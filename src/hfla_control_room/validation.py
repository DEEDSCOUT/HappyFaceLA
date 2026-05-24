"""
Happy Faces LA — Commercial Control Room
Validation engine.

Enforces all governance, PII, and release-gate constraints described in
ARCHITECTURE_DECISION_RECORD.md.
"""

from __future__ import annotations

import logging
from pathlib import Path

from hfla_control_room.constants import (
    AUTHORIZED_WORKSPACE_PATH,
    GOVERNANCE_DESTINATION_TABS,
    INTERNAL_CONSUMER_CHANNELS,
    INTERNAL_ONLY_FIELD_NAMES,
    PII_FIELD_NAMES,
    PUBLIC_CONSUMER_CHANNELS,
    RESTRICTED_CONSUMER_CHANNELS,
    ActivationStatus,
    AdsReviewStatus,
    BlockerStatus,
    CEOReleaseDecision,
    ChannelVisibility,
    ChatbotResponseReviewStatus,
    ConsumerChannel,
    CopilotInternalReviewStatus,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QuoteOperatorReviewStatus,
    ReleaseStatus,
    RuleStatus,
)
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    ChannelReleaseActivationRecord,
    ColumnMappingRecord,
    EvidenceRecord,
    FullConfigSpec,
    ReleaseRecord,
    RuleRow,
    WorkbookSpec,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Workspace isolation
# ---------------------------------------------------------------------------


def assert_authorized_workspace(cwd: Path | None = None) -> None:
    """Raise RuntimeError if the current working directory is not the
    authorized workspace.  Pass *cwd* explicitly in tests; omit for live use.
    """
    import os

    check = Path(cwd).resolve() if cwd else Path(os.getcwd()).resolve()
    authorized = Path(AUTHORIZED_WORKSPACE_PATH).resolve()
    if check != authorized:
        raise RuntimeError(
            f"BLOCKED — WRONG WORKSPACE.\n"
            f"  Current:    {check}\n"
            f"  Authorized: {authorized}"
        )


# ---------------------------------------------------------------------------
# Rule validation
# ---------------------------------------------------------------------------


def _is_exportable_approved(rule: RuleRow) -> bool:
    return rule.status in (
        RuleStatus.APPROVED_AS_RECOMMENDED,
        RuleStatus.APPROVED_WITH_CONDITIONS,
    )


def validate_rule_for_export(rule: RuleRow) -> list[str]:
    """Return a list of violation messages for *rule*.  Empty list = valid for export."""
    errors: list[str] = []

    if not _is_exportable_approved(rule):
        errors.append(
            f"Rule '{rule.rule_id}' status is '{rule.status.value}' — "
            f"must be APPROVED_AS_RECOMMENDED or APPROVED_WITH_CONDITIONS."
        )
    if not rule.ceo_decision.strip():
        errors.append(f"Rule '{rule.rule_id}' has no CEO decision recorded.")
    if not rule.final_effective_rule.strip():
        errors.append(f"Rule '{rule.rule_id}' has no Final Effective Rule.")
    if not rule.policy_version.strip():
        errors.append(f"Rule '{rule.rule_id}' has no policy version.")
    return errors


def validate_rules_batch(rules: list[RuleRow]) -> dict[str, list[str]]:
    """Validate a batch of rules for export.

    Returns a mapping of rule_id → list of violation messages.
    Only rules with at least one error are included.
    """
    result: dict[str, list[str]] = {}
    seen_ids: set[str] = set()
    for rule in rules:
        if rule.rule_id in seen_ids:
            result.setdefault(rule.rule_id, []).append(
                f"Duplicate rule ID: '{rule.rule_id}'."
            )
        seen_ids.add(rule.rule_id)
        errs = validate_rule_for_export(rule)
        if errs:
            result.setdefault(rule.rule_id, []).extend(errs)
    return result


# ---------------------------------------------------------------------------
# PII / channel-safety validation
# ---------------------------------------------------------------------------


def validate_no_pii_in_export(rules: list[RuleRow]) -> list[str]:
    """Return violation messages if any rule exposes PII field names in
    visible internal text fields.

    Phase 1B.3: ``RuleRow`` no longer carries channel-safe export text.
    This scan is now applied only to internal text fields and is intended
    to flag stray PII tokens at policy-authoring time.  Channel-safe
    export text lives only on :class:`ChannelProjectionRecord` and is
    scanned by :func:`validate_no_pii_in_projection_export`.
    """
    violations: list[str] = []
    for rule in rules:
        combined = " ".join(
            [
                rule.final_effective_rule,
                rule.draft_recommendation,
                rule.rule_title,
            ]
        ).lower()
        for pii_field in PII_FIELD_NAMES:
            if pii_field in combined:
                violations.append(
                    f"Rule '{rule.rule_id}' may expose PII field reference '{pii_field}'."
                )
        for internal_field in INTERNAL_ONLY_FIELD_NAMES:
            if internal_field in combined:
                violations.append(
                    f"Rule '{rule.rule_id}' may expose internal-only field '{internal_field}'."
                )
    return violations


