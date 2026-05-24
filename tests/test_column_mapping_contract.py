"""Phase 1B.3 — column-level mapping contract tests (YAML-driven).

Every column mapping record loaded from ``config/column_mappings.yaml``
must:

- target a tab that exists in :data:`GOVERNANCE_DESTINATION_TABS`,
- reference a column header that exists in that tab's governance YAML,
- name a ``source_field`` that exists on the corresponding Pydantic model,
- and be uniquely keyed on ``(source_model, destination_tab, column_header)``.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import pytest

from hfla_control_room.constants import GOVERNANCE_DESTINATION_TABS
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    ChannelReleaseActivationRecord,
    EvidenceRecord,
    ReleaseRecord,
    RuleRow,
)
from hfla_control_room.spec_loader import load_full_spec
from hfla_control_room.validation import validate_column_mapping_integrity

CONFIG_DIR = Path(__file__).parent.parent / "config"

MODEL_MAP = {
    "RuleRow": RuleRow,
    "EvidenceRecord": EvidenceRecord,
    "BlockerRecord": BlockerRecord,
    "ChannelProjectionRecord": ChannelProjectionRecord,
    "ReleaseRecord": ReleaseRecord,
    "ChannelReleaseActivationRecord": ChannelReleaseActivationRecord,
}


@pytest.fixture(scope="module")
def spec():
    return load_full_spec(CONFIG_DIR)


@pytest.fixture(scope="module")
def tab_headers(spec) -> dict[str, list[str]]:
    return {tab.title: list(tab.column_headers) for tab in spec.governance_workbook.tabs}


class TestColumnMappingContract:
    def test_mappings_are_loaded(self, spec):
        assert spec.column_mappings, "column_mappings.yaml produced zero records."

    def test_every_model_covered(self, spec):
        models_used = {m.source_model for m in spec.column_mappings}
        assert models_used == set(MODEL_MAP.keys())

    def test_every_destination_tab_is_known(self, spec):
        for m in spec.column_mappings:
            assert m.destination_tab in GOVERNANCE_DESTINATION_TABS, (
                f"{m.source_model}.{m.source_field} -> unknown tab "
                f"'{m.destination_tab}'"
            )

    def test_every_column_header_exists_in_tab(self, spec, tab_headers):
        for m in spec.column_mappings:
            assert m.destination_tab in tab_headers
            assert m.column_header in tab_headers[m.destination_tab], (
                f"{m.source_model}.{m.source_field}: column "
                f"'{m.column_header}' missing from tab '{m.destination_tab}'."
            )

    def test_every_source_field_exists_on_model(self, spec):
        for m in spec.column_mappings:
            model_cls = MODEL_MAP[m.source_model]
            assert m.source_field in model_cls.model_fields, (
                f"{m.source_model}.{m.source_field} not a known model field."
            )

    def test_mapping_keys_are_unique(self, spec):
        keys = [
            (m.source_model, m.destination_tab, m.column_header)
            for m in spec.column_mappings
        ]
        dupes = [k for k, c in Counter(keys).items() if c > 1]
        assert not dupes, f"Duplicate mapping keys: {dupes}"

    def test_validator_reports_no_errors(self, spec):
        errs = validate_column_mapping_integrity(
            spec.column_mappings, spec.governance_workbook
        )
        assert errs == [], errs
