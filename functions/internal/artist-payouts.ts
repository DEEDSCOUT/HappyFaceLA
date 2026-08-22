import { ArtistPayoutApplicationService } from "../../src/lib/artist-payouts/application-service.ts";
import { authenticatePayoutActor } from "../../src/lib/artist-payouts/auth.ts";
import { getPayoutRuntimeConfig } from "../../src/lib/artist-payouts/config.ts";
import { renderArtistPayoutAdmin } from "../../src/lib/artist-payouts/admin-ui.ts";
import {
  PayoutRepository,
  dashboardQueryFromUrl,
  type DashboardQuery,
  type DashboardSnapshot,
} from "../../src/lib/artist-payouts/repository.ts";
import { createStripePayoutGateway } from "../../src/lib/artist-payouts/stripe-gateway.ts";
import {
  authoritativePayoutSourcesFromEnv,
  dashboardWithAuthoritativeRoster,
} from "../../src/lib/artist-payouts/authoritative-sources.ts";
import type {
  PayoutActor,
  PayoutRuntimeEnv,
} from "../../src/lib/artist-payouts/types.ts";

interface PagesContext {
  request: Request;
  env: PayoutRuntimeEnv;
}

export interface ArtistPayoutPageDependencies {
  authenticate: typeof authenticatePayoutActor;
  dashboard(
    env: PayoutRuntimeEnv,
    query: DashboardQuery,
  ): Promise<DashboardSnapshot>;
}

const defaultDependencies: ArtistPayoutPageDependencies = {
  authenticate: authenticatePayoutActor,
  dashboard: async (env, query) => {
    const readConfig = getPayoutRuntimeConfig(env, "read");
    const repository = new PayoutRepository(
      env.PAYOUTS_D1!,
      readConfig.environment,
    );
    const sources = authoritativePayoutSourcesFromEnv(
      env,
      readConfig.environment,
    );
    try {
      const config = getPayoutRuntimeConfig(env, "preview");
      if (
        !config.stripeSecretKey ||
        !config.stripePlatformAccountId ||
        config.minimumReserveCents === null
      )
        return dashboardWithAuthoritativeRoster(repository, sources, query);
      const service = new ArtistPayoutApplicationService(
        repository,
        createStripePayoutGateway({
          environment: config.environment,
          secretKey: config.stripeSecretKey,
          expectedPlatformAccountId: config.stripePlatformAccountId,
        }),
        "https://payouts.invalid",
        config.minimumReserveCents,
        undefined,
        sources,
      );
      return service.dashboardWithFundingPreview(query);
    } catch {
      return dashboardWithAuthoritativeRoster(repository, sources, query);
    }
  },
};

function pageHeaders(
  contentType = "text/html; charset=utf-8",
  scriptNonce?: string,
): Headers {
  if (scriptNonce && !/^[A-Za-z0-9_-]{24}$/.test(scriptNonce)) {
    throw new Error("Page script nonce is malformed");
  }
  return new Headers({
    "cache-control": "no-store, private, max-age=0",
    "content-type": contentType,
    "content-security-policy": [
      "default-src 'none'",
      "base-uri 'none'",
      "connect-src 'self'",
      "font-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "img-src 'none'",
      "manifest-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      scriptNonce ? `script-src 'nonce-${scriptNonce}'` : "script-src 'none'",
      "style-src 'unsafe-inline'",
      "worker-src 'none'",
    ].join("; "),
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
  });
}

function pageScriptNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function genericPageError(status: 401 | 405 | 503): Response {
  const message =
    status === 401
      ? "Authentication required"
      : status === 405
        ? "Method not allowed"
        : "Artist payouts temporarily unavailable";
  return new Response(message, {
    status,
    headers: pageHeaders("text/plain; charset=utf-8"),
  });
}

async function authenticate(
  request: Request,
  env: PayoutRuntimeEnv,
  dependency: ArtistPayoutPageDependencies,
): Promise<PayoutActor | Response> {
  if (!request.headers.get("cf-access-jwt-assertion")?.trim())
    return genericPageError(401);
  try {
    return await dependency.authenticate(request, env, "admin");
  } catch {
    return genericPageError(401);
  }
}

export async function handleArtistPayoutPageRequest(
  context: PagesContext,
  dependency: ArtistPayoutPageDependencies = defaultDependencies,
): Promise<Response> {
  const actor = await authenticate(context.request, context.env, dependency);
  if (actor instanceof Response) return actor;

  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return genericPageError(405);
  if (method === "HEAD")
    return new Response(null, { status: 200, headers: pageHeaders() });

  try {
    const dashboard = await dependency.dashboard(
      context.env,
      dashboardQueryFromUrl(context.request.url),
    );
    const scriptNonce = pageScriptNonce();
    return new Response(
      renderArtistPayoutAdmin(dashboard, actor, scriptNonce),
      {
        status: 200,
        headers: pageHeaders("text/html; charset=utf-8", scriptNonce),
      },
    );
  } catch {
    return genericPageError(503);
  }
}

export const onRequest = (context: PagesContext): Promise<Response> =>
  handleArtistPayoutPageRequest(context);