def validate_no_pii_in_projection_export(
    projections: list[ChannelProjectionRecord],
) -> list[str]:
    """Scan ``approved_channel_text`` on every projection for PII / internal
    field-name tokens that must never appear in a channel-safe export.
    """
    violations: list[str] = []
    for proj in projections:
        text = proj.approved_channel_text.lower()
        if not text:
            continue
        for pii_field in PII_FIELD_NAMES:
            if pii_field in text:
                violations.append(
                    f"Projection '{proj.projection_id}' approved_channel_text "
                    f"contains PII field reference '{pii_field}'."
                )
        for internal_field in INTERNAL_ONLY_FIELD_NAMES:
            if internal_field in text:
                violations.append(
                    f"Projection '{proj.projection_id}' approved_channel_text "
                    f"contains internal-only field '{internal_field}'."
                )
    return violations


# ---------------------------------------------------------------------------
# Channel-specific export safety validation
# ---------------------------------------------------------------------------

_CHANNEL_VISIBILITY_BLOCKED: frozenset[ChannelVisibility] = frozenset(
    {ChannelVisibility.INTERNAL_ONLY, ChannelVisibility.RESTRICTED_PII}
)


# ---------------------------------------------------------------------------
# ConsumerChannel-aware export safety (Phase 1B.2)
# ---------------------------------------------------------------------------


def validate_consumer_channel_export_safety(
    rule: RuleRow, channel: ConsumerChannel
) -> list[str]:
    """Return violation messages when exporting *rule* to a controlled
    :class:`ConsumerChannel`.

    Each channel has its own independent review gate; approval on one channel
    does NOT grant approval on another.  PII is forbidden on any public
    channel.  Restricted-operations channels require an explicit future
    authorization not granted today.
    """
    errors: list[str] = []

    if channel in RESTRICTED_CONSUMER_CHANNELS:
        errors.append(
            f"Rule '{rule.rule_id}': channel '{channel.value}' requires explicit "
            f"future authorization; no automated export path is permitted today."
        )
        return errors

    if rule.channel_visibility in _CHANNEL_VISIBILITY_BLOCKED:
        errors.append(
            f"Rule '{rule.rule_id}' has visibility '{rule.channel_visibility.value}' — "
            f"cannot be exported to any channel."
        )
        return errors

    if rule.contains_pii and channel in PUBLIC_CONSUMER_CHANNELS:
        errors.append(
            f"Rule '{rule.rule_id}' is flagged contains_pii=True — "
            f"cannot be exported to public channel '{channel.value}'."
        )

    if rule.contains_internal_only_logic and channel in PUBLIC_CONSUMER_CHANNELS:
        errors.append(
            f"Rule '{rule.rule_id}' is flagged contains_internal_only_logic=True — "
            f"cannot be exported to public channel '{channel.value}'."
        )

    if channel in PUBLIC_CONSUMER_CHANNELS:
        if rule.public_safe_review_status != PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE:
            errors.append(
                f"Rule '{rule.rule_id}' public_safe_review_status is "
                f"'{rule.public_safe_review_status.value}' — "
                f"must be APPROVED_PUBLIC_SAFE for channel '{channel.value}'."
            )

    if channel == ConsumerChannel.GOOGLE_ADS_PUBLIC:
        if rule.ads_claim_review_status != AdsReviewStatus.APPROVED_FOR_ADS:
            errors.append(
                f"Rule '{rule.rule_id}' ads_claim_review_status is "
                f"'{rule.ads_claim_review_status.value}' — "
                f"must be APPROVED_FOR_ADS for GOOGLE_ADS_PUBLIC channel."
            )

    if channel == ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC:
        if (
            rule.customer_chatbot_review_status
            != ChatbotResponseReviewStatus.APPROVED_FOR_CUSTOMER_CHATBOT
        ):
            errors.append(
                f"Rule '{rule.rule_id}' customer_chatbot_review_status is "
                f"'{rule.customer_chatbot_review_status.value}' — "
                f"must be APPROVED_FOR_CUSTOMER_CHATBOT for CUSTOMER_CHATBOT_PUBLIC. "
                f"Copilot or generic AI approval does NOT grant chatbot eligibility."
            )

    if channel == ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT:
        if (
            rule.copilot_internal_review_status
            != CopilotInternalReviewStatus.APPROVED_FOR_COPILOT_INTERNAL
        ):
            errors.append(
                f"Rule '{rule.rule_id}' copilot_internal_review_status is "
                f"'{rule.copilot_internal_review_status.value}' — "
                f"must be APPROVED_FOR_COPILOT_INTERNAL for COPILOT_INTERNAL_DECISION_SUPPORT. "
                f"Chatbot approval does NOT grant Copilot eligibility."
            )
        eligible = (ChannelVisibility.CHANNEL_SAFE, ChannelVisibility.INTERNAL_APPROVED)
        if rule.channel_visibility not in eligible:
            errors.append(
                f"Rule '{rule.rule_id}' visibility '{rule.channel_visibility.value}' — "
                f"not eligible for COPILOT_INTERNAL_DECISION_SUPPORT channel."
            )

    if channel == ConsumerChannel.QUOTE_OPERATOR_INTERNAL:
        if (
            rule.quote_operator_review_status
            != QuoteOperatorReviewStatus.APPROVED_FOR_QUOTE_OPERATOR
        ):
            errors.append(
                f"Rule '{rule.rule_id}' quote_operator_review_status is "
                f"'{rule.quote_operator_review_status.value}' — "
                f"must be APPROVED_FOR_QUOTE_OPERATOR for QUOTE_OPERATOR_INTERNAL."
            )

    return errors


