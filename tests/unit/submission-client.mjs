#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  createSubmissionId,
  getOrCreateSubmissionId,
  markSubmissionAccepted,
  resetSubmissionState,
  rotateAcceptedSubmissionOnEdit,
  withSubmissionLock,
} from '../../src/lib/forms/submission-client.ts';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.window = { location: { pathname: '/contact/' } };
globalThis.sessionStorage = new MemoryStorage();

const generated = createSubmissionId();
assert.match(generated, /^sub_[a-f0-9]{32}$/);

const firstForm = { dataset: {} };
const firstId = getOrCreateSubmissionId(firstForm, 'contact');
assert.equal(getOrCreateSubmissionId(firstForm, 'contact'), firstId, 'same form retry reuses identity');

markSubmissionAccepted(firstForm, 'contact', firstId);
const restoredAfterBack = { dataset: {} };
assert.equal(getOrCreateSubmissionId(restoredAfterBack, 'contact'), firstId, 'back/BFCache form restores identity');
assert.equal(restoredAfterBack.dataset.submissionAccepted, 'true');

rotateAcceptedSubmissionOnEdit(restoredAfterBack, 'contact');
assert.notEqual(restoredAfterBack.dataset.submissionId, firstId, 'new edit after acceptance starts a new logical submission');

markSubmissionAccepted(firstForm, 'contact', firstId);
const initializedAfterReload = { dataset: {} };
getOrCreateSubmissionId(initializedAfterReload, 'contact');
assert.equal(initializedAfterReload.dataset.submissionAccepted, 'true', 'page initialization hydrates accepted state');
rotateAcceptedSubmissionOnEdit(initializedAfterReload, 'contact');
assert.notEqual(initializedAfterReload.dataset.submissionId, firstId, 'first edit after reload rotates before payload construction');

let release;
const pending = new Promise((resolve) => { release = resolve; });
const lockedForm = { dataset: {} };
const firstOperation = withSubmissionLock(lockedForm, async () => {
  await pending;
  return 'done';
});
const doubleClick = await withSubmissionLock(lockedForm, async () => 'unexpected');
assert.equal(doubleClick, null, 'double click is rejected while request is in flight');
release();
assert.equal(await firstOperation, 'done');
assert.equal(lockedForm.dataset.submissionInFlight, 'false');

resetSubmissionState(restoredAfterBack, 'contact');
assert.equal(restoredAfterBack.dataset.submissionId, undefined);

globalThis.sessionStorage = {
  getItem() { throw new Error('storage denied'); },
  setItem() { throw new Error('storage denied'); },
  removeItem() { throw new Error('storage denied'); },
};
const deniedStorageForm = { dataset: {} };
const deniedId = getOrCreateSubmissionId(deniedStorageForm, 'contact');
assert.equal(getOrCreateSubmissionId(deniedStorageForm, 'contact'), deniedId, 'in-memory form identity survives storage denial');

console.log('PASS submission identity, back-navigation, storage, and double-click fixtures');
