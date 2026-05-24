"""Phase 1B.3 — validation_lists.yaml canonical contract.

The validation_lists.yaml file is the single source of truth for dropdown
values rendered into governance / restricted workbook tabs.  Every enum that
is surfaced to the workbook must be represented as a list whose values match
the Python ``StrEnum`` 1:1.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.constants import (
    BlockerType,
    CEOReleaseDecision,
    ConsumerChannel,
    EvidenceReliabilityTier,
    ImplementationStatus,
    ProjectionReleaseStatus,
    QAStatus,
    ReleaseStatus,
    RuleStatus,
    SensitivityClassification,
)
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


@pytest.fixture(scope="module")
def lists_by_name():
    spec = load_full_spec(CONFIG_DIR)
    return {ls.list_name: ls.values for ls in spec.validation_lists.lists}


_ENUM_TO_LIST: dict[str, type] = {
    "rule_status": RuleStatus,
    "blocker_type": BlockerType,
    "sensitivity_classification": SensitivityClassification,
    "release_status": ReleaseStatus,
    "ceo_release_decision": CEOReleaseDecision,
    "projection_release_status": ProjectionReleaseStatus,
    "consumer_channel": ConsumerChannel,
    "qa_status": QAStatus,
    "implementation_status": ImplementationStatus,
}


class TestValidationListsCanonical:
    def test_legacy_export_channel_list_removed(self, lists_by_name):
        assert "export_channel" not in lists_by_name, (
            "Legacy 'export_channel' list must be removed — channels are "
            "now governed by ConsumerChannel + ReleaseRecord.authorized_channels."
        )

    @pytest.mark.parametrize("list_name,enum_cls", list(_ENUM_TO_LIST.items()))
    def test_list_matches_enum(self, lists_by_name, list_name, enum_cls):
        assert list_name in lists_by_name, f"Missing list: {list_name}"
        list_values = set(lists_by_name[list_name])
        enum_values = {m.value for m in enum_cls}
        assert list_values == enum_values, (
            f"List '{list_name}' diverges from {enum_cls.__name__}:\n"
            f"  list only: {sorted(list_values - enum_values)}\n"
            f"  enum only: {sorted(enum_values - list_values)}"
        )

    def test_evidence_reliability_tier_values_appear_if_listed(self, lists_by_name):
        # Optional list; if present must match enum.
        if "evidence_reliability_tier" in lists_by_name:
            assert set(lists_by_name["evidence_reliability_tier"]) == {
                m.value for m in EvidenceReliabilityTier
            }
