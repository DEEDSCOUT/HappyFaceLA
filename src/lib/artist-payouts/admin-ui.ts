import type {
  ArtistProfileCollectionKey,
  DashboardSnapshot,
  DashboardCollectionKey,
  PayoutBatchRecord,
  PayoutExceptionRecord,
} from "./repository.ts";
import type { LedgerRecord, PayoutActor, PayoutState } from "./types.ts";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function stateClass(state: string): string {
  if (state === "PAID") return "paid";
  if (state.includes("FAILED") || state === "REVERSED") return "failed";
  if (state === "PAYOUT_PENDING" || state.startsWith("TRANSFER_"))
    return "pending";
  if (state === "READY_FOR_OWNER_APPROVAL" || state === "PAYOUT_READY")
    return "ready";
  return "blocked";
}

function stateTotal(snapshot: DashboardSnapshot, state: PayoutState): number {
  return snapshot.stateTotals.find((item) => item.state === state)?.count ?? 0;
}

function batchActions(
  batch: PayoutBatchRecord,
  actor: PayoutActor,
  reviewItems: DashboardSnapshot["batchReviewItems"],
): string {
  if (actor.role !== "owner")
    return '<span class="quiet">Owner action required</span>';
  const batchId = escapeHtml(batch.batchId);
  if (batch.status === "BLOCKED") {
    return `<form class="action-form danger-zone" data-operation="release-unchanged" data-endpoint="/api/internal/artist-payouts/batches/${batchId}/release-unchanged">
      <label>After re-importing changed records, type <code>RELEASE ${batchId}</code>
        <input required name="confirmation" autocomplete="off" pattern="RELEASE ${batchId}">
      </label>
      <button type="submit">Release only unchanged, untransferred assignments for a new batch</button>
    </form>`;
  }
  const exactReview =
    reviewItems.length === batch.itemCount &&
    reviewItems.every((item) => item.snapshotMatches);
  if (!exactReview) {
    return '<span class="badge failed">Approval blocked: exact item snapshot mismatch</span>';
  }
  if (batch.status === "PREPARED") {
    return `<form class="action-form" data-operation="approve" data-endpoint="/api/internal/artist-payouts/batches/${batchId}/approve">
      <input type="hidden" name="expectedDigest" value="${escapeHtml(batch.approvalDigest)}">
      <input type="hidden" name="expectedRevision" value="${batch.approvalRevision}">
      <label>Type <code>APPROVE ${batchId}</code>
        <input required name="confirmation" autocomplete="off" pattern="APPROVE ${batchId}">
      </label>
      <button type="submit">Record owner approval for ${batch.itemCount} transfers totaling ${money(batch.totalCents)}</button>
    </form>`;
  }
  if (
    batch.status === "OWNER_APPROVED" ||
    batch.status === "PARTIALLY_COMPLETED" ||
    batch.status === "EXECUTING"
  ) {
    const verb =
      batch.status === "OWNER_APPROVED" ? "Execute" : "Recover or retry";
    return `<form class="action-form danger-zone" data-operation="execute" data-endpoint="/api/internal/artist-payouts/batches/${batchId}/execute">
      <input type="hidden" name="expectedDigest" value="${escapeHtml(batch.approvalDigest)}">
      <input type="hidden" name="expectedRevision" value="${batch.approvalRevision}">
      <label>Type <code>EXECUTE ${batchId}</code>
        <input required name="confirmation" autocomplete="off" pattern="EXECUTE ${batchId}">
      </label>
      <button type="submit">${verb} eligible transfers from this owner-approved ${money(batch.totalCents)} batch</button>
    </form>
    <form class="action-form" data-operation="authorize-recovery" data-endpoint="/api/internal/artist-payouts/batches/${batchId}/authorize-recovery">
      <input type="hidden" name="expectedDigest" value="${escapeHtml(batch.approvalDigest)}">
      <input type="hidden" name="expectedRevision" value="${batch.approvalRevision}">
      <label>Cross-day recovery reason<input required name="reason" maxlength="240" autocomplete="off"></label>
      <label>On the intended Monday/Wednesday, type <code>RECOVER ${batchId}</code>
        <input required name="confirmation" autocomplete="off" pattern="RECOVER ${batchId}">
      </label>
      <button type="submit">Authorize this exact approved revision for today only</button>
    </form>`;
  }
  return `<span class="badge ${stateClass(batch.status)}">${escapeHtml(batch.status)}</span>`;
}

