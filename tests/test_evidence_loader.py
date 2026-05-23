"""
Tests for source evidence record loading and integrity validation.

Verifies:
- Evidence records are loaded from source_evidence.yaml.
- Evidence IDs are unique.
- Duplicate evidence IDs are rejected by EvidenceRegister.
- Broken rule-ID linkages are caught by validate_evidence_integrity.
- All Phase 1 seed evidence records are DRAFT status.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.constants import EvidenceStatus
from hfla_control_room.models import EvidenceRecord, EvidenceRegister
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_evidence_integrity

CONFIG_DIR = Path(__file__).parent.parent / "config"


class TestEvidenceLoader:
    def test_evidence_records_loaded(self):
        """Evidence records must be loaded from source_evidence.yaml."""
        spec = load_full_spec(CONFIG_DIR)
        assert isinstance(spec.evidence_records, list), (
            "evidence_records must be a list on FullConfigSpec"
        )

    def test_evidence_ids_unique(self):
        """All loaded evidence records must have unique IDs."""
        spec = load_full_spec(CONFIG_DIR)
        ids = [ev.evidence_id for ev in spec.evidence_records]
        assert len(ids) == len(set(ids)), (
            f"Duplicate evidence IDs found: {[i for i in ids if ids.count(i) > 1]}"
        )

    def test_duplicate_evidence_id_rejected(self):
        """EvidenceRegister must raise ValueError when duplicate IDs are present."""
        ev1 = EvidenceRecord(evidence_id="EVD-DUP-001")
        ev2 = EvidenceRecord(evidence_id="EVD-DUP-001")
        with pytest.raises(Exception, match="Duplicate"):
            EvidenceRegister(records=[ev1, ev2])

    def test_broken_rule_id_linkage_flagged(self):
        """validate_evidence_integrity must flag evidence referencing an unknown rule."""
        from hfla_control_room.constants import RuleStatus
        from hfla_control_room.models import RuleRow

        seed_rules = [
            RuleRow(
                rule_id="RULE-FACT-001",
                rule_category="TEST",
                rule_title="Known rule",
                status=RuleStatus.DRAFT,
            )
        ]
        evidence = [EvidenceRecord(evidence_id="EVD-TEST-001", linked_rule_id="RULE-NONEXISTENT")]
        errors = validate_evidence_integrity(evidence, seed_rules)
        assert any("RULE-NONEXISTENT" in e for e in errors), (
            f"Expected error about RULE-NONEXISTENT, got: {errors}"
        )

    def test_evidence_linked_to_existing_rules(self):
        """All evidence records in the spec must link only to known seed rule IDs."""
        spec = load_full_spec(CONFIG_DIR)
        errors = validate_evidence_integrity(spec.evidence_records, spec.seed_rules)
        assert errors == [], (
            "Evidence-to-rule linkage errors found:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    def test_evidence_all_draft_in_phase_1(self):
        """All Phase 1 seed evidence records must be in DRAFT status."""
        spec = load_full_spec(CONFIG_DIR)
        non_draft = [
            ev.evidence_id
            for ev in spec.evidence_records
            if ev.status != EvidenceStatus.DRAFT
        ]
        assert non_draft == [], (
            f"Phase 1 evidence records with non-DRAFT status: {non_draft}"
        )

    def test_evidence_record_missing_id_rejected(self):
        """EvidenceRecord with empty evidence_id must be rejected."""
        with pytest.raises(Exception, match="evidence_id"):
            EvidenceRecord(evidence_id="")

    def test_legacy_linked_rule_id_normalised(self):
        """linked_rule_id (legacy YAML field) must be normalised to related_rule_ids."""
        ev = EvidenceRecord(evidence_id="EVD-LEGACY-001", linked_rule_id="RULE-001")
        assert "RULE-001" in ev.related_rule_ids, (
            "Legacy linked_rule_id must be promoted to related_rule_ids"
        )

    def test_legacy_source_url_normalised(self):
        """source_url (legacy YAML field) must be mapped to source_locator."""
        ev = EvidenceRecord(evidence_id="EVD-LEGACY-002", source_url="https://example.com")
        assert ev.source_locator == "https://example.com", (
            "Legacy source_url must be promoted to source_locator"
        )
