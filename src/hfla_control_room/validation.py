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
    AdsReviewStatus,
    AIReviewStatus,
    BlockerStatus,
    ChannelVisibility,
    ChatbotResponseReviewStatus,
    ConsumerChannel,
    CopilotInternalReviewStatus,
    ExportChannel,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QuoteOperatorReviewStatus,
    RuleStatus,
)
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    EvidenceRecord,
    FullConfigSpec,
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
    if not rule.approved_export_text.strip():
        errors.append(f"Rule '{rule.rule_id}' has no approved export text (approved_export_text).")
    if not rule.release_version.strip():
        errors.append(f"Rule '{rule.rule_id}' has no release version.")
    if not rule.effective_date.strip():
        errors.append(f"Rule '{rule.rule_id}' has no effective date.")
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
    visible text fields destined for channel-safe exports.
    """
    violations: list[str] = []
    for rule in rules:
        combined = " ".join(
            [
                rule.approved_export_text,
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


# ---------------------------------------------------------------------------
# Channel-specific export safety validation
# ---------------------------------------------------------------------------

_CHANNEL_VISIBILITY_BLOCKED: frozenset[ChannelVisibility] = frozenset(
    {ChannelVisibility.INTERNAL_ONLY, ChannelVisibility.RESTRICTED_PII}
)

# Legacy (ExportChannel) public set — retained for back-compat callers.
_PUBLIC_CHANNELS: frozenset[ExportChannel] = frozenset(
    {ExportChannel.WEBSITE, ExportChannel.GOOGLE_ADS, ExportChannel.CHATBOT}
)


def validate_channel_export_safety(
    rule: RuleRow, channel: ExportChannel
) -> list[str]:
    """Return violation messages for a specific channel export request
    (legacy :class:`ExportChannel` API).

    Phase 1B.2 fixes the customer-chatbot / Copilot conflation: the chatbot
    branch now requires :class:`ChatbotResponseReviewStatus` and the Copilot
    branch requires :class:`CopilotInternalReviewStatus`.  Approval on one
    channel does NOT grant approval on the other.
    """
    errors: list[str] = []

    if rule.channel_visibility in _CHANNEL_VISIBILITY_BLOCKED:
        errors.append(
            f"Rule '{rule.rule_id}' has visibility '{rule.channel_visibility.value}' — "
            f"cannot be exported to any channel."
        )
        return errors  # No point checking further

    if rule.contains_pii:
        errors.append(
            f"Rule '{rule.rule_id}' is flagged contains_pii=True — cannot be exported."
        )

    if rule.contains_internal_only_logic and channel in _PUBLIC_CHANNELS:
        errors.append(
            f"Rule '{rule.rule_id}' is flagged contains_internal_only_logic=True — "
            f"cannot be exported to public channel '{channel.value}'."
        )

    if channel in _PUBLIC_CHANNELS:
        if rule.public_safe_review_status != PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE:
            errors.append(
                f"Rule '{rule.rule_id}' public_safe_review_status is "
                f"'{rule.public_safe_review_status.value}' — "
                f"must be APPROVED_PUBLIC_SAFE for channel '{channel.value}'."
            )

    if channel == ExportChannel.GOOGLE_ADS:
        if rule.ads_claim_review_status != AdsReviewStatus.APPROVED_FOR_ADS:
            errors.append(
                f"Rule '{rule.rule_id}' ads_claim_review_status is "
                f"'{rule.ads_claim_review_status.value}' — "
                f"must be APPROVED_FOR_ADS for google_ads channel."
            )

    # Customer-chatbot is a PUBLIC channel and now has its OWN review gate.
    if channel == ExportChannel.CHATBOT:
        if (
            rule.customer_chatbot_review_status
            != ChatbotResponseReviewStatus.APPROVED_FOR_CUSTOMER_CHATBOT
        ):
            errors.append(
                f"Rule '{rule.rule_id}' customer_chatbot_review_status is "
                f"'{rule.customer_chatbot_review_status.value}' — "
                f"must be APPROVED_FOR_CUSTOMER_CHATBOT for chatbot channel. "
                f"Copilot or generic AI approval does NOT grant chatbot eligibility."
            )

    # Internal Copilot has its OWN review gate; chatbot approval does NOT apply.
    if channel == ExportChannel.AI_COPILOT:
        if (
            rule.copilot_internal_review_status
            != CopilotInternalReviewStatus.APPROVED_FOR_COPILOT_INTERNAL
        ):
            errors.append(
                f"Rule '{rule.rule_id}' copilot_internal_review_status is "
                f"'{rule.copilot_internal_review_status.value}' — "
                f"must be APPROVED_FOR_COPILOT_INTERNAL for ai_copilot channel. "
                f"Chatbot approval does NOT grant Copilot eligibility."
            )
        eligible = (ChannelVisibility.CHANNEL_SAFE, ChannelVisibility.INTERNAL_APPROVED)
        if rule.channel_visibility not in eligible:
            errors.append(
                f"Rule '{rule.rule_id}' visibility '{rule.channel_visibility.value}' — "
                f"not eligible for ai_copilot channel."
            )

    return errors


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
_ = (AIReviewStatus, INTERNAL_CONSUMER_CHANNELS, GOVERNANCE_DESTINATION_TABS)


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
