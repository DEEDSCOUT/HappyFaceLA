"""Phase 1B.4 — ChannelReleaseActivationRecord contract."""

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
    ChannelReleaseActivationRecord,
    ChannelReleaseActivationRegister,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.release_exporter import export_for_channel
from hfla_control_room.validation import validate_channel_activation_integrity


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


def _projection() -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id="PROJ-001",
        publication_key="website.pricing.disclosure",
        related_rule_ids=["RULE-001"],
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="public-safe",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _release(rid: str = "REL-001", **overrides) -> ReleaseRecord:
    base = dict(
        release_id=rid,
        release_version="v1",
        release_title="t",
        status=ReleaseStatus.RELEASED,
        ceo_decision=CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
        ceo_decision_date="2026-06-01",
        effective_date="2026-06-15",
        policy_version="POL-1",
        authorized_channels=[ConsumerChannel.WEBSITE_PUBLIC],
        related_rule_ids=["RULE-001"],
        related_projection_ids=["PROJ-001"],
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
    )
    base.update(overrides)
    return ReleaseRecord(**base)


def _activation(**overrides) -> ChannelReleaseActivationRecord:
    base = dict(
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
    base.update(overrides)
    return ChannelReleaseActivationRecord(**base)


class TestActivationModelContract:
    def test_full_channel_snapshot_is_the_only_supported_mode(self):
        # The enum has exactly one member, enforcing FULL_CHANNEL_SNAPSHOT.
        assert list(SnapshotMode) == [SnapshotMode.FULL_CHANNEL_SNAPSHOT]

    def test_active_requires_verified_pass(self):
        with pytest.raises(ValidationError):
            _activation(qa_status=QAStatus.NOT_VERIFIED)

    def test_active_requires_qa_evidence(self):
        with pytest.raises(ValidationError):
            _activation(qa_evidence="")

    def test_active_requires_effective_date(self):
        with pytest.raises(ValidationError):
            _activation(effective_date="")

    def test_draft_cannot_have_verified_pass(self):
        with pytest.raises(ValidationError):
            _activation(
                activation_status=ActivationStatus.DRAFT,
                qa_status=QAStatus.VERIFIED_PASS,
            )

    def test_restricted_channel_rejected(self):
        with pytest.raises(ValidationError):
            _activation(
                channel=ConsumerChannel.RESTRICTED_OPERATIONS_PII,
                activation_status=ActivationStatus.DRAFT,
                qa_status=QAStatus.NOT_VERIFIED,
                qa_evidence="",
                effective_date="",
            )

    def test_no_self_supersession(self):
        with pytest.raises(ValidationError):
            ChannelReleaseActivationRegister(
                records=[_activation(supersedes_activation_id="ACT-001")]
            )


class TestActivationRegisterContract:
    def test_unique_activation_ids(self):
        a1 = _activation()
        a2 = _activation(release_id="REL-001")
        with pytest.raises(ValidationError):
            ChannelReleaseActivationRegister(records=[a1, a2])

    def test_at_most_one_active_per_channel(self):
        a1 = _activation(activation_id="ACT-001")
        a2 = _activation(activation_id="ACT-002")
        with pytest.raises(ValidationError):
            ChannelReleaseActivationRegister(records=[a1, a2])

    def test_supersedes_fk_must_exist(self):
        a1 = _activation(
            activation_id="ACT-002", supersedes_activation_id="ACT-MISSING"
        )
        with pytest.raises(ValidationError):
            ChannelReleaseActivationRegister(records=[a1])


class TestActivationIntegrityCrossRef:
    def test_active_requires_released_release(self):
        rel = _release(
            status=ReleaseStatus.DRAFT,
            ceo_decision=CEOReleaseDecision.PENDING_CEO_REVIEW,
            authorized_channels=[],
        )
        act = _activation()
        errs = validate_channel_activation_integrity([act], [rel], [_projection()])
        assert any("not RELEASED" in e or "status" in e.lower() for e in errs)

    def test_active_requires_release_authorising_channel(self):
        rel = _release(authorized_channels=[ConsumerChannel.GOOGLE_ADS_PUBLIC])
        act = _activation()
        errs = validate_channel_activation_integrity([act], [rel], [_projection()])
        assert any("authorized_channels" in e or "authorise" in e.lower() for e in errs)

    def test_superseded_activation_does_not_export(self):
        # SUPERSEDED is not ACTIVE; exporter returns [].
        rel = _release()
        act = ChannelReleaseActivationRecord(
            activation_id="ACT-OLD",
            release_id="REL-001",
            channel=ConsumerChannel.WEBSITE_PUBLIC,
            activation_status=ActivationStatus.SUPERSEDED,
            supersedes_activation_id="",
            effective_date="2026-05-01",
            implementation_status=ImplementationStatus.IMPLEMENTED,
            qa_status=QAStatus.VERIFIED_PASS,
            qa_evidence="qa-evidence://prior",
            snapshot_mode=SnapshotMode.FULL_CHANNEL_SNAPSHOT,
            notes_internal_only="",
        )
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[_projection()],
            rules=[_rule()],
            releases=[rel],
            blockers=[],
            activations=[act],
        )
        assert exported == []