function reconciliationAction(
  ledger: LedgerRecord,
  actor: PayoutActor,
): string {
  if (actor.role !== "owner")
    return '<span class="quiet">No action available</span>';
  const ledgerId = escapeHtml(ledger.ledgerId);
  if (
    ledger.state === "TRANSFER_QUEUED" &&
    !ledger.stripeTransferId &&
    ledger.batchId
  ) {
    return `<form class="action-form danger-zone" data-operation="bind-transfer" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/reconcile-transfer-outcome">
      <label>Exact Stripe Transfer ID<input required name="transferId" autocomplete="off" pattern="tr_[A-Za-z0-9]{8,100}"></label>
      <label>Type <code>BIND ${ledgerId} tr_…</code><input required name="confirmation" autocomplete="off"></label>
      <button type="submit">Audit all recipient transfers and bind exactly one matching outcome</button>
    </form>`;
  }
  if (
    ledger.state === "MANUAL_REVIEW" &&
    ledger.manualPaymentEvidenceReference
  ) {
    return `<form class="action-form danger-zone" data-operation="cancel-manual" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/manual-payment/cancel">
      <label>Only after CRM absence is verified, type <code>CANCEL MANUAL ${ledgerId}</code><input required name="confirmation" autocomplete="off" pattern="CANCEL MANUAL ${ledgerId}"></label>
      <button type="submit">Prove CRM was not changed and cancel this intent</button>
    </form>`;
  }
  if (
    ledger.state === "READY_FOR_OWNER_APPROVAL" &&
    !ledger.batchId &&
    !ledger.stripeTransferId
  ) {
    return `<form class="action-form danger-zone manual-payment-form" data-ledger-id="${ledgerId}" data-operation="manual-payment" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/manual-payment">
      <input type="hidden" name="expectedAmountCents" value="${ledger.totalApprovedPayCents}">
      <label>Legacy method<select required name="method"><option value="">Choose</option><option>CASH</option><option>ZELLE</option><option>VENMO</option><option>CHECK</option><option>OTHER</option></select></label>
      <label>Owner reason<input required name="reason" minlength="12" maxlength="240" autocomplete="off"></label>
      <label>External evidence reference<input required name="evidenceReference" minlength="3" maxlength="200" autocomplete="off"></label>
      <label>Payment memo<input required name="memo" minlength="3" maxlength="240" autocomplete="off"></label>
      <input type="hidden" name="intentDigest" value="">
      <label>Submit once to calculate the exact phrase, then type it here<input required name="confirmation" autocomplete="off"></label>
      <button type="submit">Record exceptional manual payment with CRM readback</button>
    </form>`;
  }
  if (
    ledger.crmCorrectionRequired &&
    (ledger.state === "REVERSED" || ledger.state === "PAYOUT_FAILED")
  ) {
    return `<form class="action-form danger-zone" data-operation="correct" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/reconcile-correction">
      <label>Type <code>CORRECT ${ledgerId}</code>
        <input required name="confirmation" autocomplete="off" pattern="CORRECT ${ledgerId}">
      </label>
      <button type="submit">Write corrective CRM state and verify independent readback</button>
    </form>`;
  }
  if (!ledger.stripePayoutId || ledger.reconciled)
    return '<span class="quiet">No action available</span>';
  return `<form class="action-form" data-operation="reconcile" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/reconcile">
    <input type="hidden" name="payoutId" value="${escapeHtml(ledger.stripePayoutId)}">
    <label>Type <code>RECONCILE ${ledgerId}</code>
      <input required name="confirmation" autocomplete="off" pattern="RECONCILE ${ledgerId}">
    </label>
    <button type="submit">Verify Stripe payout, CRM write, and independent readback</button>
  </form>`;
}

function exceptionAction(
  exception: PayoutExceptionRecord,
  actor: PayoutActor,
): string {
  if (actor.role !== "owner")
    return '<span class="quiet">Owner action required</span>';
  if (exception.exceptionType === "PAYOUT_DESTINATION_MISMATCH") {
    if (
      !exception.ledgerId ||
      !exception.stripeReference ||
      !/^po_[A-Za-z0-9]{8,100}$/.test(exception.stripeReference)
    ) {
      return '<span class="quiet">Exact ledger and Stripe payout evidence is required before owner approval.</span>';
    }
    const ledgerId = escapeHtml(exception.ledgerId);
    const payoutId = escapeHtml(exception.stripeReference);
    return `<form class="action-form danger-zone" data-operation="approve-payout-destination-variance" data-endpoint="/api/internal/artist-payouts/ledgers/${ledgerId}/approve-payout-destination-variance">
      <input type="hidden" name="payoutId" value="${payoutId}">
      <label>Why this exact replacement bank payout is authorized<textarea required name="reason" minlength="12" maxlength="240"></textarea></label>
      <label>After verifying the current owner-approved bank, exact transfer, and payout membership, type <code>APPROVE DESTINATION ${ledgerId} ${payoutId}</code>
        <input required name="confirmation" autocomplete="off" pattern="APPROVE DESTINATION ${ledgerId} ${payoutId}">
      </label>
      <button type="submit">Approve this payout and replacement bank pair only</button>
    </form>`;
  }
  const exceptionId = escapeHtml(exception.exceptionId);
  return `<form class="action-form" data-operation="resolve" data-endpoint="/api/internal/artist-payouts/exceptions/${exceptionId}/resolve">
    <label>Resolution evidence<textarea required name="evidence" minlength="12" maxlength="500"></textarea></label>
    <label>After completing the stated action, type <code>RESOLVE ${exceptionId}</code>
      <input required name="confirmation" autocomplete="off" pattern="RESOLVE ${exceptionId}">
    </label>
    <button type="submit">Record owner resolution in the audit trail</button>
  </form>`;
}

const DASHBOARD_CURSOR_PARAMETERS: Record<DashboardCollectionKey, string> = {
  batches: "cursor_batches",
  ledgers: "cursor_ledgers",
  artistAccounts: "cursor_accounts",
  openExceptions: "cursor_exceptions",
  auditHistory: "cursor_audit",
  batchBlockedItems: "cursor_blocked",
  failedWebhookEvents: "cursor_failed_webhooks",
};

const ARTIST_PROFILE_CURSOR_PARAMETERS: Record<
  ArtistProfileCollectionKey,
  string
> = {
  unpaidAssignments: "cursor_artist_unpaid",
  paymentHistory: "cursor_artist_payments",
  openExceptions: "cursor_artist_exceptions",
};

function collectionPageControl(
  snapshot: DashboardSnapshot,
  collection: DashboardCollectionKey,
  sectionId: string,
  label: string,
): string {
  const page = snapshot.collectionPages?.[collection];
  if (!page) return "";
  const summary = `This page: ${page.returnedCount}. Exact total: ${page.totalCount}.`;
  if (!page.hasMore || !page.nextCursor) {
    return `<p class="quiet">${summary} End of ${escapeHtml(label)}.</p>`;
  }
  const query = new URLSearchParams({
    limit: String(snapshot.pageLimit),
    [DASHBOARD_CURSOR_PARAMETERS[collection]]: page.nextCursor,
  });
  if (snapshot.selectedArtistProfile) {
    query.set("artist_id", snapshot.selectedArtistProfile.artistId);
  }
  return `<p class="quiet">${summary} <a href="/internal/artist-payouts?${escapeHtml(query.toString())}#${escapeHtml(sectionId)}">Next ${escapeHtml(label)} page</a></p>`;
}