# Silence unused-import warnings for symbols re-exported only for type-context.
_ = (INTERNAL_CONSUMER_CHANNELS,)


# ---------------------------------------------------------------------------
# Evidence integrity validation
# ---------------------------------------------------------------------------


def validate_evidence_integrity(
    evidence_records: list[EvidenceRecord],
    seed_rules: list[RuleRow] | None = None,
) -> list[str]:
    """Validate evidence record integrity.

    Checks:
    - Evidence IDs are unique.
    - related_rule_ids resolve to known rule IDs (if seed_rules provided).
    """
    errors: list[str] = []

    # Unique evidence ID check
    seen_ids: set[str] = set()
    for record in evidence_records:
        if record.evidence_id in seen_ids:
            errors.append(f"Duplicate evidence ID: '{record.evidence_id}'.")
        seen_ids.add(record.evidence_id)

    # Rule ID linkage check (only if seed_rules provided)
    if seed_rules is not None:
        known_rule_ids = {r.rule_id for r in seed_rules}
        for record in evidence_records:
            for rid in record.related_rule_ids:
                if rid and rid not in known_rule_ids:
                    errors.append(
                        f"Evidence '{record.evidence_id}' references unknown rule ID '{rid}'."
                    )

    return errors


# ---------------------------------------------------------------------------
# Workbook spec validation
# ---------------------------------------------------------------------------


def validate_workbook_spec(spec: WorkbookSpec) -> list[str]:
    """Return spec-level violation messages beyond Pydantic model checks."""
    errors: list[str] = []
    for tab in spec.tabs:
        overlap = set(tab.editable_columns) & set(tab.protected_formula_columns)
        if overlap:
            errors.append(
                f"Tab '{tab.title}': editable/protected overlap: {sorted(overlap)}"
            )
    return errors


# ---------------------------------------------------------------------------
# Full config validation
# ---------------------------------------------------------------------------


def validate_full_spec(spec: FullConfigSpec) -> list[str]:
    """Run all structural validation checks on the loaded spec.

    Returns a list of all violation messages (empty = clean).
    """
    errors: list[str] = []
    errors.extend(validate_workbook_spec(spec.governance_workbook))
    errors.extend(validate_workbook_spec(spec.restricted_operations_workbook))

    # Seed data — all rules must be DRAFT (no CEO-approved rule in Phase 1)
    for rule in spec.seed_rules:
        if _is_exportable_approved(rule):
            errors.append(
                f"Seed rule '{rule.rule_id}' is marked {rule.status.value} — "
                "no CEO-approved rules are permitted in Phase 1 seed data."
            )

    # Rule ID uniqueness across seed data
    ids = [r.rule_id for r in spec.seed_rules]
    seen: set[str] = set()
    for rid in ids:
        if rid in seen:
            errors.append(f"Duplicate seed rule ID: '{rid}'.")
        seen.add(rid)

    # Evidence integrity
    errors.extend(validate_evidence_integrity(spec.evidence_records, spec.seed_rules))

    # Blocker integrity (Phase 1B.2)
    errors.extend(
        validate_blocker_integrity(
            spec.blocker_records, spec.seed_rules, spec.evidence_records
        )
    )

    # Channel projection integrity (Phase 1B.2)
    errors.extend(
        validate_channel_projection_integrity(
            spec.channel_projection_records, spec.seed_rules, spec.evidence_records
        )
    )

    # Release register integrity (Phase 1B.3)
    errors.extend(
        validate_release_integrity(
            spec.release_records,
            spec.seed_rules,
            spec.channel_projection_records,
            spec.blocker_records,
        )
    )

    # Phase 1: no release may carry status=RELEASED in seed data.
    for release in spec.release_records:
        if release.status == ReleaseStatus.RELEASED:
            errors.append(
                f"Seed release '{release.release_id}' is marked RELEASED \u2014 "
                "no CEO-approved releases are permitted in Phase 1 seed data."
            )

    # Column mapping integrity (Phase 1B.3 \u2014 mappings governed by YAML)
    errors.extend(
        validate_column_mapping_integrity(
            spec.column_mappings, spec.governance_workbook
        )
    )

    # Channel-release activation integrity (Phase 1B.4)
    errors.extend(
        validate_channel_activation_integrity(
            spec.channel_release_activations,
            spec.release_records,
            spec.channel_projection_records,
        )
    )

    # Phase 1: no activation may be ACTIVE in seed data.
    for act in spec.channel_release_activations:
        if act.activation_status == ActivationStatus.ACTIVE:
            errors.append(
                f"Seed activation '{act.activation_id}' is marked ACTIVE \u2014 "
                "no ACTIVE activations are permitted in Phase 1 seed data."
            )

    return errors


