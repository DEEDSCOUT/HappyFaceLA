"""Phase 1B.2 \u2014 spec_fingerprint coverage tests.

The plan_metadata.spec_fingerprint must hash the canonical JSON of the full
spec (rules + evidence + blockers + projections + workbook + rule_schema +
validation_lists + drive structure) plus the plan body and schema version.

Any mutation to any of those inputs must flip the fingerprint.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.plan_builder import build_plan
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _fp(spec):
    return build_plan(spec)["plan_metadata"]["spec_fingerprint"]


@pytest.fixture()
def base_spec():
    return load_full_spec(CONFIG_DIR)


class TestFingerprintCoverage:
    def test_baseline_deterministic(self, base_spec):
        spec2 = load_full_spec(CONFIG_DIR)
        assert _fp(base_spec) == _fp(spec2)

    def test_mutating_rule_text_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.seed_rules[0].draft_recommendation += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_evidence_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.evidence_records[0].verified_fact += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_blocker_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.blocker_records[0].decision_required += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_projection_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.channel_projection_records[0].draft_channel_text += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_workbook_tab_purpose_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.governance_workbook.tabs[0].purpose += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_rule_schema_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        # Mutate the first field's description in the rule schema
        first_field = base_spec.rule_schema.fields[0]
        first_field.description = (first_field.description or "") + " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_release_record_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.release_records[0].release_notes += " [mutated]"
        assert _fp(base_spec) != original

    def test_mutating_column_mapping_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.column_mappings[0].column_header = (
            base_spec.column_mappings[0].column_header + " (mutated)"
        )
        assert _fp(base_spec) != original

    def test_mutating_validation_list_value_flips_fingerprint(self, base_spec):
        original = _fp(base_spec)
        base_spec.validation_lists.lists[0].values.append("MUTATED_SENTINEL")
        assert _fp(base_spec) != original

    def test_operation_count_stable_across_text_mutations(self, base_spec):
        # Mutating text must not add or remove operations.
        plan1 = build_plan(base_spec)
        base_spec.seed_rules[0].draft_recommendation += " [mutated]"
        plan2 = build_plan(base_spec)
        assert (
            plan1["plan_metadata"]["operation_count"]
            == plan2["plan_metadata"]["operation_count"]
        )
