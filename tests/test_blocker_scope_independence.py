"""Phase 1B.4 R1 — blocker scope independence.

The three blocker scopes — publication / export, live-Google-provisioning,
Phase-1C content-loading — are independent.  A blocker with
``blocks_live_provisioning=False`` MUST still block the per-channel export
if it lists that channel in ``blocked_channels``.
"""

from __future__ import annotations

import pytest

from hfla_control_room.constants import (
    ActivationStatus,
    BlockerPriority,
    BlockerStatus,
    BlockerType,
    CEOReleaseDecision,
    ChannelVisibility,
    ConsumerChannel,
    ImplementationStatus,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QAStatus,
    ReleaseStatus,
    RuleStatus,
    SnapshotMode,
)
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    ChannelReleaseActivationRecord,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.release_exporter import (
    channel_publication_blockers_for_channel,
    export_for_channel,
    validate_no_live_provisioning_blockers,
    validate_no_phase_1c_loading_blockers,
)

EXPORTABLE_CHANNELS = [
    ConsumerChannel.WEBSITE_PUBLIC,
    ConsumerChannel.GOOGLE_ADS_PUBLIC,
    ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC,
    ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT,
    ConsumerChannel.QUOTE_OPERATOR_INTERNAL,
]


def _rule() -> RuleRow:
    return RuleRow(
        rule_id="RULE-001",
        rule_category="PUBLIC_PRICING",
        rule_title="t",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        ceo_decision="Approved as Recommended",
        final_effective_rule="X",
        release_version="v1",
        effective_date="2026-06-15",
        policy_version="POL-1",
        channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        public_safe_review_status=PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE,
        contains_pii=False,
        contains_internal_only_logic=False,
    )


def _projection(channel: ConsumerChannel) -> ChannelProjectionRecord:
    safe_channel_key = channel.value.lower()
    return ChannelProjectionRecord(
        projection_id=f"PROJ-{channel.value}",
        publication_key=f"key.{safe_channel_key}.test",
        related_rule_ids=["RULE-001"],
        channel=channel,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="public-safe",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _release(channel: ConsumerChannel, projection_id: str) -> ReleaseRecord:
    return ReleaseRecord(
        release_id="REL-001",
        release_version="v1",
        release_title="t",
        status=ReleaseStatus.RELEASED,
        ceo_decision=CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
        ceo_decision_date="2026-06-01",
        effective_date="2026-06-15",
        policy_version="POL-1",
        authorized_channels=[channel],
        related_rule_ids=["RULE-001"],
        related_projection_ids=[projection_id],
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
    )


def _activation(channel: ConsumerChannel) -> ChannelReleaseActivationRecord:
    return ChannelReleaseActivationRecord(
        activation_id=f"ACT-{channel.value}",
        release_id="REL-001",
        channel=channel,
        activation_status=ActivationStatus.ACTIVE,
        supersedes_activation_id="",
        effective_date="2026-06-15",
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
        snapshot_mode=SnapshotMode.FULL_CHANNEL_SNAPSHOT,
        notes_internal_only="",
    )


def _publication_only_blocker(channel: ConsumerChannel) -> BlockerRecord:
    """OPEN blocker that lists *channel* but does NOT block live-provisioning
    and does NOT block Phase-1C loading.  Must still block the publication
    export per Phase 1B.4 R1."""
    return BlockerRecord(
        blocker_id=f"BLK-PUB-{channel.value}",
        category=BlockerType.COMPLIANCE_REVIEW_REQUIRED,
        decision_required="Publication-only sign-off required.",
        why_it_matters="Channel content must not publish until resolved.",
        risk_if_missing="Channel may publish unauthorised content.",
        priority=BlockerPriority.HIGH,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
        related_rule_ids=["RULE-001"],
        related_evidence_ids=[],
        blocked_channels=[channel],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=False,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


def _phase_1c_only_blocker() -> BlockerRecord:
    return BlockerRecord(
        blocker_id="BLK-1C-001",
        category=BlockerType.DATA_MISSING,
        decision_required="Bulk content load gated on source evidence.",
        why_it_matters="Phase 1C content loading depends on signed-off sources.",
        risk_if_missing="Phase 1C content loading would proceed without sources.",
        priority=BlockerPriority.HIGH,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_EVIDENCE_REQUIRED,
        related_rule_ids=["RULE-001"],
        related_evidence_ids=[],
        blocked_channels=[],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=True,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


class TestBlockerScopeIndependence:
    @pytest.mark.parametrize("channel", EXPORTABLE_CHANNELS)
    def test_publication_blocker_with_live_provisioning_false_still_blocks_export(
        self, channel
    ):
        projection = _projection(channel)
        rule = _rule()
        release = _release(channel, projection.projection_id)
        activation = _activation(channel)
        blocker = _publication_only_blocker(channel)

        # Per-channel publication blocker check reports the blocker.
        reported = channel_publication_blockers_for_channel(channel, [blocker])
        assert [b.blocker_id for b in reported] == [blocker.blocker_id]

        # Export returns empty: publication scope blocked, regardless of
        # blocks_live_provisioning=False.
        exported = export_for_channel(
            channel,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[blocker],
            activations=[activation],
        )
        assert exported == []

    def test_phase_1c_blocker_reported_independently_of_export(self):
        blocker = _phase_1c_only_blocker()
        # Live-provisioning scope sees nothing.
        assert validate_no_live_provisioning_blockers([blocker]) == []
        # Phase-1C scope reports it.
        errs = validate_no_phase_1c_loading_blockers([blocker])
        assert any(b.blocker_id == "BLK-1C-001" for b in errs)
        # Publication scope (per-channel) sees nothing.
        for channel in EXPORTABLE_CHANNELS:
            assert channel_publication_blockers_for_channel(channel, [blocker]) == []
