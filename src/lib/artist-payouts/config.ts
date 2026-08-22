import type { PayoutEnvironment, PayoutRuntimeEnv } from "./types.ts";

export type PayoutOperation =
  | "read"
  | "preview"
  | "intake"
  | "onboarding"
  | "transfer"
  | "reconcile"
  | "account-webhook"
  | "payout-webhook";

export interface PayoutRuntimeConfig {
  environment: PayoutEnvironment;
  stripeSecretKey: string | null;
  stripePlatformAccountId: string | null;
  stripeWebhookSecret: string | null;
  minimumReserveCents: number | null;
  publicBaseUrl: string | null;
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parseEnvironment(value: string | undefined): PayoutEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "live") return normalized;
  throw new Error(
    "STRIPE_ARTIST_PAYOUTS_ENV must be explicitly set to sandbox or live",
  );
}

function requireStripeKey(
  environment: PayoutEnvironment,
  value: string | undefined,
): string {
  const key = value?.trim() ?? "";
  const valid = new RegExp(
    `^(?:sk|rk)_${environment === "live" ? "live" : "test"}_[A-Za-z0-9_]{12,}$`,
  ).test(key);
  if (!valid)
    throw new Error(
      `A valid ${environment} Stripe payout key is not configured`,
    );
  return key;
}

function requirePlatformAccountId(
  environment: PayoutEnvironment,
  value: string | undefined,
): string {
  const accountId = value?.trim() ?? "";
  if (!/^acct_[A-Za-z0-9]{12,80}$/.test(accountId)) {
    throw new Error(
      `A valid expected ${environment} Stripe platform account ID is not configured`,
    );
  }
  return accountId;
}

function parseReserve(value: string | undefined): number {
  const normalized = value?.trim() ?? "";
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      "PAYOUT_MIN_RESERVE_CENTS must be explicitly configured as integer minor units",
    );
  }
  const reserve = Number(normalized);
  if (!Number.isSafeInteger(reserve))
    throw new Error("PAYOUT_MIN_RESERVE_CENTS exceeds safe integer range");
  return reserve;
}

function parsePublicBaseUrl(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("PAYOUT_PUBLIC_BASE_URL must be an absolute HTTPS URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PAYOUT_PUBLIC_BASE_URL must be an absolute HTTPS origin without credentials",
    );
  }
  return url.origin;
}

export function getPayoutRuntimeConfig(
  env: PayoutRuntimeEnv,
  operation: PayoutOperation,
): PayoutRuntimeConfig {
  const environment = parseEnvironment(env.STRIPE_ARTIST_PAYOUTS_ENV);
  if (!env.PAYOUTS_D1) throw new Error("PAYOUTS_D1 is not configured");

  if (
    !operation.endsWith("-webhook") &&
    !enabled(env.STRIPE_ARTIST_PAYOUTS_ENABLED)
  ) {
    throw new Error("STRIPE_ARTIST_PAYOUTS_ENABLED is not true");
  }
  if (operation === "intake" && !enabled(env.STRIPE_ARTIST_INTAKE_ENABLED)) {
    throw new Error("STRIPE_ARTIST_INTAKE_ENABLED is not true");
  }
  if (
    operation === "onboarding" &&
    !enabled(env.STRIPE_ARTIST_ONBOARDING_ENABLED)
  ) {
    throw new Error("STRIPE_ARTIST_ONBOARDING_ENABLED is not true");
  }
  if (
    operation === "transfer" &&
    !enabled(env.STRIPE_ARTIST_TRANSFERS_ENABLED)
  ) {
    throw new Error("STRIPE_ARTIST_TRANSFERS_ENABLED is not true");
  }

  const stripeSecretKey =
    operation === "read"
      ? null
      : requireStripeKey(
          environment,
          environment === "live"
            ? env.STRIPE_PAYOUTS_LIVE_SECRET_KEY
            : env.STRIPE_PAYOUTS_SANDBOX_SECRET_KEY,
        );
  const stripePlatformAccountId =
    operation === "read"
      ? null
      : requirePlatformAccountId(
          environment,
          environment === "live"
            ? env.STRIPE_PAYOUTS_LIVE_PLATFORM_ACCOUNT_ID
            : env.STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID,
        );

  const webhookSecret =
    operation === "account-webhook"
      ? (environment === "live"
          ? env.STRIPE_PAYOUTS_LIVE_ACCOUNT_WEBHOOK_SECRET
          : env.STRIPE_PAYOUTS_SANDBOX_ACCOUNT_WEBHOOK_SECRET
        )?.trim()
      : operation === "payout-webhook"
        ? (environment === "live"
            ? env.STRIPE_PAYOUTS_LIVE_PAYOUT_WEBHOOK_SECRET
            : env.STRIPE_PAYOUTS_SANDBOX_PAYOUT_WEBHOOK_SECRET
          )?.trim()
        : undefined;
  if (
    operation.endsWith("-webhook") &&
    !/^whsec_[A-Za-z0-9_]{12,}$/.test(webhookSecret ?? "")
  ) {
    throw new Error(
      `A valid ${environment} Connect webhook signing secret is not configured`,
    );
  }

  return {
    environment,
    stripeSecretKey,
    stripePlatformAccountId,
    stripeWebhookSecret: webhookSecret || null,
    minimumReserveCents:
      operation === "transfer" || operation === "preview"
        ? parseReserve(env.PAYOUT_MIN_RESERVE_CENTS)
        : null,
    publicBaseUrl:
      operation === "onboarding"
        ? parsePublicBaseUrl(env.PAYOUT_PUBLIC_BASE_URL)
        : null,
  };
}

export function assertBalanceCanFundBatch(input: {
  availableBalanceCents: number;
  batchTotalCents: number;
  minimumReserveCents: number;
}): void {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(`${name} must be non-negative integer minor units`);
  }
  if (
    input.availableBalanceCents -
      input.batchTotalCents -
      input.minimumReserveCents <
    0
  ) {
    throw new Error(
      "Stripe available balance would fall below the configured payout reserve",
    );
  }
}
