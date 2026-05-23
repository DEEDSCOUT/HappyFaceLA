"""
Tests for full specification integrity.

Verifies that all YAML config files load and validate without error using
the production spec loader.
"""

from pathlib import Path

from hfla_control_room.models import FullConfigSpec
from hfla_control_room.spec_loader import load_full_spec

CONFIG_DIR = Path(__file__).parent.parent / "config"


class TestSpecIntegrity:
    def test_config_dir_exists(self):
        """The config directory must exist."""
        assert CONFIG_DIR.is_dir(), f"Config directory not found: {CONFIG_DIR}"

    def test_all_required_yaml_files_exist(self):
        """All 6 required YAML configuration files must be present."""
        required = [
            "drive_structure.yaml",
            "governance_workbook.yaml",
            "restricted_operations_workbook.yaml",
            "documents.yaml",
            "validation_lists.yaml",
            "rule_schema.yaml",
        ]
        for filename in required:
            path = CONFIG_DIR / filename
            assert path.exists(), f"Missing required config file: {filename}"

    def test_seed_data_dir_exists(self):
        """The seed_data directory must exist."""
        assert (CONFIG_DIR / "seed_data").is_dir()

    def test_load_full_spec_returns_full_config(self):
        """load_full_spec must return a FullConfigSpec without raising."""
        spec = load_full_spec(CONFIG_DIR)
        assert isinstance(spec, FullConfigSpec)

    def test_drive_structure_loaded(self):
        """Drive structure spec must be populated."""
        spec = load_full_spec(CONFIG_DIR)
        assert spec.drive_structure is not None
        assert spec.drive_structure.root_folder_name

    def test_governance_workbook_loaded(self):
        """Governance workbook spec must be populated."""
        spec = load_full_spec(CONFIG_DIR)
        assert spec.governance_workbook is not None
        assert len(spec.governance_workbook.tabs) > 0

    def test_restricted_workbook_loaded(self):
        """Restricted operations workbook spec must be populated."""
        spec = load_full_spec(CONFIG_DIR)
        assert spec.restricted_operations_workbook is not None
        assert len(spec.restricted_operations_workbook.tabs) > 0

    def test_documents_loaded(self):
        """Documents list must be non-empty."""
        spec = load_full_spec(CONFIG_DIR)
        assert len(spec.documents) >= 2

    def test_seed_rules_loaded(self):
        """Seed rules must be loaded as RuleRow instances."""
        spec = load_full_spec(CONFIG_DIR)
        assert len(spec.seed_rules) > 0

    def test_seed_rules_all_draft(self):
        """All seed rules must have DRAFT status in Phase 1."""
        spec = load_full_spec(CONFIG_DIR)
        from hfla_control_room.constants import RuleStatus
        for rule in spec.seed_rules:
            assert rule.status == RuleStatus.DRAFT, (
                f"Rule '{rule.rule_id}' has non-DRAFT status '{rule.status}' — "
                "no CEO-approved rules are permitted in Phase 1."
            )
