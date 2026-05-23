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
    INTERNAL_ONLY_FIELD_NAMES,
    PII_FIELD_NAMES,
    AdsReviewStatus,
    AIReviewStatus,
    ChannelVisibility,
    ExportChannel,
    PublicSafeReviewStatus,
    RuleStatus,
)
from hfla_control_room.models import EvidenceRecord, FullConfigSpec, RuleRow, WorkbookSpec

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

_PUBLIC_CHANNELS: frozenset[ExportChannel] = frozenset(
    {ExportChannel.WEBSITE, ExportChannel.GOOGLE_ADS, ExportChannel.CHATBOT}
)


def validate_channel_export_safety(
    rule: RuleRow, channel: ExportChannel
) -> list[str]:
    """Return violation messages for a specific channel export request.

    Enforces per-channel review status and visibility requirements beyond
    the base export gate.
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

    if channel == ExportChannel.AI_COPILOT:
        if rule.ai_response_review_status != AIReviewStatus.APPROVED_FOR_AI:
            errors.append(
                f"Rule '{rule.rule_id}' ai_response_review_status is "
                f"'{rule.ai_response_review_status.value}' — "
                f"must be APPROVED_FOR_AI for ai_copilot channel."
            )
        eligible = (ChannelVisibility.CHANNEL_SAFE, ChannelVisibility.INTERNAL_APPROVED)
        if rule.channel_visibility not in eligible:
            errors.append(
                f"Rule '{rule.rule_id}' visibility '{rule.channel_visibility.value}' — "
                f"not eligible for ai_copilot channel."
            )

    return errors


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
