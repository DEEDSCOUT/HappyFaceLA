import type { AttributionJourney } from '../attribution/atomic-attribution.ts';

export const FORM_ROUTE_VALUES = ['plan-my-party', 'packages', 'contact'] as const;
export type FormRoute = (typeof FORM_ROUTE_VALUES)[number];

export type LeadAcceptanceResponse = {
  ok: boolean;
  accepted: boolean;
  received: boolean;
  persisted: boolean;
  created: boolean;
  duplicate: boolean;
  conversionEligible: boolean;
  submissionId?: string;
  leadId?: string;
  formRoute?: FormRoute;
  suppressionReason?: string;
  ownerNotificationQueued: boolean;
  ownerNotificationSent: boolean;
  sheetWritten: boolean;
  crmPosted: boolean;
  message: string;
};

export type LeadSubmissionIdentity = {
  submissionId: string;
  leadId: string;
  formRoute: FormRoute;
  payloadHash: string;
  conversionEligible: boolean;
  suppressionReason: string | null;
  attribution: AttributionJourney;
};

const SUBMISSION_ID_RE = /^sub_[a-f0-9]{32}$/;

export function normalizeSubmissionId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (SUBMISSION_ID_RE.test(normalized)) return normalized;
  return '';
}

export function createServerSubmissionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `sub_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function createOpaqueLeadId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `lead_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeFormRoute(value: unknown, sourcePage: string | null): FormRoute {
  if (FORM_ROUTE_VALUES.includes(value as FormRoute)) return value as FormRoute;
  if (sourcePage?.startsWith('/plan-my-party')) return 'plan-my-party';
  if (sourcePage?.startsWith('/packages')) return 'packages';
  return 'contact';
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export async function payloadHash(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function detectDeterministicSpam(value: Record<string, unknown>): string | null {
  const text = Object.values(value)
    .filter((item) => typeof item === 'string')
    .join(' ')
    .toLowerCase();
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  if (urlCount >= 3) return 'multiple_unsolicited_urls';
  const markers = ['buy followers', 'casino backlink', 'guest post placement', 'crypto investment opportunity'];
  const marker = markers.find((candidate) => text.includes(candidate));
  return marker ? `spam_marker:${marker.replace(/\s+/g, '_')}` : null;
}

export function shouldEmitTechnicalEvent(response: Partial<LeadAcceptanceResponse>): boolean {
  return response.ok === true
    && response.accepted === true
    && response.persisted === true
    && response.created === true
    && response.duplicate !== true
    && response.conversionEligible === true
    && typeof response.leadId === 'string'
    && /^lead_[a-f0-9]{32}$/.test(response.leadId);
}
