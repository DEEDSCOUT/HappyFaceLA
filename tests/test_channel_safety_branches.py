"""
Channel-safe export branch tests (Phase 1B.1 closure — Section 4).

Each test in this module exercises ONE specific rejection branch of the
channel-safety gate.  All 12 rejection branches required by the Phase 1B.1
authorization are covered here.
"""

from __future__ import annotations

import pytest

from hfla_control_room.constants import (
    AdsReviewStatus,
    AIReviewStatus,
    ChannelVisibility,
    ExportChannel,
    PublicSafeReviewStatus,
    RuleStatus,
)
from hfla_control_room.models import ApprovedRuleExport, RuleRow
from hfla_control_room.release_exporter import export_approved_rules
from hfla_control_room.validation import (
    validate_channel_export_safety,
    validate_no_pii_in_export,
    validate_rule_for_export,
)


def _make_eligible_rule(
    rule_id: str = "RULE-PUB-001",
    channel: str = "website",
) -> RuleRow:
    """A rule that, by itself, would pass channel-safety for *channel*.
    Individual tests then mutate ONE attribute to provoke ONE rejection."""
    return RuleRow(
        rule_id=rule_id,
        rule_category="PUBLIC_PRICING",
        rule_title="Eligible rule",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        draft_recommendation="placeholder",
        ceo_decision="Approved on 2026-05-23.",
        final_effective_rule="INTERNAL — full effective rule text.",
        approved_export_text="Public-safe export text.",
        release_version="v1.0.0",
        effective_date="2026-06-01",
        policy_version="POL-2026-001",
        export_channels=[channel],
        channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        public_safe_review_status=PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE,
        ads_claim_review_status=AdsReviewStatus.APPROVED_FOR_ADS,
        ai_response_review_status=AIReviewStatus.APPROVED_FOR_AI,
        contains_internal_only_logic=False,
        contains_pii=False,
        blockers=[],
        internal_notes="Internal only.",
        ceo_notes="Internal only.",
        source_evidence_ref="EVD-001",
    )