function artistProfilePageControl(
  snapshot: DashboardSnapshot,
  collection: ArtistProfileCollectionKey,
  sectionId: string,
  label: string,
): string {
  const profile = snapshot.selectedArtistProfile;
  const page = profile?.collectionPages[collection];
  if (!profile || !page) return "";
  const summary = `This page: ${page.returnedCount}. Exact artist total: ${page.totalCount}.`;
  if (!page.hasMore || !page.nextCursor) {
    return `<p class="quiet">${summary} End of ${escapeHtml(label)}.</p>`;
  }
  const query = new URLSearchParams({
    limit: String(snapshot.pageLimit),
    artist_id: profile.artistId,
    [ARTIST_PROFILE_CURSOR_PARAMETERS[collection]]: page.nextCursor,
  });
  return `<p class="quiet">${summary} <a href="/internal/artist-payouts?${escapeHtml(query.toString())}#${escapeHtml(sectionId)}">Next ${escapeHtml(label)} page</a></p>`;
}

function artistProfileHref(artistId: string): string {
  const query = new URLSearchParams({ artist_id: artistId });
  return `/internal/artist-payouts?${escapeHtml(query.toString())}#artist-profile`;
}

function selectedArtistProfile(
  snapshot: DashboardSnapshot,
  actor: PayoutActor,
): string {
  const profile = snapshot.selectedArtistProfile;
  const selector = `<form method="get" action="/internal/artist-payouts" class="grid-form">
    <label>Authoritative Artist ID<input required name="artist_id" value="${escapeHtml(profile?.artistId ?? "")}" pattern="[A-Za-z0-9][A-Za-z0-9._:-]{2,119}" autocomplete="off"></label>
    <input type="hidden" name="limit" value="${snapshot.pageLimit}">
    <button type="submit">Open complete artist profile</button>
  </form>`;
  if (!profile) {
    return `<section id="artist-profile"><h2>Focused artist profile</h2>${selector}<p class="quiet">Select one artist to inspect exact artist-only requirements, unpaid assignments, complete payment history, and open exceptions. Global dashboard totals remain unchanged.</p></section>`;
  }
  const account = profile.account;
  return `<section id="artist-profile"><h2>Focused artist profile</h2>${selector}
  <p><strong>${escapeHtml(account.artistDisplayName)}</strong> · <code>${escapeHtml(profile.artistId)}</code> · <code>${escapeHtml(account.stripeAccountId)}</code></p>
  <div class="cards">
    <div class="card"><span>Onboarding</span><strong class="badge ${stateClass(account.onboardingStatus)}">${escapeHtml(account.onboardingStatus)}</strong></div>
    <div class="card"><span>Stripe requirements</span><strong>${escapeHtml(account.requirementsStatus)}</strong><span class="quiet">Checked ${escapeHtml(account.lastRequirementsCheckAt ?? "never")}</span></div>
    <div class="card"><span>Transfers / payouts</span><strong>${escapeHtml(account.transfersStatus)} / ${escapeHtml(account.payoutsStatus)}</strong></div>
    <div class="card"><span>Disabled reason</span><strong>${escapeHtml(account.disabledReason ?? "none")}</strong></div>
    <div class="card"><span>Unpaid assignments</span><strong>${profile.metrics.unpaidAssignmentCount}</strong><span class="quiet">${money(profile.metrics.unpaidAmountCents)}</span></div>
    <div class="card"><span>Complete history</span><strong>${profile.metrics.assignmentCount}</strong><span class="quiet">${profile.metrics.paidAssignmentCount} Stripe-confirmed paid</span></div>
    <div class="card"><span>Open exceptions</span><strong>${profile.metrics.openExceptionCount}</strong></div>
  </div>
  <p class="quiet">Payout destination <code>${escapeHtml(account.payoutDestinationId ?? "not verified")}</code>. Preferred payout type ${escapeHtml(account.preferredPayoutType)}. These are artist-only exact totals; the global cards above are not filtered.</p>
  <h3 id="artist-unpaid">Unpaid assignments</h3><div class="table-wrap"><table><thead><tr><th>Event</th><th>Booking / assignment</th><th>Service</th><th>Amount</th><th>State</th></tr></thead><tbody>
  ${profile.unpaidAssignments.map((ledger) => `<tr><td>${escapeHtml(ledger.eventDate)}<br>${escapeHtml(ledger.eventName)}</td><td><code>${escapeHtml(ledger.bookingId)}</code><br><code>${escapeHtml(ledger.assignmentId)}</code></td><td>${escapeHtml(ledger.service)}</td><td>${money(ledger.totalApprovedPayCents)}</td><td><span class="badge ${stateClass(ledger.state)}">${escapeHtml(ledger.state)}</span></td></tr>`).join("") || '<tr><td colspan="5">No unpaid assignments for this artist.</td></tr>'}
  </tbody></table></div>${artistProfilePageControl(snapshot, "unpaidAssignments", "artist-unpaid", "artist unpaid assignments")}
  <h3 id="artist-payment-history">Complete payment history</h3><div class="table-wrap"><table><thead><tr><th>Event</th><th>Booking / assignment</th><th>Total</th><th>State</th><th>Provider evidence</th><th>CRM closeout</th></tr></thead><tbody>
  ${profile.paymentHistory.map((ledger) => `<tr><td>${escapeHtml(ledger.eventDate)}<br>${escapeHtml(ledger.eventName)}</td><td><code>${escapeHtml(ledger.bookingId)}</code><br><code>${escapeHtml(ledger.assignmentId)}</code></td><td>${money(ledger.totalApprovedPayCents)}</td><td><span class="badge ${stateClass(ledger.state)}">${escapeHtml(ledger.state)}</span><br><code>${escapeHtml(ledger.batchId ?? "not batched")}</code></td><td>Transfer <code>${escapeHtml(ledger.stripeTransferId ?? "none")}</code><br>Payout <code>${escapeHtml(ledger.stripePayoutId ?? "none")}</code><br>Arrival ${escapeHtml(ledger.expectedArrival ?? "unknown")}</td><td>${ledger.reconciled ? "reconciled" : "not reconciled"}<br>${reconciliationAction(ledger, actor)}</td></tr>`).join("") || '<tr><td colspan="6">No payment history for this artist.</td></tr>'}
  </tbody></table></div>${artistProfilePageControl(snapshot, "paymentHistory", "artist-payment-history", "artist payment history")}
  <h3 id="artist-exceptions">Open exceptions</h3><div class="table-wrap"><table><thead><tr><th>Detected</th><th>Booking / assignment</th><th>Reason</th><th>Status</th><th>Required action</th><th>Resolution</th></tr></thead><tbody>
  ${profile.openExceptions.map((exception) => `<tr><td>${escapeHtml(exception.createdAt)}</td><td><code>${escapeHtml(exception.bookingId ?? "—")}</code><br><code>${escapeHtml(exception.assignmentId ?? "—")}</code></td><td>${escapeHtml(exception.safeReason)}<br><code>${escapeHtml(exception.reasonCode)}</code></td><td><span class="badge failed">${escapeHtml(exception.status)}</span></td><td>${escapeHtml(exception.ownerActionRequired)}</td><td>${exceptionAction(exception, actor)}</td></tr>`).join("") || '<tr><td colspan="6">No open exceptions for this artist.</td></tr>'}
  </tbody></table></div>${artistProfilePageControl(snapshot, "openExceptions", "artist-exceptions", "artist exceptions")}</section>`;
}

