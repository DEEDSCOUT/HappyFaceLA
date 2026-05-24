"""
Tests confirming PII fields are rejected from governance/channel-safe exports.

PII field names and internal-only field names must never appear in any rule text
destined for public or AI-facing channel exports.
"""


from pathlib import Path

from hfla_control_room.constants import INTERNAL_ONLY_FIELD_NAMES, PII_FIELD_NAMES, RuleStatus
from hfla_control_room.models import RuleRow
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_no_pii_in_export

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _make_rule_with_text(
    rule_id: str,
    final_rule: str = "",
    draft: str = "",
    title: str = "Test Rule",
    status: RuleStatus = RuleStatus.DRAFT,
) -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
        rule_category="TEST",
        rule_title=title,
        status=status,
        draft_recommendation=draft or "CEO_INPUT_REQUIRED — placeholder.",
        ceo_decision="",
        final_effective_rule=final_rule,
        release_version="",
        effective_date="",
        policy_version="",
        blockers=["CEO_INPUT_REQUIRED"],
        internal_notes="",
        ceo_notes="",
        source_evidence_ref="",
    )


class TestNoPIIInGovernanceExport:
    def test_pii_field_names_constant_is_non_empty(self):
        """PII_FIELD_NAMES must be a non-empty frozenset."""
        assert isinstance(PII_FIELD_NAMES, frozenset)
        assert len(PII_FIELD_NAMES) > 0

    def test_internal_only_field_names_constant_is_non_empty(self):
        """INTERNAL_ONLY_FIELD_NAMES must be a non-empty frozenset."""
        assert isinstance(INTERNAL_ONLY_FIELD_NAMES, frozenset)
        assert len(INTERNAL_ONLY_FIELD_NAMES) > 0

    def test_clean_rule_has_no_pii_violations(self):
        """A rule with clean text produces no PII violations."""
        rule = _make_rule_with_text(
            "RULE-CLEAN-001",
            final_rule="Entertainment service packages are priced as listed.",
            draft="CEO_INPUT_REQUIRED — placeholder.",
            title="Standard Pricing Disclosure",
        )
        violations = validate_no_pii_in_export([rule])
        assert violations == []

    def test_rule_with_customer_email_detected(self):
        """A rule referencing 'customer_email' in text triggers a PII violation."""
        rule = _make_rule_with_text(
            "RULE-PII-001",
            final_rule="Contact customer_email for booking confirmation.",
        )
        violations = validate_no_pii_in_export([rule])
        assert any("customer_email" in v for v in violations)

    def test_rule_with_customer_name_detected(self):
        """A rule referencing 'customer_name' in text triggers a PII violation."""
        rule = _make_rule_with_text(
            "RULE-PII-002",
            draft="Rule applies to customer_name on file.",
        )
        violations = validate_no_pii_in_export([rule])
        assert any("customer_name" in v for v in violations)

    def test_rule_with_internal_cost_detected(self):
        """A rule referencing an internal-only field name triggers a violation."""
        # Use a known internal-only field from INTERNAL_ONLY_FIELD_NAMES
        # We look for one that's safe to reference in test text
        internal_field = next(iter(INTERNAL_ONLY_FIELD_NAMES))
        rule = _make_rule_with_text(
            "RULE-INTERNAL-001",
            draft=f"This rule references {internal_field} for calculation.",
        )
        violations = validate_no_pii_in_export([rule])
        assert any(internal_field in v for v in violations)

    def test_all_pii_fields_in_title_detected(self):
        """PII field name in rule title is detected."""
        rule = _make_rule_with_text(
            "RULE-PII-003",
            title="Policy for customer_email handling",
        )
        violations = validate_no_pii_in_export([rule])
        assert len(violations) > 0

    def test_seed_rules_have_no_pii_in_text(self):
        """Phase 1 seed rules must not reference PII field names in exportable text."""
        spec = load_full_spec(CONFIG_DIR)
        violations = validate_no_pii_in_export(spec.seed_rules)
        assert violations == [], (
            "PII or internal field references found in seed rules:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )

    def test_multiple_rules_all_flagged(self):
        """validate_no_pii_in_export reports violations for every offending rule."""
        rules = [
            _make_rule_with_text("RULE-P-001", final_rule="See customer_email for details."),
            _make_rule_with_text("RULE-P-002", final_rule="Contact customer_phone."),
        ]
        violations = validate_no_pii_in_export(rules)
        # Both rules must be flagged
        assert any("RULE-P-001" in v for v in violations)
        assert any("RULE-P-002" in v for v in violations)
