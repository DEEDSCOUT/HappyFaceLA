"""Phase 1B.2 \u2014 column-level mapping contract tests.

Every COLUMN_MAPPING_CONTRACTS entry must:
- target a tab that exists in GOVERNANCE_DESTINATION_TABS,
- reference a column header that exists in that tab's governance YAML,
- name a source_field that exists on the corresponding Pydantic model.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.constants import (
    COLUMN_MAPPING_CONTRACTS,
    GOVERNANCE_DESTINATION_TABS,
)
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    EvidenceRecord,
    RuleRow,
)
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"

MODEL_MAP = {
    "RuleRow": RuleRow,
    "EvidenceRecord": EvidenceRecord,
    "BlockerRecord": BlockerRecord,
    "ChannelProjectionRecord": ChannelProjectionRecord,
}


@pytest.fixture(scope="module")
def tab_headers() -> dict[str, list[str]]:
    spec = load_full_spec(CONFIG_DIR)
    headers: dict[str, list[str]] = {}
    for tab in spec.governance_workbook.tabs:
        headers[tab.title] = list(tab.column_headers)
    return headers


class TestColumnMappingContract:
    def test_every_model_covered(self):
        assert set(COLUMN_MAPPING_CONTRACTS.keys()) == set(MODEL_MAP.keys())

    def test_every_destination_tab_is_known(self):
        for model_name, entries in COLUMN_MAPPING_CONTRACTS.items():
            for e in entries:
                tab = e["destination_tab"]
                assert tab in GOVERNANCE_DESTINATION_TABS, (
                    f"{model_name}.{e['source_field']} -> unknown tab '{tab}'"
                )

    def test_every_column_header_exists_in_tab(self, tab_headers):
        for model_name, entries in COLUMN_MAPPING_CONTRACTS.items():
            for e in entries:
                tab = e["destination_tab"]
                header = e["column_header"]
                assert tab in tab_headers, f"Tab '{tab}' not in governance workbook"
                assert header in tab_headers[tab], (
                    f"{model_name}.{e['source_field']}: column '{header}' "
                    f"missing from tab '{tab}'. Existing: {tab_headers[tab]}"
                )

    def test_every_source_field_exists_on_model(self):
        for model_name, entries in COLUMN_MAPPING_CONTRACTS.items():
            model_cls = MODEL_MAP[model_name]
            model_field_names = set(model_cls.model_fields.keys())
            for e in entries:
                field = e["source_field"]
                assert field in model_field_names, (
                    f"{model_name}.{field} declared in mapping contract but "
                    f"missing from model. Existing fields: {sorted(model_field_names)}"
                )

    def test_required_keys_present_on_every_entry(self):
        required_keys = {
            "source_field",
            "destination_tab",
            "column_header",
            "required",
            "editable_by_ceo",
            "formula_derived",
            "exportable",
            "visibility",
        }
        for model_name, entries in COLUMN_MAPPING_CONTRACTS.items():
            for e in entries:
                missing = required_keys - set(e.keys())
                assert not missing, (
                    f"{model_name}.{e.get('source_field')}: missing keys {missing}"
                )
