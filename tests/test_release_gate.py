"""
Tests for the projection-based release export gate (Phase 1B.3).
"""

from __future__ import annotations

from pathlib import Path

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
from hfla_control_room.release_exporter import export_for_channel
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _approved_rule(rule_id: str = "RULE-APPROVED-001") -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
        rule_category="PUBLIC_PRICING",
        rule_title="Approved test rule",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        draft_recommendation="Recommend approval.",
        ceo_decision="Approved as recommended on 2026-05-23.",
        final_effective_rule="The approved effective rule text.",
        release_version="v1.0.0",
        effective_date="2026-06-01",
        policy_version="POL-2026-001",
        channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        public_safe_review_status=PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE,
        contains_pii=False,
        contains_internal_only_logic=False,
        blockers=[],
        internal_notes="",
        ceo_notes="",
        source_evidence_ref="EV-2026-001",
    )


def _draft_rule(rule_id: str = "RULE-DRAFT-001") -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
        rule_category="PUBLIC_PRICING",
        rule_title="Draft test rule",
        status=RuleStatus.DRAFT,
        draft_recommendation="CEO_INPUT_REQUIRED — placeholder.",
        ceo_decision="",
        final_effective_rule="",
        release_version="",
        effective_date="",
        policy_version="",
        blockers=["CEO_INPUT_REQUIRED"],
        internal_notes="",
        ceo_notes="",
        source_evidence_ref="",
    )


def _released_projection(
    projection_id: str = "PROJ-001",
    channel: ConsumerChannel = ConsumerChannel.WEBSITE_PUBLIC,
    related_rule_ids: list[str] | None = None,
    text: str = "Publicly safe approved text.",
    publication_key: str = "website.pricing.disclosure",
) -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id=projection_id,
        publication_key=publication_key,
        related_rule_ids=related_rule_ids or ["RULE-APPROVED-001"],
        channel=channel,
        content_type="POLICY_STATEMENT",
        draft_channel_text="Draft channel text.",
        approved_channel_text=text,
        review_status="APPROVED_FOR_RELEASE",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-2026-001",
        effective_date="2026-06-01",
        requires_human_escalation=False,
        escalation_reason="",
        source_evidence_ids=["EV-2026-001"],
        contains_pii=False,
        contains_internal_only_logic=False,
        notes_internal_only="",
    )


def _released_release(
    release_id: str = "REL-2026-001",
    channels: list[ConsumerChannel] | None = None,
    projection_ids: list[str] | None = None,
    rule_ids: list[str] | None = None,
) -> ReleaseRecord:
    return ReleaseRecord(
        release_id=release_id,
        release_version="v1.0.0",
        release_title="Test release",
        status=ReleaseStatus.RELEASED,
        ceo_decision=CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
        ceo_decision_date="2026-05-23",
        effective_date="2026-06-01",
        policy_version="POL-2026-001",
        authorized_channels=channels or [ConsumerChannel.WEBSITE_PUBLIC],
        related_rule_ids=rule_ids or ["RULE-APPROVED-001"],
        related_projection_ids=projection_ids or ["PROJ-001"],
        resolved_blocker_ids=[],
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
        rollback_plan="Revert release on incident.",
        release_notes="Initial release.",
        notes_internal_only="",
    )