export function renderArtistPayoutAdmin(
  snapshot: DashboardSnapshot,
  actor: PayoutActor,
  scriptNonce: string,
): string {
  if (!/^[A-Za-z0-9_-]{24}$/.test(scriptNonce)) {
    throw new Error("Admin script nonce is malformed");
  }
  const ready = stateTotal(snapshot, "READY_FOR_OWNER_APPROVAL");
  const closeout = stateTotal(snapshot, "CLOSEOUT_PENDING");
  const paid = stateTotal(snapshot, "PAID");
  const onboardingNeeded = snapshot.onboardingQueueUnavailable
    ? "Unavailable"
    : String(snapshot.onboardingQueue.length);
  const accounts = snapshot.artistAccounts ?? [];
  const batchReviewItems = snapshot.batchReviewItems ?? [];
  const unreconciledPaid = snapshot.ledgers.filter(
    (ledger) => ledger.state === "PAID" && !ledger.reconciled,
  ).length;
  const failedPayoutStates = new Set<PayoutState>([
    "TRANSFER_FAILED",
    "PAYOUT_FAILED",
    "REVERSED",
  ]);
  const failedPayoutTotals = snapshot.stateTotals
    .filter((item) => failedPayoutStates.has(item.state))
    .reduce(
      (total, item) => ({
        count: total.count + item.count,
        amountCents: total.amountCents + item.amountCents,
      }),
      { count: 0, amountCents: 0 },
    );
  const upcomingBatch = snapshot.batches.find((batch) =>
    ["PREPARED", "OWNER_APPROVED", "EXECUTING", "PARTIALLY_COMPLETED"].includes(
      batch.status,
    ),
  );
  const recentTransfers = snapshot.recentTransfers;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Artist Payments — Happy Faces LA</title>
<style>
:root{color-scheme:light;--ink:#231b29;--muted:#6d6370;--line:#ded8df;--paper:#fff;--wash:#f8f5f8;--brand:#7a245e;--ready:#136c4a;--pending:#815a00;--failed:#a21d31;--blocked:#5e5861}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.45 system-ui,sans-serif}header,main{max-width:1440px;margin:auto;padding:1rem 1.25rem}header{display:flex;gap:1rem;align-items:center;justify-content:space-between}h1{font-size:clamp(1.45rem,3vw,2.2rem);margin:.25rem 0}.quiet{color:var(--muted);font-size:.9rem}.notice{background:#fff5d9;border:1px solid #dfc46c;padding:.8rem 1rem;border-radius:.65rem}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin:1rem 0}.card,section{background:var(--paper);border:1px solid var(--line);border-radius:.8rem;padding:1rem}.card strong{display:block;font-size:1.55rem}nav{display:flex;gap:.55rem;overflow:auto;padding:.4rem 0 1rem}nav a{color:var(--brand);font-weight:650;white-space:nowrap}section{margin:0 0 1rem;scroll-margin-top:1rem}h2{font-size:1.25rem;margin:0 0 .8rem}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:.55rem;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.8rem;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}.badge{display:inline-block;border-radius:99px;padding:.16rem .5rem;font-size:.78rem;font-weight:750}.ready{color:var(--ready);background:#e3f5ec}.pending{color:var(--pending);background:#fff1c9}.paid{color:var(--ready);background:#d9f5e8}.failed{color:var(--failed);background:#fde3e8}.blocked{color:var(--blocked);background:#ece9ed}form{display:grid;gap:.65rem;max-width:720px}label{display:grid;gap:.25rem;font-weight:650}input,select,textarea,button{font:inherit;padding:.6rem .7rem;border:1px solid #aaa;border-radius:.45rem}textarea{min-height:5rem;resize:vertical}button{background:var(--brand);color:#fff;border:0;font-weight:750;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #ffbb33;outline-offset:2px}button[disabled]{opacity:.55;cursor:wait}.danger-zone{border-left:4px solid var(--failed);padding-left:.8rem}.action-form{min-width:330px}.grid-form{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));align-items:end}.grid-form button{min-height:44px}code{font-size:.8em;overflow-wrap:anywhere}.result{white-space:pre-wrap;padding:.6rem;border-radius:.4rem;background:#f0edf1}.result:empty{display:none}@media(max-width:600px){header{align-items:flex-start;flex-direction:column}main,header{padding:.8rem}section{padding:.8rem}.cards{grid-template-columns:1fr 1fr}}
</style></head><body>
<header><div><p class="quiet">Happy Faces LA · protected internal finance area</p><h1>Artist Payments</h1><p class="quiet">Signed in as ${escapeHtml(actor.email)} (${escapeHtml(actor.role)}) · ${escapeHtml(snapshot.environment ?? "")}</p></div><a href="/internal/artist-payouts">Refresh dashboard</a></header>
<main>
<p class="notice"><strong>Owner-controlled:</strong> Transfer creation is separate from owner approval. “Paid” requires authoritative Stripe payout evidence and destination-payment membership. CRM reconciliation remains separately visible until the signed write and independent matching readback succeed.</p>
${snapshot.fundingPreviewUnavailable ? `<p class="notice"><strong>Funding preview unavailable:</strong> Local D1 records remain visible, but no batch is represented as funded. Transfer execution independently rechecks the current Stripe available balance and configured reserve.${snapshot.fundingPreviewError ? ` Safe code <code>${escapeHtml(snapshot.fundingPreviewError.code)}</code>, checked ${escapeHtml(snapshot.fundingPreviewError.checkedAt)}.` : ""}</p>` : ""}
<nav aria-label="Artist payment areas"><a href="#dashboard">Dashboard</a><a href="#artist-profile">Focused profile</a><a href="#profiles">Artist profiles</a><a href="#batches">Batch review</a><a href="#history">Payment history</a><a href="#exceptions">Exceptions</a><a href="#webhooks">Webhook failures</a><a href="#audit">Audit</a></nav>
<section id="dashboard"><h2>Dashboard</h2><div class="cards">
<div class="card"><span>Need onboarding</span><strong>${onboardingNeeded}</strong></div>
<div class="card"><span>Awaiting closeout</span><strong>${closeout}</strong></div>
<div class="card"><span>Ready for approval</span><strong>${ready}</strong></div>
<div class="card"><span>Open exceptions</span><strong>${snapshot.collectionPages.openExceptions.totalCount}</strong></div>
<div class="card"><span>Stripe-confirmed paid</span><strong>${paid}</strong><span class="quiet">${unreconciledPaid} on this page awaiting CRM closeout</span></div>
<div class="card"><span>Failed/reversed payouts</span><strong>${failedPayoutTotals.count}</strong><span class="quiet">exact global total · ${money(failedPayoutTotals.amountCents)}</span></div>
<div class="card"><span>Webhook backlog / failed</span><strong>${snapshot.webhookBacklog.received + snapshot.webhookBacklog.processing} / ${snapshot.webhookBacklog.failed}</strong></div>
</div><p><strong>Upcoming/review batch:</strong> ${upcomingBatch ? `<code>${escapeHtml(upcomingBatch.batchId)}</code> · ${escapeHtml(upcomingBatch.scheduledDate)} · ${upcomingBatch.itemCount} assignments · ${money(upcomingBatch.totalCents)} · ${upcomingBatch.remainingCandidateCount} additional eligible candidates require another batch` : "none"}</p>
<p><strong>Recent transfers (latest five):</strong> ${recentTransfers.length ? recentTransfers.map((ledger) => `<code>${escapeHtml(ledger.stripeTransferId)}</code> ${escapeHtml(ledger.artistName)} ${money(ledger.totalApprovedPayCents)}`).join(" · ") : "none"}</p>
<p class="quiet">Last cross-system reconciliation: ${escapeHtml(snapshot.lastReconciliationAt ?? "none")}. Active roster: ${snapshot.activeRosterCount === null ? "unavailable" : snapshot.activeRosterCount}. Exact totals and stable continuation cursors are reported for every growing financial collection; each table shows at most ${snapshot.pageLimit} records at a time.</p></section>
${selectedArtistProfile(snapshot, actor)}
<section id="profiles"><h2>Artist payout profiles</h2>
${snapshot.onboardingQueueUnavailable ? '<p class="notice"><strong>Authoritative onboarding queue unavailable:</strong> the dashboard does not represent this as zero. Restore the signed environment-specific active-roster list before inviting artists.</p>' : `<h3>Artists needing onboarding</h3><p class="quiet">Exact active-roster comparison. Artists disappear from this queue only after the local recipient reaches owner-approved <code>PAYOUT_READY</code>.</p><div class="table-wrap"><table><thead><tr><th>Artist</th><th>Current payout state</th><th>Owner action</th></tr></thead><tbody>${snapshot.onboardingQueue.map((item) => `<tr><td>${escapeHtml(item.displayName)}<br><code>${escapeHtml(item.artistId)}</code></td><td><span class="badge ${stateClass(item.onboardingStatus)}">${escapeHtml(item.onboardingStatus)}</span></td><td>${actor.role === "owner" ? `<form class="action-form" data-operation="onboarding" data-endpoint="/api/internal/artist-payouts/onboarding"><input type="hidden" name="artistId" value="${escapeHtml(item.artistId)}"><label>Type <code>INVITE ${escapeHtml(item.artistId)}</code><input required name="confirmation" autocomplete="off" pattern="INVITE ${escapeHtml(item.artistId)}"></label><button type="submit">Create this source-bound invitation</button></form>` : "Owner action required"}</td></tr>`).join("") || '<tr><td colspan="3">Every active roster artist is payout-ready.</td></tr>'}</tbody></table></div>`}
<form class="grid-form action-form" data-operation="onboarding" data-endpoint="/api/internal/artist-payouts/onboarding">
<label>Authoritative Artist ID<input required name="artistId" autocomplete="off"></label>
<label>Typed owner confirmation<input required name="confirmation" autocomplete="off" placeholder="INVITE artist_id"></label>
<button type="submit">Create a source-bound onboarding invitation</button></form><p class="quiet">Owner-only. Name, email, country, and legal-entity type are resolved from the signed active artist roster. The owner receives an HFL one-time claim link and a separate one-time code, never a raw Stripe Account Link. Deliver the code independently to the exact authoritative roster mailbox; never place the link and code in the same message. Delivery remains separately approval-gated.</p>
<form class="grid-form action-form" data-operation="map-existing-recipient" data-endpoint="/api/internal/artist-payouts/onboarding/map-existing">
<label>Artist ID<input required name="artistId" autocomplete="off"></label><label>Exact Stripe Account ID<input required name="accountId" autocomplete="off"></label><label>Typed owner confirmation<input required name="confirmation" autocomplete="off" placeholder="MAP artist_id acct_id"></label><button type="submit">Recover one exact existing recipient</button></form><p class="quiet">Recovery refuses duplicates and maps only an account whose Stripe environment and HFL artist metadata independently match the signed roster.</p>
<form class="grid-form action-form" data-operation="activate-recipient" data-endpoint="/api/internal/artist-payouts/onboarding/activate">
<label>Artist ID<input required name="artistId" autocomplete="off"></label><label>Exact Stripe Account ID<input required name="accountId" autocomplete="off"></label><label>Non-sensitive payee identity evidence reference<input required name="identityEvidenceReference" minlength="8" maxlength="120" pattern="[A-Za-z0-9][A-Za-z0-9._:-]{7,119}" autocomplete="off"></label><label>Typed owner confirmation<input required name="confirmation" autocomplete="off" placeholder="ACTIVATE artist_id acct_id IDENTITY VERIFIED"></label><button type="submit">Record payee identity review and activate payout eligibility</button></form><p class="quiet">Owner-only final gate. Independently verify that the Stripe legal payee identity belongs to the authoritative roster artist; enter only an opaque evidence reference, never identity data. Stripe requirements, transfers, payouts, destination, account provenance, and the current signed roster are then re-read before this account can become payout-ready.</p>
<form class="grid-form action-form" data-operation="ledger-intake" data-endpoint="/api/internal/artist-payouts/ledger">
<label>Authoritative CRM payout record ID<input required name="crmRecordId" autocomplete="off"></label><button type="submit">Import or refresh one closed-out assignment</button></form><p class="quiet">All Booking ID, Assignment ID, artist, amount, closeout, and revision fields are read from the signed environment-specific Booking Control Center source.</p>
<div class="table-wrap"><table><thead><tr><th>Artist</th><th>Account</th><th>Onboarding</th><th>Requirements</th><th>Transfers</th><th>Payouts</th><th>Unpaid assignments</th><th>History</th><th>Open exceptions</th><th>Last verified</th></tr></thead><tbody>
${
  accounts
    .map((a) => {
      const metrics = snapshot.artistProfileMetrics.find(
        (item) => item.artistId === a.artistId,
      );
      if (!metrics) {
        throw new Error("Artist profile metrics are incomplete");
      }
      return `<tr><td>${escapeHtml(a.artistDisplayName)}<br><code>${escapeHtml(a.artistId)}</code><br><a href="${artistProfileHref(a.artistId)}">View complete profile</a></td><td><code>${escapeHtml(a.stripeAccountId)}</code></td><td><span class="badge ${stateClass(a.onboardingStatus)}">${escapeHtml(a.onboardingStatus)}</span></td><td>${escapeHtml(a.requirementsStatus)}<br><span class="quiet">Disabled: ${escapeHtml(a.disabledReason ?? "none")}</span></td><td>${escapeHtml(a.transfersStatus)}</td><td>${escapeHtml(a.payoutsStatus)}</td><td>${metrics.unpaidAssignmentCount}<br>${money(metrics.unpaidAmountCents)}</td><td>${metrics.assignmentCount} assignments<br>${metrics.paidAssignmentCount} Stripe-confirmed paid</td><td>${metrics.openExceptionCount}</td><td>${escapeHtml(a.lastRequirementsCheckAt ?? "never")}</td></tr>`;
    })
    .join("") || '<tr><td colspan="10">No artist payout profiles.</td></tr>'
}
</tbody></table></div>${collectionPageControl(snapshot, "artistAccounts", "profiles", "artist profiles")}</section>
<section id="batches"><h2>Batch review</h2>
<form class="grid-form action-form" data-operation="prepare" data-endpoint="/api/internal/artist-payouts/batches/prepare"><label>Monday or Wednesday processing date<input required type="date" name="scheduledDate"></label><button type="submit">Prepare eligible assignments for owner review</button></form>
<div class="table-wrap"><table><thead><tr><th>Batch</th><th>Date</th><th>Status</th><th>Artists</th><th>Assignments</th><th>Owner-approved assignments</th><th>Blocked</th><th>Remaining</th><th>Total</th><th>Current available / reserve / post-transfer</th><th>Exact owner action</th></tr></thead><tbody>
${
  snapshot.batches
    .map((b) => {
      const items = batchReviewItems.filter(
        (item) => item.batchId === b.batchId,
      );
      const artistCount = new Set(items.map((item) => item.artistId)).size;
      const approvedCount = items.filter(
        (item) => item.itemStatus !== "PREPARED",
      ).length;
      return `<tr><td><code>${escapeHtml(b.batchId)}</code><br><span class="quiet">rev ${b.approvalRevision}<br>${escapeHtml(b.approvalDigest ?? "no digest")}</span></td><td>${escapeHtml(b.scheduledDate)}</td><td><span class="badge ${stateClass(b.status)}">${escapeHtml(b.status)}</span></td><td>${artistCount}</td><td>${b.itemCount}</td><td>${approvedCount}</td><td>${b.blockedItemCount}</td><td>${b.remainingCandidateCount}${b.remainingCandidateCount > 0 ? '<br><span class="badge pending">PREPARE ANOTHER BATCH</span>' : ""}</td><td>${money(b.totalCents)}</td><td>${money(b.availableBalanceCents)} / ${money(b.minimumReserveCents)} / ${money(b.projectedBalanceCents)}</td><td>${batchActions(
        b,
        actor,
        items,
      )}</td></tr>`;
    })
    .join("") || '<tr><td colspan="11">No payout batches.</td></tr>'
}
</tbody></table></div>${collectionPageControl(snapshot, "batches", "batches", "batches")}</section>
<section id="batch-items"><h2>Exact batch assignment snapshots</h2><p class="quiet">Every owner approval and execution is disabled unless every displayed row still matches the immutable assignment, artist, destination, amount, source revision, material digest, and memo captured by the batch.</p><div class="table-wrap"><table><thead><tr><th>Batch / intended date</th><th>Artist</th><th>Booking / Assignment</th><th>Event / service</th><th>Pay components</th><th>Total / destination</th><th>Closeout / Stripe / eligibility</th><th>Exceptions / snapshot</th></tr></thead><tbody>
${batchReviewItems.map((item) => `<tr><td><code>${escapeHtml(item.batchId)}</code><br>${escapeHtml(item.scheduledDate)}</td><td>${escapeHtml(item.artistName)}<br><code>${escapeHtml(item.artistId)}</code></td><td><code>${escapeHtml(item.bookingId)}</code><br><code>${escapeHtml(item.assignmentId)}</code></td><td><strong>${escapeHtml(item.eventName)}</strong><br>${escapeHtml(item.eventDate)}<br>${escapeHtml(item.service)}<br><span class="quiet">Closeout verified ${escapeHtml(item.closeoutVerifiedAt)}</span></td><td>Service ${money(item.servicePayCents)}<br>Travel ${money(item.travelPayCents)}<br>Bonus ${money(item.bonusCents)}<br>Adjustment ${money(item.adjustmentCents)}<br>Deduction −${money(item.deductionCents)}</td><td><strong>${money(item.totalCents)}</strong><br><code>${escapeHtml(item.connectedAccountId)}</code></td><td>${escapeHtml(item.closeoutStatus)}<br>${escapeHtml(item.stripeReadiness)}<br><span class="badge ${stateClass(item.eligibilityState)}">${escapeHtml(item.eligibilityState)}</span></td><td>${item.exceptionCount}<br><span class="badge ${item.snapshotMatches ? "paid" : "failed"}">${item.snapshotMatches ? "EXACT SNAPSHOT" : "MISMATCH — BLOCKED"}</span></td></tr>`).join("") || '<tr><td colspan="8">No batch assignment snapshots.</td></tr>'}
</tbody></table></div></section>
<section id="blocked-batch-items"><h2>Blocked batch candidates</h2><p class="quiet">These candidates were excluded before owner approval because the latest Stripe recipient readiness check failed closed. Resolve the linked exception before preparing a later batch.</p><div class="table-wrap"><table><thead><tr><th>Batch / detected</th><th>Artist</th><th>Booking / assignment</th><th>Event / service</th><th>Amount</th><th>Reason</th><th>Required action</th></tr></thead><tbody>
${snapshot.batchBlockedItems.map((item) => `<tr><td><code>${escapeHtml(item.batchId)}</code><br>${escapeHtml(item.createdAt)}</td><td>${escapeHtml(item.artistName)}<br><code>${escapeHtml(item.artistId)}</code></td><td><code>${escapeHtml(item.bookingId)}</code><br><code>${escapeHtml(item.assignmentId)}</code></td><td><strong>${escapeHtml(item.eventName)}</strong><br>${escapeHtml(item.eventDate)}<br>${escapeHtml(item.service)}</td><td>${money(item.totalCents)}</td><td>${escapeHtml(item.safeReason)}<br><code>${escapeHtml(item.reasonCode)}</code></td><td>${escapeHtml(item.ownerActionRequired)}</td></tr>`).join("") || '<tr><td colspan="7">No blocked batch candidates.</td></tr>'}
</tbody></table></div>${collectionPageControl(snapshot, "batchBlockedItems", "blocked-batch-items", "blocked candidates")}</section>
<section id="history"><h2>Assignment payment history</h2><div class="table-wrap"><table><thead><tr><th>Artist</th><th>Booking / Assignment</th><th>Event / service</th><th>Components</th><th>Total</th><th>Destination</th><th>Batch</th><th>Financial state</th><th>Provider evidence</th><th>Closed-loop action</th></tr></thead><tbody>
${snapshot.ledgers.map((l) => `<tr><td>${escapeHtml(l.artistName)}<br><code>${escapeHtml(l.artistId)}</code></td><td><code>${escapeHtml(l.bookingId)}</code><br><code>${escapeHtml(l.assignmentId)}</code></td><td><strong>${escapeHtml(l.eventName)}</strong><br>${escapeHtml(l.eventDate)}<br>${escapeHtml(l.service)}</td><td>Service ${money(l.servicePayCents)}<br>Travel ${money(l.travelPayCents)}<br>Bonus ${money(l.bonusCents)}<br>Adjustment ${money(l.adjustmentCents)}<br>Deduction −${money(l.deductionCents)}</td><td>${money(l.totalApprovedPayCents)}</td><td><code>${escapeHtml(l.connectedAccountId)}</code></td><td><code>${escapeHtml(l.batchId ?? "not batched")}</code></td><td><span class="badge ${stateClass(l.state)}">${escapeHtml(l.state)}</span><br><span class="quiet">CRM reconciled: ${l.reconciled ? "yes" : "no"}</span></td><td>Transfer <code>${escapeHtml(l.stripeTransferId ?? "none")}</code><br>Payout <code>${escapeHtml(l.stripePayoutId ?? "none")}</code><br>Expected arrival ${escapeHtml(l.expectedArrival ?? "unknown")}<br>Failure <code>${escapeHtml(l.failureCode ?? "none")}</code> ${escapeHtml(l.failureReason ?? "")}</td><td>${reconciliationAction(l, actor)}</td></tr>`).join("") || '<tr><td colspan="10">No payment ledger items.</td></tr>'}
</tbody></table></div>${collectionPageControl(snapshot, "ledgers", "history", "payment history")}</section>
<section id="exceptions"><h2>Exception queue</h2><div class="table-wrap"><table><thead><tr><th>Detected / last attempt</th><th>Artist / booking / assignment</th><th>Reason / Stripe reference</th><th>Status</th><th>Owner action</th><th>Next attempt</th><th>Resolution</th></tr></thead><tbody>
${
  snapshot.openExceptions
    .map((e) => {
      const artistName =
        accounts.find((account) => account.artistId === e.artistId)
          ?.artistDisplayName ??
        snapshot.ledgers.find((ledger) => ledger.artistId === e.artistId)
          ?.artistName ??
        "Unknown artist";
      return `<tr><td>${escapeHtml(e.createdAt)}<br><span class="quiet">${escapeHtml(e.lastAttemptAt ?? "never")}</span></td><td>${escapeHtml(artistName)}<br><code>${escapeHtml(e.artistId ?? "—")}</code><br><code>${escapeHtml(e.bookingId ?? "—")}</code><br><code>${escapeHtml(e.assignmentId ?? "—")}</code></td><td>${escapeHtml(e.safeReason)}<br><code>${escapeHtml(e.reasonCode)}</code><br>Stripe <code>${escapeHtml(e.stripeReference ?? "none")}</code></td><td><span class="badge failed">${escapeHtml(e.status)}</span></td><td>${escapeHtml(e.ownerActionRequired)}</td><td>${escapeHtml(e.nextAllowedAttemptAt ?? "manual")}</td><td>${exceptionAction(e, actor)}</td></tr>`;
    })
    .join("") || '<tr><td colspan="7">No open exceptions.</td></tr>'
}
</tbody></table></div>${collectionPageControl(snapshot, "openExceptions", "exceptions", "exceptions")}</section>
<section id="webhooks"><h2>Failed webhook events</h2><p class="quiet">Stable newest-first pages with an exact global total. Safe operational references only. Reconcile authoritative Stripe state before any retry.</p><div class="table-wrap"><table><thead><tr><th>Received</th><th>Event</th><th>Type</th><th>Connected account</th><th>Error code</th><th>Retry count</th><th>Owner action</th></tr></thead><tbody>
${snapshot.failedWebhookEvents.map((event) => `<tr><td>${escapeHtml(event.receivedAt)}</td><td><code>${escapeHtml(event.eventId)}</code></td><td>${escapeHtml(event.eventType)}</td><td><code>${escapeHtml(event.connectedAccountId ?? "platform")}</code></td><td><code>${escapeHtml(event.safeErrorCode)}</code></td><td>${event.retryCount}</td><td>Inspect the durable event and current Stripe object; do not replay money movement blindly.</td></tr>`).join("") || '<tr><td colspan="7">No failed webhook events.</td></tr>'}
</tbody></table></div>${collectionPageControl(snapshot, "failedWebhookEvents", "webhooks", "failed webhook events")}</section>
<section id="audit"><h2>Append-only audit history</h2><div class="table-wrap"><table><thead><tr><th>Timestamp</th><th>Actor / action</th><th>Booking / assignment / artist</th><th>Amount</th><th>State</th><th>Result</th><th>Stripe evidence</th></tr></thead><tbody>
${snapshot.auditHistory.map((a) => `<tr><td>${escapeHtml(a.timestamp)}</td><td>${escapeHtml(a.actor)}<br><strong>${escapeHtml(a.action)}</strong></td><td><code>${escapeHtml(a.bookingId ?? "—")}</code><br><code>${escapeHtml(a.assignmentId ?? "—")}</code><br><code>${escapeHtml(a.artistId ?? "—")}</code></td><td>${money(a.amountCents)}</td><td>${escapeHtml(a.previousState ?? "—")} → ${escapeHtml(a.newState ?? "—")}</td><td>${escapeHtml(a.result)}<br>${escapeHtml(a.failureReason ?? "")}</td><td><code>${escapeHtml(a.transferId ?? "—")}</code><br><code>${escapeHtml(a.payoutId ?? "—")}</code></td></tr>`).join("") || '<tr><td colspan="7">No audit events.</td></tr>'}
</tbody></table></div>${collectionPageControl(snapshot, "auditHistory", "audit", "audit history")}</section><div id="operation-result" class="result" role="status" aria-live="polite"></div>
</main><script nonce="${scriptNonce}">
async function manualIntentDigest(body,ledgerId){var canonical=JSON.stringify({ledgerId:ledgerId,expectedAmountCents:body.expectedAmountCents,method:body.method,reason:body.reason,evidenceReference:body.evidenceReference,memo:body.memo});var bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)));return 'sha256-hex:'+Array.from(bytes,function(byte){return byte.toString(16).padStart(2,'0')}).join('')}
document.addEventListener('submit',async function(event){var form=event.target;if(!form.classList.contains('action-form'))return;event.preventDefault();var button=form.querySelector('button');var result=document.getElementById('operation-result');button.disabled=true;result.textContent='Working…';try{var body={};new FormData(form).forEach(function(value,key){body[key]=key==='expectedRevision'||key==='expectedAmountCents'?Number(value):String(value)});if(form.dataset.operation==='manual-payment'){var digest=await manualIntentDigest(body,form.dataset.ledgerId);body.intentDigest=digest;form.querySelector('[name="intentDigest"]').value=digest;var phrase='MANUAL '+form.dataset.ledgerId+' '+digest;if(body.confirmation!==phrase){result.textContent='Review the exact method, reason, evidence, memo, and amount. Then type this exact approval phrase and submit again:\\n'+phrase;button.disabled=false;result.focus();return}}var response=await fetch(form.dataset.endpoint,{method:'POST',headers:{'content-type':'application/json','x-hfla-payout-request':'owner-confirmed','idempotency-key':'ui:'+form.dataset.operation+':'+crypto.randomUUID()},body:JSON.stringify(body)});var payload=await response.json();if(!response.ok||payload.ok!==true)throw new Error(payload.error||'Operation failed');if(payload.invitationUrl){var target=new URL(payload.invitationUrl);if(target.origin!==location.origin||target.pathname!=='/artist/payout-onboarding'||!target.searchParams.get('claim')||!/^([2-9A-HJ-NP-Z]{5})-([2-9A-HJ-NP-Z]{5})$/.test(payload.challengeCode))throw new Error('Onboarding invitation failed browser validation');result.textContent='Source-bound invitation created. Do not send without owner approval. Deliver these through two independent channels. Link: '+target.href+'\\nOne-time code for the authoritative roster mailbox only: '+payload.challengeCode;button.disabled=false;result.focus();return}result.textContent='Operation completed. Refreshing verified state…';location.reload()}catch(error){result.textContent=error instanceof Error?error.message:'Operation failed';button.disabled=false;result.focus()}});
</script></body></html>`;
}
