# Release Governance

## Happy Faces LA — Commercial Control Room

**Version:** 1.0 — Phase 1
**Date:** 2026-05-23

---

## 1. Release Lifecycle

Every commercial rule release follows this mandatory lifecycle:

```
DRAFT → CEO_REVIEW → [APPROVED or REJECTED] → RELEASE PACKAGE → DEPLOYED → VERIFIED
```

No step may be skipped. No rule transitions from DRAFT to DEPLOYED without CEO approval.

---

## 2. Release Gate Requirements

A rule is eligible for release if and only if ALL of the following are true:

| Requirement | Field | Enforcement |
|---|---|---|
| CEO decision recorded | `ceo_decision` | Non-empty string |
| CEO decision is approved | `status` | `APPROVED_AS_RECOMMENDED` or `APPROVED_WITH_CONDITIONS` |
| Final effective rule text written (internal, NOT exported) | `final_effective_rule` | Non-empty string |
| Separately reviewed channel-safe text | `approved_export_text` | Non-empty string; used as the export payload |
| Release version assigned | `release_version` | Non-empty, follows semantic versioning |
| Effective date set | `effective_date` | Non-empty date |
| Policy version assigned | `policy_version` | Non-empty string |
| No active blockers | `blockers` | Empty list or all resolved |

Failure on any requirement = rule excluded from export. No exceptions. No overrides.

---

## 3. Approved Rule Export Process

> **Phase 1B.1 clarification.**  Rule approval occurs only *after* the
> complete controlled CEO draft content has been loaded (Phase 1C) and
> reviewed.  Raw drafts, internal notes, blockers, and placeholder rows
> MUST NOT be exported to any public channel.  The export gate uses the
> separately reviewed `approved_export_text` field — never the raw
> `final_effective_rule` text — for channel-safe payloads.

1. Governance team runs `python -m hfla_control_room.cli validate --config config`.
2. All spec integrity checks pass.
3. The DERIVED tab `04_ACTIVE_RULES_EXPORT` is reviewed — only approved
   rules with non-empty `approved_export_text` appear.
4. `python -m hfla_control_room.cli plan --config config --output artifacts/dry_run`
   is run and reviewed.  The tracked plan snapshot is byte-stable; a
   wall-clock receipt is also written under `.runtime/audit/`.
5. CEO reviews release package (Release Brief populated from TEMPLATE Doc B).
6. CEO signs the Release Brief.
7. (Phase 2+) `python -m hfla_control_room.cli provision --config config --apply` is run.
8. Audit report is generated and retained.
9. Release entry logged in `12_RELEASE_CHANGELOG`.

---

## 4. Channel-Safe Export Constraints

The sanitized machine-readable export for website, Google Ads, Copilot, and chatbot use:

- Contains only `approved_export_text` (the separately reviewed
  customer-facing text) — never the raw `final_effective_rule`, drafts,
  recommendations, blockers, internal notes, or CEO notes.
- Excludes ALL PII fields (see `PII_FIELD_NAMES` in `constants.py`).
- Excludes ALL internal-only fields (`ceo_notes`, `internal_cost`,
  `margin`, `dispatch_origin`, `performer_cost`, `internal_profitability_input`,
  etc. — see `INTERNAL_ONLY_FIELD_NAMES`).
- Is filtered by channel: each channel receives only rules whose
  `export_channels` list includes it AND whose per-channel review status
  is approved (`APPROVED_PUBLIC_SAFE`, `APPROVED_FOR_ADS`, or
  `APPROVED_FOR_AI` as applicable).
- Is never produced from Sheet B (Restricted Operations) data.
- Is never produced from DRAFT or REJECTED rules.

---

## 5. Rollback Procedure

If a deployed release is found to be incorrect:

1. Identify the affected rules by Rule ID.
2. Mark those rules as `SUPERSEDED` in `03_RULE_REGISTER_MASTER`.
3. Activate the prior version rules (or create corrected rules through the full CEO approval lifecycle).
4. Regenerate channel exports.
5. Execute website, ads, AI, and CRM rollback steps per the Release Brief rollback section.
6. Log the rollback in `12_RELEASE_CHANGELOG` with a rollback reference entry.

**There is no automated rollback command in Phase 1.**

---

## 6. Authoritative Phase Sequence

Live Google action is gated by an explicit multi-phase sequence.  Phase 2
is **not** the immediate successor to Phase 1; intermediate Phase 1C and
Phase 1D acceptances are mandatory.

