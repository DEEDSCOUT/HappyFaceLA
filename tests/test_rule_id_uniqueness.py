"""
Tests for rule ID uniqueness enforcement.

RuleRegister must reject duplicate rule IDs across all seed files.
"""

from pathlib import Path

import pytest

from hfla_control_room.constants import RuleStatus
from hfla_control_room.models import RuleRegister, RuleRow
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _make_draft_rule(rule_id: str) -> RuleRow:
    """Helper to create a minimal valid DRAFT rule."""
    return RuleRow(
        rule_id=rule_id,
        rule_category="TEST_CATEGORY",
        rule_title=f"Test rule {rule_id}",
        status=RuleStatus.DRAFT,
        draft_recommendation="CEO_INPUT_REQUIRED — placeholder.",
        ceo_decision="",
        final_effective_rule="",
        release_version="",
        effective_date="",
        policy_version="",
        export_channels=[],
        blockers=["CEO_INPUT_REQUIRED"],
        internal_notes="Test placeholder.",
        ceo_notes="",
        source_evidence_ref="",
    )


class TestRuleIdUniqueness:
    def test_unique_rule_ids_accepted(self):
        """RuleRegister accepts a list of rules with distinct IDs."""
        rules = [_make_draft_rule(f"RULE-TEST-{i:03d}") for i in range(1, 6)]
        register = RuleRegister(rules=rules)
        assert len(register.rules) == 5

    def test_duplicate_rule_id_rejected(self):
        """RuleRegister raises ValidationError when two rules share the same ID."""
        from pydantic import ValidationError
        rules = [
            _make_draft_rule("RULE-DUP-001"),
            _make_draft_rule("RULE-DUP-002"),
            _make_draft_rule("RULE-DUP-001"),  # duplicate
        ]
        with pytest.raises(ValidationError, match="Duplicate rule IDs"):
            RuleRegister(rules=rules)

    def test_seed_rules_have_unique_ids(self):
        """All loaded seed rules across all seed files must have unique rule IDs."""
        spec = load_full_spec(CONFIG_DIR)
        ids = [r.rule_id for r in spec.seed_rules]
        seen = set()
        duplicates = []
        for rid in ids:
            if rid in seen:
                duplicates.append(rid)
            seen.add(rid)
        assert not duplicates, f"Duplicate rule IDs found in seed data: {duplicates}"

    def test_empty_rule_list_accepted(self):
        """RuleRegister accepts an empty rule list."""
        register = RuleRegister(rules=[])
        assert register.rules == []

    def test_single_rule_accepted(self):
        """RuleRegister accepts a single-rule list."""
        rules = [_make_draft_rule("RULE-SINGLE-001")]
        register = RuleRegister(rules=rules)
        assert len(register.rules) == 1