def _open_blocker(channels: list[ConsumerChannel]) -> BlockerRecord:
    return BlockerRecord(
        blocker_id="BLK-001",
        category=BlockerType.COMPLIANCE_REVIEW_REQUIRED,
        decision_required="Compliance sign-off required.",
        why_it_matters="Live provisioning is gated on this decision.",
        risk_if_missing="Channel may publish unapproved content.",
        priority=BlockerPriority.HIGH,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
        related_rule_ids=["RULE-APPROVED-001"],
        related_evidence_ids=[],
        blocked_channels=channels,
        blocks_live_provisioning=True,
        blocks_phase_1c_content_loading=True,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


def _active_activation(
    activation_id: str = "ACT-001",
    release_id: str = "REL-2026-001",
    channel: ConsumerChannel = ConsumerChannel.WEBSITE_PUBLIC,
) -> ChannelReleaseActivationRecord:
    return ChannelReleaseActivationRecord(
        activation_id=activation_id,
        release_id=release_id,
        channel=channel,
        activation_status=ActivationStatus.ACTIVE,
        supersedes_activation_id="",
        effective_date="2026-06-01",
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
        snapshot_mode=SnapshotMode.FULL_CHANNEL_SNAPSHOT,
        notes_internal_only="",
    )


class TestReleaseGate:
    def test_seed_data_yields_empty_export_every_channel(self):
        """Phase 1: no RELEASED releases exist; every channel returns []."""
        spec = load_full_spec(CONFIG_DIR)
        for channel in ConsumerChannel:
            if channel.name.startswith("RESTRICTED"):
                with pytest.raises(ValueError):
                    export_for_channel(
                        channel,
                        projections=spec.channel_projection_records,
                        rules=spec.seed_rules,
                        releases=spec.release_records,
                        blockers=spec.blocker_records,
                        activations=spec.channel_release_activations,
                    )
                continue
            exported = export_for_channel(
                channel,
                projections=spec.channel_projection_records,
                rules=spec.seed_rules,
                releases=spec.release_records,
                blockers=spec.blocker_records,
                activations=spec.channel_release_activations,
            )
            assert exported == []

    def test_fully_authorised_projection_is_exported(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(projection_ids=[projection.projection_id])
        activation = _active_activation(release_id=release.release_id)
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[activation],
        )
        assert len(exported) == 1
        assert exported[0].projection_id == projection.projection_id
        assert exported[0].release_id == release.release_id
        assert exported[0].activation_id == activation.activation_id
        assert exported[0].publication_key == projection.publication_key

    def test_draft_projection_rejected(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        # Build a DRAFT projection (model would reject RELEASED + empty text).
        projection = ChannelProjectionRecord(
            projection_id=projection.projection_id,
            publication_key=projection.publication_key,
            related_rule_ids=projection.related_rule_ids,
            channel=projection.channel,
            content_type=projection.content_type,
            draft_channel_text=projection.draft_channel_text,
            approved_channel_text="",
            review_status="NOT_REVIEWED",
            release_status=ProjectionReleaseStatus.DRAFT,
            policy_version=projection.policy_version,
            effective_date=projection.effective_date,
            source_evidence_ids=projection.source_evidence_ids,
        )
        release = _released_release(projection_ids=[projection.projection_id])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_missing_release_record_rejected(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_channel_mismatch_in_release_rejected(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(
            projection_ids=[projection.projection_id],
            channels=[ConsumerChannel.GOOGLE_ADS_PUBLIC],
        )
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_projection_not_in_release_rejected(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(projection_ids=["PROJ-OTHER-999"])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_release_not_released_rejected(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(projection_ids=[projection.projection_id])
        release.status = ReleaseStatus.DRAFT
        release.ceo_decision = CEOReleaseDecision.PENDING_CEO_REVIEW
        release.authorized_channels = []
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_unapproved_rule_rejects_projection(self):
        rule = _draft_rule("RULE-DRAFT-001")
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(
            projection_ids=[projection.projection_id],
            rule_ids=[rule.rule_id],
        )
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_missing_ceo_decision_rejects_projection(self):
        rule = _approved_rule()
        rule.ceo_decision = ""
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(projection_ids=[projection.projection_id])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []

    def test_open_provisioning_blocker_short_circuits_channel(self):
        rule = _approved_rule()
        projection = _released_projection(related_rule_ids=[rule.rule_id])
        release = _released_release(projection_ids=[projection.projection_id])
        blocker = _open_blocker([ConsumerChannel.WEBSITE_PUBLIC])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[blocker],
            activations=[],
        )
        assert exported == []

    def test_restricted_operations_channel_rejected(self):
        with pytest.raises(ValueError):
            export_for_channel(
                ConsumerChannel.RESTRICTED_OPERATIONS_PII,
                projections=[],
                rules=[],
                releases=[],
                blockers=[],
                activations=[],
            )

    def test_empty_approved_text_rejected(self):
        rule = _approved_rule()
        # Model normally forbids RELEASED + empty text; use model_construct
        # to bypass the model validator and verify the exporter still rejects.
        projection = ChannelProjectionRecord.model_construct(
            projection_id="PROJ-001",
            publication_key="website.pricing.disclosure",
            related_rule_ids=[rule.rule_id],
            channel=ConsumerChannel.WEBSITE_PUBLIC,
            content_type="POLICY_STATEMENT",
            draft_channel_text="draft",
            approved_channel_text="   ",
            review_status="APPROVED_FOR_RELEASE",
            release_status=ProjectionReleaseStatus.RELEASED,
            policy_version="POL-2026-001",
            effective_date="2026-06-01",
            requires_human_escalation=False,
            escalation_reason="",
            source_evidence_ids=[],
            contains_pii=False,
            contains_internal_only_logic=False,
            notes_internal_only="",
        )
        release = _released_release(projection_ids=[projection.projection_id])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=[rule],
            releases=[release],
            blockers=[],
            activations=[],
        )
        assert exported == []