1. **Phase 1B.1 — Acceptance gap closure.**  Deterministic plan
   generation; governance documentation corrections; rule / evidence /
   blocker → tab mapping contract; channel-safe branch tests; idempotency
   test fix; source-evidence comment corrections.  No live Google action.
2. **Phase 1C — Controlled draft content load.**  The 19 seed rules
   currently in the repository are scaffold placeholders.  Phase 1C
   replaces them with the complete controlled CEO draft content (still
   `status: DRAFT`).  Loads complete source evidence records.  No live
   Google action.  No APPROVED rules.
3. **Phase 1D — Idempotency contract validation.**  Exercise the
   manifest / Google-side idempotency contract — deterministic keys,
   search-before-create, fail-closed on multiple Drive matches,
   never-delete — against the full Phase 1C content set.  Still no live
   Google action.
4. **Phase 2 — Connect Google OAuth and execute live Drive provisioning.**
   First live Google call.  Authorized only after Phase 1D acceptance.
5. **Phase 3 — Controlled rule approval.**  Per-rule transitions from
   DRAFT to APPROVED under explicit CEO authorization, after complete
   Phase 1C content has been loaded and reviewed.  Raw drafts, internal
   notes, and placeholder rows MUST NOT be exported.
6. **Phase 4 — Channel-safe release.**  Approved rules with the required
   per-channel review status are exported to website / Google Ads / AI
   copilot / chatbot via `release_exporter`.

### Phase 2 prerequisites (when finally reached)

1. CEO/Controller explicit written authorization for Phase 2.
2. Phase 1B.1, 1C, and 1D acceptance reports on record.
3. Delivery of a controller-approved data payload (pricing, policy, AI rules).
4. OAuth scope research completed and approved (see `GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md`).
5. Business Google account selected by CEO.
6. All Phase 1 quality gates re-confirmed passing on the Phase 1C payload.
7. Dry-run plan reviewed and approved before `--apply` is executed.

---

## 7. Immutable Records

The following records are append-only after initial entry:

- `12_RELEASE_CHANGELOG` rows — no deletion permitted
- CEO Approval Record in the Policy Manual (Doc A)
- Audit receipts in `artifacts/`
- Git commit history

---

*Maintained by: Happy Faces LA Engineering and CEO/Controller*

---

## Phase 1B.2 Update (2026-05-23)

The governance workbook now has 15 tabs (`GOVERNANCE_TAB_COUNT = 15`).
Tab `10_CHANNEL_PROJECTION_REGISTER` is the new single source of truth
for per-channel approved text; the AI customer-response matrix (now tab 11),
source-evidence register (tab 12), and release changelog (tab 13) are
renumbered downstream.

Open blockers are now first-class `BlockerRecord` rows populated into
`02_OPEN_BLOCKERS` directly, not a derived FILTER view of the rule
register. A CRITICAL OPEN blocker that does not also assert
`blocks_phase_1c_content_loading=True` is a validation failure.

The release gate enforces, in addition to the prior rules:

- A rule may be exported to a consumer channel only when the matching
  per-channel review status is `APPROVED_FOR_<CHANNEL>`. Approval on one
  channel does not propagate to another.
- `RESTRICTED_OPERATIONS_PII` exports are rejected outright pending
  explicit future authorization.
- A projection's `release_status` of `APPROVED_FOR_RELEASE` or
  `RELEASED` requires non-empty `approved_channel_text`, `policy_version`
  and `effective_date`.
- A `DRAFT` projection that carries non-empty `approved_channel_text` is
  rejected (stale-draft guard).
- All controlled records reject unknown YAML keys at parse time.


---

## Phase 1B.3 Addendum — ReleaseRecord Becomes the Sole Channel-Publish Authority

Phase 1B.3 introduces `ReleaseRecord` as the single source of release
authority.  A release record is the only artifact that may promote one
or more `ChannelProjectionRecord` rows to live publication on one or
more consumer channels.  RuleRow approval is necessary but not sufficient.

A `ReleaseRecord` with `status=RELEASED` must carry:

- A non-empty `release_version` (e.g. `v2026-Q3-01`).
- A non-empty `ceo_decision_date` and `effective_date`.
- A non-empty `policy_version` reference.
- `ceo_decision` in {APPROVED_AS_RECOMMENDED, APPROVED_WITH_CONDITIONS}.
- At least one `authorized_channel`.
- At least one `related_projection_id`.

DRAFT records must not list any `authorized_channels`; the model
enforces this invariant at construction time.

All Phase 1 release records are DRAFT placeholders.  No release is
RELEASED.  The release exporter therefore returns an empty approved set
for every consumer channel.  This is the correct Phase 1 state.
