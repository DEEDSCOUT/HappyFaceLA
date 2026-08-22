import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECIPIENT_INVENTORY_ACCOUNTS,
  STRIPE_PAYOUTS_API_VERSION,
  StripeSdkPayoutGateway,
} from "../../src/lib/artist-payouts/stripe-gateway.ts";

const ACCOUNT_ID = "acct_123456789012";
const TRANSFER_ID = "tr_12345678";
const PAYOUT_ID = "po_12345678";
const DESTINATION_PAYMENT_ID = "py_12345678";
const RECIPIENT_PROVENANCE = `hmac-sha256:${"a".repeat(64)}`;
const RECOVERY_FINGERPRINT = "hfl-artist-transfer:ledger_123:revision_1";

function makeAccount(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    configuration: {
      recipient: {
        applied: true,
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status: "active", status_details: [] },
            payouts: { status: "active", status_details: [] },
          },
        },
      },
    },
    created: "2026-08-22T12:00:00.000Z",
    livemode: false,
    dashboard: "express",
    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    contact_email: "artist@example.com",
    metadata: {
      hfla_artist_id: "artist_123",
      hfla_environment: "sandbox",
      hfla_purpose: "artist_payout_recipient",
      hfla_recipient_provenance: RECIPIENT_PROVENANCE,
    },
    requirements: { entries: [] },
    ...overrides,
  };
}

function makeTransfer(overrides = {}) {
  return {
    id: TRANSFER_ID,
    object: "transfer",
    amount: 12_345,
    amount_reversed: 0,
    balance_transaction: "txn_12345678",
    created: 1_787_920_000,
    currency: "usd",
    description: "Artist pay for assignment ASG-123",
    destination: ACCOUNT_ID,
    destination_payment: DESTINATION_PAYMENT_ID,
    livemode: false,
    metadata: {},
    reversals: { object: "list", data: [], has_more: false, url: "" },
    reversed: false,
    source_transaction: null,
    transfer_group: "assignment:ASG-123",
    ...overrides,
  };
}

function makePayout(overrides = {}) {
  return {
    id: PAYOUT_ID,
    object: "payout",
    amount: 12_345,
    application_fee: null,
    application_fee_amount: null,
    arrival_date: 1_788_000_000,
    automatic: true,
    balance_transaction: "txn_payout123",
    created: 1_787_990_000,
    currency: "usd",
    description: null,
    destination: "ba_12345678",
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    livemode: false,
    metadata: {},
    method: "standard",
    original_payout: null,
    payout_method: null,
    reconciliation_status: "completed",
    reversed_by: null,
    source_type: "card",
    statement_descriptor: null,
    status: "paid",
    trace_id: null,
    type: "bank_account",
    ...overrides,
  };
}

function makeBankAccount(overrides = {}) {
  return {
    id: "ba_123456789012",
    object: "bank_account",
    account: ACCOUNT_ID,
    account_holder_name: null,
    account_holder_type: null,
    account_type: "checking",
    available_payout_methods: ["standard"],
    bank_name: "SYNTHETIC TEST BANK",
    country: "US",
    currency: "usd",
    default_for_currency: true,
    fingerprint: "synthetic_fingerprint",
    last4: "6789",
    routing_number: null,
    status: "new",
    ...overrides,
  };
}

function makeV2Inventory(pages, onPage = () => undefined) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        onPage(pageIndex);
        for (const account of pages[pageIndex]) yield account;
      }
    },
  };
}