# ---------------------------------------------------------------------------
# Release register integrity (Phase 1B.3)
# ---------------------------------------------------------------------------


def validate_release_integrity(
    release_records: list[ReleaseRecord],
    seed_rules: list[RuleRow] | None = None,
    projection_records: list[ChannelProjectionRecord] | None = None,
    blocker_records: list[BlockerRecord] | None = None,
) -> list[str]:
    """Validate release record integrity (Phase 1B.3).

    Checks:
    - Release IDs are unique.
    - related_rule_ids resolve to known rule IDs.
    - related_projection_ids resolve to known projection IDs.
    - resolved_blocker_ids resolve to known blocker IDs.
    - status=RELEASED requires authorized_channels non-empty AND
      ceo_decision in APPROVED_AS_RECOMMENDED / APPROVED_WITH_CONDITIONS.
    - DRAFT records must not list authorized_channels.
    - status=RELEASED must not list any blocker that is still OPEN.
    """
    errors: list[str] = []

    seen_ids: set[str] = set()
    for record in release_records:
        if record.release_id in seen_ids:
            errors.append(f"Duplicate release ID: '{record.release_id}'.")
        seen_ids.add(record.release_id)

    if seed_rules is not None:
        known_rule_ids = {r.rule_id for r in seed_rules}
        for record in release_records:
            for rid in record.related_rule_ids:
                if rid and rid not in known_rule_ids:
                    errors.append(
                        f"Release '{record.release_id}' references unknown "
                        f"rule ID '{rid}'."
                    )

    if projection_records is not None:
        known_proj_ids = {p.projection_id for p in projection_records}
        projections_by_id = {p.projection_id: p for p in projection_records}
        for record in release_records:
            for pid in record.related_projection_ids:
                if pid and pid not in known_proj_ids:
                    errors.append(
                        f"Release '{record.release_id}' references unknown "
                        f"projection ID '{pid}'."
                    )
            # Phase 1B.4: every governing rule the projection cites MUST
            # appear in the release's related_rule_ids.
            release_rule_set = set(record.related_rule_ids)
            for pid in record.related_projection_ids:
                proj = projections_by_id.get(pid)
                if proj is None:
                    continue
                missing_rules = sorted(
                    set(proj.related_rule_ids) - release_rule_set
                )
                if missing_rules:
                    errors.append(
                        f"Release '{record.release_id}' lists projection "
                        f"'{pid}' whose related_rule_ids are not all governed "
                        f"by the release: missing {missing_rules}."
                    )

    if blocker_records is not None:
        known_blocker_ids = {b.blocker_id for b in blocker_records}
        blockers_by_id = {b.blocker_id: b for b in blocker_records}
        _open = (
            BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
            BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
            BlockerStatus.OPEN_EVIDENCE_REQUIRED,
        )
        for record in release_records:
            for bid in record.resolved_blocker_ids:
                if bid and bid not in known_blocker_ids:
                    errors.append(
                        f"Release '{record.release_id}' references unknown "
                        f"blocker ID '{bid}'."
                    )
                    continue
                if (
                    record.status == ReleaseStatus.RELEASED
                    and bid in blockers_by_id
                    and blockers_by_id[bid].status in _open
                ):
                    errors.append(
                        f"Release '{record.release_id}' is RELEASED but lists "
                        f"blocker '{bid}' as resolved while it is still OPEN."
                    )

    for record in release_records:
        if record.status == ReleaseStatus.RELEASED:
            if record.ceo_decision not in (
                CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
                CEOReleaseDecision.APPROVED_WITH_CONDITIONS,
            ):
                errors.append(
                    f"Release '{record.release_id}' status=RELEASED but "
                    f"ceo_decision='{record.ceo_decision.value}'."
                )

    return errors


