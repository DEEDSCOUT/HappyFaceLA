"""Phase 1B.2 \u2014 consumer-channel authority tests.

The new ConsumerChannel-aware export-safety validator must:
- reject the RESTRICTED_OPERATIONS_PII channel outright,
- reject any public channel when contains_pii=True,
- treat chatbot vs Copilot vs quote-operator approvals as independent gates.
"""

from __future__ import annotations

import pytest

from hfla_control_room.constants import (
    AdsReviewStatus,
    ChannelVisibility,
    ChatbotResponseReviewStatus,
    ConsumerChannel,
    CopilotInternalReviewStatus,
    PublicSafeReviewStatus,
    QuoteOperatorReviewStatus,
    RuleStatus,
)
from hfla_control_room.models import RuleRow
from hfla_control_room.validation import validate_consumer_channel_export_safety


def _rule() -> RuleRow:
    return RuleRow(
        rule_id="RULE-CC-001",
        rule_category="PUBLIC_PRICING",
        rule_title="t",
        status=RuleStatus.APPROVED_AS_RECOMMENDED,
        approved_export_text="public-safe text",
        export_channels=["website"],
        channel_visibility=ChannelVisibility.CHANNEL_SAFE,
        public_safe_review_status=PublicSafeReviewStatus.APPROVED_PUBLIC_SAFE,
        ads_claim_review_status=AdsReviewStatus.APPROVED_FOR_ADS,
        customer_chatbot_review_status=ChatbotResponseReviewStatus.APPROVED_FOR_CUSTOMER_CHATBOT,
        copilot_internal_review_status=CopilotInternalReviewStatus.APPROVED_FOR_COPILOT_INTERNAL,
        quote_operator_review_status=QuoteOperatorReviewStatus.APPROVED_FOR_QUOTE_OPERATOR,
        contains_internal_only_logic=False,
        contains_pii=False,
    )


class TestConsumerChannelAuthority:
    def test_restricted_operations_channel_always_rejected(self):
        rule = _rule()
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.RESTRICTED_OPERATIONS_PII
        )
        assert errors, "RESTRICTED_OPERATIONS_PII must be rejected outright."
        assert any("authorization" in e.lower() for e in errors)

    @pytest.mark.parametrize(
        "channel",
        [
            ConsumerChannel.WEBSITE_PUBLIC,
            ConsumerChannel.GOOGLE_ADS_PUBLIC,
            ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC,
        ],
    )
    def test_public_channel_rejects_pii(self, channel):
        rule = _rule()
        rule.contains_pii = True
        errors = validate_consumer_channel_export_safety(rule, channel)
        assert any("contains_pii" in e for e in errors), errors

    def test_chatbot_approval_alone_does_not_grant_copilot(self):
        rule = _rule()
        rule.copilot_internal_review_status = CopilotInternalReviewStatus.NOT_REVIEWED
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT
        )
        assert any("copilot_internal_review_status" in e for e in errors), errors

    def test_copilot_approval_alone_does_not_grant_chatbot(self):
        rule = _rule()
        rule.customer_chatbot_review_status = ChatbotResponseReviewStatus.NOT_REVIEWED
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC
        )
        assert any("customer_chatbot_review_status" in e for e in errors), errors

    def test_chatbot_with_approval_passes(self):
        rule = _rule()
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC
        )
        assert errors == [], errors

    def test_copilot_with_approval_passes(self):
        rule = _rule()
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT
        )
        assert errors == [], errors

    def test_quote_operator_without_approval_rejected(self):
        rule = _rule()
        rule.quote_operator_review_status = QuoteOperatorReviewStatus.NOT_REVIEWED
        errors = validate_consumer_channel_export_safety(
            rule, ConsumerChannel.QUOTE_OPERATOR_INTERNAL
        )
        assert any("quote_operator_review_status" in e for e in errors), errors
