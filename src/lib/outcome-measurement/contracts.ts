export const ATTRIBUTION_CAPTURE_VERSION = 'ATTRIBUTION_CAPTURE_V1' as const;
export const OUTCOME_MEASUREMENT_CAPTURE_FLAG = 'OUTCOME_MEASUREMENT_CAPTURE_ENABLED' as const;

export const OUTCOME_MEASUREMENT_SOURCE_SYSTEMS = [
  'HFLA_WEB_LEAD',
  'HFLA_PLAN_MY_PARTY',
] as const;

export type OutcomeMeasurementSourceSystem = typeof OUTCOME_MEASUREMENT_SOURCE_SYSTEMS[number];
export type AttributionCaptureState = 'CAPTURED' | 'QUARANTINED';

export type OutcomeMeasurementD1Value = string | number | null;

export interface OutcomeMeasurementD1Result {
  success?: boolean;
  error?: string;
  meta?: {
    changes?: number;
    [key: string]: unknown;
  };
}

export interface OutcomeMeasurementD1PreparedStatement {
  bind(...values: OutcomeMeasurementD1Value[]): OutcomeMeasurementD1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<OutcomeMeasurementD1Result & { results?: T[] }>;
}

export interface OutcomeMeasurementD1Database {
  prepare(query: string): OutcomeMeasurementD1PreparedStatement;
}

export type OutcomeMeasurementEnv = {
  OUTCOME_MEASUREMENT_CAPTURE_ENABLED?: string;
  OUTCOME_MEASUREMENT_D1?: OutcomeMeasurementD1Database;
};

export type AttributionCaptureInput = {
  source_system: OutcomeMeasurementSourceSystem;
  source_lead_id: string;
  submitted_at: string;
  landing_page?: string | null;
  source_page?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
};

export type CanonicalAttributionRecord = {
  source_system: OutcomeMeasurementSourceSystem;
  source_lead_id: string;
  submitted_at: string;
  landing_page: string | null;
  source_page: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  capture_version: typeof ATTRIBUTION_CAPTURE_VERSION;
  capture_state: AttributionCaptureState;
};

export type LeadAttributionRecord = CanonicalAttributionRecord & {
  created_at: string;
  record_sha256: string;
};

export type MeasurementCaptureResult =
  | {
      status: 'DISABLED';
      eligible: false;
      code: 'FEATURE_DISABLED';
    }
  | {
      status: 'CAPTURED';
      eligible: true;
      code: 'INSERTED' | 'IDEMPOTENT';
      captureState: 'CAPTURED';
    }
  | {
      status: 'QUARANTINED';
      eligible: false;
      code: 'UNSUPPORTED_IDENTIFIER_SET';
      captureState: 'QUARANTINED';
      persistence: 'INSERTED' | 'IDEMPOTENT';
    }
  | {
      status: 'FAILED';
      eligible: false;
      code:
        | 'STORAGE_UNAVAILABLE'
        | 'STORAGE_ERROR'
        | 'IDENTITY_CONFLICT'
        | 'INVALID_ATTRIBUTION';
    };