function makeClient(overrides = {}) {
  const calls = {
    accountCreate: [],
    accountList: [],
    accountRetrieve: [],
    accountLinkCreate: [],
    transferCreate: [],
    transferList: [],
    transferRetrieve: [],
    payoutRetrieve: [],
    balanceTransactionList: [],
    balanceSettingsRetrieve: [],
    platformAccountRetrieve: [],
    externalAccountList: [],
  };
  const client = {
    accounts: {
      async retrieve(...args) {
        calls.platformAccountRetrieve.push(args);
        return { id: ACCOUNT_ID, object: "account" };
      },
      listExternalAccounts(...args) {
        calls.externalAccountList.push(args);
        return makeV2Inventory([[makeBankAccount()]]);
      },
    },
    v2: {
      core: {
        accounts: {
          list(...args) {
            calls.accountList.push(args);
            return makeV2Inventory([[makeAccount()]]);
          },
          async create(...args) {
            calls.accountCreate.push(args);
            return makeAccount();
          },
          async retrieve(...args) {
            calls.accountRetrieve.push(args);
            return makeAccount();
          },
        },
        accountLinks: {
          async create(...args) {
            calls.accountLinkCreate.push(args);
            return {
              object: "v2.core.account_link",
              account: ACCOUNT_ID,
              created: "2026-08-22T12:00:00.000Z",
              expires_at: "2026-08-22T12:30:00.000Z",
              livemode: false,
              url: "https://connect.stripe.com/setup/s/test-link",
              use_case: { type: "account_onboarding" },
            };
          },
        },
      },
    },
    balance: {
      async retrieve() {
        return {
          object: "balance",
          available: [
            { amount: 20_000, currency: "usd" },
            { amount: 1_000, currency: "usd" },
            { amount: 50_000, currency: "eur" },
          ],
          livemode: false,
          pending: [],
        };
      },
    },
    balanceSettings: {
      async retrieve(...args) {
        calls.balanceSettingsRetrieve.push(args);
        return {
          object: "balance_settings",
          payments: {
            debit_negative_balances: true,
            payouts: {
              automatic_transfer_rules_by_currency: null,
              minimum_balance_by_currency: null,
              schedule: {
                interval: "weekly",
                weekly_payout_days: ["monday", "wednesday"],
              },
              statement_descriptor: null,
              status: "enabled",
            },
            settlement_timing: {
              delay_days: 2,
              start_of_day: null,
            },
          },
        };
      },
    },
    transfers: {
      async create(...args) {
        calls.transferCreate.push(args);
        return makeTransfer();
      },
      async retrieve(...args) {
        calls.transferRetrieve.push(args);
        return makeTransfer();
      },
      async list(...args) {
        calls.transferList.push(args);
        return {
          object: "list",
          data: [],
          has_more: false,
          url: "/v1/transfers",
        };
      },
    },
    payouts: {
      async retrieve(...args) {
        calls.payoutRetrieve.push(args);
        return makePayout();
      },
    },
    balanceTransactions: {
      async list(...args) {
        calls.balanceTransactionList.push(args);
        return {
          object: "list",
          data: [{ id: "txn_12345678", source: DESTINATION_PAYMENT_ID }],
          has_more: false,
          url: "/v1/balance_transactions",
        };
      },
    },
    ...overrides,
  };
  return { client, calls };
}

test("pins the v1 Stripe resources to the API version bundled with stripe-node 22.5.0", () => {
  assert.equal(STRIPE_PAYOUTS_API_VERSION, "2026-07-29.dahlia");
});

