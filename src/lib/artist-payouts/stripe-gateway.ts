import Stripe from "stripe";
import { ARTIST_PAYOUT_STRIPE_API_VERSION } from "../stripe-api-version.ts";
import type {
  PayoutEnvironment,
  StripePayoutGateway,
  StripePayoutResult,
  StripeRecipientCandidate,
  StripeRecipientStatus,
  StripeTransferResult,
} from "./types.ts";
import {
  isSafeBusinessId,
  isStripeAccountId,
  sanitizeOperationalText,
} from "./validation.ts";

/**
 * The API version bundled with stripe-node 22.5.0 in this repository.
 *
 * V2 Core resources select Stripe's v2 API mode in the SDK-generated resource
 * implementation. Keep the v1 version pinned here for Balance, Transfers,
 * Payouts, and Balance Transactions instead of silently following an account's
 * Dashboard default.
 */
export const STRIPE_PAYOUTS_API_VERSION = ARTIST_PAYOUT_STRIPE_API_VERSION;

const PAYOUT_CURRENCY = "usd" as const;
const MAX_METADATA_KEYS = 50;
export const MAX_RECIPIENT_INVENTORY_ACCOUNTS = 10_000;
export const MAX_PAYOUT_DESTINATION_ACCOUNTS = 1_000;

export interface StripePayoutGatewayFactoryOptions {
  environment: PayoutEnvironment;
  expectedPlatformAccountId: string;
  secretKey?: string;
  client?: Stripe;
}

function assertExpectedMode(
  environment: PayoutEnvironment,
  livemode: boolean,
  resource: string,
): void {
  const expectedLiveMode = environment === "live";
  if (livemode !== expectedLiveMode) {
    throw new Error(
      `${resource} mode does not match the configured payout environment`,
    );
  }
}