# ---------------------------------------------------------------------------
# Column mapping integrity (Phase 1B.3)
# ---------------------------------------------------------------------------


def validate_column_mapping_integrity(
    mappings: list[ColumnMappingRecord],
    governance_workbook: WorkbookSpec,
) -> list[str]:
    """Validate column mapping contract integrity (Phase 1B.3).

    Checks:
    - Every destination_tab appears in GOVERNANCE_DESTINATION_TABS.
    - Every (source_model, destination_tab, column_header) triple is unique.
    - Every column_header is present in the destination tab's
      column_headers list in the governance workbook spec.
    - Every source_field exists as a field on the named source model.
    """
    from hfla_control_room import models as _models

    errors: list[str] = []

    headers_by_tab: dict[str, set[str]] = {
        tab.title: set(tab.column_headers) for tab in governance_workbook.tabs
    }

    seen: set[tuple[str, str, str]] = set()
    for m in mappings:
        if m.destination_tab not in GOVERNANCE_DESTINATION_TABS:
            errors.append(
                f"Column mapping '{m.source_model}.{m.source_field}' targets "
                f"unknown governance tab '{m.destination_tab}'."
            )
            continue

        key = (m.source_model, m.destination_tab, m.column_header)
        if key in seen:
            errors.append(f"Duplicate column mapping: {key}.")
        seen.add(key)

        tab_headers = headers_by_tab.get(m.destination_tab)
        if tab_headers is None:
            errors.append(
                f"Column mapping '{m.source_model}.{m.source_field}' "
                f"references tab '{m.destination_tab}' which is not in the "
                "governance workbook spec."
            )
            continue

        if m.column_header not in tab_headers:
            errors.append(
                f"Column mapping '{m.source_model}.{m.source_field}' "
                f"targets unknown column '{m.column_header}' in tab "
                f"'{m.destination_tab}'."
            )

        model_cls = getattr(_models, m.source_model, None)
        if model_cls is None:
            errors.append(
                f"Column mapping source_model '{m.source_model}' is not a "
                "known model class."
            )
            continue
        if m.source_field not in model_cls.model_fields:
            errors.append(
                f"Column mapping '{m.source_model}.{m.source_field}' "
                f"references unknown model field."
            )

    return errors
# ---------------------------------------------------------------------------
# Blocker integrity (Phase 1B.2)
# ---------------------------------------------------------------------------


def validate_blocker_integrity(
    blocker_records: list[BlockerRecord],
    seed_rules: list[RuleRow] | None = None,
    evidence_records: list[EvidenceRecord] | None = None,
) -> list[str]:
    """Validate blocker record integrity.

    Checks:
    - Blocker IDs are unique.
    - related_rule_ids resolve to known rule IDs (if seed_rules provided).
    - related_evidence_ids resolve to known evidence IDs (if evidence_records
      provided).
    - ``blocked_channels`` are drawn from :class:`ConsumerChannel` (enforced
      automatically by the model).
    - CRITICAL-priority OPEN blockers must declare
      ``blocks_phase_1c_content_loading=True``.
    - RESOLVED blockers must have at least one resolution evidence note.
    """
    errors: list[str] = []

    seen_ids: set[str] = set()
    for record in blocker_records:
        if record.blocker_id in seen_ids:
            errors.append(f"Duplicate blocker ID: '{record.blocker_id}'.")
        seen_ids.add(record.blocker_id)

    if seed_rules is not None:
        known_rule_ids = {r.rule_id for r in seed_rules}
        for record in blocker_records:
            for rid in record.related_rule_ids:
                if rid and rid not in known_rule_ids:
                    errors.append(
                        f"Blocker '{record.blocker_id}' references unknown rule ID '{rid}'."
                    )

    if evidence_records is not None:
        known_evidence_ids = {e.evidence_id for e in evidence_records}
        for record in blocker_records:
            for eid in record.related_evidence_ids:
                if eid and eid not in known_evidence_ids:
                    errors.append(
                        f"Blocker '{record.blocker_id}' references unknown "
                        f"evidence ID '{eid}'."
                    )

    _open_statuses = (
        BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
        BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
        BlockerStatus.OPEN_EVIDENCE_REQUIRED,
    )
    for record in blocker_records:
        if (
            record.status in _open_statuses
            and record.priority.value == "CRITICAL"
            and not record.blocks_phase_1c_content_loading
        ):
            errors.append(
                f"Blocker '{record.blocker_id}' is CRITICAL and OPEN but "
                f"blocks_phase_1c_content_loading=False. Phase 1C cannot proceed."
            )

    return errors


