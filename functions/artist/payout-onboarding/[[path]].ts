import { getPayoutRuntimeConfig } from "../../../src/lib/artist-payouts/config.ts";
import { resolveActiveArtistIdentity } from "../../../src/lib/artist-payouts/artist-roster-adapter.ts";
import {
  onboardingChallengeDigest,
  onboardingRecipientEmailBinding,
  signOnboardingClaim,
  verifyOnboardingClaim,
  type OnboardingClaimPayload,
} from "../../../src/lib/artist-payouts/onboarding-claim.ts";
import { PayoutRepository } from "../../../src/lib/artist-payouts/repository.ts";
import { createStripePayoutGateway } from "../../../src/lib/artist-payouts/stripe-gateway.ts";
import type {
  PayoutEnvironment,
  PayoutRuntimeEnv,
} from "../../../src/lib/artist-payouts/types.ts";
import type { AuthoritativeArtistIdentity } from "../../../src/lib/artist-payouts/artist-roster-adapter.ts";

interface PagesContext {
  request: Request;
  env: PayoutRuntimeEnv;
  params?: Record<string, string | string[]>;
}

interface OnboardingRouteRuntime {
  config: { environment: PayoutEnvironment; publicBaseUrl: string };
  secret: string;
  repository: Pick<
    PayoutRepository,
    | "getArtistAccount"
    | "activateOnboardingSession"
    | "isOnboardingSessionActive"
    | "recordOnboardingLinkCreated"
  >;
  stripe: Pick<
    ReturnType<typeof createStripePayoutGateway>,
    "createOnboardingLink" | "retrieveRecipientStatus"
  >;
  resolveArtist(artistId: string): Promise<AuthoritativeArtistIdentity>;
}

export interface ArtistOnboardingRouteDependencies {
  now(): Date;
  runtime(context: PagesContext): OnboardingRouteRuntime;
}

const SESSION_COOKIE = "__Host-hfla-payout-onboarding";
const CONFIRMATION_COOKIE = "__Host-hfla-payout-onboarding-confirm";
const SESSION_SECONDS = 30 * 60;
const CONFIRMATION_SECONDS = 10 * 60;

function headers(contentType = "text/html; charset=utf-8"): Headers {
  return new Headers({
    "cache-control": "no-store, private, max-age=0",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
}

function page(message: string, status = 200, canContinue = false): Response {
  const responseHeaders = headers();
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artist payout onboarding</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:1rem;color:#231b29}main{border:1px solid #ded8df;border-radius:1rem;padding:1.5rem}a{display:inline-block;background:#7a245e;color:#fff;padding:.7rem 1rem;border-radius:.5rem}</style></head><body><main><h1>Happy Faces LA artist payout onboarding</h1><p>${message}</p>${canContinue ? '<p><a href="/artist/payout-onboarding/refresh">Continue secure Stripe onboarding</a></p>' : ""}</main></body></html>`,
    { status, headers: responseHeaders },
  );
}

function confirmationPage(input: {
  title: string;
  message: string;
  action: string;
  claimToken?: string;
  setCookie?: string;
  requireEmail?: boolean;
  requireChallenge?: boolean;
}): Response {
  const responseHeaders = headers();
  if (input.setCookie) responseHeaders.set("set-cookie", input.setCookie);
  const hidden = input.claimToken
    ? `<input type="hidden" name="claim" value="${input.claimToken}">`
    : "";
  const email = input.requireEmail
    ? '<label for="contactEmail">Email address on your Happy Faces LA artist profile</label><input id="contactEmail" name="contactEmail" type="email" autocomplete="email" maxlength="254" required>'
    : "";
  const challenge = input.requireChallenge
    ? '<label for="challengeCode">One-time code delivered separately to that roster email</label><input id="challengeCode" name="challengeCode" type="text" autocomplete="one-time-code" inputmode="text" minlength="10" maxlength="16" required>'
    : "";
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:1rem;color:#231b29}main{border:1px solid #ded8df;border-radius:1rem;padding:1.5rem}label,input{display:block;width:100%;box-sizing:border-box;margin:.75rem 0}input{padding:.7rem;font:inherit}button{background:#7a245e;color:#fff;border:0;padding:.8rem 1rem;border-radius:.5rem;font:inherit;font-weight:700}</style></head><body><main><h1>${input.title}</h1><p>${input.message}</p><form method="post" action="${input.action}">${hidden}${email}${challenge}<button type="submit">Continue to secure Stripe onboarding</button></form></main></body></html>`,
    { status: 200, headers: responseHeaders },
  );
}

