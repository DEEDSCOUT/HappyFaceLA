type Env = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_IR03B_PROBE_TOKEN?: string;
};

type Context = {
  request: Request;
  env: Env;
};

const APPROVED_EXPOSED_KEY_FINGERPRINT =
  '4CD7702124A81DA59F08C787F8C2E2B9B5D2C1CD58FFF2C64FDAD0D1F109B7B5';
const DIAGNOSTIC_DEPLOYMENT_ID = 'stripe-ir03b-binding-check-v1';
const PROBE_HEADER = 'x-hfla-ir03b-probe';
const encoder = new TextEncoder();

function json(data: Record<string, boolean | string>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function createBindingCheckHandler(
  expectedFingerprint = APPROVED_EXPOSED_KEY_FINGERPRINT,
): (context: Context) => Promise<Response> {
  return async ({ request, env }: Context): Promise<Response> => {
    if (request.method !== 'GET') {
      return json({ ok: false }, 405);
    }

    const url = new URL(request.url);
    if (url.search !== '') {
      return json({ ok: false }, 400);
    }

    const configuredProbeToken = env.STRIPE_IR03B_PROBE_TOKEN;
    const suppliedProbeToken = request.headers.get(PROBE_HEADER);
    if (
      typeof configuredProbeToken !== 'string' ||
      configuredProbeToken.length === 0 ||
      typeof suppliedProbeToken !== 'string' ||
      !constantTimeEqual(suppliedProbeToken, configuredProbeToken)
    ) {
      return json({ ok: false }, 401);
    }

    if (typeof env.STRIPE_SECRET_KEY !== 'string' || env.STRIPE_SECRET_KEY.length === 0) {
      return json({ ok: false }, 503);
    }

    const runtimeFingerprint = await sha256Hex(env.STRIPE_SECRET_KEY);
    return json(
      {
        ok: true,
        match: constantTimeEqual(runtimeFingerprint, expectedFingerprint),
        deployment: DIAGNOSTIC_DEPLOYMENT_ID,
      },
      200,
    );
  };
}

export const onRequest = createBindingCheckHandler();
