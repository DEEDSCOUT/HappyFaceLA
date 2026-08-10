import {
  ATTRIBUTION_VERSION,
  buildSubmissionJourney,
  capturePageAttribution,
  flattenJourney,
  sanitizeJourney,
  type AttributionJourney,
} from './atomic-attribution.ts';

const STORAGE_KEY = `hfla_attribution_v${ATTRIBUTION_VERSION}`;
const LEGACY_STORAGE_KEY = 'hfla_attribution';
let memoryJourney: AttributionJourney | null = null;

type BrowserAttributionConfig = {
  retentionMs?: number | null;
  persistentStorageAllowed?: boolean;
  consentGranted?: boolean;
};

declare global {
  interface Window {
    __HFLA_ATTRIBUTION_CONFIG__?: BrowserAttributionConfig;
  }
}

function config(): Required<BrowserAttributionConfig> {
  const candidate = window.__HFLA_ATTRIBUTION_CONFIG__ || {};
  return {
    retentionMs: typeof candidate.retentionMs === 'number' && candidate.retentionMs >= 0
      ? candidate.retentionMs
      : null,
    persistentStorageAllowed: candidate.persistentStorageAllowed === true,
    consentGranted: candidate.consentGranted === true,
  };
}

function canPersist(candidate: Required<BrowserAttributionConfig>): boolean {
  return candidate.persistentStorageAllowed
    && candidate.consentGranted
    && typeof candidate.retentionMs === 'number'
    && candidate.retentionMs > 0;
}

function readJson(storage: Storage | undefined): unknown {
  if (!storage) return null;
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function browserStorage(kind: 'sessionStorage' | 'localStorage'): Storage | undefined {
  try {
    return window[kind];
  } catch {
    return undefined;
  }
}

export function purgeLegacyAttributionStorage(): void {
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try {
      browserStorage(kind)?.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Never ingest the legacy fieldwise record. Cleanup remains best-effort.
    }
  }
}

function readJourney(nowMs = Date.now()): AttributionJourney | null {
  purgeLegacyAttributionStorage();
  const runtime = config();
  if (!canPersist(runtime)) {
    try {
      browserStorage('localStorage')?.removeItem(STORAGE_KEY);
    } catch {
      // Consent/retention revocation cleanup is best-effort.
    }
  }
  const options = { nowMs, retentionMs: runtime.retentionMs };
  const session = sanitizeJourney(readJson(browserStorage('sessionStorage')), options);
  if (session) return session;
  if (canPersist(runtime)) {
    const local = sanitizeJourney(readJson(browserStorage('localStorage')), options);
    if (local) return local;
  }
  return sanitizeJourney(memoryJourney, options);
}

function writeJourney(journey: AttributionJourney): void {
  purgeLegacyAttributionStorage();
  memoryJourney = journey;
  const serialized = JSON.stringify(journey);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // In-memory state still protects retries when storage is unavailable.
  }
  const runtime = config();
  if (canPersist(runtime)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Persistence is optional and must never block a form.
    }
  } else {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Consent/retention revocation cleanup is best-effort.
    }
  }
}

function currentInput(nowMs: number) {
  return {
    url: window.location.href,
    referrer: document.referrer || null,
    capturedAt: new Date(nowMs).toISOString(),
  };
}

export function captureBrowserAttribution(nowMs = Date.now()): AttributionJourney {
  const runtime = config();
  const journey = capturePageAttribution(readJourney(nowMs), currentInput(nowMs), {
    expectedOrigin: window.location.origin,
    retentionMs: runtime.retentionMs,
    nowMs,
  });
  writeJourney(journey);
  return journey;
}

export function buildBrowserSubmissionAttribution(nowMs = Date.now()): {
  attribution: AttributionJourney;
  compatibility: Record<string, string | null>;
} {
  const runtime = config();
  const journey = buildSubmissionJourney(readJourney(nowMs), currentInput(nowMs), {
    expectedOrigin: window.location.origin,
    retentionMs: runtime.retentionMs,
    nowMs,
  });
  writeJourney({ ...journey, submit_touch: null });
  return { attribution: journey, compatibility: flattenJourney(journey) };
}

export function clearBrowserAttribution(): void {
  memoryJourney = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage cleanup is best-effort.
  }
}
