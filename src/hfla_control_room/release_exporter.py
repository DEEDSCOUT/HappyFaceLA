"""
Happy Faces LA — Commercial Control Room
Release exporter (Phase 1B.4).

Produces sanitized, channel-safe, machine-readable approved-projection
exports for website, Google Ads, customer chatbot, Copilot internal, and
quote-operator consumption.

GOVERNANCE CONTRACT (enforced at runtime).  The full Phase 1B.4 authority
chain a projection MUST satisfy to be authorised for a channel:

  1.  ``projection.channel == requested_channel``.
  2.  ``projection.release_status == RELEASED``.
  3.  ``projection.approved_channel_text`` is non-empty.
  4.  ``projection.publication_key`` is non-empty and unique within the
      active per-channel snapshot (duplicate keys FAIL CLOSED).
  5.  Every governing rule exists, status in
      (APPROVED_AS_RECOMMENDED, APPROVED_WITH_CONDITIONS), and
      ``ceo_decision`` is non-empty.
  6.  Per-channel safety gates pass for every governing rule.
  7.  A :class:`ReleaseRecord` with ``status=RELEASED`` exists that
      authorises the channel AND lists the projection.
  8.  ``set(projection.related_rule_ids) <= set(release.related_rule_ids)``
      — the release must explicitly govern every rule the projection cites.
  9.  Exactly one ACTIVE :class:`ChannelReleaseActivationRecord` exists for
      the channel, points at the same ``release_id``, and uses snapshot
      mode ``FULL_CHANNEL_SNAPSHOT``.
  10. No OPEN :class:`BlockerRecord` lists the channel in
      ``blocked_channels`` (this is the **publication / export** scope and
      is INDEPENDENT of ``blocks_live_provisioning`` and
      ``blocks_phase_1c_content_loading``).

Independent blocker scopes (Phase 1B.4 split):

  A. **Publication / export scope** — :func:`_channel_has_open_export_blocker`
     and :func:`channel_publication_blockers_for_channel`.  Any OPEN
     blocker listing the channel in ``blocked_channels`` stops the export.

  B. **Live-Google-provisioning scope** —
     :func:`validate_no_live_provisioning_blockers`.  Any OPEN blocker with
     ``blocks_live_provisioning=True`` stops the live provisioner.

  C. **Phase 1C content-loading scope** —
     :func:`validate_no_phase_1c_loading_blockers`.  Any OPEN blocker with
     ``blocks_phase_1c_content_loading=True`` stops bulk loading.

The three scopes are evaluated INDEPENDENTLY.  Approval on one scope never
implies approval on another.

PHASE 1: No CEO-approved releases or activations exist yet.  All seed
records are DRAFT.  The exporter therefore produces an empty approved set
for every channel (correct behavior).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from hfla_control_room.constants import (
    RESTRICTED_CONSUMER_CHANNELS,
    ActivationStatus,
    BlockerStatus,
    ConsumerChannel,
    ProjectionReleaseStatus,
    ReleaseStatus,
    RuleStatus,
    SnapshotMode,
)
from hfla_control_room.models import (
    ApprovedProjectionExport,
    BlockerRecord,
    ChannelProjectionRecord,
    ChannelReleaseActivationRecord,
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


# ---------------------------------------------------------------------------
# Independent blocker scopes (Phase 1B.4 — R1 fix)
# ---------------------------------------------------------------------------


def _channel_has_open_export_blocker(
    channel: ConsumerChannel, blockers: list[BlockerRecord]
) -> BlockerRecord | None:
    """Return the first OPEN blocker that lists *channel* in its
    ``blocked_channels``, regardless of ``blocks_live_provisioning`` /
    ``blocks_phase_1c_content_loading``.

    This is the **channel publication / export** scope.  Any open blocker
    naming a channel in its ``blocked_channels`` veto list MUST stop
    that channel's exports, even if the live-Google-provisioning flag is
    false (the live provisioner is one consumer; publication is a
    different consumer).
    """
    for blocker in blockers:
        if blocker.status not in _OPEN_BLOCKER_STATUSES:
            continue
        if channel in blocker.blocked_channels:
            return blocker
    return None


def channel_publication_blockers_for_channel(
    channel: ConsumerChannel, blockers: list[BlockerRecord]
) -> list[BlockerRecord]:
    """Return ALL OPEN blockers vetoing publication on *channel*."""
    return [
        b
        for b in blockers
        if b.status in _OPEN_BLOCKER_STATUSES and channel in b.blocked_channels
    ]


def validate_no_live_provisioning_blockers(
    blockers: list[BlockerRecord],
) -> list[BlockerRecord]:
    """Return OPEN blockers with ``blocks_live_provisioning=True``.

    Independent of channel.  Live-Google-provisioning is a workspace-level
    operation; any open blocker that asserts it blocks live provisioning
    vetoes the live apply path until resolved.
    """
    return [
        b
        for b in blockers
        if b.status in _OPEN_BLOCKER_STATUSES and b.blocks_live_provisioning
    ]


def validate_no_phase_1c_loading_blockers(
    blockers: list[BlockerRecord],
) -> list[BlockerRecord]:
    """Return OPEN blockers with ``blocks_phase_1c_content_loading=True``."""
    return [
        b
        for b in blockers
        if b.status in _OPEN_BLOCKER_STATUSES and b.blocks_phase_1c_content_loading
    ]


# ---------------------------------------------------------------------------
# Activation lookup (Phase 1B.4 — R2 fix)
# ---------------------------------------------------------------------------


def _find_active_activation_for_channel(
    channel: ConsumerChannel,
    activations: list[ChannelReleaseActivationRecord],
) -> ChannelReleaseActivationRecord | None:
    """Return the single ACTIVE activation for *channel*, or ``None``.

    If more than one ACTIVE activation is found for the same channel the
    register-level integrity validator (`ChannelReleaseActivationRegister`)
    will already have rejected the spec; this guard is a defence-in-depth
    safety net at export time.
    """
    found: ChannelReleaseActivationRecord | None = None
    for a in activations:
        if a.channel != channel:
            continue
        if a.activation_status != ActivationStatus.ACTIVE:
            continue
        if a.snapshot_mode != SnapshotMode.FULL_CHANNEL_SNAPSHOT:
            continue
        if found is not None:
            raise ValueError(
                f"Channel '{channel.value}' has multiple ACTIVE activations: "
                f"'{found.activation_id}' and '{a.activation_id}'."
            )
        found = a
    return found


def export_for_channel(
    channel: ConsumerChannel,
    *,
    projections: list[ChannelProjectionRecord],
    rules: list[RuleRow],
    releases: list[ReleaseRecord],
    blockers: list[BlockerRecord],
    activations: list[ChannelReleaseActivationRecord],
) -> list[ApprovedProjectionExport]:
    """Return the projections that are authorised to publish on *channel*.

    Phase 1 returns an empty list for every channel — no activation is
    ACTIVE.  The function never reads any deprecated rule-level export
    text; channel text lives only on :class:`ChannelProjectionRecord`.

    Raises:
        ValueError: if *channel* is the restricted-operations channel,
            if the register has multiple ACTIVE activations, or if a
            duplicate ``(channel, publication_key)`` would be emitted
            (fails closed).
    """
    if channel in RESTRICTED_CONSUMER_CHANNELS:
        raise ValueError(
            f"Channel '{channel.value}' is restricted-operations / PII and "
            "has no automated export path in Phase 1."
        )

    # Gate A — channel publication / export blocker scope (independent of
    # blocks_live_provisioning).  Phase 1B.4 R1 fix.
    open_blocker = _channel_has_open_export_blocker(channel, blockers)
    if open_blocker is not None:
        logger.warning(
            "Channel '%s' has open publication blocker '%s' (status=%s) — "
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

    activation = _find_active_activation_for_channel(channel, activations)
    if activation is None:
        logger.info(
            "Channel '%s' has no ACTIVE activation — no exports authorised.",
            channel.value,
        )
        return []

    release = next(
        (r for r in releases if r.release_id == activation.release_id), None
    )
    if release is None:
        raise ValueError(
            f"Activation '{activation.activation_id}' references unknown "
            f"release_id '{activation.release_id}'."
        )
    if release.status != ReleaseStatus.RELEASED:
        raise ValueError(
            f"Activation '{activation.activation_id}' is ACTIVE but its "
            f"release '{release.release_id}' has status "
            f"'{release.status.value}', not RELEASED."
        )
    if channel not in release.authorized_channels:
        raise ValueError(
            f"Activation '{activation.activation_id}' targets channel "
            f"'{channel.value}' but its release '{release.release_id}' does "
            "not list that channel in authorized_channels."
        )

    rules_by_id = {r.rule_id: r for r in rules}
    release_rule_id_set = set(release.related_rule_ids)
    exported: list[ApprovedProjectionExport] = []
    seen_keys: dict[str, str] = {}
    skipped_wrong_channel = 0
    skipped_not_released = 0
    skipped_not_in_release = 0
    skipped_unapproved_rule = 0
    skipped_safety = 0
    skipped_governing_rule_outside_release = 0

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

        if projection.projection_id not in release.related_projection_ids:
            skipped_not_in_release += 1
            continue

        # Governing rule inclusion: every rule the projection cites MUST
        # appear in the release's related_rule_ids.
        if not set(projection.related_rule_ids) <= release_rule_id_set:
            skipped_governing_rule_outside_release += 1
            logger.warning(
                "Projection '%s' rules %s are not all governed by release "
                "'%s' rules %s.",
                projection.projection_id,
                sorted(projection.related_rule_ids),
                release.release_id,
                sorted(release_rule_id_set),
            )
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

        # Fail-closed duplicate-key detection within the active snapshot.
        if projection.publication_key in seen_keys:
            raise ValueError(
                f"Channel '{channel.value}' activation "
                f"'{activation.activation_id}' would emit duplicate "
                f"publication_key '{projection.publication_key}' from "
                f"projections '{seen_keys[projection.publication_key]}' "
                f"and '{projection.projection_id}' — failing closed."
            )
        seen_keys[projection.publication_key] = projection.projection_id

        exported.append(
            ApprovedProjectionExport(
                projection_id=projection.projection_id,
                publication_key=projection.publication_key,
                related_rule_ids=list(projection.related_rule_ids),
                channel=projection.channel,
                content_type=projection.content_type,
                approved_channel_text=projection.approved_channel_text,
                release_id=release.release_id,
                release_version=release.release_version,
                policy_version=release.policy_version or projection.policy_version,
                effective_date=(
                    activation.effective_date
                    or release.effective_date
                    or projection.effective_date
                ),
                activation_id=activation.activation_id,
                requires_human_escalation=projection.requires_human_escalation,
                escalation_reason=projection.escalation_reason,
            )
        )

    logger.info(
        "Channel '%s' export (activation=%s, release=%s): %d authorised, "
        "%d wrong-channel, %d not-released, %d not-in-release, "
        "%d unapproved-rule, %d safety-rejected, "
        "%d governing-rule-outside-release.",
        channel.value,
        activation.activation_id,
        release.release_id,
        len(exported),
        skipped_wrong_channel,
        skipped_not_released,
        skipped_not_in_release,
        skipped_unapproved_rule,
        skipped_safety,
        skipped_governing_rule_outside_release,
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
