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
| Final effective rule text written | `final_effective_rule` | Non-empty string |
| Release version assigned | `release_version` | Non-empty, follows semantic versioning |
| Effective date set | `effective_date` | Non-empty date |
| Policy version assigned | `policy_version` | Non-empty string |
| No active blockers | `blockers` | Empty list or all resolved |

Failure on any requirement = rule excluded from export. No exceptions. No overrides.

---

## 3. Approved Rule Export Process

1. Governance team runs `python -m hfla_control_room.cli validate --config config`
2. All spec integrity checks pass.
3. `04_ACTIVE_RULES_EXPORT` tab is reviewed — only approved rules appear.
4. `python -m hfla_control_room.cli plan --config config --output artifacts/dry_run` is run and reviewed.
5. CEO reviews release package (release brief populated from TEMPLATE Doc B).
6. CEO signs the Release Brief.
7. (Phase 2+) `python -m hfla_control_room.cli provision --config config --apply` is run.
8. Audit report is generated and retained.
9. Release entry logged in `12_RELEASE_CHANGELOG`.

---

## 4. Channel-Safe Export Constraints

The sanitized machine-readable export for website, Google Ads, Copilot, and chatbot use:

- Contains only `final_effective_rule` text — no drafts, no recommendations.
- Excludes ALL PII fields.
- Excludes ALL internal-only fields (ceo_notes, internal_cost, margin, etc.).
- Is filtered by channel: each channel receives only rules marked for that channel.
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

## 6. Phase 2 Authorization Requirements

Phase 2 live provisioning requires:

1. CEO/Controller explicit written authorization.
2. Delivery of a controller-approved data payload (pricing, policy, AI rules).
3. OAuth scope research completed and approved (see `GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md`).
4. Business Google account selected by CEO.
5. All Phase 1 quality gates re-confirmed passing on the Phase 2 payload.
6. Dry-run plan reviewed and approved before `--apply` is executed.

---

## 7. Immutable Records

The following records are append-only after initial entry:

- `12_RELEASE_CHANGELOG` rows — no deletion permitted
- CEO Approval Record in the Policy Manual (Doc A)
- Audit receipts in `artifacts/`
- Git commit history

---

*Maintained by: Happy Faces LA Engineering and CEO/Controller*
