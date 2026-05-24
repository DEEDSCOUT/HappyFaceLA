"""Phase 1B.3 — column_mappings.yaml contract.

The column-mapping contract was moved from a Python constant in
constants.py into config/column_mappings.yaml so that it participates in
the deterministic spec_fingerprint and surfaces as plan drift.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hfla_control_room.constants import GOVERNANCE_DESTINATION_TABS
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


@pytest.fixture(scope="module")
def mappings():
    return load_full_spec(CONFIG_DIR).column_mappings


class TestColumnMappingYamlContract:
    def test_mappings_loaded_from_yaml(self, mappings):
        assert len(mappings) > 0, "column_mappings.yaml must produce records."

    def test_every_destination_tab_is_known_governance_tab(self, mappings):
        unknown = sorted({
            m.destination_tab for m in mappings
            if m.destination_tab not in GOVERNANCE_DESTINATION_TABS
        })
        assert unknown == [], f"Unknown destination tabs: {unknown}"

    def test_column_header_unique_within_destination_per_model(self, mappings):
        seen: set[tuple[str, str, str]] = set()
        dupes: list[tuple[str, str, str]] = []
        for m in mappings:
            key = (m.source_model, m.destination_tab, m.column_header)
            if key in seen:
                dupes.append(key)
            seen.add(key)
        assert dupes == [], f"Duplicate (model, tab, column): {dupes}"

    def test_release_record_columns_routed_to_release_changelog(self, mappings):
        release_dests = {
            m.destination_tab for m in mappings if m.source_model == "ReleaseRecord"
        }
        assert release_dests == {"13_RELEASE_CHANGELOG"}, (
            f"ReleaseRecord columns must route only to 13_RELEASE_CHANGELOG; "
            f"got {release_dests}"
        )

    def test_python_constant_column_mapping_removed(self):
        from hfla_control_room import constants
        assert not hasattr(constants, "COLUMN_MAPPING_CONTRACTS"), (
            "Legacy COLUMN_MAPPING_CONTRACTS must remain removed from "
            "constants.py — mappings live in config/column_mappings.yaml."
        )
