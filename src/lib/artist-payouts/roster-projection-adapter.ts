import {
  appsScriptRequest,
  validateAppsScriptTransportEndpoint,
} from "./apps-script-transport.ts";
import {
  ONBOARDING_STATES,
  PAYOUT_ENVIRONMENTS,
  type OnboardingState,
  type PayoutEnvironment,
  type PayoutRuntimeEnv,
} from "./types.ts";
import {
  isIsoDate,
  isIsoInstant,
  isSafeBusinessId,
  isSpreadsheetSafeText,
  isStripeAccountId,
  sanitizeOperationalText,
} from "./validation.ts";
import { dateInTimeZone } from "./schedule.ts";
import type { ArtistAccountRecord } from "./repository.ts";

const REQUIREMENT_STATES = [
  "complete",
  "pending",
  "currently_due",
  "past_due",
  "closed",
  "inactive",
] as const;

export interface ArtistRosterProjection {
  environment: PayoutEnvironment;
  artistId: string;
  connectedAccountId: string;
  onboardingStatus: OnboardingState;
  requirementsStatus: (typeof REQUIREMENT_STATES)[number];
  transfersEnabled: boolean;
  payoutReady: boolean;
  dashboardType: "express";
  preferredPayoutType: "automatic_standard" | "unverified";
  lastRequirementsCheckAt: string;
  onboardedDate: string | null;
  disabledReason: string | null;
  exceptionFlag: boolean;
}

export interface ArtistRosterProjectionConfig {
  writeUrl: string;
  readUrl: string;
  allowedOrigin: string;
  secret: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxResponseClockSkewSeconds?: number;
}

export interface ArtistRosterSyncReceipt {
  artistId: string;
  revision: string;
  requestId: string;
  recovered: boolean;
}

export interface ArtistRosterProjectionWriter {
  sync(account: ArtistAccountRecord): Promise<ArtistRosterSyncReceipt>;
}

export function rosterProjectionConfigFromRuntimeEnv(
  env: PayoutRuntimeEnv,
  environment: PayoutEnvironment,
): ArtistRosterProjectionConfig {
  const sandbox = environment === "sandbox";
  const values = {
    writeUrl: (sandbox
      ? env.PAYOUT_SANDBOX_ROSTER_PROJECTION_WRITE_URL
      : env.PAYOUT_LIVE_ROSTER_PROJECTION_WRITE_URL
    )?.trim(),
    readUrl: (sandbox
      ? env.PAYOUT_SANDBOX_ROSTER_PROJECTION_READ_URL
      : env.PAYOUT_LIVE_ROSTER_PROJECTION_READ_URL
    )?.trim(),
    allowedOrigin: (sandbox
      ? env.PAYOUT_SANDBOX_ROSTER_PROJECTION_ALLOWED_ORIGIN
      : env.PAYOUT_LIVE_ROSTER_PROJECTION_ALLOWED_ORIGIN
    )?.trim(),
    secret: (sandbox
      ? env.PAYOUT_SANDBOX_ROSTER_PROJECTION_SECRET
      : env.PAYOUT_LIVE_ROSTER_PROJECTION_SECRET
    )?.trim(),
  };
  if (
    !values.writeUrl ||
    !values.readUrl ||
    !values.allowedOrigin ||
    !values.secret
  ) {
    throw new Error("Artist roster status projection is not configured");
  }
  return values as ArtistRosterProjectionConfig;
}

interface RosterAdapterResponse {
  ok?: unknown;
  environment?: unknown;
  artistId?: unknown;
  revision?: unknown;
  requestId?: unknown;
  projection?: unknown;
  error?: unknown;
}

