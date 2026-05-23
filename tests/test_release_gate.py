"""
Tests for the release export gate.

The release exporter must reject DRAFT rules and rules with missing required fields.
Only fully CEO-approved rules with all required fields populated may be exported.
"""


from pathlib import Path

from hfla_control_room.constants import RuleStatus
from hfla_control_room.models import RuleRow
from hfla_control_room.release_exporter import export_approved_rules
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_rule_for_export, validate_rules_batch

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _make_draft_rule(rule_id: str = "RULE-TEST-001") -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
        rule_category="TEST",
        rule_title="Test rule",
        status=RuleStatus.DRAFT,
        draft_recommendation="CEO_INPUT_REQUIRED — placeholder.",
        ceo_decision="",
        final_effective_rule="",
        release_version="",
        effective_date="",
        policy_version="",
        export_channels=[],
        blockers=["CEO_INPUT_REQUIRED"],
        internal_notes="",
        ceo_notes="",
        source_evidence_ref="",
    )


def _make_approved_rule(rule_id: str = "RULE-TEST-001") -> RuleRow:
    return RuleRow(
        rule_id=rule_id,
        rule_category="TEST",
        rule_title="Approved test rule",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        draft_recommendation="CEO_INPUT_REQUIRED — placeholder.",
        ceo_decision="Approved as recommended on 2026-05-23.",
        final_effective_rule="The approved effective rule text.",
        approved_export_text="The approved channel-safe export text for this rule.",
        release_version="v1.0.0",
        effective_date="2026-06-01",
        policy_version="POL-2026-001",
        export_channels=["website"],
        channel_visibility="CHANNEL_SAFE",
        public_safe_review_status="APPROVED_PUBLIC_SAFE",
        ai_response_review_status="NOT_REVIEWED",
        ads_claim_review_status="NOT_REVIEWED",
        blockers=[],
        internal_notes="",
        ceo_notes="",
        source_evidence_ref="",
    )


class TestReleaseGate:
    def test_draft_rule_fails_validation(self):
        """A DRAFT rule must produce validation errors."""
        rule = _make_draft_rule()
        errors = validate_rule_for_export(rule)
        assert len(errors) > 0

    def test_draft_rule_rejected_from_export(self):
        """export_approved_rules must return empty list for all-DRAFT input."""
        rules = [_make_draft_rule(f"RULE-TEST-{i:03d}") for i in range(1, 4)]
        approved = export_approved_rules(rules)
        assert approved == [], f"Expected empty export but got: {approved}"

    def test_approved_rule_passes_validation(self):
        """A fully approved rule must produce no validation errors."""
        rule = _make_approved_rule()
        errors = validate_rule_for_export(rule)
        assert errors == []

    def test_approved_rule_included_in_export(self):
        """export_approved_rules must include fully approved rules."""
        rules = [_make_approved_rule("RULE-APPROVED-001")]
        approved = export_approved_rules(rules)
        assert len(approved) == 1
        assert approved[0].rule_id == "RULE-APPROVED-001"

    def test_missing_ceo_decision_fails(self):
        """A rule with empty ceo_decision must fail validation."""
        rule = _make_approved_rule()
        rule.ceo_decision = ""
        errors = validate_rule_for_export(rule)
        assert any("CEO decision" in e for e in errors)

    def test_missing_final_rule_fails(self):
        """A rule with empty final_effective_rule must fail validation."""
        rule = _make_approved_rule()
        rule.final_effective_rule = ""
        errors = validate_rule_for_export(rule)
        assert any("Final Effective Rule" in e for e in errors)

    def test_missing_release_version_fails(self):
        """A rule with empty release_version must fail validation."""
        rule = _make_approved_rule()
        rule.release_version = ""
        errors = validate_rule_for_export(rule)
        assert any("release version" in e for e in errors)

    def test_missing_effective_date_fails(self):
        """A rule with empty effective_date must fail validation."""
        rule = _make_approved_rule()
        rule.effective_date = ""
        errors = validate_rule_for_export(rule)
        assert any("effective date" in e for e in errors)

    def test_missing_policy_version_fails(self):
        """A rule with empty policy_version must fail validation."""
        rule = _make_approved_rule()
        rule.policy_version = ""
        errors = validate_rule_for_export(rule)
        assert any("policy version" in e for e in errors)

    def test_batch_validation_identifies_all_drafts(self):
        """validate_rules_batch must flag all DRAFT rules in a batch."""
        rules = [_make_draft_rule(f"RULE-TEST-{i:03d}") for i in range(1, 4)]
        result = validate_rules_batch(rules)
        # All 3 rules must appear in the error dict
        assert len(result) == 3

    def test_all_seed_rules_rejected_from_export(self):
        """All Phase 1 seed rules must be rejected from export (all DRAFT)."""
        spec = load_full_spec(CONFIG_DIR)
        approved = export_approved_rules(spec.seed_rules)
        assert approved == [], (
            f"Expected no seed rules to pass export gate, but got: "
            f"{[r.get('rule_id') for r in approved]}"
        )

    def test_missing_approved_export_text_fails(self):
        """A rule with empty approved_export_text must fail validation."""
        rule = _make_approved_rule()
        rule.approved_export_text = ""
        errors = validate_rule_for_export(rule)
        assert any("approved_export_text" in e for e in errors), (
            f"Expected error about approved_export_text, got: {errors}"
        )

    def test_approved_export_text_used_in_export(self):
        """export_approved_rules must use approved_export_text, not final_effective_rule."""
        rule = _make_approved_rule("RULE-EXPORT-001")
        rule.approved_export_text = "Publicly safe export text."
        rule.final_effective_rule = "INTERNAL CEO NOTES — DO NOT EXPORT."
        approved = export_approved_rules([rule])
        assert len(approved) == 1
        assert approved[0].approved_export_text == "Publicly safe export text."
        # Confirm final_effective_rule is not present in the export model
        assert not hasattr(approved[0], "final_effective_rule"), (
            "ApprovedRuleExport must not expose final_effective_rule."
        )
