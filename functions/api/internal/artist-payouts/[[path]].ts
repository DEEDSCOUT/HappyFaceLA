import {
  ArtistPayoutApplicationService,
  type BatchExecutionResult,
  type PayoutServiceClock,
} from "../../../../src/lib/artist-payouts/application-service.ts";
import { authoritativePayoutSourcesFromEnv } from "../../../../src/lib/artist-payouts/authoritative-sources.ts";
import {
  authenticatePayoutActor,
  assertMutationRequest,
} from "../../../../src/lib/artist-payouts/auth.ts";
import {
  getPayoutRuntimeConfig,
  type PayoutOperation,
} from "../../../../src/lib/artist-payouts/config.ts";
import { manualPaymentIntentDigest } from "../../../../src/lib/artist-payouts/approval.ts";
import {
  PayoutRepository,
  PayoutRepositoryError,
  dashboardQueryFromUrl,
  type DashboardQuery,
  type DashboardSnapshot,
  type PayoutBatchRecord,
  type PayoutDestinationVarianceApprovalRecord,
} from "../../../../src/lib/artist-payouts/repository.ts";
import { createStripePayoutGateway } from "../../../../src/lib/artist-payouts/stripe-gateway.ts";
import {
  assertCurrentLosAngelesProcessingDay,
  dateInTimeZone,
} from "../../../../src/lib/artist-payouts/schedule.ts";
import type {
  CrmAdapterConfig,
  CrmSyncReceipt,
} from "../../../../src/lib/artist-payouts/crm-adapter.ts";
import {
  createArtistRosterProjectionWriter,
  rosterProjectionConfigFromRuntimeEnv,
} from "../../../../src/lib/artist-payouts/roster-projection-adapter.ts";
import type {
  LedgerRecord,
  PayoutActor,
  PayoutEnvironment,
  PayoutRuntimeEnv,
  StripePayoutGateway,
} from "../../../../src/lib/artist-payouts/types.ts";
import {
  isIsoDate,
  isSafeBusinessId,
  readJsonObject,
  sanitizeOperationalText,
} from "../../../../src/lib/artist-payouts/validation.ts";

const API_PREFIX = "/api/internal/artist-payouts";
const JSON_LIMIT_BYTES = 24_576;
const DIGEST_RE = /^sha256:[A-Za-z0-9_-]{43}$/;

export const ARTIST_PAYOUT_RUNTIME_OPERATIONS = Object.freeze({
  preview: "preview",
  execute: "transfer",
  reconcile: "reconcile",
} as const);

interface PagesContext {
  request: Request;
  env: PayoutRuntimeEnv;
  params?: Record<string, string | string[]>;
}

interface OnboardingInput {
  artistId: string;
  actor: PayoutActor;
  requestId: string;
}

interface LedgerInput {
  crmRecordId: string;
  actor: PayoutActor;
  requestId: string;
}

interface BatchMutationInput {
  batchId: string;
  expectedDigest: string;
  expectedRevision: number;
  actor: PayoutActor;
  requestId: string;
}