function assertProjection(value: ArtistRosterProjection): void {
  if (!PAYOUT_ENVIRONMENTS.includes(value.environment))
    throw new Error("Artist roster projection environment is invalid");
  if (!isSafeBusinessId(value.artistId))
    throw new Error("Artist roster projection identity is invalid");
  if (!isStripeAccountId(value.connectedAccountId))
    throw new Error("Artist roster projection account ID is invalid");
  if (!ONBOARDING_STATES.includes(value.onboardingStatus))
    throw new Error("Artist roster projection onboarding state is invalid");
  if (!REQUIREMENT_STATES.includes(value.requirementsStatus))
    throw new Error("Artist roster projection requirements state is invalid");
  if (
    typeof value.transfersEnabled !== "boolean" ||
    typeof value.payoutReady !== "boolean" ||
    typeof value.exceptionFlag !== "boolean"
  ) {
    throw new Error("Artist roster projection flags are invalid");
  }
  if (value.payoutReady !== (value.onboardingStatus === "PAYOUT_READY")) {
    throw new Error("Artist roster payout readiness state is contradictory");
  }
  if (
    value.transfersEnabled &&
    !["RESTRICTED", "TRANSFERS_ENABLED", "PAYOUT_READY"].includes(
      value.onboardingStatus,
    )
  ) {
    throw new Error("Artist roster transfer state is contradictory");
  }
  if (
    value.onboardingStatus === "TRANSFERS_ENABLED" &&
    !value.transfersEnabled
  ) {
    throw new Error("Artist roster transfer state is contradictory");
  }
  if (value.payoutReady && value.requirementsStatus !== "complete") {
    throw new Error(
      "Artist roster payout readiness requires complete requirements",
    );
  }
  if (
    value.dashboardType !== "express" ||
    !["automatic_standard", "unverified"].includes(value.preferredPayoutType)
  ) {
    throw new Error("Artist roster payout configuration is unsupported");
  }
  if (value.payoutReady && value.preferredPayoutType !== "automatic_standard") {
    throw new Error(
      "Artist roster payout readiness requires verified automatic standard payouts",
    );
  }
  if (!isIsoInstant(value.lastRequirementsCheckAt))
    throw new Error("Artist roster requirements check time is invalid");
  if (value.onboardedDate !== null && !isIsoDate(value.onboardedDate))
    throw new Error("Artist roster onboarded date is invalid");
  if (
    ["ONBOARDING_COMPLETE", "TRANSFERS_ENABLED", "PAYOUT_READY"].includes(
      value.onboardingStatus,
    ) &&
    value.onboardedDate === null
  ) {
    throw new Error("Artist roster advanced state requires an onboarded date");
  }
  const expectedException = ["RESTRICTED", "DISABLED"].includes(
    value.onboardingStatus,
  );
  if (value.exceptionFlag !== expectedException)
    throw new Error("Artist roster exception state is contradictory");
  if (value.disabledReason !== null) {
    if (!isSpreadsheetSafeText(value.disabledReason, 240))
      throw new Error("Artist roster disabled reason is invalid");
  }
}

export function projectionFromArtistAccount(
  account: ArtistAccountRecord,
): ArtistRosterProjection {
  if (!account.lastRequirementsCheckAt)
    throw new Error("Artist account has not completed a Stripe status check");
  if (!REQUIREMENT_STATES.includes(account.requirementsStatus as never)) {
    throw new Error("Artist account requirements state is unsupported");
  }
  const projection: ArtistRosterProjection = {
    environment: account.environment,
    artistId: account.artistId,
    connectedAccountId: account.stripeAccountId,
    onboardingStatus: account.onboardingStatus,
    requirementsStatus:
      account.requirementsStatus as ArtistRosterProjection["requirementsStatus"],
    transfersEnabled: account.transfersStatus === "active",
    payoutReady: account.onboardingStatus === "PAYOUT_READY",
    dashboardType: account.dashboardType,
    preferredPayoutType: account.preferredPayoutType,
    lastRequirementsCheckAt: account.lastRequirementsCheckAt,
    onboardedDate: account.onboardedAt
      ? dateInTimeZone(new Date(account.onboardedAt))
      : null,
    disabledReason: account.disabledReason,
    exceptionFlag: account.payoutExceptionFlag,
  };
  assertProjection(projection);
  return projection;
}

export function createArtistRosterProjectionWriter(
  config: ArtistRosterProjectionConfig,
  fetcher: typeof fetch = fetch,
): ArtistRosterProjectionWriter {
  return {
    sync: (account) =>
      syncArtistRosterProjection(
        projectionFromArtistAccount(account),
        config,
        fetcher,
      ),
  };
}

function transportConfig(
  url: string,
  projection: ArtistRosterProjection,
  config: ArtistRosterProjectionConfig,
) {
  return {
    url,
    allowedOrigin: config.allowedOrigin,
    secret: config.secret,
    environment: projection.environment,
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxResponseClockSkewSeconds: config.maxResponseClockSkewSeconds,
  };
}

function readDescriptor(projection: ArtistRosterProjection): string {
  return JSON.stringify({
    operation: "artist_roster_projection_read_v1",
    environment: projection.environment,
    artistId: projection.artistId,
  });
}

function writePayload(
  projection: ArtistRosterProjection,
  expectedRevision: string,
) {
  const orderedProjection: ArtistRosterProjection = {
    environment: projection.environment,
    artistId: projection.artistId,
    connectedAccountId: projection.connectedAccountId,
    onboardingStatus: projection.onboardingStatus,
    requirementsStatus: projection.requirementsStatus,
    transfersEnabled: projection.transfersEnabled,
    payoutReady: projection.payoutReady,
    dashboardType: projection.dashboardType,
    preferredPayoutType: projection.preferredPayoutType,
    lastRequirementsCheckAt: projection.lastRequirementsCheckAt,
    onboardedDate: projection.onboardedDate,
    disabledReason: projection.disabledReason,
    exceptionFlag: projection.exceptionFlag,
  };
  return {
    operation: "artist_roster_projection_v1" as const,
    expectedArtistId: projection.artistId,
    expectedRevision,
    projection: orderedProjection,
  };
}

function exactProjection(
  value: unknown,
  expected: ArtistRosterProjection,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expectedRecord = expected as unknown as Record<string, unknown>;
  const keys = Object.keys(expectedRecord).sort();
  return (
    JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(keys) &&
    keys.every(
      (key) =>
        JSON.stringify(actual[key]) === JSON.stringify(expectedRecord[key]),
    )
  );
}