function namedCookie(request: Request, expectedName: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === expectedName) return value.join("=") || null;
  }
  return null;
}

function cookieValue(request: Request): string | null {
  return namedCookie(request, SESSION_COOKIE);
}

function pathSegment(context: PagesContext): string {
  const raw = context.params?.path;
  return Array.isArray(raw) ? raw.join("/") : (raw ?? "");
}

function runtime(context: PagesContext): OnboardingRouteRuntime {
  const config = getPayoutRuntimeConfig(context.env, "onboarding");
  if (!config.stripeSecretKey || !config.publicBaseUrl)
    throw new Error("Onboarding runtime is incomplete");
  const sandbox = config.environment === "sandbox";
  const secret = sandbox
    ? (context.env.PAYOUT_SANDBOX_ONBOARDING_CLAIM_SECRET ?? "")
    : (context.env.PAYOUT_LIVE_ONBOARDING_CLAIM_SECRET ?? "");
  const rosterUrl = sandbox
    ? (context.env.PAYOUT_SANDBOX_ROSTER_READ_URL ?? "")
    : (context.env.PAYOUT_LIVE_ROSTER_READ_URL ?? "");
  const rosterOrigin = sandbox
    ? (context.env.PAYOUT_SANDBOX_ROSTER_ALLOWED_ORIGIN ?? "")
    : (context.env.PAYOUT_LIVE_ROSTER_ALLOWED_ORIGIN ?? "");
  const rosterSecret = sandbox
    ? (context.env.PAYOUT_SANDBOX_ROSTER_READ_SECRET ?? "")
    : (context.env.PAYOUT_LIVE_ROSTER_READ_SECRET ?? "");
  if (!secret || !rosterUrl || !rosterOrigin || !rosterSecret)
    throw new Error("Onboarding identity delivery is not configured");
  return {
    config: {
      environment: config.environment,
      publicBaseUrl: config.publicBaseUrl,
    },
    secret,
    repository: new PayoutRepository(
      context.env.PAYOUTS_D1!,
      config.environment,
    ),
    stripe: createStripePayoutGateway({
      environment: config.environment,
      secretKey: config.stripeSecretKey,
      expectedPlatformAccountId: config.stripePlatformAccountId!,
    }),
    resolveArtist: (artistId) =>
      resolveActiveArtistIdentity(artistId, {
        url: rosterUrl,
        allowedOrigin: rosterOrigin,
        secret: rosterSecret,
        environment: config.environment,
      }),
  };
}

async function assertBoundIdentity(
  payload: OnboardingClaimPayload,
  values: OnboardingRouteRuntime,
): Promise<AuthoritativeArtistIdentity> {
  const [identity, account] = await Promise.all([
    values.resolveArtist(payload.artistId),
    values.repository.getArtistAccount(payload.artistId),
  ]);
  if (
    identity.artistId !== payload.artistId ||
    identity.revision !== payload.rosterRevision ||
    (await onboardingRecipientEmailBinding({
      secret: values.secret,
      environment: values.config.environment,
      artistId: identity.artistId,
      contactEmail: identity.contactEmail,
    })) !== payload.recipientEmailBinding ||
    !account ||
    account.stripeAccountId !== payload.accountId ||
    account.onboardingStatus === "PAYOUT_READY" ||
    account.onboardingStatus === "DISABLED"
  ) {
    throw new Error("Onboarding recipient identity no longer matches");
  }
  return identity;
}

