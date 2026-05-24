"""Phase 1B.2 \u2014 ChannelProjectionRecord contract & integrity tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from hfla_control_room.constants import ConsumerChannel, ProjectionReleaseStatus
from hfla_control_room.models import (
    ChannelProjectionRecord,
    ChannelProjectionRegister,
)
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_channel_projection_integrity

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _make_projection(
    projection_id: str = "PROJ-T-001",
    *,
    channel: ConsumerChannel = ConsumerChannel.WEBSITE_PUBLIC,
    release_status: ProjectionReleaseStatus = ProjectionReleaseStatus.DRAFT,
    approved_channel_text: str = "",
    contains_pii: bool = False,
    policy_version: str = "",
    effective_date: str = "",
    related_rule_ids: list[str] | None = None,
    source_evidence_ids: list[str] | None = None,
    publication_key: str = "website.test.key",
) -> ChannelProjectionRecord:
    return ChannelProjectionRecord(
        projection_id=projection_id,
        publication_key=publication_key,
        channel=channel,
        content_type="website_copy",
        draft_channel_text="draft text",
        approved_channel_text=approved_channel_text,
        release_status=release_status,
        contains_pii=contains_pii,
        policy_version=policy_version,
        effective_date=effective_date,
        related_rule_ids=related_rule_ids or [],
        source_evidence_ids=source_evidence_ids or [],
    )


class TestChannelProjectionContract:
    def test_empty_projection_id_rejected(self):
        with pytest.raises(ValidationError):
            _make_projection(projection_id="   ")

    def test_duplicate_ids_rejected_by_register(self):
        with pytest.raises(ValidationError):
            ChannelProjectionRegister(
                records=[_make_projection("PROJ-DUP"), _make_projection("PROJ-DUP")]
            )

    def test_public_with_pii_rejected_on_model(self):
        with pytest.raises(ValidationError):
            _make_projection(channel=ConsumerChannel.WEBSITE_PUBLIC, contains_pii=True)

    def test_released_without_text_rejected_on_model(self):
        with pytest.raises(ValidationError):
            _make_projection(
                release_status=ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
                approved_channel_text="",
            )

    def test_draft_with_approved_text_rejected_by_integrity(self):
        # Model accepts (DRAFT + text is "stale draft"), integrity check rejects.
        p = _make_projection(
            release_status=ProjectionReleaseStatus.DRAFT,
            approved_channel_text="leftover approved text",
        )
        errors = validate_channel_projection_integrity([p], seed_rules=[], evidence_records=[])
        assert any("DRAFT" in e for e in errors), errors

    def test_released_without_policy_version_rejected_by_integrity(self):
        p = _make_projection(
            release_status=ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
            approved_channel_text="approved",
            effective_date="2026-06-01",
        )
        errors = validate_channel_projection_integrity([p], seed_rules=[], evidence_records=[])
        assert any("policy_version" in e for e in errors), errors

    def test_released_without_effective_date_rejected_by_integrity(self):
        p = _make_projection(
            release_status=ProjectionReleaseStatus.RELEASED,
            approved_channel_text="approved",
            policy_version="POL-2026-001",
        )
        errors = validate_channel_projection_integrity([p], seed_rules=[], evidence_records=[])
        assert any("effective_date" in e for e in errors), errors

    def test_unknown_rule_link_rejected(self):
        p = _make_projection(related_rule_ids=["RULE-NOPE"])
        errors = validate_channel_projection_integrity([p], seed_rules=[], evidence_records=[])
        assert any("RULE-NOPE" in e for e in errors), errors

    def test_unknown_evidence_link_rejected(self):
        p = _make_projection(source_evidence_ids=["EVD-NOPE"])
        errors = validate_channel_projection_integrity([p], seed_rules=[], evidence_records=[])
        assert any("EVD-NOPE" in e for e in errors), errors

    def test_loader_picks_up_placeholder_projections(self):
        spec = load_full_spec(CONFIG_DIR)
        assert len(spec.channel_projection_records) == 3
        ids = {p.projection_id for p in spec.channel_projection_records}
        assert {"PROJ-DRAFT-001", "PROJ-DRAFT-002", "PROJ-DRAFT-003"} == ids
