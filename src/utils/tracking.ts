import { trackProductionAnalyticsEvent } from "../lib/analytics/production-analytics.ts";

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
    return trackProductionAnalyticsEvent(name, params);
}

export { };
