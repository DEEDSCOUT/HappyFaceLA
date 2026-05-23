"""
Tests for the data-to-sheet mapping contract (Phase 1B.1 closure).

Mapping contract:
  - Rule records          -> 03_RULE_REGISTER_MASTER       (single source of truth)
  - Source evidence       -> 11_SOURCE_EVIDENCE            (single source of truth)
  - Blockers              -> 02_OPEN_BLOCKERS              (DERIVED view)
  - Active approved rules -> 04_ACTIVE_RULES_EXPORT        (DERIVED view)
  - Public pricing        -> 05_PUBLIC_PRICING_PACKAGES    (DERIVED view)
  - AI response matrix    -> 10_AI_CUSTOMER_RESPONSE_MATRIX (DERIVED view)

Plan operations must encode this mapping in a controlled vocabulary, and every
``target_tab`` / ``source_tab`` reference must resolve to a known governance
tab title.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.constants import GOVERNANCE_DESTINATION_TABS
from hfla_control_room.plan_builder import (
    PLAN_OPERATION_TYPES,
    build_plan,
    validate_plan_destination_tabs,
)
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _ops(plan, op_name):
    return [o for o in plan["operations"] if o["op"] == op_name]


@pytest.fixture(scope="module")
def plan():
    return build_plan(load_full_spec(CONFIG_DIR))


class TestMappingContract:
    def test_rule_register_population_targets_correct_tab(self, plan):
        ops = _ops(plan, "POPULATE_RULE_REGISTER")
        assert len(ops) == 1, "Exactly one POPULATE_RULE_REGISTER op expected."
        assert ops[0]["target_tab"] == "03_RULE_REGISTER_MASTER"
        assert ops[0]["is_derived_view"] is False

    def test_rule_register_population_record_count_matches_seed_rules(self, plan):
        spec = load_full_spec(CONFIG_DIR)
        op = _ops(plan, "POPULATE_RULE_REGISTER")[0]
        assert op["record_count"] == len(spec.seed_rules)
        assert op["rule_ids"] == sorted(r.rule_id for r in spec.seed_rules)

    def test_source_evidence_population_targets_correct_tab(self, plan):
        ops = _ops(plan, "POPULATE_SOURCE_EVIDENCE")
        assert len(ops) == 1
        assert ops[0]["target_tab"] == "11_SOURCE_EVIDENCE"
        assert ops[0]["is_derived_view"] is False

    def test_source_evidence_population_record_count_matches_evidence(self, plan):
        spec = load_full_spec(CONFIG_DIR)
        op = _ops(plan, "POPULATE_SOURCE_EVIDENCE")[0]
        assert op["record_count"] == len(spec.evidence_records)
        assert op["evidence_ids"] == sorted(e.evidence_id for e in spec.evidence_records)

    def test_open_blockers_is_a_derived_view_of_rule_register(self, plan):
        ops = _ops(plan, "DERIVE_OPEN_BLOCKERS")
        assert len(ops) == 1
        assert ops[0]["target_tab"] == "02_OPEN_BLOCKERS"
        assert ops[0]["source_tab"] == "03_RULE_REGISTER_MASTER"
        assert ops[0]["is_derived_view"] is True

    def test_active_rules_export_is_a_derived_view(self, plan):
        ops = _ops(plan, "DERIVE_ACTIVE_RULES_EXPORT")
        assert len(ops) == 1
        assert ops[0]["target_tab"] == "04_ACTIVE_RULES_EXPORT"
        assert ops[0]["source_tab"] == "03_RULE_REGISTER_MASTER"
        assert ops[0]["is_derived_view"] is True

    def test_public_pricing_is_a_derived_view(self, plan):
        ops = _ops(plan, "DERIVE_PUBLIC_PRICING_PACKAGES")
        assert len(ops) == 1
        assert ops[0]["target_tab"] == "05_PUBLIC_PRICING_PACKAGES"
        assert ops[0]["source_tab"] == "03_RULE_REGISTER_MASTER"
        assert ops[0]["is_derived_view"] is True

    def test_ai_response_matrix_is_a_derived_view(self, plan):
        ops = _ops(plan, "DERIVE_AI_RESPONSE_MATRIX")
        assert len(ops) == 1
        assert ops[0]["target_tab"] == "10_AI_CUSTOMER_RESPONSE_MATRIX"
        assert ops[0]["source_tab"] == "03_RULE_REGISTER_MASTER"
        assert ops[0]["is_derived_view"] is True

    def test_all_target_and_source_tabs_are_in_controlled_vocabulary(self, plan):
        errors = validate_plan_destination_tabs(plan)
        assert errors == [], f"Plan references unknown governance tabs: {errors}"

    def test_validator_rejects_unknown_target_tab(self):
        bad_plan = {
            "operations": [
                {
                    "op": "POPULATE_RULE_REGISTER",
                    "name": "Governance Workbook",
                    "target_tab": "99_BOGUS_TAB",
                    "is_derived_view": False,
                    "live_action": False,
                }
            ]
        }
        errors = validate_plan_destination_tabs(bad_plan)
        assert len(errors) == 1
        assert "99_BOGUS_TAB" in errors[0]

    def test_no_derive_op_duplicates_a_populate_op_target(self, plan):
        """DERIVE_* ops must not target the same tab as a POPULATE_* op
        (single source of truth — derived views cannot overwrite raw inputs)."""
        populate_targets = {
            o["target_tab"]
            for o in plan["operations"]
            if o["op"].startswith("POPULATE_")
        }
        derive_targets = {
            o["target_tab"]
            for o in plan["operations"]
            if o["op"].startswith("DERIVE_")
        }
        overlap = populate_targets & derive_targets
        assert overlap == set(), (
            f"Derived views must not overwrite populated tabs; overlap: {overlap}"
        )

    def test_plan_operation_types_are_all_in_controlled_vocabulary(self, plan):
        for op in plan["operations"]:
            assert op["op"] in PLAN_OPERATION_TYPES, (
                f"Unknown plan operation type '{op['op']}'."
            )

    def test_governance_destination_tabs_includes_expected_anchors(self):
        for required in (
            "02_OPEN_BLOCKERS",
            "03_RULE_REGISTER_MASTER",
            "04_ACTIVE_RULES_EXPORT",
            "05_PUBLIC_PRICING_PACKAGES",
            "10_AI_CUSTOMER_RESPONSE_MATRIX",
            "11_SOURCE_EVIDENCE",
        ):
            assert required in GOVERNANCE_DESTINATION_TABS
