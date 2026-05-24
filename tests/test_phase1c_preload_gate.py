"""Phase 1B.5 — Phase 1C content-loading pre-load gate.

validate_phase1c_preload_readiness must:

- Block when any structural blocker (blocks_phase_1c_content_loading=True) is OPEN.
- NOT block for ordinary open CEO/business-decision blockers
  (blocks_phase_1c_content_loading=False), including per-channel publication
  blockers.  Those remain recordable in the draft workbook.
- Block when a CEO-approved rule exists in the dataset.
- Block when a RELEASED release exists in the dataset.
- Block when an ACTIVE channel activation exists in the dataset.
- Block when a projection with APPROVED_FOR_RELEASE/RELEASED status carries
  non-empty approved_channel_text.
- Clear for the current DRAFT-only seed dataset.

All five permitted output channels are proven (parametrized) to have their
ordinary channel-level publication blockers NOT interfere with the Phase 1C
dataset-loading gate.
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
    FullConfigSpec,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.validation import (
    validate_no_phase_1c_loading_blockers,
    validate_phase1c_preload_readiness,
)

EXPORTABLE_CHANNELS = [
    ConsumerChannel.WEBSITE_PUBLIC,
    ConsumerChannel.GOOGLE_ADS_PUBLIC,
    ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC,
    ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT,
    ConsumerChannel.QUOTE_OPERATOR_INTERNAL,
]


# ---------------------------------------------------------------------------
# Minimal spec builder
# ---------------------------------------------------------------------------


def _spec(
    *,
    blocker_records: list[BlockerRecord] | None = None,
    seed_rules: list[RuleRow] | None = None,
    release_records: list[ReleaseRecord] | None = None,
    channel_release_activations: list[ChannelReleaseActivationRecord] | None = None,
    channel_projection_records: list[ChannelProjectionRecord] | None = None,
) -> FullConfigSpec:
    """Build a minimal FullConfigSpec touching only the Phase-1C gate fields."""
    return FullConfigSpec.model_construct(
        blocker_records=blocker_records or [],
        seed_rules=seed_rules or [],
        release_records=release_records or [],
        channel_release_activations=channel_release_activations or [],
        channel_projection_records=channel_projection_records or [],
    )


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _structural_blocker() -> BlockerRecord:
    """OPEN blocker with blocks_phase_1c_content_loading=True — gates loading."""
    return BlockerRecord(
        blocker_id="BLK-STRUCT-001",
        category=BlockerType.DATA_MISSING,
        decision_required="Source evidence must be signed off before loading.",
        why_it_matters="Loaded content depends on unverified source.",
        risk_if_missing="Phase 1C content could be loaded without signed-off sources.",
        priority=BlockerPriority.CRITICAL,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_EVIDENCE_REQUIRED,
        related_rule_ids=[],
        related_evidence_ids=[],
        blocked_channels=[],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=True,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


def _ordinary_open_blocker() -> BlockerRecord:
    """OPEN blocker with blocks_phase_1c_content_loading=False.

    Represents a CEO / business-decision item that must remain recordable
    in the draft workbook without blocking dataset loading.
    """
    return BlockerRecord(
        blocker_id="BLK-ORD-001",
        category=BlockerType.CEO_INPUT_REQUIRED,
        decision_required="CEO must decide on preferred pricing tier.",
        why_it_matters="Pricing tier affects all published copy.",
        risk_if_missing="Wrong tier could be loaded.",
        priority=BlockerPriority.HIGH,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
        related_rule_ids=[],
        related_evidence_ids=[],
        blocked_channels=[],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=False,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


def _channel_publication_blocker(channel: ConsumerChannel) -> BlockerRecord:
    """Per-channel publication blocker — blocks export but NOT loading."""
    return BlockerRecord(
        blocker_id=f"BLK-PUB-{channel.value}",
        category=BlockerType.COMPLIANCE_REVIEW_REQUIRED,
        decision_required="Channel copy requires compliance sign-off.",
        why_it_matters="Published content must be legally reviewed.",
        risk_if_missing="Potentially non-compliant copy could be published.",
        priority=BlockerPriority.HIGH,
        ceo_input_final_answer="",
        status=BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
        related_rule_ids=[],
        related_evidence_ids=[],
        blocked_channels=[channel],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=False,
        responsible_owner="CEO",
        resolution_evidence="",
        notes_internal_only="",
    )


def _resolved_structural_blocker() -> BlockerRecord:
    return BlockerRecord(
        blocker_id="BLK-STRUCT-RESOLVED",
        category=BlockerType.DATA_MISSING,
        decision_required="Evidence was required.",
        why_it_matters="Sources verified.",
        risk_if_missing="N/A",
        priority=BlockerPriority.CRITICAL,
        ceo_input_final_answer="Evidence reviewed and signed off.",
        status=BlockerStatus.RESOLVED,
        related_rule_ids=[],
        related_evidence_ids=[],
        blocked_channels=[],
        blocks_live_provisioning=False,
        blocks_phase_1c_content_loading=True,
        responsible_owner="CEO",
        resolution_evidence="evidence://signed-off",
        notes_internal_only="",
    )


def _draft_rule() -> RuleRow:
    return RuleRow(
        rule_id="RULE-DRAFT-001",
        rule_category="PUBLIC_PRICING",
        rule_title="Draft pricing rule",
        status=RuleStatus.DRAFT,
        ceo_decision="",
        final_effective_rule="",
        channel_visibility=ChannelVisibility.INTERNAL_ONLY,
        public_safe_review_status=PublicSafeReviewStatus.NOT_REVIEWED,
        contains_pii=False,
        contains_internal_only_logic=False,
    )


def _approved_rule() -> RuleRow:
    return RuleRow(
        rule_id="RULE-APPROVED-001",
        rule_category="PUBLIC_PRICING",
        rule_title="Approved pricing rule",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        ceo_decision="Approved as Recommended",
        final_effective_rule="Final rule text.",
        release_version="v1",
        effective_date="2026-06-15",
        policy_version="POL-1",
        channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        public_safe_review_status=PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE,
        contains_pii=False,
        contains_internal_only_logic=False,
    )


def _released_release() -> ReleaseRecord:
    return ReleaseRecord(
        release_id="REL-001",
        release_version="v1",
        release_title="Released",
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


def _draft_release() -> ReleaseRecord:
    return ReleaseRecord(
        release_id="REL-DRAFT-001",
        release_version="v1",
        release_title="Draft",
        status=ReleaseStatus.DRAFT,
        ceo_decision=CEOReleaseDecision.PENDING_CEO_REVIEW,
        ceo_decision_date="",
        effective_date="",
        policy_version="",
        authorized_channels=[],
        related_rule_ids=[],
        related_projection_ids=[],
        implementation_status=ImplementationStatus.NOT_STARTED,
        qa_status=QAStatus.NOT_VERIFIED,
        qa_evidence="",
    )


def _active_activation() -> ChannelReleaseActivationRecord:
    return ChannelReleaseActivationRecord(
        activation_id="ACT-ACTIVE-001",
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


def _draft_activation() -> ChannelReleaseActivationRecord:
    return ChannelReleaseActivationRecord(
        activation_id="ACT-DRAFT-001",
        release_id="REL-DRAFT-001",
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        activation_status=ActivationStatus.DRAFT,
        supersedes_activation_id="",
        effective_date="",
        implementation_status=ImplementationStatus.NOT_STARTED,
        qa_status=QAStatus.NOT_VERIFIED,
        qa_evidence="",
        snapshot_mode=SnapshotMode.FULL_CHANNEL_SNAPSHOT,
        notes_internal_only="",
    )


def _approved_projection() -> ChannelProjectionRecord:
    """Projection with APPROVED_FOR_RELEASE status and non-empty approved text."""
    return ChannelProjectionRecord(
        projection_id="PROJ-APPROVED-001",
        publication_key="website.pricing.test",
        related_rule_ids=["RULE-DRAFT-001"],
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="Approved text ready for publication.",
        release_status=ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _draft_projection() -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id="PROJ-DRAFT-001",
        publication_key="placeholder.website.pricing_disclosure",
        related_rule_ids=[],
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="",
        release_status=ProjectionReleaseStatus.DRAFT,
        policy_version="",
        effective_date="",
    )


# ---------------------------------------------------------------------------
# Section A — Blocker scope
# ---------------------------------------------------------------------------


class TestPhase1CGateBlockerScope:
    def test_structural_blocker_blocks_gate(self):
        spec = _spec(blocker_records=[_structural_blocker()])
        errs = validate_phase1c_preload_readiness(spec)
        assert any("BLK-STRUCT-001" in e for e in errs)

    def test_ordinary_open_blocker_does_not_block_gate(self):
        """CEO/business-decision blockers must not stop dataset loading."""
        spec = _spec(blocker_records=[_ordinary_open_blocker()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_resolved_structural_blocker_does_not_block_gate(self):
        spec = _spec(blocker_records=[_resolved_structural_blocker()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_validate_no_phase1c_loading_blockers_exposed_from_validation(self):
        """The gate function is now importable directly from validation."""
        blocking = validate_no_phase_1c_loading_blockers([_structural_blocker()])
        assert [b.blocker_id for b in blocking] == ["BLK-STRUCT-001"]

        not_blocking = validate_no_phase_1c_loading_blockers([_ordinary_open_blocker()])
        assert not_blocking == []

    @pytest.mark.parametrize("channel", EXPORTABLE_CHANNELS)
    def test_channel_publication_blocker_does_not_block_phase1c_gate(self, channel):
        """All five permitted output channels: per-channel publication blockers
        (blocked_channels=[channel], blocks_phase_1c_content_loading=False)
        must NOT block the Phase 1C pre-load gate.

        Channel-level publication blockers gate per-channel export, not
        dataset loading.  The two scopes are independent.
        """
        blocker = _channel_publication_blocker(channel)
        spec = _spec(blocker_records=[blocker])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == [], (
            f"Channel={channel.value}: publication blocker should not block "
            f"Phase 1C gate, but got errors: {errs}"
        )


# ---------------------------------------------------------------------------
# Section B — Content safety
# ---------------------------------------------------------------------------


class TestPhase1CGateContentSafety:
    def test_approved_rule_blocks_gate(self):
        spec = _spec(seed_rules=[_approved_rule()])
        errs = validate_phase1c_preload_readiness(spec)
        assert any("RULE-APPROVED-001" in e for e in errs)
        assert any("APPROVED_AS_RECOMMENDED" in e for e in errs)

    def test_draft_rule_passes_gate(self):
        spec = _spec(seed_rules=[_draft_rule()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_released_release_blocks_gate(self):
        spec = _spec(release_records=[_released_release()])
        errs = validate_phase1c_preload_readiness(spec)
        assert any("REL-001" in e for e in errs)
        assert any("RELEASED" in e for e in errs)

    def test_draft_release_passes_gate(self):
        spec = _spec(release_records=[_draft_release()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_active_activation_blocks_gate(self):
        spec = _spec(channel_release_activations=[_active_activation()])
        errs = validate_phase1c_preload_readiness(spec)
        assert any("ACT-ACTIVE-001" in e for e in errs)
        assert any("ACTIVE" in e for e in errs)

    def test_draft_activation_passes_gate(self):
        spec = _spec(channel_release_activations=[_draft_activation()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_approved_projection_with_text_blocks_gate(self):
        spec = _spec(channel_projection_records=[_approved_projection()])
        errs = validate_phase1c_preload_readiness(spec)
        assert any("PROJ-APPROVED-001" in e for e in errs)

    def test_draft_projection_with_empty_text_passes_gate(self):
        spec = _spec(channel_projection_records=[_draft_projection()])
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []

    def test_all_violations_are_reported(self):
        """All five violation types are reported independently (no early exit)."""
        spec = _spec(
            blocker_records=[_structural_blocker()],
            seed_rules=[_approved_rule()],
            release_records=[_released_release()],
            channel_release_activations=[_active_activation()],
            channel_projection_records=[_approved_projection()],
        )
        errs = validate_phase1c_preload_readiness(spec)
        assert len(errs) == 5

    def test_clean_draft_dataset_passes_gate(self):
        spec = _spec(
            blocker_records=[_ordinary_open_blocker()],
            seed_rules=[_draft_rule()],
            release_records=[_draft_release()],
            channel_release_activations=[_draft_activation()],
            channel_projection_records=[_draft_projection()],
        )
        errs = validate_phase1c_preload_readiness(spec)
        assert errs == []


# ---------------------------------------------------------------------------
# Section C — Real config integration
# ---------------------------------------------------------------------------


class TestPhase1CGateRealConfig:
    def test_current_seed_config_is_blocked_by_structural_placeholders(self):
        """The committed seed config is correctly BLOCKED by three structural
        placeholder blockers (BLK-DRAFT-001/002/003).

        Each placeholder has ``blocks_phase_1c_content_loading=True`` by
        design: Phase 1C content loading requires CEO, compliance, and
        evidence sign-offs that have not yet occurred.  The gate working
        correctly means it detects them and returns errors.

        Proves postcondition: structural blockers stop dataset loading.
        Ordinary open blockers with ``blocks_phase_1c_content_loading=False``
        would not appear here.
        """
        from pathlib import Path

        from hfla_control_room.spec_loader import load_full_spec

        spec = load_full_spec(Path("config"))
        errs = validate_phase1c_preload_readiness(spec)

        # Gate must be BLOCKED — the three structural placeholder blockers
        # are all OPEN and all assert blocks_phase_1c_content_loading=True.
        assert len(errs) == 3, (
            f"Expected exactly 3 structural-blocker errors, got {len(errs)}:\n"
            + "\n".join(errs)
        )
        blocker_ids_reported = {e.split("'")[1] for e in errs}
        assert blocker_ids_reported == {
            "BLK-DRAFT-001",
            "BLK-DRAFT-002",
            "BLK-DRAFT-003",
        }, f"Unexpected blocker IDs in gate errors: {blocker_ids_reported}"