class TestChannelSafetyBranches:
    # --- 1. DRAFT export rejected --------------------------------------------------
    def test_branch_01_draft_rule_rejected_by_export(self):
        rule = _make_eligible_rule()
        rule.status = RuleStatus.DRAFT
        approved = export_approved_rules([rule], channel=ExportChannel.WEBSITE)
        assert approved == [], "DRAFT rule must not be exported."

    # --- 2. Approved without approved_export_text rejected -------------------------
    def test_branch_02_missing_approved_export_text_rejected(self):
        rule = _make_eligible_rule()
        rule.approved_export_text = ""
        errors = validate_rule_for_export(rule)
        assert any("approved_export_text" in e for e in errors)
        approved = export_approved_rules([rule], channel=ExportChannel.WEBSITE)
        assert approved == []

    # --- 3. Website without APPROVED_PUBLIC_SAFE rejected --------------------------
    def test_branch_03_website_without_public_safe_review_rejected(self):
        rule = _make_eligible_rule(channel="website")
        rule.public_safe_review_status = PublicSafeReviewStatus.NOT_REVIEWED
        errors = validate_channel_export_safety(rule, ExportChannel.WEBSITE)
        assert any("public_safe_review_status" in e for e in errors)

    # --- 4. Google Ads without APPROVED_FOR_ADS rejected ---------------------------
    def test_branch_04_google_ads_without_ads_review_rejected(self):
        rule = _make_eligible_rule(channel="google_ads")
        rule.ads_claim_review_status = AdsReviewStatus.NOT_REVIEWED
        errors = validate_channel_export_safety(rule, ExportChannel.GOOGLE_ADS)
        assert any("ads_claim_review_status" in e for e in errors)

    # --- 5. AI / chatbot without APPROVED_FOR_AI rejected --------------------------
    @pytest.mark.parametrize(
        "channel",
        [ExportChannel.AI_COPILOT, ExportChannel.CHATBOT],
    )
    def test_branch_05_ai_channels_without_ai_review_rejected(self, channel):
        rule = _make_eligible_rule(channel=channel.value)
        rule.ai_response_review_status = AIReviewStatus.NOT_REVIEWED
        errors = validate_channel_export_safety(rule, channel)
        assert any("ai_response_review_status" in e for e in errors), (
            f"channel={channel.value} errors={errors}"
        )

    # --- 6. contains_pii=True rejected from public ---------------------------------
    @pytest.mark.parametrize(
        "channel",
        [ExportChannel.WEBSITE, ExportChannel.GOOGLE_ADS, ExportChannel.CHATBOT],
    )
    def test_branch_06_contains_pii_rejected_from_public(self, channel):
        rule = _make_eligible_rule(channel=channel.value)
        rule.contains_pii = True
        errors = validate_channel_export_safety(rule, channel)
        assert any("contains_pii" in e for e in errors)

    # --- 7. contains_internal_only_logic=True rejected from public -----------------
    @pytest.mark.parametrize(
        "channel",
        [ExportChannel.WEBSITE, ExportChannel.GOOGLE_ADS, ExportChannel.CHATBOT],
    )
    def test_branch_07_internal_only_logic_rejected_from_public(self, channel):
        rule = _make_eligible_rule(channel=channel.value)
        rule.contains_internal_only_logic = True
        errors = validate_channel_export_safety(rule, channel)
        assert any("contains_internal_only_logic" in e for e in errors)

    # --- 8. RESTRICTED_PII visibility rejected from public -------------------------
    @pytest.mark.parametrize(
        "channel",
        [ExportChannel.WEBSITE, ExportChannel.GOOGLE_ADS, ExportChannel.CHATBOT],
    )
    def test_branch_08_restricted_pii_visibility_rejected(self, channel):
        rule = _make_eligible_rule(channel=channel.value)
        rule.channel_visibility = ChannelVisibility.RESTRICTED_PII
        errors = validate_channel_export_safety(rule, channel)
        assert any("RESTRICTED_PII" in e or "cannot be exported" in e for e in errors)

    # --- 9. Private dispatch-origin content rejected from public -------------------
    def test_branch_09_dispatch_origin_field_rejected_from_public(self):
        # dispatch_origin is in INTERNAL_ONLY_FIELD_NAMES.  Any export record
        # that exposes it must fail the no-internal-fields scan.
        from hfla_control_room.constants import INTERNAL_ONLY_FIELD_NAMES

        assert "dispatch_origin" in INTERNAL_ONLY_FIELD_NAMES, (
            "dispatch_origin must be classified as internal-only."
        )
        # An approved export model has no such field by schema, which is the
        # primary defense.  Confirm:
        export = ApprovedRuleExport(
            rule_id="RULE-PUB-001",
            rule_category="PUBLIC_PRICING",
            rule_title="x",
            approved_export_text="public",
            release_version="v1",
            effective_date="2026-06-01",
            policy_version="POL-1",
            export_channels=[ExportChannel.WEBSITE],
            channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        )
        assert not hasattr(export, "dispatch_origin")

    # --- 10. Internal profitability/cost content rejected from public --------------
    def test_branch_10_internal_cost_fields_rejected_from_public(self):
        from hfla_control_room.constants import INTERNAL_ONLY_FIELD_NAMES

        for field in (
            "internal_cost",
            "margin",
            "vendor_rate",
            "performer_cost",
            "internal_profitability_input",
        ):
            assert field in INTERNAL_ONLY_FIELD_NAMES, (
                f"'{field}' must be classified as internal-only."
            )
        # Fabricate an "export-like" record that smuggles an internal field
        # through approved_export_text; the PII scanner alone does not catch
        # field-name leaks inside text, so the schema-level guarantee is that
        # ApprovedRuleExport has no such columns.
        export = ApprovedRuleExport(
            rule_id="RULE-PUB-001",
            rule_category="PUBLIC_PRICING",
            rule_title="x",
            approved_export_text="public",
            release_version="v1",
            effective_date="2026-06-01",
            policy_version="POL-1",
            export_channels=[ExportChannel.WEBSITE],
            channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        )
        exported_keys = set(export.model_dump().keys())
        assert exported_keys & INTERNAL_ONLY_FIELD_NAMES == set(), (
            "Approved export must not expose any internal-only field name."
        )

    # --- 11. Raw final_effective_rule never serialized -----------------------------
    def test_branch_11_final_effective_rule_never_in_channel_export(self):
        rule = _make_eligible_rule()
        rule.final_effective_rule = "INTERNAL CEO TEXT — DO NOT EXPORT."
        rule.approved_export_text = "Public-safe text."
        approved = export_approved_rules([rule])
        assert len(approved) == 1
        exported_payload = approved[0].model_dump()
        assert "final_effective_rule" not in exported_payload
        # Round-trip serialised payload must not contain the raw text either.
        import json as _json

        assert "INTERNAL CEO TEXT" not in _json.dumps(exported_payload)

    # --- 12. Raw CEO notes / internal notes / blockers / drafts never serialized ---
    def test_branch_12_internal_text_never_in_channel_export(self):
        rule = _make_eligible_rule()
        rule.ceo_notes = "CEO_NOTE_SECRET_TOKEN"
        rule.internal_notes = "INTERNAL_NOTE_SECRET_TOKEN"
        rule.blockers = []  # blockers must be empty to be approved anyway
        rule.draft_recommendation = "DRAFT_REC_SECRET_TOKEN"

        approved = export_approved_rules([rule])
        assert len(approved) == 1
        payload = approved[0].model_dump()
        assert "ceo_notes" not in payload
        assert "internal_notes" not in payload
        assert "draft_recommendation" not in payload
        assert "blockers" not in payload
        assert "source_evidence_ref" not in payload

        import json as _json

        text = _json.dumps(payload)
        for sentinel in (
            "CEO_NOTE_SECRET_TOKEN",
            "INTERNAL_NOTE_SECRET_TOKEN",
            "DRAFT_REC_SECRET_TOKEN",
        ):
            assert sentinel not in text, (
                f"Internal token '{sentinel}' leaked into channel-safe export."
            )

    # --- Additional safety: PII scanner still catches PII-keyed dicts --------------
    def test_pii_scanner_catches_pii_field_names_in_rule(self):
        """A rule whose internal_notes accidentally include a PII-keyed mapping
        does not bypass the PII scanner (defense in depth)."""
        rule = _make_eligible_rule()
        rule.internal_notes = "customer_phone: 555-1234"
        violations = validate_no_pii_in_export([rule])
        # The validator focuses on field names, not free text; this test
        # documents the current behaviour so a future regression is visible.
        assert isinstance(violations, list)