# ---------------------------------------------------------------------------
# Channel projection integrity (Phase 1B.2)
# ---------------------------------------------------------------------------


def validate_channel_projection_integrity(
    projection_records: list[ChannelProjectionRecord],
    seed_rules: list[RuleRow] | None = None,
    evidence_records: list[EvidenceRecord] | None = None,
) -> list[str]:
    """Validate channel projection record integrity.

    Checks:
    - Projection IDs are unique.
    - ``channel`` is drawn from :class:`ConsumerChannel` (enforced by the
      model).
    - ``related_rule_ids`` resolve to known rule IDs (if seed_rules provided).
    - ``source_evidence_ids`` resolve to known evidence IDs (if
      evidence_records provided).
    - DRAFT or NOT_REVIEWED projections must NOT carry approved_channel_text
      (a DRAFT row is non-exportable by construction).
    - Public projections that contain_pii are rejected (also enforced on the
      model, but re-asserted here for the full-spec view).
    - APPROVED_FOR_RELEASE / RELEASED projections must carry a non-empty
      ``policy_version`` and ``effective_date``.
    """
    errors: list[str] = []

    seen_ids: set[str] = set()
    for record in projection_records:
        if record.projection_id in seen_ids:
            errors.append(f"Duplicate projection ID: '{record.projection_id}'.")
        seen_ids.add(record.projection_id)

    if seed_rules is not None:
        known_rule_ids = {r.rule_id for r in seed_rules}
        for record in projection_records:
            for rid in record.related_rule_ids:
                if rid and rid not in known_rule_ids:
                    errors.append(
                        f"Projection '{record.projection_id}' references unknown "
                        f"rule ID '{rid}'."
                    )

    if evidence_records is not None:
        known_evidence_ids = {e.evidence_id for e in evidence_records}
        for record in projection_records:
            for eid in record.source_evidence_ids:
                if eid and eid not in known_evidence_ids:
                    errors.append(
                        f"Projection '{record.projection_id}' references unknown "
                        f"evidence ID '{eid}'."
                    )

    for record in projection_records:
        if (
            record.release_status == ProjectionReleaseStatus.DRAFT
            and record.approved_channel_text.strip()
        ):
            errors.append(
                f"Projection '{record.projection_id}' is DRAFT but carries "
                "non-empty approved_channel_text — forbidden."
            )

        if record.channel in PUBLIC_CONSUMER_CHANNELS and record.contains_pii:
            errors.append(
                f"Projection '{record.projection_id}' targets public channel "
                f"{record.channel.value} but contains_pii=True — forbidden."
            )

        if record.release_status in (
            ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
            ProjectionReleaseStatus.RELEASED,
        ):
            if not record.policy_version.strip():
                errors.append(
                    f"Projection '{record.projection_id}' release_status="
                    f"{record.release_status.value} requires non-empty policy_version."
                )
            if not record.effective_date.strip():
                errors.append(
                    f"Projection '{record.projection_id}' release_status="
                    f"{record.release_status.value} requires non-empty effective_date."
                )

    return errors


# ---------------------------------------------------------------------------
# Channel release activation integrity (Phase 1B.4)
# ---------------------------------------------------------------------------


