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
    RuleStatus,
)
from hfla_control_room.models import FullConfigSpec, RuleRow, WorkbookSpec

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
    """Return a list of violation messages for *rule*.  Empty list = valid."""
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
            [rule.final_effective_rule, rule.draft_recommendation, rule.rule_title]
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
    """Walk *root* and return paths of any detected secret files.

    Skips `.venv/`, `.git/`, and `node_modules/` directories.
    """
    skip_dirs = {".venv", "venv", ".git", "node_modules", "__pycache__"}
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