test("rejects a same-mode credential bound to the wrong Stripe platform before any payout operation", async () => {
  const { client, calls } = makeClient({
    accounts: {
      async retrieve() {
        return { id: "acct_999999999999", object: "account" };
      },
    },
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  await assert.rejects(
    gateway.createRecipient({
      artistId: "artist_123",
      displayName: "Sample Artist",
      contactEmail: "artist@example.com",
      country: "US",
      legalEntityType: "individual",
      environment: "sandbox",
      provenanceFingerprint: RECIPIENT_PROVENANCE,
    }),
    /different platform account/,
  );
  assert.equal(calls.accountCreate.length, 0);
});

test("creates only an Accounts v2 recipient with Express Dashboard and platform responsibility", async () => {
  const { client, calls } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  const result = await gateway.createRecipient({
    artistId: "artist_123",
    displayName: "Sample Artist",
    contactEmail: "ARTIST@example.com",
    country: "US",
    legalEntityType: "individual",
    environment: "sandbox",
    provenanceFingerprint: RECIPIENT_PROVENANCE,
  });

  assert.deepEqual(result, { accountId: ACCOUNT_ID });
  const [params, options] = calls.accountCreate[0];
  assert.equal(params.dashboard, "express");
  assert.equal(params.type, undefined);
  assert.deepEqual(params.identity, {
    country: "US",
    entity_type: "individual",
  });
  assert.equal(params.configuration.merchant, undefined);
  assert.deepEqual(params.configuration, {
    recipient: {
      capabilities: {
        stripe_balance: { stripe_transfers: { requested: true } },
      },
    },
  });
  assert.deepEqual(params.defaults.responsibilities, {
    fees_collector: "application",
    losses_collector: "application",
  });
  assert.equal(params.contact_email, "artist@example.com");
  assert.equal(params.metadata.hfla_recipient_provenance, RECIPIENT_PROVENANCE);
  assert.equal(options.idempotencyKey, "hfla:recipient:sandbox:artist_123");
});

test("rejects an idempotent recipient create readback with stale contact or provenance", async () => {
  for (const unsafeAccount of [
    makeAccount({ contact_email: "other@example.com" }),
    makeAccount({
      metadata: {
        hfla_artist_id: "artist_123",
        hfla_environment: "sandbox",
        hfla_purpose: "artist_payout_recipient",
        hfla_recipient_provenance: `hmac-sha256:${"b".repeat(64)}`,
      },
    }),
  ]) {
    const { client } = makeClient();
    client.v2.core.accounts.create = async () => unsafeAccount;
    const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
    await assert.rejects(
      gateway.createRecipient({
        artistId: "artist_123",
        displayName: "Sample Artist",
        contactEmail: "artist@example.com",
        country: "US",
        legalEntityType: "individual",
        environment: "sandbox",
        provenanceFingerprint: RECIPIENT_PROVENANCE,
      }),
      /idempotency readback/,
    );
  }
});

test("auto-paginates the complete recipient inventory before deciding whether an artist mapping exists", async () => {
  const { client, calls } = makeClient();
  const visitedPages = [];
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    makeAccount({
      id: `acct_nonmatch${String(index).padStart(8, "0")}`,
      contact_email: "other@example.com",
      metadata: {
        hfla_artist_id: `artist_other_${index}`,
        hfla_environment: "sandbox",
        hfla_purpose: "artist_payout_recipient",
        hfla_recipient_provenance: `hmac-sha256:${"b".repeat(64)}`,
      },
    }),
  );
  client.v2.core.accounts.list = (...args) => {
    calls.accountList.push(args);
    return makeV2Inventory([firstPage, [makeAccount()]], (pageIndex) =>
      visitedPages.push(pageIndex),
    );
  };
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  assert.deepEqual(
    await gateway.findRecipientsByArtist({
      artistId: "artist_123",
      contactEmail: "artist@example.com",
      provenanceFingerprint: RECIPIENT_PROVENANCE,
    }),
    [
      {
        accountId: ACCOUNT_ID,
        contactEmailMatches: true,
        environmentMetadataMatches: true,
        purposeMatches: true,
        provenanceMatches: true,
      },
    ],
  );
  assert.deepEqual(calls.accountList[0], [
    { applied_configurations: ["recipient"], limit: 100 },
  ]);
  assert.deepEqual(visitedPages, [0, 1]);
});

test("a prior-secret recipient remains a reconciliation candidate but is not an exact automatic match", async () => {
  const { client } = makeClient();
  const priorSecretAccount = makeAccount({
    metadata: {
      hfla_artist_id: "artist_123",
      hfla_environment: "sandbox",
      hfla_purpose: "artist_payout_recipient",
      hfla_recipient_provenance: `hmac-sha256:${"d".repeat(64)}`,
    },
  });
  client.v2.core.accounts.list = () => makeV2Inventory([[priorSecretAccount]]);
  client.v2.core.accounts.retrieve = async () => priorSecretAccount;
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  assert.deepEqual(
    await gateway.findRecipientsByArtist({
      artistId: "artist_123",
      contactEmail: "artist@example.com",
      provenanceFingerprint: RECIPIENT_PROVENANCE,
    }),
    [
      {
        accountId: ACCOUNT_ID,
        contactEmailMatches: true,
        environmentMetadataMatches: true,
        purposeMatches: true,
        provenanceMatches: false,
      },
    ],
  );
});

test("fails closed before account creation when recipient inventory exceeds the reviewed bound", async () => {
  const { client } = makeClient();
  client.v2.core.accounts.list = () =>
    makeV2Inventory([
      Array.from({ length: MAX_RECIPIENT_INVENTORY_ACCOUNTS + 1 }, (_, index) =>
        makeAccount({
          id: `acct_bound${String(index).padStart(8, "0")}`,
          contact_email: "other@example.com",
          metadata: {
            hfla_artist_id: `artist_other_${index}`,
            hfla_environment: "sandbox",
            hfla_purpose: "artist_payout_recipient",
            hfla_recipient_provenance: `hmac-sha256:${"c".repeat(64)}`,
          },
        }),
      ),
    ]);
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  await assert.rejects(
    gateway.findRecipientsByArtist({
      artistId: "artist_123",
      contactEmail: "artist@example.com",
      provenanceFingerprint: RECIPIENT_PROVENANCE,
    }),
    /safety bound/,
  );
});

test("creates a recipient-only hosted onboarding link that collects eventually-due requirements", async () => {
  const { client, calls } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  const result = await gateway.createOnboardingLink({
    accountId: ACCOUNT_ID,
    returnUrl: "https://happyfacesla.com/internal/payouts/onboarding-return",
    refreshUrl: "https://happyfacesla.com/internal/payouts/onboarding-refresh",
  });

  assert.equal(result.url, "https://connect.stripe.com/setup/s/test-link");
  assert.equal(result.expiresAt, Date.parse("2026-08-22T12:30:00.000Z") / 1000);
  assert.deepEqual(calls.accountLinkCreate[0][0].use_case, {
    type: "account_onboarding",
    account_onboarding: {
      configurations: ["recipient"],
      collection_options: {
        fields: "eventually_due",
        future_requirements: "include",
      },
      refresh_url:
        "https://happyfacesla.com/internal/payouts/onboarding-refresh",
      return_url: "https://happyfacesla.com/internal/payouts/onboarding-return",
    },
  });
});

test("retrieves recipient readiness only when Stripe metadata and automatic payout settings match", async () => {
  const { client, calls } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  const status = await gateway.retrieveRecipientStatus(
    ACCOUNT_ID,
    "artist_123",
  );
  assert.equal(status.transfersStatus, "active");
  assert.equal(status.payoutsStatus, "active");
  assert.equal(status.automaticPayoutsEnabled, true);
  assert.equal(status.payoutScheduleInterval, "weekly");
  assert.equal(status.payoutDestinationId, "ba_123456789012");
  assert.deepEqual(calls.balanceSettingsRetrieve[0], [
    {},
    { stripeAccount: ACCOUNT_ID },
  ]);
  assert.deepEqual(calls.externalAccountList[0], [ACCOUNT_ID, { limit: 100 }]);
  await assert.rejects(
    gateway.retrieveRecipientStatus(ACCOUNT_ID, "artist_other"),
    /does not belong/,
  );
});

test("fails recipient readiness closed when any external account advertises Instant Payouts", async () => {
  for (const inventory of [
    [makeBankAccount({ available_payout_methods: ["standard", "instant"] })],
    [
      makeBankAccount(),
      makeBankAccount({
        id: "ba_210987654321",
        default_for_currency: false,
        available_payout_methods: ["instant"],
      }),
    ],
    [
      makeBankAccount(),
      {
        id: "card_123456789012",
        object: "card",
        available_payout_methods: ["instant"],
      },
    ],
  ]) {
    const { client } = makeClient();
    client.accounts.listExternalAccounts = () => makeV2Inventory([inventory]);
    const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
    const status = await gateway.retrieveRecipientStatus(
      ACCOUNT_ID,
      "artist_123",
    );
    assert.equal(status.payoutDestinationId, null);
    assert.equal(status.disabledReason, "instant_payout_method_advertised");
  }
});

test("payout readback requires and returns the exact standard bank destination", async () => {
  const { client } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  const payout = await gateway.retrievePayout(ACCOUNT_ID, PAYOUT_ID);
  assert.equal(payout.destinationId, "ba_12345678");

  client.payouts.retrieve = async () =>
    makePayout({ destination: "card_12345678" });
  await assert.rejects(
    gateway.retrievePayout(ACCOUNT_ID, PAYOUT_ID),
    /bank destination ID is malformed/,
  );
});

test("accepts only enabled automatic payout intervals and fails manual or unknown schedules closed", async () => {
  for (const interval of ["daily", "weekly", "monthly"]) {
    const { client } = makeClient();
    client.balanceSettings.retrieve = async () => ({
      object: "balance_settings",
      payments: {
        payouts: {
          schedule: { interval },
          status: "enabled",
        },
      },
    });
    const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
    const status = await gateway.retrieveRecipientStatus(
      ACCOUNT_ID,
      "artist_123",
    );
    assert.equal(status.automaticPayoutsEnabled, true);
    assert.equal(status.payoutScheduleInterval, interval);
    assert.equal(status.disabledReason, null);
  }

  for (const settings of [
    { status: "enabled", schedule: { interval: "manual" } },
    { status: "enabled", schedule: { interval: "unexpected" } },
    { status: "enabled", schedule: null },
    { status: "disabled", schedule: { interval: "weekly" } },
  ]) {
    const { client } = makeClient();
    client.balanceSettings.retrieve = async () => ({
      object: "balance_settings",
      payments: { payouts: settings },
    });
    const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
    const status = await gateway.retrieveRecipientStatus(
      ACCOUNT_ID,
      "artist_123",
    );
    assert.equal(status.automaticPayoutsEnabled, false);
    assert.equal(
      status.payoutScheduleInterval,
      settings.status === "disabled" ? "weekly" : null,
    );
    assert.match(status.disabledReason, /^automatic_payouts_/);
  }

  const { client } = makeClient();
  client.balanceSettings.retrieve = async () => {
    throw new Error("provider unavailable");
  };
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  await assert.rejects(
    gateway.retrieveRecipientStatus(ACCOUNT_ID, "artist_123"),
    /provider unavailable/,
  );
});

test("recipient readiness fails closed on controller, currency, or responsibility drift", async () => {
  const unsafeAccounts = [
    makeAccount({ dashboard: "full" }),
    makeAccount({
      defaults: {
        currency: "eur",
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
    }),
    makeAccount({
      defaults: {
        currency: "usd",
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "application",
        },
      },
    }),
    makeAccount({
      defaults: {
        currency: "usd",
        responsibilities: {
          fees_collector: "application",
          losses_collector: "stripe",
        },
      },
    }),
    makeAccount({ applied_configurations: ["recipient", "merchant"] }),
  ];
  for (const account of unsafeAccounts) {
    const { client } = makeClient();
    client.v2.core.accounts.retrieve = async () => account;
    const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
    await assert.rejects(
      gateway.retrieveRecipientStatus(ACCOUNT_ID, "artist_123"),
      /controller architecture/,
    );
  }
});

test("creates a standalone Transfer with the caller-provided idempotency key", async () => {
  const { client, calls } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  const result = await gateway.createTransfer({
    amount: 12_345,
    currency: "usd",
    destination: ACCOUNT_ID,
    description: "Artist pay for assignment ASG-123",
    transferGroup: "assignment:ASG-123",
    metadata: { assignment_id: "ASG-123" },
    idempotencyKey: "artist-transfer:ledger_123:revision_1",
  });

  assert.equal(result.id, TRANSFER_ID);
  assert.equal(result.destinationPaymentId, DESTINATION_PAYMENT_ID);
  const [params, options] = calls.transferCreate[0];
  assert.equal(params.source_transaction, undefined);
  assert.equal(params.application_fee_amount, undefined);
  assert.equal(options.idempotencyKey, "artist-transfer:ledger_123:revision_1");
});

test("paginates destination transfers and returns every exact recovery fingerprint match", async () => {
  const first = makeTransfer({
    id: "tr_11111111",
    metadata: { idempotency_fingerprint: RECOVERY_FINGERPRINT },
  });
  const second = makeTransfer({
    id: "tr_22222222",
    metadata: { idempotency_fingerprint: RECOVERY_FINGERPRINT },
  });
  const { client, calls } = makeClient();
  client.transfers.list = async (...args) => {
    calls.transferList.push(args);
    return args[0].starting_after
      ? {
          object: "list",
          data: [second],
          has_more: false,
          url: "/v1/transfers",
        }
      : { object: "list", data: [first], has_more: true, url: "/v1/transfers" };
  };
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  assert.deepEqual(
    (
      await gateway.findTransfersByRecoveryFingerprint({
        destinationAccountId: ACCOUNT_ID,
        idempotencyFingerprint: RECOVERY_FINGERPRINT,
      })
    ).map((transfer) => transfer.id),
    ["tr_11111111", "tr_22222222"],
  );
  assert.deepEqual(calls.transferList[0][0], {
    destination: ACCOUNT_ID,
    limit: 100,
  });
  assert.equal(calls.transferList[1][0].starting_after, "tr_11111111");
});

test("recovery inventory ignores different fingerprints and rejects wrong Stripe mode", async () => {
  const { client } = makeClient();
  client.transfers.list = async () => ({
    object: "list",
    data: [
      makeTransfer({ metadata: { idempotency_fingerprint: "different" } }),
    ],
    has_more: false,
    url: "/v1/transfers",
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  assert.deepEqual(
    await gateway.findTransfersByRecoveryFingerprint({
      destinationAccountId: ACCOUNT_ID,
      idempotencyFingerprint: RECOVERY_FINGERPRINT,
    }),
    [],
  );

  client.transfers.list = async () => ({
    object: "list",
    data: [makeTransfer({ livemode: true })],
    has_more: false,
    url: "/v1/transfers",
  });
  await assert.rejects(
    () =>
      gateway.findTransfersByRecoveryFingerprint({
        destinationAccountId: ACCOUNT_ID,
        idempotencyFingerprint: RECOVERY_FINGERPRINT,
      }),
    /mode does not match/,
  );
});

test("retrieves only platform available USD balance entries", async () => {
  const { client } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  assert.equal(await gateway.retrieveAvailableBalance("usd"), 21_000);
});

test("confirms positive payout membership for a standard automatic payout", async () => {
  const { client, calls } = makeClient();
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  assert.equal(
    await gateway.payoutContainsDestinationPayment({
      accountId: ACCOUNT_ID,
      payoutId: PAYOUT_ID,
      destinationPaymentId: DESTINATION_PAYMENT_ID,
    }),
    true,
  );
  assert.deepEqual(calls.payoutRetrieve[0], [
    PAYOUT_ID,
    {},
    { stripeAccount: ACCOUNT_ID },
  ]);
  assert.deepEqual(calls.balanceTransactionList[0], [
    { payout: PAYOUT_ID, source: DESTINATION_PAYMENT_ID, limit: 100 },
    { stripeAccount: ACCOUNT_ID },
  ]);
});

test("can positively bind a destination payment while automatic payout reconciliation is in progress", async () => {
  const { client, calls } = makeClient({
    payouts: {
      async retrieve(...args) {
        calls.payoutRetrieve.push(args);
        return makePayout({ reconciliation_status: "in_progress" });
      },
    },
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);

  assert.equal(
    await gateway.payoutContainsDestinationPayment({
      accountId: ACCOUNT_ID,
      payoutId: PAYOUT_ID,
      destinationPaymentId: DESTINATION_PAYMENT_ID,
    }),
    true,
  );
  assert.equal(calls.balanceTransactionList.length, 1);
});

test("treats an absent destination payment match as non-membership", async () => {
  const { client } = makeClient({
    balanceTransactions: {
      async list() {
        return { data: [] };
      },
    },
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  assert.equal(
    await gateway.payoutContainsDestinationPayment({
      accountId: ACCOUNT_ID,
      payoutId: PAYOUT_ID,
      destinationPaymentId: DESTINATION_PAYMENT_ID,
    }),
    false,
  );
});

test("fails closed on a Stripe resource from the wrong mode", async () => {
  const { client } = makeClient({
    balance: {
      async retrieve() {
        return {
          object: "balance",
          available: [],
          livemode: true,
          pending: [],
        };
      },
    },
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  await assert.rejects(
    () => gateway.retrieveAvailableBalance("usd"),
    /mode does not match/,
  );
});

test("rejects source-transaction-backed transfers", async () => {
  const { client } = makeClient({
    transfers: {
      async create() {
        return makeTransfer({ source_transaction: "ch_12345678" });
      },
      async retrieve() {
        return makeTransfer({ source_transaction: "ch_12345678" });
      },
    },
  });
  const gateway = new StripeSdkPayoutGateway(client, "sandbox", ACCOUNT_ID);
  await assert.rejects(
    () => gateway.retrieveTransfer(TRANSFER_ID),
    /standalone Transfer/,
  );
});
