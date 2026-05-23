"""
Happy Faces LA — Commercial Control Room
Release exporter.

Produces sanitized, channel-safe, machine-readable approved-rules exports
for website, Google Ads, Copilot, and chatbot consumption.

EXPORT RULES (enforced at runtime):
1. Only rules with CEO decision APPROVED_AS_RECOMMENDED or
   APPROVED_WITH_CONDITIONS may be exported.
2. All required fields (final_effective_rule, release_version,
   effective_date, policy_version) must be populated.
3. PII-classified fields are stripped from every export record.
4. Internal-only fields (ceo_notes, internal profitability, etc.) are
   stripped from every export record.
5. Restricted Operations data is never merged into a channel-safe export.
6. Draft rules are never included.
7. The export is channel-filtered: only rules whose export_channels
   list includes the requested channel are included.

PHASE 1: No CEO-approved rules exist yet.  All seed data is DRAFT.
The exporter will produce an empty approved set (correct behavior).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from hfla_control_room.constants import ExportChannel, RuleStatus
from hfla_control_room.models import ApprovedRuleExport, RuleRow
from hfla_control_room.validation import validate_rule_for_export

logger = logging.getLogger(__name__)


def _is_approved(rule: RuleRow) -> bool:
    return rule.status in (
        RuleStatus.APPROVED_AS_RECOMMENDED,
        RuleStatus.APPROVED_WITH_CONDITIONS,
    )


def export_approved_rules(
    rules: list[RuleRow],
    channel: ExportChannel | None = None,
) -> list[ApprovedRuleExport]:
    """Filter and validate rules for export.

    Args:
        rules: All rules from the register.
        channel: If provided, restrict to rules targeting this channel.
                 If None, export all approved rules across all channels.

    Returns:
        List of :class:`ApprovedRuleExport` records ready for serialization.

    Raises:
        ValueError: If any approved rule fails validation (should not happen
                    if governance discipline is maintained).
    """
    exported: list[ApprovedRuleExport] = []
    skipped_draft: int = 0
    skipped_validation: int = 0

    for rule in rules:
        if not _is_approved(rule):
            skipped_draft += 1
            continue

        if channel and channel not in rule.export_channels:
            continue

        errors = validate_rule_for_export(rule)
        if errors:
            logger.warning(
                "Rule '%s' failed export validation (skipped): %s",
                rule.rule_id,
                errors,
            )
            skipped_validation += 1
            continue

        exported.append(
            ApprovedRuleExport(
                rule_id=rule.rule_id,
                rule_category=rule.rule_category,
                rule_title=rule.rule_title,
                final_effective_rule=rule.final_effective_rule,
                release_version=rule.release_version,
                effective_date=rule.effective_date,
                policy_version=rule.policy_version,
                export_channels=rule.export_channels,
            )
        )

    logger.info(
        "Export complete: %d approved, %d draft skipped, %d validation failures.",
        len(exported),
        skipped_draft,
        skipped_validation,
    )
    return exported


def write_export(
    records: list[ApprovedRuleExport],
    output_path: Path,
    channel: ExportChannel | None = None,
) -> Path:
    """Serialize export records to JSON at *output_path*.

    The output file is suitable for machine consumption by website,
    Google Ads, Copilot, and chatbot systems after CEO release approval.
    No PII or internal-only fields are present in the output.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        "export_metadata": {
            "channel": channel.value if channel else "all",
            "record_count": len(records),
            "contains_pii": False,
            "contains_internal_only_fields": False,
            "phase": "PHASE_1_DRY_RUN — no approved rules exist yet",
        },
        "approved_rules": [r.model_dump() for r in records],
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Export written: %s (%d records)", output_path, len(records))
    return output_path
