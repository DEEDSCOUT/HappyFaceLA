const SUBMISSION_ID_RE = /^sub_[a-f0-9]{32}$/;
const STORAGE_PREFIX = 'hfla_submission_v1:';

type SubmissionState = {
  submissionId: string;
  accepted: boolean;
};

function makeRandomHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createSubmissionId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random submission identity is unavailable.');
  }
  return `sub_${makeRandomHex()}`;
}

function storageKey(route: string): string {
  return `${STORAGE_PREFIX}${route}:${window.location.pathname}`;
}

function readState(route: string): SubmissionState | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey(route)) || 'null') as Partial<SubmissionState> | null;
    if (!parsed || !SUBMISSION_ID_RE.test(String(parsed.submissionId || ''))) return null;
    return { submissionId: String(parsed.submissionId), accepted: parsed.accepted === true };
  } catch {
    return null;
  }
}

function writeState(route: string, state: SubmissionState): void {
  try {
    sessionStorage.setItem(storageKey(route), JSON.stringify(state));
  } catch {
    // The form-local data attribute remains the retry identity.
  }
}

export function getOrCreateSubmissionId(form: HTMLFormElement, route: string): string {
  const local = form.dataset.submissionId;
  if (local && SUBMISSION_ID_RE.test(local)) return local;
  const stored = readState(route);
  const submissionId = stored?.submissionId || createSubmissionId();
  form.dataset.submissionId = submissionId;
  form.dataset.submissionAccepted = stored?.accepted ? 'true' : 'false';
  writeState(route, { submissionId, accepted: stored?.accepted === true });
  return submissionId;
}

export function markSubmissionAccepted(form: HTMLFormElement, route: string, submissionId: string): void {
  if (!SUBMISSION_ID_RE.test(submissionId)) return;
  form.dataset.submissionId = submissionId;
  form.dataset.submissionAccepted = 'true';
  writeState(route, { submissionId, accepted: true });
}

export function rotateAcceptedSubmissionOnEdit(form: HTMLFormElement, route: string): void {
  if (form.dataset.submissionAccepted !== 'true') return;
  const submissionId = createSubmissionId();
  form.dataset.submissionId = submissionId;
  form.dataset.submissionAccepted = 'false';
  writeState(route, { submissionId, accepted: false });
}

export function resetSubmissionState(form: HTMLFormElement | null, route: string): void {
  if (form) {
    delete form.dataset.submissionId;
    delete form.dataset.submissionAccepted;
    delete form.dataset.submissionInFlight;
  }
  try {
    sessionStorage.removeItem(storageKey(route));
  } catch {
    // A fresh form-local identity will still be created after reload.
  }
}

export async function withSubmissionLock<T>(
  form: HTMLFormElement,
  operation: () => Promise<T>,
): Promise<T | null> {
  if (form.dataset.submissionInFlight === 'true') return null;
  form.dataset.submissionInFlight = 'true';
  try {
    return await operation();
  } finally {
    form.dataset.submissionInFlight = 'false';
  }
}
