import type { PayoutActor, PayoutRole, PayoutRuntimeEnv } from "./types.ts";

interface AccessClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwksDocument {
  keys?: AccessJsonWebKey[];
}

interface AccessJsonWebKey extends JsonWebKey {
  kid?: string;
}

let jwksCache: {
  url: string;
  expiresAt: number;
  keys: AccessJsonWebKey[];
} | null = null;

function csvEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function expectedIssuer(teamDomain: string): string {
  const host = teamDomain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(host)) {
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN must be a cloudflareaccess.com host",
    );
  }
  return `https://${host}`;
}

async function getJwks(
  issuer: string,
  forceRefresh = false,
): Promise<AccessJsonWebKey[]> {
  const url = `${issuer}/cdn-cgi/access/certs`;
  const now = Date.now();
  if (!forceRefresh && jwksCache?.url === url && jwksCache.expiresAt > now)
    return jwksCache.keys;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("Unable to retrieve Cloudflare Access signing keys");
  const document = (await response.json()) as JwksDocument;
  const keys = document.keys?.filter((key) => key.kty === "RSA") ?? [];
  if (keys.length === 0)
    throw new Error("Cloudflare Access returned no RSA signing keys");
  jwksCache = { url, expiresAt: now + 5 * 60_000, keys };
  return keys;
}

export async function verifyCloudflareAccessJwt(
  token: string,
  env: PayoutRuntimeEnv,
): Promise<AccessClaims> {
  const segments = token.split(".");
  if (segments.length !== 3)
    throw new Error("Cloudflare Access assertion is malformed");
  const header = parseJwtPart<JwtHeader>(segments[0]);
  const claims = parseJwtPart<AccessClaims>(segments[1]);
  if (header.alg !== "RS256" || !header.kid)
    throw new Error("Cloudflare Access assertion algorithm is invalid");

  const issuer = expectedIssuer(env.CF_ACCESS_TEAM_DOMAIN ?? "");
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!audience) throw new Error("CF_ACCESS_AUD is not configured");
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud)
    ? claims.aud
    : claims.aud
      ? [claims.aud]
      : [];
  if (claims.iss !== issuer || !audiences.includes(audience))
    throw new Error("Cloudflare Access assertion scope is invalid");
  if (
    !claims.exp ||
    claims.exp <= now ||
    (claims.nbf && claims.nbf > now + 30)
  ) {
    throw new Error("Cloudflare Access assertion is expired or not active");
  }

  let key = (await getJwks(issuer)).find(
    (candidate) => candidate.kid === header.kid,
  );
  if (!key) {
    key = (await getJwks(issuer, true)).find(
      (candidate) => candidate.kid === header.kid,
    );
  }
  if (!key) throw new Error("Cloudflare Access signing key was not found");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    decodeBase64Url(segments[2]) as BufferSource,
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`) as BufferSource,
  );
  if (!verified)
    throw new Error("Cloudflare Access assertion signature is invalid");
  return claims;
}

export async function authenticatePayoutActor(
  request: Request,
  env: PayoutRuntimeEnv,
  requiredRole: PayoutRole = "admin",
  verifier: typeof verifyCloudflareAccessJwt = verifyCloudflareAccessJwt,
): Promise<PayoutActor> {
  const token = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!token) throw new Error("Cloudflare Access authentication is required");
  const claims = await verifier(token, env);
  const email = claims.email?.trim().toLowerCase();
  if (!email) throw new Error("Authenticated identity has no email address");

  const owners = csvEmails(env.PAYOUT_OWNER_EMAILS);
  const admins = csvEmails(env.PAYOUT_ADMIN_EMAILS);
  const role: PayoutRole | null = owners.has(email)
    ? "owner"
    : admins.has(email)
      ? "admin"
      : null;
  if (!role)
    throw new Error(
      "Authenticated identity is not authorized for artist payouts",
    );
  if (requiredRole === "owner" && role !== "owner")
    throw new Error("Owner authorization is required");
  return { email, role };
}

export function assertMutationRequest(
  request: Request,
  configuredOrigin: string,
): void {
  const origin = request.headers.get("origin");
  if (origin !== configuredOrigin)
    throw new Error("Request origin is not authorized");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin")
    throw new Error("Cross-site mutation is not allowed");
  if (request.headers.get("x-hfla-payout-request") !== "owner-confirmed") {
    throw new Error("Explicit payout request confirmation header is required");
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length > 180 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    throw new Error("A valid Idempotency-Key header is required");
  }
}