async function createStripeRedirect(
  payload: OnboardingClaimPayload,
  values: OnboardingRouteRuntime,
  sessionToken: string,
  createdAt: string,
): Promise<Response> {
  const link = await values.stripe.createOnboardingLink({
    accountId: payload.accountId,
    returnUrl: `${values.config.publicBaseUrl}/artist/payout-onboarding/return`,
    refreshUrl: `${values.config.publicBaseUrl}/artist/payout-onboarding/refresh`,
  });
  await values.repository.recordOnboardingLinkCreated({
    sessionNonce: payload.nonce,
    artistId: payload.artistId,
    stripeAccountId: payload.accountId,
    createdAt,
    auditId: `audit_onboarding_${crypto.randomUUID()}`,
    requestId: payload.nonce,
  });
  const responseHeaders = headers("text/plain; charset=utf-8");
  responseHeaders.set("location", link.url);
  responseHeaders.set(
    "set-cookie",
    `${SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
  );
  responseHeaders.append(
    "set-cookie",
    `${CONFIRMATION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
  );
  return new Response("Continue to secure Stripe onboarding.", {
    status: 303,
    headers: responseHeaders,
  });
}

async function sessionPayload(
  request: Request,
  values: OnboardingRouteRuntime,
  now: Date,
): Promise<OnboardingClaimPayload> {
  const token = cookieValue(request);
  if (!token) throw new Error("Onboarding session is missing");
  const payload = await verifyOnboardingClaim({
    token,
    secret: values.secret,
    expectedPurpose: "artist-onboarding-session",
    expectedEnvironment: values.config.environment,
    now,
  });
  await assertBoundIdentity(payload, values);
  const active = await values.repository.isOnboardingSessionActive({
    sessionNonce: payload.nonce,
    artistId: payload.artistId,
    stripeAccountId: payload.accountId,
    rosterRevision: payload.rosterRevision,
    now: now.toISOString(),
  });
  if (!active) throw new Error("Onboarding session was revoked or expired");
  return payload;
}

function requireSameOriginPost(request: Request, expectedOrigin: string): void {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== expectedOrigin
  )
    throw new Error("Onboarding confirmation origin does not match");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded"))
    throw new Error("Onboarding confirmation content type is invalid");
}

async function claimFromForm(
  request: Request,
): Promise<{ claim: string; contactEmail: string; challengeCode: string }> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4096)
    throw new Error("Onboarding confirmation is too large");
  const values = new URLSearchParams(raw);
  if (
    [...values.keys()].some(
      (key) =>
        key !== "claim" && key !== "contactEmail" && key !== "challengeCode",
    )
  )
    throw new Error("Onboarding confirmation contains unexpected fields");
  const claim = values.get("claim");
  if (!claim || values.getAll("claim").length !== 1)
    throw new Error("Onboarding claim is missing");
  const contactEmail = values.get("contactEmail");
  if (!contactEmail || values.getAll("contactEmail").length !== 1)
    throw new Error("Onboarding recipient email is missing");
  const challengeCode = values.get("challengeCode");
  if (!challengeCode || values.getAll("challengeCode").length !== 1)
    throw new Error("Onboarding challenge is missing");
  return { claim, contactEmail, challengeCode };
}

function sameClaimIdentity(
  left: OnboardingClaimPayload,
  right: OnboardingClaimPayload,
): boolean {
  return (
    left.environment === right.environment &&
    left.artistId === right.artistId &&
    left.accountId === right.accountId &&
    left.nonce === right.nonce &&
    left.rosterRevision === right.rosterRevision &&
    left.recipientEmailBinding === right.recipientEmailBinding &&
    left.expiresAt === right.expiresAt
  );
}

const defaultDependencies: ArtistOnboardingRouteDependencies = {
  now: () => new Date(),
  runtime,
};