function assertStripeObjectId(
  value: string,
  prefix: string,
  label: string,
): void {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}[A-Za-z0-9]{8,100}$`);
  if (!pattern.test(value)) throw new Error(`${label} is malformed`);
}

function assertHttpsUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(
      `${label} must be an absolute HTTPS URL without credentials`,
    );
  }
}

function assertContactEmail(value: string): void {
  if (
    value.length > 254 ||
    /[\u0000-\u0020\u007F]/.test(value) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(value)
  ) {
    throw new Error("Artist contact email is malformed");
  }
}

function assertMetadata(metadata: Record<string, string>): void {
  const entries = Object.entries(metadata);
  if (entries.length > MAX_METADATA_KEYS)
    throw new Error("Stripe metadata exceeds the key limit");
  for (const [key, value] of entries) {
    if (!key || key.length > 40 || key.includes("[") || key.includes("]")) {
      throw new Error("Stripe metadata key is invalid");
    }
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      /[\u0000-\u001F\u007F]/.test(value)
    ) {
      throw new Error("Stripe metadata value is invalid");
    }
  }
}

function objectId(
  value: string | { id?: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : null;
}

function normalizeTransfer(
  transfer: Stripe.Transfer,
  environment: PayoutEnvironment,
): StripeTransferResult {
  assertExpectedMode(environment, transfer.livemode, "Stripe Transfer");
  if (transfer.source_transaction !== null) {
    throw new Error(
      "Artist payouts require a standalone Transfer without a source transaction",
    );
  }
  if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
    throw new Error("Stripe Transfer amount is invalid");
  }
  if (transfer.currency.toLowerCase() !== PAYOUT_CURRENCY) {
    throw new Error(
      "Stripe Transfer currency is not supported by the artist payout system",
    );
  }

  const destination = objectId(transfer.destination);
  if (!destination || !isStripeAccountId(destination)) {
    throw new Error("Stripe Transfer destination is missing or malformed");
  }
  const destinationPaymentId = objectId(transfer.destination_payment);
  const metadata = { ...transfer.metadata };
  assertMetadata(metadata);

  return {
    id: transfer.id,
    amount: transfer.amount,
    currency: transfer.currency.toLowerCase(),
    destination,
    destinationPaymentId,
    reversed: transfer.reversed,
    transferGroup: transfer.transfer_group,
    metadata,
  };
}

function requirementStatus(account: Stripe.V2.Core.Account): string {
  if (account.closed) return "closed";
  if (!account.configuration?.recipient?.applied) return "inactive";
  const entries = account.requirements?.entries ?? [];
  if (entries.length === 0) return "complete";
  return account.requirements?.summary?.minimum_deadline?.status ?? "pending";
}

function currentlyDueRequirements(account: Stripe.V2.Core.Account): string[] {
  const descriptions = (account.requirements?.entries ?? [])
    .filter(
      (entry) =>
        entry.awaiting_action_from === "user" &&
        (entry.minimum_deadline.status === "currently_due" ||
          entry.minimum_deadline.status === "past_due"),
    )
    .map((entry) => sanitizeOperationalText(entry.description, 500))
    .filter(Boolean);
  return [...new Set(descriptions)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function recipientDisabledReason(
  account: Stripe.V2.Core.Account,
): string | null {
  if (account.closed) return "account_closed";
  const balanceCapabilities =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  const transfers = balanceCapabilities?.stripe_transfers;
  const payouts = balanceCapabilities?.payouts;
  if (transfers && transfers.status !== "active") {
    return (
      transfers.status_details[0]?.code ??
      `stripe_transfers_${transfers.status}`
    );
  }
  if (payouts && payouts.status !== "active") {
    return payouts.status_details[0]?.code ?? `payouts_${payouts.status}`;
  }
  if (account.requirements?.summary?.minimum_deadline?.status === "past_due") {
    return "requirements_past_due";
  }
  return null;
}

function assertRecipientArchitecture(account: Stripe.V2.Core.Account): void {
  if (
    account.applied_configurations.length !== 1 ||
    account.applied_configurations[0] !== "recipient" ||
    account.configuration?.recipient?.applied !== true ||
    account.dashboard !== "express" ||
    account.defaults?.currency !== PAYOUT_CURRENCY ||
    account.defaults?.responsibilities?.fees_collector !== "application" ||
    account.defaults?.responsibilities?.losses_collector !== "application"
  ) {
    throw new Error(
      "Stripe recipient controller architecture does not match the approved HFL payout design",
    );
  }
}

export class StripeSdkPayoutGateway implements StripePayoutGateway {
  private readonly stripe: Stripe;
  private readonly environment: PayoutEnvironment;
  private readonly expectedPlatformAccountId: string;
  private platformIdentityCheck: Promise<void> | null = null;

  constructor(
    stripe: Stripe,
    environment: PayoutEnvironment,
    expectedPlatformAccountId: string,
  ) {
    if (environment !== "sandbox" && environment !== "live") {
      throw new Error("Stripe payout environment must be sandbox or live");
    }
    if (!isStripeAccountId(expectedPlatformAccountId)) {
      throw new Error("Expected Stripe platform account ID is malformed");
    }
    this.stripe = stripe;
    this.environment = environment;
    this.expectedPlatformAccountId = expectedPlatformAccountId;
  }

  private async assertPlatformIdentity(): Promise<void> {
    if (!this.platformIdentityCheck) {
      this.platformIdentityCheck = (async () => {
        const platform = await this.stripe.accounts.retrieve(null);
        if (
          !platform ||
          !isStripeAccountId(platform.id) ||
          platform.id !== this.expectedPlatformAccountId
        ) {
          throw new Error(
            "Stripe credential is bound to a different platform account",
          );
        }
      })();
    }
    await this.platformIdentityCheck;
  }

  async findRecipientsByArtist(input: {
    artistId: string;
    contactEmail: string;
    provenanceFingerprint: string;
  }): Promise<StripeRecipientCandidate[]> {
    await this.assertPlatformIdentity();
    if (!isSafeBusinessId(input.artistId))
      throw new Error("Artist ID is malformed");
    const contactEmail = input.contactEmail.trim().toLowerCase();
    assertContactEmail(contactEmail);
    if (!/^hmac-sha256:[a-f0-9]{64}$/.test(input.provenanceFingerprint))
      throw new Error("Recipient provenance fingerprint is malformed");
    const inventory = this.stripe.v2.core.accounts.list({
      applied_configurations: ["recipient"],
      limit: 100,
    });
    const matches = new Map<string, StripeRecipientCandidate>();
    let inspected = 0;
    for await (const account of inventory) {
      inspected += 1;
      if (inspected > MAX_RECIPIENT_INVENTORY_ACCOUNTS) {
        throw new Error(
          "Recipient inventory exceeds the reviewed automatic-pagination safety bound",
        );
      }
      assertExpectedMode(this.environment, account.livemode, "Stripe Account");
      if (
        account.metadata?.hfla_artist_id === input.artistId &&
        account.applied_configurations.includes("recipient")
      ) {
        assertStripeObjectId(account.id, "acct_", "Stripe Account ID");
        const current = await this.stripe.v2.core.accounts.retrieve(
          account.id,
          {
            include: [
              "configuration.recipient",
              "defaults",
              "requirements",
              "future_requirements",
            ],
          },
        );
        assertExpectedMode(
          this.environment,
          current.livemode,
          "Stripe Account",
        );
        if (current.id !== account.id)
          throw new Error("Stripe returned a substituted recipient account");
        assertRecipientArchitecture(current);
        const candidate: StripeRecipientCandidate = {
          accountId: current.id,
          contactEmailMatches:
            current.contact_email?.trim().toLowerCase() === contactEmail,
          environmentMetadataMatches:
            current.metadata?.hfla_environment === this.environment,
          purposeMatches:
            current.metadata?.hfla_purpose === "artist_payout_recipient",
          provenanceMatches:
            current.metadata?.hfla_recipient_provenance ===
            input.provenanceFingerprint,
        };
        const prior = matches.get(candidate.accountId);
        if (prior && JSON.stringify(prior) !== JSON.stringify(candidate)) {
          throw new Error(
            "Recipient inventory returned conflicting versions of one Stripe account",
          );
        }
        matches.set(candidate.accountId, candidate);
      }
    }
    return [...matches.values()].sort((left, right) =>
      left.accountId.localeCompare(right.accountId),
    );
  }

  async createRecipient(input: {
    artistId: string;
    displayName: string;
    contactEmail: string;
    country: string;
    legalEntityType:
      "individual" | "company" | "non_profit" | "government_entity";
    environment: PayoutEnvironment;
    provenanceFingerprint: string;
  }): Promise<{ accountId: string }> {
    await this.assertPlatformIdentity();
    if (input.environment !== this.environment) {
      throw new Error(
        "Artist account environment does not match the Stripe gateway environment",
      );
    }
    if (!isSafeBusinessId(input.artistId))
      throw new Error("Artist ID is malformed");
    if (!/^hmac-sha256:[a-f0-9]{64}$/.test(input.provenanceFingerprint))
      throw new Error("Recipient provenance fingerprint is malformed");
    const displayName = sanitizeOperationalText(input.displayName, 120);
    if (!displayName) throw new Error("Artist display name is required");
    const contactEmail = input.contactEmail.trim().toLowerCase();
    assertContactEmail(contactEmail);
    const country = input.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country))
      throw new Error("Artist country must be an ISO alpha-2 code");
    if (
      !["individual", "company", "non_profit", "government_entity"].includes(
        input.legalEntityType,
      )
    ) {
      throw new Error("Artist legal entity type is invalid");
    }

    const account = await this.stripe.v2.core.accounts.create(
      {
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        contact_email: contactEmail,
        dashboard: "express",
        defaults: {
          currency: PAYOUT_CURRENCY,
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        display_name: displayName,
        identity: {
          country,
          entity_type: input.legalEntityType,
        },
        include: [
          "configuration.recipient",
          "defaults",
          "requirements",
          "future_requirements",
        ],
        metadata: {
          hfla_artist_id: input.artistId,
          hfla_environment: input.environment,
          hfla_purpose: "artist_payout_recipient",
          hfla_recipient_provenance: input.provenanceFingerprint,
        },
      },
      {
        idempotencyKey: `hfla:recipient:${input.environment}:${input.artistId}`,
      },
    );

    assertExpectedMode(this.environment, account.livemode, "Stripe Account");
    if (!isStripeAccountId(account.id))
      throw new Error("Stripe returned a malformed Account ID");
    if (!account.applied_configurations.includes("recipient")) {
      throw new Error("Stripe did not apply the recipient configuration");
    }
    if (
      account.contact_email?.trim().toLowerCase() !== contactEmail ||
      account.metadata?.hfla_artist_id !== input.artistId ||
      account.metadata?.hfla_environment !== input.environment ||
      account.metadata?.hfla_purpose !== "artist_payout_recipient" ||
      account.metadata?.hfla_recipient_provenance !==
        input.provenanceFingerprint
    ) {
      throw new Error(
        "Stripe recipient idempotency readback does not match the current artist provenance",
      );
    }
    assertRecipientArchitecture(account);
    return { accountId: account.id };
  }

  async createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string; expiresAt: number }> {
    await this.assertPlatformIdentity();
    if (!isStripeAccountId(input.accountId))
      throw new Error("Stripe Account ID is malformed");
    assertHttpsUrl(input.returnUrl, "Onboarding return URL");
    assertHttpsUrl(input.refreshUrl, "Onboarding refresh URL");

    const link = await this.stripe.v2.core.accountLinks.create({
      account: input.accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
          refresh_url: input.refreshUrl,
          return_url: input.returnUrl,
        },
      },
    });

    assertExpectedMode(this.environment, link.livemode, "Stripe Account Link");
    if (link.account !== input.accountId)
      throw new Error("Stripe Account Link is for a different account");
    assertHttpsUrl(link.url, "Stripe Account Link");
    const expiresAt = Math.floor(Date.parse(link.expires_at) / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
      throw new Error("Stripe Account Link expiration is invalid");
    }
    return { url: link.url, expiresAt };
  }

  async retrieveRecipientStatus(
    accountId: string,
    expectedArtistId: string,
  ): Promise<StripeRecipientStatus> {
    await this.assertPlatformIdentity();
    if (!isStripeAccountId(accountId))
      throw new Error("Stripe Account ID is malformed");
    if (!isSafeBusinessId(expectedArtistId))
      throw new Error("Artist ID is malformed");
    const account = await this.stripe.v2.core.accounts.retrieve(accountId, {
      include: [
        "configuration.recipient",
        "defaults",
        "requirements",
        "future_requirements",
      ],
    });
    assertExpectedMode(this.environment, account.livemode, "Stripe Account");
    if (account.id !== accountId)
      throw new Error("Stripe returned a different Account");
    if (account.metadata?.hfla_artist_id !== expectedArtistId) {
      throw new Error("Stripe Account does not belong to the expected artist");
    }
    if (
      account.metadata?.hfla_environment !== this.environment ||
      account.metadata?.hfla_purpose !== "artist_payout_recipient" ||
      !/^hmac-sha256:[a-f0-9]{64}$/.test(
        account.metadata?.hfla_recipient_provenance ?? "",
      ) ||
      !account.applied_configurations.includes("recipient")
    ) {
      throw new Error("Stripe Account payout provenance is invalid");
    }
    assertRecipientArchitecture(account);

    const balanceSettings = await this.stripe.balanceSettings.retrieve(
      {},
      { stripeAccount: accountId },
    );
    const payoutSettings = balanceSettings.payments?.payouts;
    const interval = payoutSettings?.schedule?.interval;
    const payoutScheduleInterval =
      interval === "daily"
        ? "daily"
        : interval === "weekly"
          ? "weekly"
          : interval === "monthly"
            ? "monthly"
            : null;
    const automaticPayoutsEnabled =
      payoutSettings?.status === "enabled" && payoutScheduleInterval !== null;
    const automaticPayoutDisabledReason = automaticPayoutsEnabled
      ? null
      : interval === "manual"
        ? "automatic_payouts_manual"
        : payoutSettings?.status !== "enabled"
          ? "automatic_payouts_disabled"
          : "automatic_payouts_schedule_unverified";

    const externalAccounts = this.stripe.accounts.listExternalAccounts(
      accountId,
      { limit: 100 },
    );
    const payoutDestinations: string[] = [];
    let inspectedDestinations = 0;
    let instantPayoutMethodAdvertised = false;
    for await (const externalAccount of externalAccounts) {
      inspectedDestinations += 1;
      if (inspectedDestinations > MAX_PAYOUT_DESTINATION_ACCOUNTS) {
        throw new Error(
          "Payout destination inventory exceeds the reviewed automatic-pagination safety bound",
        );
      }
      const payoutMethods =
        "available_payout_methods" in externalAccount &&
        Array.isArray(externalAccount.available_payout_methods)
          ? externalAccount.available_payout_methods
          : [];
      if (payoutMethods.includes("instant")) {
        instantPayoutMethodAdvertised = true;
      }
      if (
        externalAccount.object !== "bank_account" ||
        externalAccount.currency.toLowerCase() !== PAYOUT_CURRENCY ||
        externalAccount.default_for_currency !== true ||
        !["new", "validated", "verified"].includes(externalAccount.status) ||
        !payoutMethods.includes("standard")
      ) {
        continue;
      }
      assertStripeObjectId(
        externalAccount.id,
        "ba_",
        "Stripe payout destination ID",
      );
      const destinationAccountId = objectId(externalAccount.account);
      if (destinationAccountId && destinationAccountId !== accountId) {
        throw new Error(
          "Stripe payout destination belongs to a different connected account",
        );
      }
      payoutDestinations.push(externalAccount.id);
    }
    if (payoutDestinations.length > 1) {
      throw new Error(
        "Stripe returned multiple default USD standard payout destinations",
      );
    }
    const payoutDestinationId = instantPayoutMethodAdvertised
      ? null
      : (payoutDestinations[0] ?? null);
    const payoutDestinationDisabledReason = payoutDestinationId
      ? null
      : instantPayoutMethodAdvertised
        ? "instant_payout_method_advertised"
        : "payout_destination_unavailable";

    const balanceCapabilities =
      account.configuration?.recipient?.capabilities?.stripe_balance;
    return {
      accountId: account.id,
      transfersStatus:
        balanceCapabilities?.stripe_transfers?.status ?? "not_requested",
      payoutsStatus: balanceCapabilities?.payouts?.status ?? "not_available",
      automaticPayoutsEnabled,
      payoutScheduleInterval,
      payoutDestinationId,
      requirementsStatus: requirementStatus(account),
      currentlyDue: currentlyDueRequirements(account),
      disabledReason:
        recipientDisabledReason(account) ??
        automaticPayoutDisabledReason ??
        payoutDestinationDisabledReason,
    };
  }

  async retrieveAvailableBalance(currency: "usd"): Promise<number> {
    await this.assertPlatformIdentity();
    if (currency !== PAYOUT_CURRENCY)
      throw new Error("Only USD artist payouts are supported");
    const balance = await this.stripe.balance.retrieve();
    assertExpectedMode(this.environment, balance.livemode, "Stripe Balance");

    let total = 0;
    for (const entry of balance.available) {
      if (!Number.isSafeInteger(entry.amount))
        throw new Error("Stripe available balance amount is invalid");
      if (entry.currency.toLowerCase() === currency) {
        total += entry.amount;
        if (!Number.isSafeInteger(total))
          throw new Error(
            "Stripe available balance exceeds safe integer range",
          );
      }
    }
    return total;
  }

  async createTransfer(input: {
    amount: number;
    currency: "usd";
    destination: string;
    description: string;
    transferGroup: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<StripeTransferResult> {
    await this.assertPlatformIdentity();
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new Error("Transfer amount must be positive integer minor units");
    }
    if (input.currency !== PAYOUT_CURRENCY)
      throw new Error("Only USD artist payouts are supported");
    if (!isStripeAccountId(input.destination))
      throw new Error("Stripe Account ID is malformed");
    const description = sanitizeOperationalText(input.description, 500);
    if (!description) throw new Error("Transfer description is required");
    if (
      !input.transferGroup ||
      input.transferGroup.length > 255 ||
      /[\u0000-\u001F\u007F]/.test(input.transferGroup)
    ) {
      throw new Error("Transfer group is invalid");
    }
    if (
      !input.idempotencyKey ||
      input.idempotencyKey.length > 255 ||
      /[\u0000-\u001F\u007F]/.test(input.idempotencyKey)
    ) {
      throw new Error("Transfer idempotency key is invalid");
    }
    assertMetadata(input.metadata);

    const transfer = await this.stripe.transfers.create(
      {
        amount: input.amount,
        currency: input.currency,
        destination: input.destination,
        description,
        metadata: input.metadata,
        transfer_group: input.transferGroup,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    const normalized = normalizeTransfer(transfer, this.environment);
    if (
      normalized.amount !== input.amount ||
      normalized.currency !== input.currency ||
      normalized.destination !== input.destination
    ) {
      throw new Error(
        "Stripe Transfer response does not match the requested artist payout",
      );
    }
    return normalized;
  }

  async retrieveTransfer(transferId: string): Promise<StripeTransferResult> {
    await this.assertPlatformIdentity();
    assertStripeObjectId(transferId, "tr_", "Stripe Transfer ID");
    const transfer = await this.stripe.transfers.retrieve(transferId);
    if (transfer.id !== transferId)
      throw new Error("Stripe returned a different Transfer");
    return normalizeTransfer(transfer, this.environment);
  }

  async findTransfersByRecoveryFingerprint(input: {
    destinationAccountId: string;
    idempotencyFingerprint: string;
  }): Promise<StripeTransferResult[]> {
    await this.assertPlatformIdentity();
    if (!isStripeAccountId(input.destinationAccountId))
      throw new Error("Stripe recovery destination is malformed");
    if (
      !/^hfl-artist-transfer:[A-Za-z0-9._:-]{3,180}$/.test(
        input.idempotencyFingerprint,
      )
    ) {
      throw new Error("Stripe recovery fingerprint is malformed");
    }
    const matches: StripeTransferResult[] = [];
    let startingAfter: string | undefined;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await this.stripe.transfers.list({
        destination: input.destinationAccountId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const transfer of page.data) {
        const normalized = normalizeTransfer(transfer, this.environment);
        if (
          normalized.metadata.idempotency_fingerprint ===
          input.idempotencyFingerprint
        ) {
          matches.push(normalized);
        }
      }
      if (!page.has_more)
        return matches.sort((left, right) => left.id.localeCompare(right.id));
      const last = page.data.at(-1);
      if (!last?.id)
        throw new Error("Stripe transfer inventory pagination is inconsistent");
      startingAfter = last.id;
    }
    throw new Error(
      "Stripe transfer inventory exceeds the bounded recovery audit; owner review is required",
    );
  }

  async retrievePayout(
    accountId: string,
    payoutId: string,
  ): Promise<StripePayoutResult> {
    await this.assertPlatformIdentity();
    if (!isStripeAccountId(accountId))
      throw new Error("Stripe Account ID is malformed");
    assertStripeObjectId(payoutId, "po_", "Stripe Payout ID");
    const payout = await this.stripe.payouts.retrieve(
      payoutId,
      {},
      { stripeAccount: accountId },
    );
    assertExpectedMode(this.environment, payout.livemode, "Stripe Payout");
    if (payout.id !== payoutId)
      throw new Error("Stripe returned a different Payout");
    if (!payout.automatic || payout.method !== "standard") {
      throw new Error(
        "Artist payout reconciliation only accepts standard automatic payouts",
      );
    }
    const destinationId = objectId(payout.destination);
    if (!destinationId) {
      throw new Error("Stripe Payout bank destination is missing");
    }
    assertStripeObjectId(
      destinationId,
      "ba_",
      "Stripe Payout bank destination ID",
    );
    if (
      !Number.isSafeInteger(payout.arrival_date) ||
      payout.arrival_date <= 0
    ) {
      throw new Error("Stripe Payout arrival date is invalid");
    }
    return {
      id: payout.id,
      destinationId,
      status: payout.status,
      arrivalDate: payout.arrival_date,
      reconciliationStatus: payout.reconciliation_status,
      failureCode: payout.failure_code,
      failureMessage: payout.failure_message,
    };
  }

  async payoutContainsDestinationPayment(input: {
    accountId: string;
    payoutId: string;
    destinationPaymentId: string;
  }): Promise<boolean> {
    await this.assertPlatformIdentity();
    if (!isStripeAccountId(input.accountId))
      throw new Error("Stripe Account ID is malformed");
    assertStripeObjectId(input.payoutId, "po_", "Stripe Payout ID");
    assertStripeObjectId(
      input.destinationPaymentId,
      "py_",
      "Stripe destination payment ID",
    );

    // The payout filter is documented for automatic payouts. A positive source
    // match is useful while a payout is pending; a negative result is never
    // treated as final until the caller has separately verified paid/completed.
    await this.retrievePayout(input.accountId, input.payoutId);

    const transactions = await this.stripe.balanceTransactions.list(
      {
        payout: input.payoutId,
        source: input.destinationPaymentId,
        limit: 100,
      },
      { stripeAccount: input.accountId },
    );
    return transactions.data.some(
      (transaction) =>
        objectId(transaction.source) === input.destinationPaymentId,
    );
  }
}

export function createStripePayoutGateway(
  options: StripePayoutGatewayFactoryOptions,
): StripeSdkPayoutGateway {
  const secretKey = options.secretKey?.trim();
  if (!options.client && !secretKey)
    throw new Error("Stripe payout secret key is required");
  const stripe =
    options.client ?? createStripePayoutClient(secretKey as string);
  return new StripeSdkPayoutGateway(
    stripe,
    options.environment,
    options.expectedPlatformAccountId,
  );
}

export function createStripePayoutClient(secretKey: string): Stripe {
  if (!/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]{12,}$/.test(secretKey.trim())) {
    throw new Error("A well-formed Stripe payout secret key is required");
  }
  return new Stripe(secretKey.trim(), {
    apiVersion: STRIPE_PAYOUTS_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
