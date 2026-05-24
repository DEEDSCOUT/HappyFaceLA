"""
Happy Faces LA — Commercial Control Room
Release exporter (Phase 1B.3).

Produces sanitized, channel-safe, machine-readable approved-projection
exports for website, Google Ads, customer chatbot, Copilot internal, and
quote-operator consumption.

GOVERNANCE CONTRACT (enforced at runtime):

    RuleRow         governs *policy approval* but never publishes channel text.
    ChannelProjectionRecord owns *per-channel approved text*.
    ReleaseRecord   gates whether any approved content becomes active for a
                    specific channel.

A projection may flow to a channel ONLY when ALL of the following hold:

  1. ``projection.channel == requested_channel``.
  2. ``projection.release_status == RELEASED``.
  3. ``projection.approved_channel_text`` is non-empty.
  4. Every related rule exists, status in
     (APPROVED_AS_RECOMMENDED, APPROVED_WITH_CONDITIONS), and
     ``ceo_decision`` is non-empty.
  5. There is a :class:`ReleaseRecord` with ``status=RELEASED``,
     ``channel in authorized_channels`` and ``projection_id in
     related_projection_ids``.
  6. No open :class:`BlockerRecord` lists the channel in
     ``blocked_channels`` with ``blocks_live_provisioning=True``.

The RESTRICTED_OPERATIONS_PII channel is unreachable from any export path
in Phase 1.  It is rejected at the front of the function.

PHASE 1: No CEO-approved releases exist yet.  All seed releases are DRAFT.
The exporter therefore produces an empty approved set for every channel
(correct behavior).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from hfla_control_room.constants import (
    RESTRICTED_CONSUMER_CHANNELS,
    BlockerStatus,
    ConsumerChannel,
    ProjectionReleaseStatus,
    ReleaseStatus,
    RuleStatus,
)
from hfla_control_room.models import (
    ApprovedProjectionExport,
    BlockerRecord,
    ChannelProjectionRecord,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.validation import (
    validate_channel_projection_integrity,
    validate_consumer_channel_export_safety,
)

logger = logging.getLogger(__name__)


_APPROVED_RULE_STATUSES = (
    RuleStatus.APPROVED_AS_RECOMMENDED,
    RuleStatus.APPROVED_WITH_CONDITIONS,
)

_OPEN_BLOCKER_STATUSES = (
    BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
    BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
    BlockerStatus.OPEN_EVIDENCE_REQUIRED,
)


def _rule_is_approved(rule: RuleRow) -> bool:
    return rule.status in _APPROVED_RULE_STATUSES and bool(rule.ceo_decision.strip())


def _find_authorising_release(
    projection: ChannelProjectionRecord,
    channel: ConsumerChannel,
    releases: list[ReleaseRecord],
) -> ReleaseRecord | None:
    for release in releases:
        if release.status != ReleaseStatus.RELEASED:
            continue
        if channel not in release.authorized_channels:
            continue
        if projection.projection_id not in release.related_projection_ids:
            continue
        return release
    return None


def _channel_has_open_provisioning_blocker(
    channel: ConsumerChannel, blockers: list[BlockerRecord]
) -> BlockerRecord | None:
    for blocker in blockers:
        if blocker.status not in _OPEN_BLOCKER_STATUSES:
            continue
        if not blocker.blocks_live_provisioning:
            continue
        if channel in blocker.blocked_channels:
            return blocker
    return None


def export_for_channel(
    channel: ConsumerChannel,
    *,
    projections: list[ChannelProjectionRecord],
    rules: list[RuleRow],
    releases: list[ReleaseRecord],
    blockers: list[BlockerRecord],
) -> list[ApprovedProjectionExport]:
    """Return the projections that are authorised to publish on *channel*.

    Phase 1 returns an empty list for every channel — no release is RELEASED.
    The function never reads any deprecated rule-level export text;
    channel text lives only on :class:`ChannelProjectionRecord`.

    Raises:
        ValueError: if *channel* is the restricted-operations channel.
    """
    if channel in RESTRICTED_CONSUMER_CHANNELS:
        raise ValueError(
            f"Channel '{channel.value}' is restricted-operations / PII and "
            "has no automated export path in Phase 1."
        )

    open_blocker = _channel_has_open_provisioning_blocker(channel, blockers)
    if open_blocker is not None:
        logger.warning(
            "Channel '%s' has open provisioning blocker '%s' (status=%s) — "
            "no exports authorised.",
            channel.value,
            open_blocker.blocker_id,
            open_blocker.status.value,
        )
        return []

    # Defensive: re-run the projection integrity check to surface invariant
    # violations (PII on public channels, missing policy_version, etc.).
    integrity_errors = validate_channel_projection_integrity(
        projections, rules, evidence_records=None
    )
    if integrity_errors:
        raise ValueError(
            "Channel projection integrity errors prevent export: "
            + "; ".join(integrity_errors)
        )

    rules_by_id = {r.rule_id: r for r in rules}
    exported: list[ApprovedProjectionExport] = []
    skipped_wrong_channel = 0
    skipped_not_released = 0
    skipped_no_release_record = 0
    skipped_unapproved_rule = 0
    skipped_safety = 0

    for projection in projections:
        if projection.channel != channel:
            skipped_wrong_channel += 1
            continue

        if projection.release_status != ProjectionReleaseStatus.RELEASED:
            skipped_not_released += 1
            continue

        if not projection.approved_channel_text.strip():
            skipped_not_released += 1
            continue

        # Every governing rule must be APPROVED with a CEO decision recorded.
        rule_ok = True
        for rule_id in projection.related_rule_ids:
            rule = rules_by_id.get(rule_id)
            if rule is None or not _rule_is_approved(rule):
                rule_ok = False
                break
        if not rule_ok:
            skipped_unapproved_rule += 1
            continue

        # Re-apply per-channel safety gates on every governing rule.
        safety_violation = False
        for rule_id in projection.related_rule_ids:
            rule = rules_by_id[rule_id]
            errs = validate_consumer_channel_export_safety(rule, channel)
            if errs:
                logger.warning(
                    "Projection '%s' rule '%s' failed channel safety: %s",
                    projection.projection_id,
                    rule_id,
                    errs,
                )
                safety_violation = True
                break
        if safety_violation:
            skipped_safety += 1
            continue

        release = _find_authorising_release(projection, channel, releases)
        if release is None:
            skipped_no_release_record += 1
            continue

        exported.append(
            ApprovedProjectionExport(
                projection_id=projection.projection_id,
                related_rule_ids=list(projection.related_rule_ids),
                channel=projection.channel,
                content_type=projection.content_type,
                approved_channel_text=projection.approved_channel_text,
                release_id=release.release_id,
                release_version=release.release_version,
                policy_version=release.policy_version or projection.policy_version,
                effective_date=release.effective_date or projection.effective_date,
            )
        )

    logger.info(
        "Channel '%s' export: %d authorised, %d wrong-channel, "
        "%d not-released, %d no-release-record, %d unapproved-rule, "
        "%d safety-rejected.",
        channel.value,
        len(exported),
        skipped_wrong_channel,
        skipped_not_released,
        skipped_no_release_record,
        skipped_unapproved_rule,
        skipped_safety,
    )
    return exported


def write_channel_export(
    records: list[ApprovedProjectionExport],
    output_path: Path,
    channel: ConsumerChannel,
) -> Path:
    """Serialize export records to JSON at *output_path*.

    The output is suitable for machine consumption by the channel surface
    after CEO release approval.  No PII / internal-only / draft fields are
    present in the output.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        "export_metadata": {
            "channel": channel.value,
            "record_count": len(records),
            "contains_pii": False,
            "contains_internal_only_fields": False,
            "phase": "PHASE_1_DRY_RUN — no released projections exist yet",
        },
        "approved_projections": [r.model_dump(mode="json") for r in records],
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Export written: %s (%d records)", output_path, len(records))
    return output_path