interface RouteOperations {
  dashboard(
    env: PayoutRuntimeEnv,
    query: DashboardQuery,
  ): Promise<DashboardSnapshot>;
  startOnboarding(
    env: PayoutRuntimeEnv,
    input: OnboardingInput,
  ): Promise<{
    invitationUrl: string;
    challengeCode: string;
    expiresAt: number;
    account: { artistId: string; onboardingStatus: string };
  }>;
  mapExistingStripeRecipient(
    env: PayoutRuntimeEnv,
    input: {
      artistId: string;
      accountId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{
    artistId: string;
    stripeAccountId: string;
    onboardingStatus: string;
  }>;
  activateArtistPayoutAccount(
    env: PayoutRuntimeEnv,
    input: {
      artistId: string;
      accountId: string;
      identityEvidenceReference: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{
    artistId: string;
    stripeAccountId: string;
    onboardingStatus: string;
  }>;
  ingestLedger(
    env: PayoutRuntimeEnv,
    input: LedgerInput,
  ): Promise<{
    ledger: LedgerRecord;
    blockers: string[];
    approvalInvalidated: boolean;
  }>;
  prepareBatch(
    env: PayoutRuntimeEnv,
    input: {
      scheduledDate: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{ batch: PayoutBatchRecord; approvalDigest: string }>;
  approveBatch(
    env: PayoutRuntimeEnv,
    input: BatchMutationInput,
  ): Promise<PayoutBatchRecord>;
  releaseUnchangedBatchAssignments(
    env: PayoutRuntimeEnv,
    input: {
      batchId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{ batch: PayoutBatchRecord; releasedLedgerIds: string[] }>;
  authorizeCrossDayBatchRecovery(
    env: PayoutRuntimeEnv,
    input: {
      batchId: string;
      expectedDigest: string;
      expectedRevision: number;
      reason: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<PayoutBatchRecord>;
  executeBatch(
    env: PayoutRuntimeEnv,
    input: BatchMutationInput,
  ): Promise<BatchExecutionResult>;
  reconcileAmbiguousTransferOutcome(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      transferId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<LedgerRecord>;
  approvePayoutDestinationVariance(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      payoutId: string;
      reason: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<PayoutDestinationVarianceApprovalRecord>;
  recordManualPaymentException(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      expectedAmountCents: number;
      method: string;
      reason: string;
      evidenceReference: string;
      memo: string;
      intentDigest: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt }>;
  cancelManualPaymentIntent(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<LedgerRecord>;
  assertExecutionProcessingDay(
    env: PayoutRuntimeEnv,
    batchId: string,
    now: Date,
  ): Promise<void>;
  reconcilePayout(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      payoutId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt | null }>;
  reconcileCorrectiveState(
    env: PayoutRuntimeEnv,
    input: {
      ledgerId: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt }>;
  resolveException(
    env: PayoutRuntimeEnv,
    input: {
      exceptionId: string;
      evidence: string;
      actor: PayoutActor;
      requestId: string;
    },
  ): Promise<void>;
}

export interface ArtistPayoutRouteDependencies {
  authenticate: typeof authenticatePayoutActor;
  operations: RouteOperations;
  now(): Date;
}

const unavailableStripe: StripePayoutGateway = {
  findRecipientsByArtist: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  createRecipient: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  createOnboardingLink: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  retrieveRecipientStatus: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  retrieveAvailableBalance: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  createTransfer: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  retrieveTransfer: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  findTransfersByRecoveryFingerprint: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  retrievePayout: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
  payoutContainsDestinationPayment: async () => {
    throw new Error("Stripe access is unavailable for this operation");
  },
};

function repositoryFor(
  env: PayoutRuntimeEnv,
  operation: PayoutOperation,
): {
  repository: PayoutRepository;
  environment: PayoutEnvironment;
  secretKey: string | null;
  platformAccountId: string | null;
  publicBaseUrl: string | null;
  minimumReserveCents: number | null;
} {
  const config = getPayoutRuntimeConfig(env, operation);
  return {
    repository: new PayoutRepository(env.PAYOUTS_D1!, config.environment),
    environment: config.environment,
    secretKey: config.stripeSecretKey,
    platformAccountId: config.stripePlatformAccountId,
    publicBaseUrl: config.publicBaseUrl,
    minimumReserveCents: config.minimumReserveCents,
  };
}

function localService(
  env: PayoutRuntimeEnv,
  sourceRequired = false,
): ArtistPayoutApplicationService {
  const config = repositoryFor(env, "read");
  return new ArtistPayoutApplicationService(
    config.repository,
    unavailableStripe,
    "https://payouts.invalid",
    null,
    undefined,
    sourceRequired
      ? authoritativePayoutSourcesFromEnv(env, config.environment)
      : null,
  );
}

function stripeService(
  env: PayoutRuntimeEnv,
  operation: "preview" | "intake" | "onboarding" | "transfer" | "reconcile",
  sourceRequired = operation === "intake" ||
    operation === "onboarding" ||
    operation === "transfer",
  clock?: PayoutServiceClock,
): ArtistPayoutApplicationService {
  const config = repositoryFor(env, operation);
  if (!config.secretKey || !config.platformAccountId)
    throw new Error("Stripe payout credentials are unavailable");
  return new ArtistPayoutApplicationService(
    config.repository,
    createStripePayoutGateway({
      environment: config.environment,
      secretKey: config.secretKey,
      expectedPlatformAccountId: config.platformAccountId,
    }),
    config.publicBaseUrl ?? "https://payouts.invalid",
    config.minimumReserveCents,
    clock,
    sourceRequired
      ? authoritativePayoutSourcesFromEnv(env, config.environment)
      : null,
    operation === "onboarding"
      ? onboardingSecretFromEnv(env, config.environment)
      : null,
    sourceRequired && operation !== "preview"
      ? createArtistRosterProjectionWriter(
          rosterProjectionConfigFromRuntimeEnv(env, config.environment),
        )
      : null,
  );
}

export function prepareBatchWithRuntimeStripe(
  env: PayoutRuntimeEnv,
  input: {
    scheduledDate: string;
    actor: PayoutActor;
    requestId: string;
  },
  clock?: PayoutServiceClock,
): Promise<
  Awaited<ReturnType<ArtistPayoutApplicationService["prepareBatch"]>>
> {
  return stripeService(
    env,
    ARTIST_PAYOUT_RUNTIME_OPERATIONS.preview,
    false,
    clock,
  ).prepareBatch(input);
}

function environmentValue(
  environment: PayoutEnvironment,
  sandbox: string | undefined,
  live: string | undefined,
): string | undefined {
  return environment === "sandbox" ? sandbox : live;
}

function onboardingSecretFromEnv(
  env: PayoutRuntimeEnv,
  environment: PayoutEnvironment,
): string | null {
  return (
    environmentValue(
      environment,
      env.PAYOUT_SANDBOX_ONBOARDING_CLAIM_SECRET,
      env.PAYOUT_LIVE_ONBOARDING_CLAIM_SECRET,
    ) ?? null
  );
}

function crmConfigFromEnv(
  env: PayoutRuntimeEnv,
  environment: PayoutEnvironment,
): CrmAdapterConfig {
  const writeUrl = environmentValue(
    environment,
    env.PAYOUT_SANDBOX_CRM_WRITE_URL,
    env.PAYOUT_LIVE_CRM_WRITE_URL,
  )?.trim();
  const readUrl = environmentValue(
    environment,
    env.PAYOUT_SANDBOX_CRM_READ_URL,
    env.PAYOUT_LIVE_CRM_READ_URL,
  )?.trim();
  const allowedOrigin = environmentValue(
    environment,
    env.PAYOUT_SANDBOX_CRM_ALLOWED_ORIGIN,
    env.PAYOUT_LIVE_CRM_ALLOWED_ORIGIN,
  )?.trim();
  const secret = environmentValue(
    environment,
    env.PAYOUT_SANDBOX_CRM_WEBHOOK_SECRET,
    env.PAYOUT_LIVE_CRM_WEBHOOK_SECRET,
  )?.trim();
  if (!writeUrl || !readUrl || !allowedOrigin || !secret) {
    throw new Error("CRM payout reconciliation is not configured");
  }
  return { writeUrl, readUrl, allowedOrigin, secret };
}

const defaultOperations: RouteOperations = {
  dashboard: async (env, query) => {
    try {
      return await stripeService(
        env,
        ARTIST_PAYOUT_RUNTIME_OPERATIONS.preview,
        true,
      ).dashboardWithFundingPreview(query);
    } catch {
      const snapshot = await localService(
        env,
        true,
      ).dashboardWithFundingPreview(query);
      return {
        ...snapshot,
        fundingPreviewUnavailable: true,
        fundingPreviewError: {
          code: "STRIPE_PREVIEW_CONFIGURATION_UNAVAILABLE",
          checkedAt: new Date().toISOString(),
        },
      };
    }
  },
  startOnboarding: async (env, input) =>
    stripeService(env, "onboarding").startOnboarding(input),
  mapExistingStripeRecipient: async (env, input) =>
    stripeService(env, "onboarding").mapExistingStripeRecipient(input),
  activateArtistPayoutAccount: async (env, input) =>
    stripeService(env, "onboarding").activateArtistPayoutAccount(input),
  ingestLedger: async (env, input) =>
    stripeService(env, "intake").ingestLedger(input),
  prepareBatch: async (env, input) => prepareBatchWithRuntimeStripe(env, input),
  approveBatch: async (env, input) => localService(env).approveBatch(input),
  releaseUnchangedBatchAssignments: async (env, input) =>
    localService(env).releaseUnchangedBatchAssignments(input),
  authorizeCrossDayBatchRecovery: async (env, input) =>
    localService(env).authorizeCrossDayBatchRecovery(input),
  executeBatch: async (env, input) =>
    stripeService(env, ARTIST_PAYOUT_RUNTIME_OPERATIONS.execute).executeBatch(
      input,
    ),
  reconcileAmbiguousTransferOutcome: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
    ).reconcileAmbiguousTransferOutcome(input),
  approvePayoutDestinationVariance: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
    ).approvePayoutDestinationVariance(input),
  recordManualPaymentException: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
      true,
    ).recordManualPaymentException({
      ...input,
      crm: crmConfigFromEnv(env, repositoryFor(env, "read").environment),
    }),
  cancelManualPaymentIntent: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
      true,
    ).cancelManualPaymentIntent({
      ...input,
      crm: crmConfigFromEnv(env, repositoryFor(env, "read").environment),
    }),
  assertExecutionProcessingDay: async (env, batchId, now) => {
    const config = repositoryFor(env, "read");
    const batch = await config.repository.getBatch(batchId);
    if (!batch)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout batch was not found",
      );
    const processingDate = dateInTimeZone(now);
    assertCurrentLosAngelesProcessingDay(processingDate, now);
    if (
      batch.scheduledDate !== processingDate &&
      (batch.recoveryProcessingDate !== processingDate ||
        !batch.recoveryAuthorizedBy ||
        !batch.recoveryAuthorizedAt ||
        !batch.recoveryReason)
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Batch is not authorized for this Los Angeles processing date",
      );
    }
  },
  reconcilePayout: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
    ).reconcilePayout({
      ...input,
      crm: crmConfigFromEnv(env, repositoryFor(env, "read").environment),
    }),
  reconcileCorrectiveState: async (env, input) =>
    stripeService(
      env,
      ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
    ).reconcileCorrectiveState({
      ...input,
      crm: crmConfigFromEnv(env, repositoryFor(env, "read").environment),
    }),
  resolveException: async (env, input) => {
    const config = repositoryFor(env, "read");
    const resolvedAt = new Date().toISOString();
    await config.repository.resolveException({
      exceptionId: input.exceptionId,
      evidence: input.evidence,
      actor: input.actor.email,
      auditId: `audit_${crypto.randomUUID()}`,
      requestId: input.requestId,
      resolvedAt,
    });
  },
};

const defaultDependencies: ArtistPayoutRouteDependencies = {
  authenticate: authenticatePayoutActor,
  operations: defaultOperations,
  now: () => new Date(),
};

function securityHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "no-store, private, max-age=0",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    vary: "CF-Access-Jwt-Assertion",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "content-security-policy":
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders("application/json; charset=utf-8"),
  });
}

function genericError(status: 401 | 403 | 404 | 405 | 409 | 503): Response {
  const messages = {
    401: "Authentication required",
    403: "Action not permitted",
    404: "Not found",
    405: "Method not allowed",
    409: "Request could not be applied",
    503: "Artist payouts temporarily unavailable",
  } as const;
  return json({ ok: false, error: messages[status] }, status);
}

function routeSegments(request: Request): string[] | null {
  const pathname = new URL(request.url).pathname;
  if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`))
    return null;
  const suffix = pathname.slice(API_PREFIX.length);
  if (!suffix) return [];
  if (/%2f|%5c/i.test(suffix) || suffix.includes("\\")) return null;
  try {
    const rawSegments = suffix.slice(1).split("/");
    if (rawSegments.some((segment) => segment.length === 0)) return null;
    const segments = rawSegments.map((segment) => decodeURIComponent(segment));
    return segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
      ? null
      : segments;
  } catch {
    return null;
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function safeRequiredText(value: unknown, maxLength: number): string | null {
  const safe = sanitizeOperationalText(value, maxLength);
  return typeof value === "string" && safe.length > 0 && safe === value.trim()
    ? safe
    : null;
}

function serverMutationOrigin(env: PayoutRuntimeEnv): string {
  const raw = env.PAYOUT_PUBLIC_BASE_URL?.trim() ?? "";
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Payout mutation origin is not configured");
  }
  return url.origin;
}

async function mutationBody(
  request: Request,
  env: PayoutRuntimeEnv,
): Promise<Record<string, unknown> | Response> {
  let configuredOrigin: string;
  try {
    configuredOrigin = serverMutationOrigin(env);
  } catch {
    return genericError(503);
  }
  try {
    assertMutationRequest(request, configuredOrigin);
  } catch {
    return genericError(403);
  }
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    return genericError(409);
  }
  try {
    return await readJsonObject(request, JSON_LIMIT_BYTES);
  } catch {
    return genericError(409);
  }
}

function requestId(request: Request): string {
  return request.headers.get("idempotency-key")!.trim();
}

function batchConfirmation(
  body: Record<string, unknown>,
  batchId: string,
  verb: "APPROVE" | "EXECUTE",
): { expectedDigest: string; expectedRevision: number } | null {
  if (
    !hasExactKeys(body, ["expectedDigest", "expectedRevision", "confirmation"])
  )
    return null;
  if (!DIGEST_RE.test(String(body.expectedDigest ?? ""))) return null;
  if (
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0
  )
    return null;
  if (body.confirmation !== `${verb} ${batchId}`) return null;
  return {
    expectedDigest: body.expectedDigest as string,
    expectedRevision: body.expectedRevision as number,
  };
}

function statusForFailure(error: unknown): 409 | 503 {
  if (error instanceof PayoutRepositoryError) {
    return [
      "INVALID_INPUT",
      "NOT_FOUND",
      "CONFLICT",
      "STALE_REVISION",
      "APPROVAL_INVALIDATED",
      "CLAIM_REJECTED",
    ].includes(error.code)
      ? 409
      : 503;
  }
  const message = error instanceof Error ? error.message : "";
  if (
    /requires owner reconciliation|No eligible assignments|cannot be in the future|cannot precede|was not found|does not match the owner-reviewed snapshot|not eligible for owner-triggered execution|no transfer items|already in progress|does not contain the approved transfer|Payout processing|Payout batch date/i.test(
      message,
    )
  ) {
    return 409;
  }
  return 503;
}

async function authenticate(
  request: Request,
  env: PayoutRuntimeEnv,
  dependency: ArtistPayoutRouteDependencies,
): Promise<PayoutActor | Response> {
  if (!request.headers.get("cf-access-jwt-assertion")?.trim())
    return genericError(401);
  try {
    return await dependency.authenticate(request, env, "admin");
  } catch {
    return genericError(401);
  }
}

export async function handleArtistPayoutApiRequest(
  context: PagesContext,
  dependency: ArtistPayoutRouteDependencies = defaultDependencies,
): Promise<Response> {
  const actor = await authenticate(context.request, context.env, dependency);
  if (actor instanceof Response) return actor;

  const segments = routeSegments(context.request);
  if (segments === null) return genericError(404);
  const method = context.request.method.toUpperCase();

  if (
    method === "GET" &&
    (segments.length === 0 ||
      (segments.length === 1 && segments[0] === "dashboard"))
  ) {
    try {
      const dashboard = await dependency.operations.dashboard(
        context.env,
        dashboardQueryFromUrl(context.request.url),
      );
      return json({ ok: true, dashboard });
    } catch {
      return genericError(503);
    }
  }
  if (
    method === "HEAD" &&
    (segments.length === 0 ||
      (segments.length === 1 && segments[0] === "dashboard"))
  ) {
    return new Response(null, {
      status: 200,
      headers: securityHeaders("application/json; charset=utf-8"),
    });
  }
  if (method !== "POST") return genericError(405);

  const body = await mutationBody(context.request, context.env);
  if (body instanceof Response) return body;
  const mutationRequestId = requestId(context.request);

  try {
    if (
      segments.length === 2 &&
      segments[0] === "onboarding" &&
      segments[1] === "activate"
    ) {
      if (actor.role !== "owner") return genericError(403);
      if (
        !hasExactKeys(body, [
          "artistId",
          "accountId",
          "identityEvidenceReference",
          "confirmation",
        ])
      )
        return genericError(409);
      const artistId = isSafeBusinessId(body.artistId) ? body.artistId : null;
      const accountId = String(body.accountId ?? "");
      const identityEvidenceReference = sanitizeOperationalText(
        body.identityEvidenceReference,
        120,
      );
      if (
        !artistId ||
        !/^acct_[A-Za-z0-9]{12,80}$/.test(accountId) ||
        !isSafeBusinessId(identityEvidenceReference) ||
        identityEvidenceReference.length < 8 ||
        identityEvidenceReference !==
          String(body.identityEvidenceReference ?? "").trim() ||
        body.confirmation !==
          `ACTIVATE ${artistId} ${accountId} IDENTITY VERIFIED`
      ) {
        return genericError(409);
      }
      const account = await dependency.operations.activateArtistPayoutAccount(
        context.env,
        {
          artistId,
          accountId,
          identityEvidenceReference,
          actor,
          requestId: mutationRequestId,
        },
      );
      return json({ ok: true, account });
    }

    if (
      segments.length === 2 &&
      segments[0] === "onboarding" &&
      segments[1] === "map-existing"
    ) {
      if (actor.role !== "owner") return genericError(403);
      if (!hasExactKeys(body, ["artistId", "accountId", "confirmation"]))
        return genericError(409);
      const artistId = isSafeBusinessId(body.artistId) ? body.artistId : null;
      const accountId = String(body.accountId ?? "");
      if (
        !artistId ||
        !/^acct_[A-Za-z0-9]{12,80}$/.test(accountId) ||
        body.confirmation !== `MAP ${artistId} ${accountId}`
      ) {
        return genericError(409);
      }
      const account = await dependency.operations.mapExistingStripeRecipient(
        context.env,
        { artistId, accountId, actor, requestId: mutationRequestId },
      );
      return json(
        {
          ok: true,
          account: {
            artistId: account.artistId,
            onboardingStatus: account.onboardingStatus,
          },
        },
        201,
      );
    }

    if (segments.length === 1 && segments[0] === "onboarding") {
      if (actor.role !== "owner") return genericError(403);
      if (!hasExactKeys(body, ["artistId", "confirmation"])) {
        return genericError(409);
      }
      const artistId = isSafeBusinessId(body.artistId) ? body.artistId : null;
      if (!artistId || body.confirmation !== `INVITE ${artistId}`)
        return genericError(409);
      const result = await dependency.operations.startOnboarding(context.env, {
        artistId,
        actor,
        requestId: mutationRequestId,
      });
      return json(
        {
          ok: true,
          invitationUrl: result.invitationUrl,
          challengeCode: result.challengeCode,
          expiresAt: result.expiresAt,
          account: {
            artistId: result.account.artistId,
            onboardingStatus: result.account.onboardingStatus,
          },
        },
        201,
      );
    }

    if (segments.length === 1 && segments[0] === "ledger") {
      if (!hasExactKeys(body, ["crmRecordId"])) return genericError(409);
      const crmRecordId = isSafeBusinessId(body.crmRecordId)
        ? body.crmRecordId
        : null;
      if (!crmRecordId) return genericError(409);
      const result = await dependency.operations.ingestLedger(context.env, {
        crmRecordId,
        actor,
        requestId: mutationRequestId,
      });
      return json({
        ok: true,
        ledger: {
          ledgerId: result.ledger.ledgerId,
          assignmentId: result.ledger.assignmentId,
          state: result.ledger.state,
          sourceRevision: result.ledger.sourceRevision,
        },
        blockers: result.blockers,
        approvalInvalidated: result.approvalInvalidated,
      });
    }

    if (
      segments.length === 2 &&
      segments[0] === "batches" &&
      segments[1] === "prepare"
    ) {
      if (
        !hasExactKeys(body, ["scheduledDate"]) ||
        !isIsoDate(body.scheduledDate)
      )
        return genericError(409);
      try {
        assertCurrentLosAngelesProcessingDay(
          body.scheduledDate,
          dependency.now(),
        );
      } catch {
        return genericError(409);
      }
      const result = await dependency.operations.prepareBatch(context.env, {
        scheduledDate: body.scheduledDate,
        actor,
        requestId: mutationRequestId,
      });
      return json(
        {
          ok: true,
          batch: {
            batchId: result.batch.batchId,
            status: result.batch.status,
            scheduledDate: result.batch.scheduledDate,
            itemCount: result.batch.itemCount,
            totalCents: result.batch.totalCents,
            approvalDigest: result.approvalDigest,
            approvalRevision: result.batch.approvalRevision,
          },
        },
        201,
      );
    }

    if (
      segments.length === 4 &&
      segments[0] === "ledgers" &&
      segments[2] === "manual-payment" &&
      segments[3] === "cancel"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, ["confirmation"]) ||
        body.confirmation !== `CANCEL MANUAL ${ledgerId}`
      ) {
        return genericError(409);
      }
      const ledger = await dependency.operations.cancelManualPaymentIntent(
        context.env,
        { ledgerId, actor, requestId: mutationRequestId },
      );
      return json({ ok: true, ledger: { ledgerId, state: ledger.state } });
    }

    if (
      segments.length === 3 &&
      segments[0] === "batches" &&
      segments[2] === "authorize-recovery"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const batchId = segments[1];
      if (
        !isSafeBusinessId(batchId) ||
        !hasExactKeys(body, [
          "expectedDigest",
          "expectedRevision",
          "reason",
          "confirmation",
        ]) ||
        typeof body.reason !== "string" ||
        body.reason.length < 12 ||
        body.reason.length > 240 ||
        !DIGEST_RE.test(String(body.expectedDigest ?? "")) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 0 ||
        body.confirmation !== `RECOVER ${batchId}`
      ) {
        return genericError(409);
      }
      const batch = await dependency.operations.authorizeCrossDayBatchRecovery(
        context.env,
        {
          batchId,
          expectedDigest: body.expectedDigest as string,
          expectedRevision: body.expectedRevision as number,
          reason: body.reason,
          actor,
          requestId: mutationRequestId,
        },
      );
      return json({
        ok: true,
        batch: {
          batchId: batch.batchId,
          recoveryProcessingDate: batch.recoveryProcessingDate,
          recoveryAuthorizedAt: batch.recoveryAuthorizedAt,
        },
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "batches" &&
      segments[2] === "release-unchanged"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const batchId = segments[1];
      if (
        !isSafeBusinessId(batchId) ||
        !hasExactKeys(body, ["confirmation"]) ||
        body.confirmation !== `RELEASE ${batchId}`
      ) {
        return genericError(409);
      }
      const result =
        await dependency.operations.releaseUnchangedBatchAssignments(
          context.env,
          { batchId, actor, requestId: mutationRequestId },
        );
      return json({
        ok: true,
        batch: { batchId: result.batch.batchId, status: result.batch.status },
        releasedLedgerIds: result.releasedLedgerIds,
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "batches" &&
      segments[2] === "approve"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const batchId = segments[1];
      if (!isSafeBusinessId(batchId)) return genericError(409);
      const confirmation = batchConfirmation(body, batchId, "APPROVE");
      if (!confirmation) return genericError(409);
      const batch = await dependency.operations.approveBatch(context.env, {
        batchId,
        ...confirmation,
        actor,
        requestId: mutationRequestId,
      });
      return json({
        ok: true,
        batch: {
          batchId: batch.batchId,
          status: batch.status,
          approvalDigest: batch.approvalDigest,
          approvalRevision: batch.approvalRevision,
          approvalTimestamp: batch.approvalTimestamp,
        },
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "batches" &&
      segments[2] === "execute"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const batchId = segments[1];
      if (!isSafeBusinessId(batchId)) return genericError(409);
      const confirmation = batchConfirmation(body, batchId, "EXECUTE");
      if (!confirmation) return genericError(409);
      await dependency.operations.assertExecutionProcessingDay(
        context.env,
        batchId,
        dependency.now(),
      );
      const result = await dependency.operations.executeBatch(context.env, {
        batchId,
        ...confirmation,
        actor,
        requestId: mutationRequestId,
      });
      return json({
        ok: true,
        batch: {
          batchId: result.batch.batchId,
          status: result.batch.status,
          approvalDigest: result.batch.approvalDigest,
          approvalRevision: result.batch.approvalRevision,
        },
        createdTransferCount: result.createdTransfers.length,
        failedTransferCount: result.failedLedgers.length,
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "ledgers" &&
      segments[2] === "manual-payment"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, [
          "expectedAmountCents",
          "method",
          "reason",
          "evidenceReference",
          "memo",
          "intentDigest",
          "confirmation",
        ]) ||
        !Number.isSafeInteger(body.expectedAmountCents) ||
        Number(body.expectedAmountCents) <= 0 ||
        !["CASH", "ZELLE", "VENMO", "CHECK", "OTHER"].includes(
          String(body.method ?? ""),
        ) ||
        !/^sha256-hex:[a-f0-9]{64}$/.test(String(body.intentDigest ?? ""))
      ) {
        return genericError(409);
      }
      const reason = safeRequiredText(body.reason, 240);
      const evidenceReference = safeRequiredText(body.evidenceReference, 200);
      const memo = safeRequiredText(body.memo, 240);
      if (
        !reason ||
        reason.length < 12 ||
        !evidenceReference ||
        evidenceReference.length < 3 ||
        !memo ||
        memo.length < 3
      ) {
        return genericError(409);
      }
      const exactIntentDigest = await manualPaymentIntentDigest({
        ledgerId,
        expectedAmountCents: body.expectedAmountCents as number,
        method: body.method as string,
        reason,
        evidenceReference,
        memo,
      });
      if (
        body.intentDigest !== exactIntentDigest ||
        body.confirmation !== `MANUAL ${ledgerId} ${exactIntentDigest}`
      ) {
        return genericError(409);
      }
      const result = await dependency.operations.recordManualPaymentException(
        context.env,
        {
          ledgerId,
          expectedAmountCents: body.expectedAmountCents as number,
          method: body.method as string,
          reason,
          evidenceReference,
          memo,
          intentDigest: exactIntentDigest,
          actor,
          requestId: mutationRequestId,
        },
      );
      return json({
        ok: true,
        ledger: {
          ledgerId: result.ledger.ledgerId,
          state: result.ledger.state,
          reconciled: result.ledger.reconciled,
        },
        crmVerified: true,
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "ledgers" &&
      segments[2] === "reconcile-transfer-outcome"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      const transferId = String(body.transferId ?? "");
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, ["transferId", "confirmation"]) ||
        !/^tr_[A-Za-z0-9]{8,100}$/.test(transferId) ||
        body.confirmation !== `BIND ${ledgerId} ${transferId}`
      ) {
        return genericError(409);
      }
      const ledger =
        await dependency.operations.reconcileAmbiguousTransferOutcome(
          context.env,
          {
            ledgerId,
            transferId,
            actor,
            requestId: mutationRequestId,
          },
        );
      return json({
        ok: true,
        ledger: {
          ledgerId: ledger.ledgerId,
          state: ledger.state,
          transferId: ledger.stripeTransferId,
        },
        destinationPaymentVerified: Boolean(ledger.stripeDestinationPaymentId),
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "ledgers" &&
      segments[2] === "reconcile-correction"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, ["confirmation"]) ||
        body.confirmation !== `CORRECT ${ledgerId}`
      ) {
        return genericError(409);
      }
      const result = await dependency.operations.reconcileCorrectiveState(
        context.env,
        {
          ledgerId,
          actor,
          requestId: mutationRequestId,
        },
      );
      return json({
        ok: true,
        ledger: {
          ledgerId: result.ledger.ledgerId,
          state: result.ledger.state,
          reconciled: result.ledger.reconciled,
          crmCorrectionRequired: result.ledger.crmCorrectionRequired,
        },
        crmVerified: true,
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "ledgers" &&
      segments[2] === "approve-payout-destination-variance"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      const payoutId = String(body.payoutId ?? "");
      const reason = safeRequiredText(body.reason, 240);
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, ["payoutId", "reason", "confirmation"]) ||
        !/^po_[A-Za-z0-9]{8,100}$/.test(payoutId) ||
        !reason ||
        reason.length < 12 ||
        body.confirmation !== `APPROVE DESTINATION ${ledgerId} ${payoutId}`
      ) {
        return genericError(409);
      }
      const approval =
        await dependency.operations.approvePayoutDestinationVariance(
          context.env,
          {
            ledgerId,
            payoutId,
            reason,
            actor,
            requestId: mutationRequestId,
          },
        );
      return json({
        ok: true,
        approval: {
          approvalId: approval.approvalId,
          ledgerId: approval.ledgerId,
          payoutId: approval.payoutId,
          originalDestinationId: approval.originalDestinationId,
          approvedDestinationId: approval.approvedDestinationId,
          approvedBy: approval.approvedBy,
          createdAt: approval.createdAt,
        },
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "ledgers" &&
      segments[2] === "reconcile"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const ledgerId = segments[1];
      if (
        !isSafeBusinessId(ledgerId) ||
        !hasExactKeys(body, ["payoutId", "confirmation"]) ||
        !/^po_[A-Za-z0-9]{8,100}$/.test(String(body.payoutId ?? "")) ||
        body.confirmation !== `RECONCILE ${ledgerId}`
      ) {
        return genericError(409);
      }
      const result = await dependency.operations.reconcilePayout(context.env, {
        ledgerId,
        payoutId: body.payoutId as string,
        actor,
        requestId: mutationRequestId,
      });
      return json({
        ok: true,
        ledger: {
          ledgerId: result.ledger.ledgerId,
          state: result.ledger.state,
          reconciled: result.ledger.reconciled,
        },
        crmVerified: result.crm !== null || result.ledger.reconciled,
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "exceptions" &&
      segments[2] === "resolve"
    ) {
      if (actor.role !== "owner") return genericError(403);
      const exceptionId = segments[1];
      if (
        !isSafeBusinessId(exceptionId) ||
        !hasExactKeys(body, ["confirmation", "evidence"]) ||
        body.confirmation !== `RESOLVE ${exceptionId}`
      ) {
        return genericError(409);
      }
      const evidence = safeRequiredText(body.evidence, 500);
      if (!evidence || evidence.length < 12) return genericError(409);
      await dependency.operations.resolveException(context.env, {
        exceptionId,
        evidence,
        actor,
        requestId: mutationRequestId,
      });
      return json({ ok: true, exception: { exceptionId, status: "RESOLVED" } });
    }

    return genericError(404);
  } catch (error) {
    return genericError(statusForFailure(error));
  }
}

export const onRequest = (context: PagesContext): Promise<Response> =>
  handleArtistPayoutApiRequest(context);
