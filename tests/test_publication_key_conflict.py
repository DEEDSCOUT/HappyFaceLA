"""Phase 1B.4 — duplicate (channel, publication_key) MUST fail closed."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from hfla_control_room.constants import (
    ActivationStatus,
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
    ChannelProjectionRecord,
    ChannelProjectionRegister,
    ChannelReleaseActivationRecord,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.release_exporter import export_for_channel


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


def _projection(pid: str, key: str) -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id=pid,
        publication_key=key,
        related_rule_ids=["RULE-001"],
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="public-safe",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _release(pids: list[str]) -> ReleaseRecord:
    return ReleaseRecord(
        release_id="REL-001",
        release_version="v1",
        release_title="t",
        status=ReleaseStatus.RELEASED,
        ceo_decision=CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
        ceo_decision_date="2026-06-01",
        effective_date="2026-06-15",
        policy_version="POL-1",
        authorized_channels=[ConsumerChannel.WEBSITE_PUBLIC],
        related_rule_ids=["RULE-001"],
        related_projection_ids=pids,
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
    )


def _activation() -> ChannelReleaseActivationRecord:
    return ChannelReleaseActivationRecord(
        activation_id="ACT-001",
        release_id="REL-001",
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        activation_status=ActivationStatus.ACTIVE,
        supersedes_activation_id="",
        effective_date="2026-06-15",
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
        snapshot_mode=SnapshotMode.FULL_CHANNEL_SNAPSHOT,
        notes_internal_only="",
    )


class TestPublicationKeyConflict:
    def test_register_rejects_duplicate_publication_key_among_released(self):
        p1 = _projection("PROJ-1", "website.pricing.disclosure")
        p2 = _projection("PROJ-2", "website.pricing.disclosure")
        with pytest.raises(ValidationError):
            ChannelProjectionRegister(records=[p1, p2])

    def test_exporter_fails_closed_on_duplicate_publication_key(self):
        p1 = _projection("PROJ-1", "website.pricing.disclosure")
        # Bypass register-level uniqueness with model_construct (different
        # validation path); the exporter MUST still fail closed.
        p2 = ChannelProjectionRecord.model_construct(
            projection_id="PROJ-2",
            publication_key="website.pricing.disclosure",
            related_rule_ids=["RULE-001"],
            channel=ConsumerChannel.WEBSITE_PUBLIC,
            content_type="POLICY_STATEMENT",
            draft_channel_text="draft",
            approved_channel_text="another public-safe text",
            release_status=ProjectionReleaseStatus.RELEASED,
            review_status="APPROVED_FOR_RELEASE",
            policy_version="POL-1",
            effective_date="2026-06-15",
            requires_human_escalation=False,
            escalation_reason="",
            source_evidence_ids=[],
            contains_pii=False,
            contains_internal_only_logic=False,
            notes_internal_only="",
        )
        release = _release(["PROJ-1", "PROJ-2"])
        with pytest.raises(ValueError, match="duplicate publication_key"):
            export_for_channel(
                ConsumerChannel.WEBSITE_PUBLIC,
                projections=[p1, p2],
                rules=[_rule()],
                releases=[release],
                blockers=[],
                activations=[_activation()],
            )
