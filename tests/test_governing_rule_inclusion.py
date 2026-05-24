"""Phase 1B.4 — governing-rule inclusion contract.

A ChannelProjectionRecord MUST only cite related_rule_ids that are
explicitly governed by the linked release.  Both
``validate_release_integrity`` and ``export_for_channel`` reject a
projection citing a rule outside the release's related_rule_ids.
"""

from __future__ import annotations

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
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.release_exporter import export_for_channel
from hfla_control_room.validation import validate_release_integrity


def _rule(rule_id: str = "RULE-001") -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
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


def _projection(rule_ids: list[str]) -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id="PROJ-001",
        publication_key="website.pricing.disclosure",
        related_rule_ids=rule_ids,
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="public-safe",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _release(rule_ids: list[str]) -> ReleaseRecord:
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
        related_rule_ids=rule_ids,
        related_projection_ids=["PROJ-001"],
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


class TestGoverningRuleInclusion:
    def test_validate_release_integrity_rejects_unincluded_governing_rule(self):
        # Projection cites RULE-001 + RULE-002, but release only governs RULE-001.
        rules = [_rule("RULE-001"), _rule("RULE-002")]
        projection = _projection(["RULE-001", "RULE-002"])
        release = _release(["RULE-001"])
        errs = validate_release_integrity([release], rules, [projection], [])
        assert any("RULE-002" in e for e in errs)

    def test_export_for_channel_skips_projection_outside_release_rule_set(self):
        rules = [_rule("RULE-001"), _rule("RULE-002")]
        projection = _projection(["RULE-001", "RULE-002"])
        release = _release(["RULE-001"])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[projection],
            rules=rules,
            releases=[release],
            blockers=[],
            activations=[_activation()],
        )
        assert exported == []