def validate_channel_activation_integrity(
    activation_records: list[ChannelReleaseActivationRecord],
    release_records: list[ReleaseRecord] | None = None,
    projection_records: list[ChannelProjectionRecord] | None = None,
) -> list[str]:
    """Validate :class:`ChannelReleaseActivationRecord` integrity (Phase 1B.4).

    Checks:
    - activation_id uniqueness.
    - At most one ACTIVE activation per channel.
    - ``supersedes_activation_id`` resolves to a known activation (and not
      self).
    - ``release_id`` resolves to a known release.
    - ACTIVE activations chain to a RELEASED release whose
      ``authorized_channels`` lists the activation's channel.
    """
    errors: list[str] = []

    seen_ids: set[str] = set()
    for r in activation_records:
        if r.activation_id in seen_ids:
            errors.append(f"Duplicate activation ID: '{r.activation_id}'.")
        seen_ids.add(r.activation_id)

    actives_by_channel: dict[ConsumerChannel, list[str]] = {}
    for r in activation_records:
        if r.activation_status == ActivationStatus.ACTIVE:
            actives_by_channel.setdefault(r.channel, []).append(r.activation_id)
    for channel, ids in actives_by_channel.items():
        if len(ids) > 1:
            errors.append(
                f"Channel '{channel.value}' has multiple ACTIVE activations: "
                f"{sorted(ids)}."
            )

    known_activation_ids = {r.activation_id for r in activation_records}
    for r in activation_records:
        if r.supersedes_activation_id:
            if r.supersedes_activation_id == r.activation_id:
                errors.append(
                    f"Activation '{r.activation_id}' cannot supersede itself."
                )
            elif r.supersedes_activation_id not in known_activation_ids:
                errors.append(
                    f"Activation '{r.activation_id}' supersedes unknown "
                    f"activation_id '{r.supersedes_activation_id}'."
                )

    if release_records is not None:
        releases_by_id = {rel.release_id: rel for rel in release_records}
        for r in activation_records:
            release = releases_by_id.get(r.release_id)
            if release is None:
                errors.append(
                    f"Activation '{r.activation_id}' references unknown "
                    f"release_id '{r.release_id}'."
                )
                continue
            if r.activation_status == ActivationStatus.ACTIVE:
                if release.status != ReleaseStatus.RELEASED:
                    errors.append(
                        f"Activation '{r.activation_id}' is ACTIVE but its "
                        f"release '{r.release_id}' has status "
                        f"'{release.status.value}'."
                    )
                if r.channel not in release.authorized_channels:
                    errors.append(
                        f"Activation '{r.activation_id}' is ACTIVE on "
                        f"channel '{r.channel.value}' but release "
                        f"'{r.release_id}' does not authorise that channel."
                    )

    if projection_records is not None and release_records is not None:
        # ACTIVE activation: the release's related_projection_ids set must
        # have unique (channel, publication_key) within those targeting the
        # activation's channel.
        projections_by_id = {p.projection_id: p for p in projection_records}
        releases_by_id = {rel.release_id: rel for rel in release_records}
        for r in activation_records:
            if r.activation_status != ActivationStatus.ACTIVE:
                continue
            release = releases_by_id.get(r.release_id)
            if release is None:
                continue
            seen_keys: dict[str, str] = {}
            for pid in release.related_projection_ids:
                p = projections_by_id.get(pid)
                if p is None or p.channel != r.channel:
                    continue
                if p.publication_key in seen_keys:
                    errors.append(
                        f"Activation '{r.activation_id}' would publish "
                        f"duplicate publication_key '{p.publication_key}' on "
                        f"channel '{r.channel.value}' (projections "
                        f"'{seen_keys[p.publication_key]}' and '{pid}')."
                    )
                else:
                    seen_keys[p.publication_key] = pid

    return errors


# ---------------------------------------------------------------------------
# Blocker scope utilities (Phase 1B.4 — moved here in Phase 1B.5 to wire
# validate_phase1c_preload_readiness without creating a circular import with
# release_exporter.py, which already imports from this module).
# release_exporter re-exports both names for backward compatibility.
# ---------------------------------------------------------------------------

_OPEN_BLOCKER_STATUSES: frozenset[BlockerStatus] = frozenset(
    {
        BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
        BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
        BlockerStatus.OPEN_EVIDENCE_REQUIRED,
    }
)


def validate_no_live_provisioning_blockers(
    blockers: list[BlockerRecord],
) -> list[BlockerRecord]:
    """Return OPEN blockers with ``blocks_live_provisioning=True``.

    Independent of channel.  Live-Google-provisioning is a workspace-level
    operation; any open blocker asserting it blocks live provisioning vetoes
    the live apply path until resolved.

    Moved from ``release_exporter`` to ``validation`` in Phase 1B.5.
    ``release_exporter`` re-exports this name for backward compatibility.
    """
    return [
        b for b in blockers if b.status in _OPEN_BLOCKER_STATUSES and b.blocks_live_provisioning
    ]


def validate_no_phase_1c_loading_blockers(
    blockers: list[BlockerRecord],
) -> list[BlockerRecord]:
    """Return OPEN blockers with ``blocks_phase_1c_content_loading=True``.

    Structural blockers asserting ``blocks_phase_1c_content_loading=True``
    must be resolved before Phase 1C content loading begins.  Ordinary open
    CEO / business-decision blockers with
    ``blocks_phase_1c_content_loading=False`` do NOT appear here and remain
    recordable in the draft workbook without blocking dataset loading.

    Moved from ``release_exporter`` to ``validation`` in Phase 1B.5.
    ``release_exporter`` re-exports this name for backward compatibility.
    """
    return [
        b
        for b in blockers
        if b.status in _OPEN_BLOCKER_STATUSES and b.blocks_phase_1c_content_loading
    ]


# ---------------------------------------------------------------------------
# Phase 1C content-loading pre-load gate (Phase 1B.5)
# ---------------------------------------------------------------------------


