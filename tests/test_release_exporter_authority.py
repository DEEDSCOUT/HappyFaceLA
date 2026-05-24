"""Phase 1B.3 — release_exporter authority gates.

Complementary to ``tests/test_release_gate.py``.  Asserts the structural
authority contract: only RELEASED ReleaseRecords with the requested channel
in ``authorized_channels`` AND the projection in ``related_projection_ids``
may authorise a channel export.
"""

from __future__ import annotations

import pytest

from hfla_control_room.constants import (
    CEOReleaseDecision,
    ChannelVisibility,
    ConsumerChannel,
    ImplementationStatus,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QAStatus,
    ReleaseStatus,
    RuleStatus,
)
from hfla_control_room.models import (
    ChannelProjectionRecord,
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


def _projection() -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id="PROJ-001",
        related_rule_ids=["RULE-001"],
        channel=ConsumerChannel.WEBSITE_PUBLIC,
        content_type="POLICY_STATEMENT",
        draft_channel_text="draft",
        approved_channel_text="public-safe text",
        release_status=ProjectionReleaseStatus.RELEASED,
        policy_version="POL-1",
        effective_date="2026-06-15",
    )


def _release(**overrides) -> ReleaseRecord:
    base = dict(
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
        related_projection_ids=["PROJ-001"],
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
    )
    base.update(overrides)
    return ReleaseRecord(**base)


class TestReleaseExporterAuthority:
    def test_restricted_channel_raises(self):
        with pytest.raises(ValueError):
            export_for_channel(
                ConsumerChannel.RESTRICTED_OPERATIONS_PII,
                projections=[],
                rules=[],
                releases=[],
                blockers=[],
            )

    def test_release_not_authorising_channel_rejected(self):
        release = _release(authorized_channels=[ConsumerChannel.GOOGLE_ADS_PUBLIC])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[_projection()],
            rules=[_rule()],
            releases=[release],
            blockers=[],
        )
        assert exported == []

    def test_release_not_listing_projection_rejected(self):
        release = _release(related_projection_ids=["PROJ-OTHER"])
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[_projection()],
            rules=[_rule()],
            releases=[release],
            blockers=[],
        )
        assert exported == []

    def test_no_releases_rejects_everything(self):
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[_projection()],
            rules=[_rule()],
            releases=[],
            blockers=[],
        )
        assert exported == []

    def test_happy_path_returns_one_export(self):
        exported = export_for_channel(
            ConsumerChannel.WEBSITE_PUBLIC,
            projections=[_projection()],
            rules=[_rule()],
            releases=[_release()],
            blockers=[],
        )
        assert len(exported) == 1
        out = exported[0]
        assert out.projection_id == "PROJ-001"
        assert out.channel == ConsumerChannel.WEBSITE_PUBLIC
        assert out.release_id == "REL-001"
        assert out.approved_channel_text == "public-safe text"