function adapterResponse(
  value: unknown,
  label: "read" | "write",
  projection: ArtistRosterProjection,
): RosterAdapterResponse {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Artist roster " + label + " returned an invalid signed payload",
    );
  const result = value as RosterAdapterResponse;
  const expected =
    result.ok === true
      ? label === "read"
        ? [
            "artistId",
            "environment",
            "ok",
            "projection",
            "requestId",
            "revision",
          ]
        : ["artistId", "environment", "ok", "requestId", "revision"]
      : ["error", "ok"];
  if (
    JSON.stringify(Object.keys(result).sort()) !==
    JSON.stringify(expected.sort())
  ) {
    throw new Error("Artist roster " + label + " payload has an invalid shape");
  }
  if (result.ok !== true)
    throw new Error("Artist roster " + label + " failed closed");
  if (
    result.environment !== projection.environment ||
    result.artistId !== projection.artistId
  ) {
    throw new Error("Artist roster response identity is invalid");
  }
  return result;
}

function responseIdentity(
  result: RosterAdapterResponse,
  requestId: string,
): ArtistRosterSyncReceipt {
  const artistId = sanitizeOperationalText(result.artistId, 160);
  const revision = sanitizeOperationalText(result.revision, 200);
  const responseRequestId = sanitizeOperationalText(result.requestId, 160);
  if (!artistId || !revision || !responseRequestId)
    throw new Error("Artist roster response omitted persistence identity");
  if (responseRequestId !== requestId)
    throw new Error("Artist roster response request identity is invalid");
  return {
    artistId,
    revision,
    requestId: responseRequestId,
    recovered: false,
  };
}

export async function syncArtistRosterProjection(
  projection: ArtistRosterProjection,
  config: ArtistRosterProjectionConfig,
  fetcher: typeof fetch = fetch,
): Promise<ArtistRosterSyncReceipt> {
  assertProjection(projection);
  const writeEndpoint = validateAppsScriptTransportEndpoint({
    url: config.writeUrl,
    allowedOrigin: config.allowedOrigin,
  });
  const readEndpoint = validateAppsScriptTransportEndpoint({
    url: config.readUrl,
    allowedOrigin: config.allowedOrigin,
  });
  if (writeEndpoint.href === readEndpoint.href)
    throw new Error("Artist roster read and write endpoints must be distinct");

  const readCurrent = async (): Promise<{
    result: RosterAdapterResponse;
    identity: ArtistRosterSyncReceipt;
  }> => {
    const transport = await appsScriptRequest(
      {
        operation: "artist_roster_projection_read_v1",
        method: "GET",
        businessDescriptor: readDescriptor(projection),
        query: [
          ["environment", projection.environment],
          ["artistId", projection.artistId],
        ],
        config: transportConfig(readEndpoint.href, projection, config),
      },
      fetcher,
    );
    const result = adapterResponse(transport.payload, "read", projection);
    const identity = responseIdentity(result, transport.requestId);
    return { result, identity };
  };

  const current = await readCurrent();
  if (exactProjection(current.result.projection, projection)) {
    return { ...current.identity, recovered: true };
  }

  const payload = writePayload(projection, current.identity.revision);
  let writeResult: RosterAdapterResponse | null = null;
  let writeRequestId: string | null = null;
  let writeError: unknown = null;
  try {
    const transport = await appsScriptRequest(
      {
        operation: "artist_roster_projection_v1",
        method: "POST",
        businessDescriptor: JSON.stringify(payload),
        payload,
        config: transportConfig(writeEndpoint.href, projection, config),
      },
      fetcher,
    );
    writeResult = adapterResponse(transport.payload, "write", projection);
    writeRequestId = transport.requestId;
    responseIdentity(writeResult, writeRequestId);
  } catch (error) {
    writeError = error;
  }

  let verified: Awaited<ReturnType<typeof readCurrent>>;
  try {
    verified = await readCurrent();
  } catch (readError) {
    if (writeError) {
      throw new AggregateError(
        [writeError, readError],
        "Artist roster write outcome is ambiguous and requires review",
        { cause: readError },
      );
    }
    throw readError;
  }
  if (!exactProjection(verified.result.projection, projection)) {
    if (writeError) {
      throw new AggregateError(
        [writeError],
        "Artist roster write outcome is ambiguous and requires review",
      );
    }
    throw new Error(
      "Artist roster independent readback did not match the safe projection",
    );
  }
  if (writeResult && writeRequestId) {
    const writeIdentity = responseIdentity(writeResult, writeRequestId);
    if (
      writeIdentity.artistId !== verified.identity.artistId ||
      writeIdentity.revision !== verified.identity.revision
    ) {
      throw new Error(
        "Artist roster write acknowledgement and readback disagree",
      );
    }
  }
  return { ...verified.identity, recovered: writeError !== null };
}
