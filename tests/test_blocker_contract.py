"""Phase 1B.2 \u2014 BlockerRecord contract & integrity tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from hfla_control_room.constants import (
    BlockerPriority,
    BlockerStatus,
    BlockerType,
    ConsumerChannel,
)
from hfla_control_room.models import BlockerRecord, BlockerRegister
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_blocker_integrity

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _make_blocker(
    blocker_id: str = "BLK-T-001",
    *,
    status: BlockerStatus = BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
    priority: BlockerPriority = BlockerPriority.HIGH,
    blocks_phase_1c: bool = True,
    resolution_evidence: str = "",
    related_rule_ids: list[str] | None = None,
    related_evidence_ids: list[str] | None = None,
) -> BlockerRecord:
    return BlockerRecord(
        blocker_id=blocker_id,
        category=BlockerType.CEO_INPUT_REQUIRED,
        decision_required="Decide X.",
        why_it_matters="Because Y.",
        risk_if_missing="Z risk.",
        priority=priority,
        status=status,
        related_rule_ids=related_rule_ids or [],
        related_evidence_ids=related_evidence_ids or [],
        blocked_channels=[ConsumerChannel.WEBSITE_PUBLIC],
        blocks_live_provisioning=True,
        blocks_phase_1c_content_loading=blocks_phase_1c,
        resolution_evidence=resolution_evidence,
    )


class TestBlockerContract:
    def test_resolved_without_evidence_rejected(self):
        with pytest.raises(ValidationError):
            _make_blocker(status=BlockerStatus.RESOLVED, resolution_evidence="")

    def test_resolved_with_evidence_accepted(self):
        b = _make_blocker(status=BlockerStatus.RESOLVED, resolution_evidence="See EVD-001.")
        assert b.status == BlockerStatus.RESOLVED

    def test_empty_blocker_id_rejected(self):
        with pytest.raises(ValidationError):
            _make_blocker(blocker_id="   ")

    def test_duplicate_blocker_ids_rejected_by_register(self):
        with pytest.raises(ValidationError):
            BlockerRegister(records=[_make_blocker("BLK-DUP-1"), _make_blocker("BLK-DUP-1")])

    def test_critical_open_must_block_phase_1c(self):
        b = _make_blocker(
            "BLK-CRIT-1",
            priority=BlockerPriority.CRITICAL,
            status=BlockerStatus.OPEN_COMPLIANCE_REVIEW_REQUIRED,
            blocks_phase_1c=False,
        )
        errors = validate_blocker_integrity([b], seed_rules=[], evidence_records=[])
        assert any("Phase 1C" in e or "phase_1c" in e for e in errors), errors

    def test_unknown_rule_link_rejected(self):
        b = _make_blocker("BLK-LINK-1", related_rule_ids=["RULE-DOES-NOT-EXIST"])
        errors = validate_blocker_integrity([b], seed_rules=[], evidence_records=[])
        assert any("RULE-DOES-NOT-EXIST" in e for e in errors), errors

    def test_unknown_evidence_link_rejected(self):
        b = _make_blocker("BLK-LINK-2", related_evidence_ids=["EVD-MISSING"])
        errors = validate_blocker_integrity([b], seed_rules=[], evidence_records=[])
        assert any("EVD-MISSING" in e for e in errors), errors

    def test_loader_picks_up_placeholder_blockers(self):
        spec = load_full_spec(CONFIG_DIR)
        assert len(spec.blocker_records) == 3
        ids = {b.blocker_id for b in spec.blocker_records}
        assert {"BLK-DRAFT-001", "BLK-DRAFT-002", "BLK-DRAFT-003"} == ids
