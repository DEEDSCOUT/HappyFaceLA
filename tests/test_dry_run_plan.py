"""
Tests for the dry-run plan builder.

Verifies:
- The plan contains exactly 2 sheet assets and 2 doc assets.
- No live Google API calls are made during plan generation.
- plan_builder.build_plan returns all expected operation types.
- provision --apply raises the Phase 1 block.
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from hfla_control_room.plan_builder import build_plan
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


class TestDryRunPlan:
    def test_build_plan_returns_dict(self):
        """build_plan must return a dict."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        assert isinstance(plan, dict)

    def test_plan_has_operations_key(self):
        """Plan dict must contain an 'operations' key."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        assert "operations" in plan

    def test_plan_contains_exactly_two_sheet_operations(self):
        """Plan must contain exactly 2 CREATE_SHEET operations (governance + restricted)."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        sheet_ops = [
            op for op in plan["operations"]
            if op.get("op") == "CREATE_SHEET"
        ]
        assert len(sheet_ops) == 2, (
            f"Expected exactly 2 CREATE_SHEET operations, got {len(sheet_ops)}."
        )

    def test_plan_contains_exactly_two_doc_operations(self):
        """Plan must contain exactly 2 CREATE_DOC operations."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        doc_ops = [
            op for op in plan["operations"]
            if op.get("op") == "CREATE_DOC"
        ]
        assert len(doc_ops) == 2, (
            f"Expected exactly 2 CREATE_DOC operations, got {len(doc_ops)}."
        )

    def test_plan_contains_folder_operations(self):
        """Plan must contain at least one CREATE_FOLDER operation."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        folder_ops = [op for op in plan["operations"] if op.get("op") == "CREATE_FOLDER"]
        assert len(folder_ops) > 0

    def test_all_plan_operations_have_live_action_false(self):
        """All plan operations must have live_action=False in Phase 1."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        for op in plan["operations"]:
            assert op.get("live_action") is False, (
                f"Operation '{op.get('op')} — {op.get('name')}' has live_action=True in Phase 1!"
            )

    def test_no_google_api_calls_during_plan(self):
        """build_plan must not call any Google API functions."""
        spec = load_full_spec(CONFIG_DIR)

        with patch("hfla_control_room.google_auth.get_drive_service") as mock_drive, \
             patch("hfla_control_room.google_auth.get_sheets_service") as mock_sheets, \
             patch("hfla_control_room.google_auth.get_docs_service") as mock_docs:
            build_plan(spec)

        mock_drive.assert_not_called()
        mock_sheets.assert_not_called()
        mock_docs.assert_not_called()

    def test_governance_sheet_has_14_tabs_in_plan(self):
        """The governance workbook in the plan must list 14 tab titles."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        sheet_ops = [op for op in plan["operations"] if op.get("op") == "CREATE_SHEET"]
        # Find whichever sheet has 14 tabs
        fourteen_tab_sheets = [op for op in sheet_ops if op.get("tab_count") == 14]
        assert len(fourteen_tab_sheets) == 1, (
            f"Expected exactly 1 sheet with 14 tabs; found {len(fourteen_tab_sheets)}."
        )

    def test_restricted_sheet_has_9_tabs_in_plan(self):
        """The restricted operations workbook in the plan must list 9 tab titles."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        sheet_ops = [op for op in plan["operations"] if op.get("op") == "CREATE_SHEET"]
        nine_tab_sheets = [op for op in sheet_ops if op.get("tab_count") == 9]
        assert len(nine_tab_sheets) == 1, (
            f"Expected exactly 1 sheet with 9 tabs; found {len(nine_tab_sheets)}."
        )

    def test_apply_raises_phase_1_block(self):
        """DriveProvisioner must raise RuntimeError (BLOCKED) when dry_run=False."""
        from hfla_control_room.drive_provisioner import DriveProvisioner
        from hfla_control_room.manifest import Manifest

        manifest = Manifest()
        with pytest.raises(RuntimeError, match="BLOCKED"):
            DriveProvisioner(manifest=manifest, dry_run=False)

    def test_plan_metadata_keys_present(self):
        """Plan dict must include plan_metadata with phase, generated_at, and dry_run keys."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        assert "plan_metadata" in plan
        meta = plan["plan_metadata"]
        assert "phase" in meta
        assert "generated_at_utc" in meta
        assert meta.get("live_google_calls") is False
