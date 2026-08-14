export const PRODUCTION_ANALYTICS_POLICY_VERSION = "production-host-v1";
export const PRODUCTION_ANALYTICS_HOSTS = Object.freeze([
  "happyfacesla.com",
  "www.happyfacesla.com",
]);

export const GA4_MEASUREMENT_ID = "G-7NH6RY78TK";
export const CLARITY_PROJECT_ID = "wsw4v74jpw";

type AnalyticsEnvironment = "production" | "non-production";

interface AnalyticsPolicyState {
  version: typeof PRODUCTION_ANALYTICS_POLICY_VERSION;
  hostname: string;
  environment: AnalyticsEnvironment;
  allowed: boolean;
}

type ClarityQueue = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    __HFLA_ANALYTICS_POLICY__?: AnalyticsPolicyState;
    __HFLA_ANALYTICS_BOOTSTRAPPED__?: boolean;
    hflaTrackEvent?: (name: string, params?: Record<string, unknown>) => boolean;
    gtag?: (...args: unknown[]) => void;
    clarity?: ClarityQueue;
    dataLayer?: unknown[];
  }
}

function normalizeHostname(hostname: unknown): string {
  return typeof hostname === "string" ? hostname.trim().toLowerCase() : "";
}

export function isApprovedProductionAnalyticsHost(hostname: unknown): boolean {
  const normalized = normalizeHostname(hostname);
  return PRODUCTION_ANALYTICS_HOSTS.includes(normalized);
}

export function applyProductionAnalyticsPolicy(targetWindow: Window): AnalyticsPolicyState {
  const hostname = normalizeHostname(targetWindow.location?.hostname);
  const allowed = isApprovedProductionAnalyticsHost(hostname);
  const state: AnalyticsPolicyState = {
    version: PRODUCTION_ANALYTICS_POLICY_VERSION,
    hostname,
    environment: allowed ? "production" : "non-production",
    allowed,
  };
  targetWindow.__HFLA_ANALYTICS_POLICY__ = state;
  return state;
}

export function isProductionAnalyticsAllowed(targetWindow?: Window): boolean {
  const resolvedWindow = targetWindow ?? (typeof window === "undefined" ? undefined : window);
  if (!resolvedWindow) return false;

  const policy = applyProductionAnalyticsPolicy(resolvedWindow);
  return policy.allowed && policy.environment === "production";
}

export function trackProductionAnalyticsEvent(
  name: string,
  params: Record<string, unknown> = {},
  targetWindow?: Window,
): boolean {
  const resolvedWindow = targetWindow ?? (typeof window === "undefined" ? undefined : window);
  if (!resolvedWindow || !isProductionAnalyticsAllowed(resolvedWindow)) return false;

  resolvedWindow.dataLayer = resolvedWindow.dataLayer || [];
  if (typeof resolvedWindow.gtag === "function") {
    resolvedWindow.gtag("event", name, params);
  } else {
    resolvedWindow.dataLayer.push({ event: name, ...params });
  }
  return true;
}

function appendAnalyticsScript(
  targetDocument: Document,
  id: string,
  src: string,
): void {
  if (targetDocument.getElementById(id)) return;
  const script = targetDocument.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  (targetDocument.head || targetDocument.documentElement).appendChild(script);
}

export function installProductionAnalytics(
  targetWindow?: Window,
  targetDocument?: Document,
): AnalyticsPolicyState | null {
  const resolvedWindow = targetWindow ?? (typeof window === "undefined" ? undefined : window);
  const resolvedDocument = targetDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!resolvedWindow || !resolvedDocument) return null;

  const policy = applyProductionAnalyticsPolicy(resolvedWindow);
  resolvedWindow.hflaTrackEvent = (name, params = {}) =>
    trackProductionAnalyticsEvent(name, params, resolvedWindow);

  if (!policy.allowed || resolvedWindow.__HFLA_ANALYTICS_BOOTSTRAPPED__) {
    return policy;
  }

  resolvedWindow.dataLayer = resolvedWindow.dataLayer || [];
  if (typeof resolvedWindow.gtag !== "function") {
    resolvedWindow.gtag = (...args: unknown[]) => {
      resolvedWindow.dataLayer?.push(args);
    };
  }
  resolvedWindow.gtag("js", new Date());
  resolvedWindow.gtag("config", GA4_MEASUREMENT_ID);
  appendAnalyticsScript(
    resolvedDocument,
    "hfla-production-ga4",
    `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`,
  );

  if (typeof resolvedWindow.clarity !== "function") {
    const clarityQueue: ClarityQueue = (...args: unknown[]) => {
      clarityQueue.q = clarityQueue.q || [];
      clarityQueue.q.push(args);
    };
    resolvedWindow.clarity = clarityQueue;
  }
  appendAnalyticsScript(
    resolvedDocument,
    "hfla-production-clarity",
    `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`,
  );

  resolvedWindow.__HFLA_ANALYTICS_BOOTSTRAPPED__ = true;
  return policy;
}

export {};
