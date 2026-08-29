export const OUTCOME_MEASUREMENT_BROWSER_ROUTES = [
  {
    id: 'QUOTE_FORM',
    route: 'QuoteForm production callers',
    endpoint: '/api/lead',
    sourceSystem: 'HFLA_WEB_LEAD',
  },
  {
    id: 'PACKAGES',
    route: '/packages/',
    endpoint: '/api/lead',
    sourceSystem: 'HFLA_WEB_LEAD',
  },
  {
    id: 'HIRE_FACE_PAINTER',
    route: '/hire-face-painter-los-angeles/',
    endpoint: '/api/quote-request',
    sourceSystem: 'HFLA_PLAN_MY_PARTY',
  },
  {
    id: 'PLAN_MY_PARTY',
    route: '/plan-my-party/',
    endpoint: '/api/quote-request',
    sourceSystem: 'HFLA_PLAN_MY_PARTY',
  },
] as const;

export type OutcomeMeasurementBrowserRouteId = typeof OUTCOME_MEASUREMENT_BROWSER_ROUTES[number]['id'];
export type GoogleClickIdentifierField = 'gclid' | 'gbraid' | 'wbraid';
export type GoogleClickTouch = Record<GoogleClickIdentifierField, string | null>;

export type BrowserRouteSubmission = {
  routeId: OutcomeMeasurementBrowserRouteId;
  basePayload: Record<string, unknown>;
  selectedGoogleTouch: GoogleClickTouch | null;
  firstGoogleTouch?: GoogleClickTouch | null;
  fetchImpl?: typeof fetch;
};

export type BrowserPayloadMutationContext = {
  routeId: OutcomeMeasurementBrowserRouteId;
  selectedGoogleTouch: GoogleClickTouch | null;
  firstGoogleTouch: GoogleClickTouch | null;
};

export type BrowserRouteSubmitterOptions = {
  mutatePayload?: (
    payload: Record<string, unknown>,
    context: BrowserPayloadMutationContext,
  ) => Record<string, unknown>;
  mutateSerializedBody?: (
    body: string,
    context: BrowserPayloadMutationContext,
  ) => string;
};

const CLICK_FIELDS: readonly GoogleClickIdentifierField[] = ['gclid', 'gbraid', 'wbraid'];

function routeDefinition(routeId: OutcomeMeasurementBrowserRouteId) {
  const route = OUTCOME_MEASUREMENT_BROWSER_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route) throw new TypeError('Unknown outcome-measurement browser route');
  return route;
}

export function exactGoogleClickTouch(value: GoogleClickTouch | null | undefined): GoogleClickTouch | null {
  if (!value) return null;
  const touch: GoogleClickTouch = { gclid: null, gbraid: null, wbraid: null };
  let present = false;
  for (const field of CLICK_FIELDS) {
    const identifier = value[field];
    if (identifier === null || identifier === undefined || identifier === '') continue;
    if (typeof identifier !== 'string') throw new TypeError('Invalid Google click identifier');
    touch[field] = identifier;
    present = true;
  }
  return present ? touch : null;
}

export function buildOutcomeMeasurementBrowserPayload(
  input: Omit<BrowserRouteSubmission, 'fetchImpl'>,
): Record<string, unknown> {
  const route = routeDefinition(input.routeId);
  const selected = exactGoogleClickTouch(input.selectedGoogleTouch);
  const first = exactGoogleClickTouch(input.firstGoogleTouch) ?? selected;
  const payload = { ...input.basePayload };

  for (const field of CLICK_FIELDS) {
    delete payload[field];
    delete payload[`first_${field}`];
    delete payload[`submit_${field}`];
    payload[field] = selected?.[field] ?? null;
    if (route.endpoint === '/api/quote-request') {
      payload[`first_${field}`] = first?.[field] ?? null;
      payload[`submit_${field}`] = selected?.[field] ?? null;
    }
  }

  return payload;
}

export function createOutcomeMeasurementBrowserSubmitter(
  options: BrowserRouteSubmitterOptions = {},
) {
  return async function submitOutcomeMeasurementBrowserRoute(input: BrowserRouteSubmission): Promise<{
    response: Response;
    payload: Record<string, unknown>;
  }> {
    const route = routeDefinition(input.routeId);
    const context: BrowserPayloadMutationContext = {
      routeId: input.routeId,
      selectedGoogleTouch: exactGoogleClickTouch(input.selectedGoogleTouch),
      firstGoogleTouch: exactGoogleClickTouch(input.firstGoogleTouch),
    };
    const built = buildOutcomeMeasurementBrowserPayload(input);
    const payload = options.mutatePayload ? options.mutatePayload(built, context) : built;
    const serialized = JSON.stringify(payload);
    const body = options.mutateSerializedBody
      ? options.mutateSerializedBody(serialized, context)
      : serialized;
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(route.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return { response, payload: JSON.parse(body) as Record<string, unknown> };
  };
}

export const submitOutcomeMeasurementBrowserRoute = createOutcomeMeasurementBrowserSubmitter();