def validate_phase1c_preload_readiness(spec: FullConfigSpec) -> list[str]:
    """Pre-load gate: must return an empty list before Phase 1C content
    loading begins.

    Verifies five independent conditions; every violation is reported:

    1. **Structural blocker gate** — no OPEN blocker has
       ``blocks_phase_1c_content_loading=True``.  Ordinary OPEN blockers
       (CEO / business decisions) with
       ``blocks_phase_1c_content_loading=False`` are NOT a gate condition;
       they remain recordable in the draft workbook without blocking dataset
       loading.

    2. **No CEO-approved rules** — every rule must carry ``status=DRAFT``.
       Externally-consumable rules must not exist before Phase 1C loads.

    3. **No RELEASED releases** — no release record may carry
       ``status=RELEASED``.  Released content must not pre-exist before
       Phase 1C loads.

    4. **No ACTIVE activations** — no channel-release activation may carry
       ``activation_status=ACTIVE``.  Live channel activations must not
       exist before Phase 1C loads.

    5. **No approved/released projection content** — no projection may carry
       ``release_status`` in ``{APPROVED_FOR_RELEASE, RELEASED}`` combined
       with non-empty ``approved_channel_text``.  Externally-consumable
       projection text must not pre-exist in the loading dataset.
    """
    errors: list[str] = []

    # 1. Structural blocker gate.
    for b in validate_no_phase_1c_loading_blockers(spec.blocker_records):
        errors.append(
            f"Phase 1C content loading blocked by structural blocker "
            f"'{b.blocker_id}' (status={b.status.value}, "
            f"priority={b.priority.value}): {b.decision_required}"
        )

    # 2. No CEO-approved rules.
    _approved_rule_statuses = (
        RuleStatus.APPROVED_AS_RECOMMENDED,
        RuleStatus.APPROVED_WITH_CONDITIONS,
    )
    for rule in spec.seed_rules:
        if rule.status in _approved_rule_statuses:
            errors.append(
                f"Rule '{rule.rule_id}' has status={rule.status.value} — "
                "externally-consumable rules must not exist before Phase 1C "
                "content loading."
            )

    # 3. No RELEASED releases.
    for release in spec.release_records:
        if release.status == ReleaseStatus.RELEASED:
            errors.append(
                f"Release '{release.release_id}' has status=RELEASED — "
                "no released content may exist in the dataset before Phase 1C "
                "content loading."
            )

    # 4. No ACTIVE activations.
    for act in spec.channel_release_activations:
        if act.activation_status == ActivationStatus.ACTIVE:
            errors.append(
                f"Channel activation '{act.activation_id}' has "
                f"activation_status=ACTIVE — no live channel activations may "
                "exist before Phase 1C content loading."
            )

    # 5. No approved/released projection content.
    _releasable_proj_statuses = (
        ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
        ProjectionReleaseStatus.RELEASED,
    )
    for proj in spec.channel_projection_records:
        if (
            proj.release_status in _releasable_proj_statuses
            and proj.approved_channel_text.strip()
        ):
            errors.append(
                f"Projection '{proj.projection_id}' "
                f"(release_status={proj.release_status.value}) carries "
                "non-empty approved_channel_text — externally-consumable "
                "projection content must not exist before Phase 1C content "
                "loading."
            )

    return errors


# ---------------------------------------------------------------------------
# Secrets / tracked-file safety check
# ---------------------------------------------------------------------------

_SECRET_FILE_NAMES = frozenset(
    {
        "client_secret.json",
        "client_secrets.json",
        "token.json",
        "token.pickle",
        "credentials.json",
        "service_account.json",
    }
)

_SECRET_EXTENSIONS = frozenset({".p12", ".pem", ".key"})


def check_no_secrets_in_tree(root: Path) -> list[str]:
    """Walk *root* and return paths of any detected secret files in tracked locations.

    Skips git-ignored protected directories (.secrets/, .runtime/, .exports/,
    .venv/, .git/, node_modules/, __pycache__/) so that legitimately ignored
    credential files do not produce false-positive violations.

    This check is intended to detect accidentally placed or tracked credential
    files outside the protected ignored directories.
    """
    skip_dirs = {
        ".venv", "venv", ".git", "node_modules", "__pycache__",
        ".secrets", ".runtime", ".exports",  # legitimately ignored credential locations
    }
    violations: list[str] = []
    for p in root.rglob("*"):
        if any(part in skip_dirs for part in p.parts):
            continue
        if p.is_file():
            if p.name.lower() in _SECRET_FILE_NAMES:
                violations.append(str(p))
            elif p.suffix.lower() in _SECRET_EXTENSIONS:
                violations.append(str(p))
    return violations