export async function handleArtistOnboardingRequest(
  context: PagesContext,
  dependencies: ArtistOnboardingRouteDependencies = defaultDependencies,
): Promise<Response> {
  if (!["GET", "HEAD", "POST"].includes(context.request.method))
    return page("This request method is not available.", 405);
  if (context.request.method === "HEAD")
    return new Response(null, { status: 200, headers: headers() });
  const now = dependencies.now();
  try {
    const values = dependencies.runtime(context);
    const path = pathSegment(context);
    if (!path) {
      const form =
        context.request.method === "GET"
          ? null
          : await claimFromForm(context.request);
      const token =
        context.request.method === "GET"
          ? new URL(context.request.url).searchParams.get("claim")
          : form?.claim;
      if (!token) return page("This invitation is missing or invalid.", 400);
      const payload = await verifyOnboardingClaim({
        token,
        secret: values.secret,
        expectedPurpose: "artist-onboarding-claim",
        expectedEnvironment: values.config.environment,
        now,
      });
      const identity = await assertBoundIdentity(payload, values);
      if (context.request.method === "GET") {
        const confirmationToken = await signOnboardingClaim(
          { ...payload, purpose: "artist-onboarding-confirmation" },
          values.secret,
        );
        return confirmationPage({
          title: "Confirm secure payout onboarding",
          message:
            "Continue only if you requested this Happy Faces LA artist payout setup. Use the one-time code delivered separately to your roster email. Your sensitive identity and bank details go directly to Stripe.",
          action: "/artist/payout-onboarding",
          claimToken: token,
          requireEmail: true,
          requireChallenge: true,
          setCookie: `${CONFIRMATION_COOKIE}=${confirmationToken}; Path=/; Max-Age=${CONFIRMATION_SECONDS}; Secure; HttpOnly; SameSite=Strict`,
        });
      }
      requireSameOriginPost(context.request, values.config.publicBaseUrl ?? "");
      if (
        !form ||
        (await onboardingRecipientEmailBinding({
          secret: values.secret,
          environment: values.config.environment,
          artistId: payload.artistId,
          contactEmail: form.contactEmail,
        })) !== payload.recipientEmailBinding ||
        form.contactEmail.toLowerCase() !== identity.contactEmail.toLowerCase()
      ) {
        throw new Error("Onboarding recipient email does not match");
      }
      const confirmationToken = namedCookie(
        context.request,
        CONFIRMATION_COOKIE,
      );
      if (!confirmationToken)
        throw new Error("Onboarding confirmation cookie is missing");
      const confirmation = await verifyOnboardingClaim({
        token: confirmationToken,
        secret: values.secret,
        expectedPurpose: "artist-onboarding-confirmation",
        expectedEnvironment: values.config.environment,
        now,
      });
      if (!sameClaimIdentity(payload, confirmation))
        throw new Error("Onboarding confirmation does not match the claim");
      const sessionPayload: OnboardingClaimPayload = {
        ...payload,
        purpose: "artist-onboarding-session",
        nonce: `session_${crypto.randomUUID()}`,
        expiresAt: new Date(
          now.valueOf() + SESSION_SECONDS * 1000,
        ).toISOString(),
      };
      const sessionToken = await signOnboardingClaim(
        sessionPayload,
        values.secret,
      );
      await values.repository.activateOnboardingSession({
        claimNonce: payload.nonce,
        sessionNonce: sessionPayload.nonce,
        artistId: payload.artistId,
        stripeAccountId: payload.accountId,
        rosterRevision: payload.rosterRevision,
        challengeDigest: await onboardingChallengeDigest({
          secret: values.secret,
          environment: values.config.environment,
          artistId: payload.artistId,
          accountId: payload.accountId,
          nonce: payload.nonce,
          rosterRevision: payload.rosterRevision,
          challengeCode: form.challengeCode,
        }),
        expiresAt: sessionPayload.expiresAt,
        activatedAt: now.toISOString(),
        auditId: `audit_onboarding_${crypto.randomUUID()}`,
        requestId: payload.nonce,
      });
      try {
        return await createStripeRedirect(
          sessionPayload,
          values,
          sessionToken,
          now.toISOString(),
        );
      } catch {
        return confirmationPage({
          title: "Secure Stripe onboarding is temporarily unavailable",
          message:
            "Your invitation was securely confirmed. Retry the same session; Happy Faces LA will not create a second recipient.",
          action: "/artist/payout-onboarding/refresh",
          setCookie: `${SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
        });
      }
    }
    if (path === "refresh") {
      const payload = await sessionPayload(context.request, values, now);
      if (context.request.method === "GET") {
        return confirmationPage({
          title: "Continue secure Stripe onboarding",
          message:
            "Stripe requested a refreshed single-use onboarding session. Continue to return securely to Stripe.",
          action: "/artist/payout-onboarding/refresh",
        });
      }
      requireSameOriginPost(context.request, values.config.publicBaseUrl ?? "");
      return createStripeRedirect(
        payload,
        values,
        cookieValue(context.request) ?? "",
        now.toISOString(),
      );
    }
    if (path === "return") {
      if (context.request.method !== "GET")
        return page("This request method is not available.", 405);
      const payload = await sessionPayload(context.request, values, now);
      const status = await values.stripe.retrieveRecipientStatus(
        payload.accountId,
        payload.artistId,
      );
      const ready =
        status.requirementsStatus === "complete" &&
        status.transfersStatus === "active" &&
        status.payoutsStatus === "active" &&
        status.currentlyDue.length === 0 &&
        status.disabledReason === null;
      return page(
        ready
          ? "Your secure payout details were received. Happy Faces LA will separately confirm payout eligibility."
          : "Stripe reports that more information is required. Continue only in the secure Stripe flow.",
        200,
        !ready && status.disabledReason === null,
      );
    }
    return page("This onboarding path is not available.", 404);
  } catch {
    return page(
      "This secure onboarding invitation or session is invalid, expired, or unavailable. Request a new invitation from Happy Faces LA.",
      400,
    );
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleArtistOnboardingRequest(context);
}
