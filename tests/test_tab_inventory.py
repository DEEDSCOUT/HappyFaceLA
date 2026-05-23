"""
Tests for workbook tab inventory.

Governance workbook must have exactly 14 unique tabs.
Restricted operations workbook must have exactly 9 unique tabs.
"""

from pathlib import Path

from hfla_control_room.constants import GOVERNANCE_TAB_COUNT, RESTRICTED_OPS_TAB_COUNT
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


class TestTabInventory:
    def test_governance_workbook_has_14_tabs(self):
        """Governance workbook must have exactly 14 tabs."""
        spec = load_full_spec(CONFIG_DIR)
        actual = len(spec.governance_workbook.tabs)
        assert actual == GOVERNANCE_TAB_COUNT, (
            f"Governance workbook has {actual} tabs; expected {GOVERNANCE_TAB_COUNT}."
        )

    def test_governance_tabs_have_unique_titles(self):
        """All 14 governance workbook tab titles must be unique."""
        spec = load_full_spec(CONFIG_DIR)
        titles = [t.title for t in spec.governance_workbook.tabs]
        assert len(titles) == len(set(titles)), (
            f"Duplicate tab titles in governance workbook: {titles}"
        )

    def test_governance_tab_titles(self):
        """Governance workbook must contain all expected tab titles."""
        spec = load_full_spec(CONFIG_DIR)
        titles = {t.title for t in spec.governance_workbook.tabs}
        expected = {
            "00_CONTROL_CENTER",
            "01_CEO_APPROVAL_QUEUE",
            "02_OPEN_BLOCKERS",
            "03_RULE_REGISTER_MASTER",
            "04_ACTIVE_RULES_EXPORT",
            "05_PUBLIC_PRICING_PACKAGES",
            "06_INTERNAL_QUOTE_TRAVEL_RULES",
            "07_BOOKING_POLICY_COMPLIANCE",
            "08_VENDOR_SCHOOL_CORPORATE_RULES",
            "09_CHANNEL_IMPLEMENTATION_MAP",
            "10_AI_CUSTOMER_RESPONSE_MATRIX",
            "11_SOURCE_EVIDENCE",
            "12_RELEASE_CHANGELOG",
            "99_VALIDATION_CONFIG",
        }
        missing = expected - titles
        extra = titles - expected
        assert expected == titles, (
            f"Governance tab titles mismatch.\n  Missing: {missing}\n  Extra: {extra}"
        )

    def test_restricted_workbook_has_9_tabs(self):
        """Restricted operations workbook must have exactly 9 tabs."""
        spec = load_full_spec(CONFIG_DIR)
        actual = len(spec.restricted_operations_workbook.tabs)
        assert actual == RESTRICTED_OPS_TAB_COUNT, (
            f"Restricted workbook has {actual} tabs; expected {RESTRICTED_OPS_TAB_COUNT}."
        )

    def test_restricted_tabs_have_unique_titles(self):
        """All 9 restricted operations tab titles must be unique."""
        spec = load_full_spec(CONFIG_DIR)
        titles = [t.title for t in spec.restricted_operations_workbook.tabs]
        assert len(titles) == len(set(titles)), (
            f"Duplicate tab titles in restricted workbook: {titles}"
        )

    def test_restricted_tab_titles(self):
        """Restricted workbook must contain all expected tab titles."""
        spec = load_full_spec(CONFIG_DIR)
        titles = {t.title for t in spec.restricted_operations_workbook.tabs}
        expected = {
            "00_ACCESS_AND_USAGE_RULES",
            "01_QUOTE_WORKBENCH",
            "02_LEAD_PIPELINE",
            "03_BOOKINGS_EVENTS",
            "04_EVENT_DELIVERY_METRICS",
            "05_UNIT_ECONOMICS",
            "06_GOOGLE_ADS_PERFORMANCE",
            "07_KPI_DASHBOARD",
            "99_VALIDATION_CONFIG",
        }
        missing = expected - titles
        extra = titles - expected
        assert expected == titles, (
            f"Restricted tab titles mismatch.\n  Missing: {missing}\n  Extra: {extra}"
        )

    def test_no_tab_title_overlap_between_workbooks(self):
        """Core data tabs must not overlap between workbooks.

        Both workbooks share 99_VALIDATION_CONFIG by design (shared config tab).
        The non-shared tabs must be distinct to prevent confusion.
        """
        spec = load_full_spec(CONFIG_DIR)
        gov_titles = {t.title for t in spec.governance_workbook.tabs}
        res_titles = {t.title for t in spec.restricted_operations_workbook.tabs}
        # 99_VALIDATION_CONFIG intentionally appears in both — it is the shared
        # validation lookup tab. All other tabs must be distinct.
        EXPECTED_SHARED = {"99_VALIDATION_CONFIG"}
        unexpected_overlap = (gov_titles & res_titles) - EXPECTED_SHARED
        assert not unexpected_overlap, (
            f"Unexpected tab title overlap between workbooks: {unexpected_overlap}"
        )
