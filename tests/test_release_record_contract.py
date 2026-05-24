"""Phase 1B.3 — ReleaseRecord model contract.

DRAFT records must not authorise channels; RELEASED records must carry the
mandatory CEO-decision evidence + approved channels + projection IDs.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from hfla_control_room.constants import (
    CEOReleaseDecision,
    ConsumerChannel,
    ImplementationStatus,
    QAStatus,
    ReleaseStatus,
)
from hfla_control_room.models import ReleaseRecord


def _valid_released(**overrides) -> ReleaseRecord:
    base = dict(
        release_id="REL-001",
        release_version="v1.0",
        release_title="Test release",
        status=ReleaseStatus.RELEASED,
        ceo_decision=CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
        ceo_decision_date="2026-06-01",
        effective_date="2026-06-15",
        policy_version="POL-2026-001",
        authorized_channels=[ConsumerChannel.WEBSITE_PUBLIC],
        related_rule_ids=["RULE-001"],
        related_projection_ids=["PROJ-001"],
        implementation_status=ImplementationStatus.IMPLEMENTED,
        qa_status=QAStatus.VERIFIED_PASS,
        qa_evidence="qa-evidence://signed-off",
    )
    base.update(overrides)
    return ReleaseRecord(**base)


class TestReleaseRecordContract:
    def test_draft_default_is_valid(self):
        r = ReleaseRecord(
            release_id="REL-D-001",
            release_version="",
            release_title="Draft",
            policy_version="",
        )
        assert r.status == ReleaseStatus.DRAFT
        assert r.ceo_decision == CEOReleaseDecision.PENDING_CEO_REVIEW
        assert r.authorized_channels == []

    def test_draft_cannot_authorize_channels(self):
        with pytest.raises(ValidationError):
            ReleaseRecord(
                release_id="REL-D-002",
                release_version="",
                release_title="Draft",
                status=ReleaseStatus.DRAFT,
                policy_version="",
                authorized_channels=[ConsumerChannel.WEBSITE_PUBLIC],
            )

    def test_released_happy_path(self):
        r = _valid_released()
        assert r.status == ReleaseStatus.RELEASED

    def test_released_requires_release_version(self):
        with pytest.raises(ValidationError):
            _valid_released(release_version="")

    def test_released_requires_ceo_decision_date(self):
        with pytest.raises(ValidationError):
            _valid_released(ceo_decision_date="")

    def test_released_requires_effective_date(self):
        with pytest.raises(ValidationError):
            _valid_released(effective_date="")

    def test_released_requires_policy_version(self):
        with pytest.raises(ValidationError):
            _valid_released(policy_version="")

    def test_released_requires_authorized_channels(self):
        with pytest.raises(ValidationError):
            _valid_released(authorized_channels=[])

    def test_released_requires_related_projection_ids(self):
        with pytest.raises(ValidationError):
            _valid_released(related_projection_ids=[])

    def test_released_rejects_pending_decision(self):
        with pytest.raises(ValidationError):
            _valid_released(ceo_decision=CEOReleaseDecision.PENDING_CEO_REVIEW)

    def test_released_rejects_deferred_decision(self):
        with pytest.raises(ValidationError):
            _valid_released(
                ceo_decision=CEOReleaseDecision.DEFERRED_NEED_MORE_EVIDENCE
            )
