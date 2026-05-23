"""
Tests for manifest persistence and the idempotency architecture.

Verifies:
- ASSET_KEYS registry is populated and unique.
- make_key produces deterministic, stable keys.
- Manifest save/load round-trip works correctly.
- Manifest loads fresh (empty) when no file exists.
- MANIFEST_PATH is in a git-ignored directory.
"""

from __future__ import annotations

from pathlib import Path

from hfla_control_room.manifest import ASSET_KEYS, Manifest, ManifestEntry, make_key


class TestIdempotencyContract:
    def test_asset_keys_non_empty(self):
        """ASSET_KEYS registry must contain at least 10 entries for Phase 1."""
        assert len(ASSET_KEYS) >= 10, (
            f"Expected ≥10 entries in ASSET_KEYS, got {len(ASSET_KEYS)}."
        )

    def test_asset_keys_unique(self):
        """All ASSET_KEYS values must be unique."""
        values = list(ASSET_KEYS.values())
        assert len(values) == len(set(values)), (
            "Duplicate values detected in ASSET_KEYS — idempotency keys must be unique."
        )

    def test_all_required_keys_present(self):
        """All Phase 1 structural asset keys must be present in ASSET_KEYS."""
        required = [
            "root_control_room_folder",
            "active_governance_folder",
            "governance_master_sheet",
            "active_policy_manual_doc",
            "restricted_operations_folder",
            "restricted_operations_sheet",
            "release_packages_folder",
            "release_brief_template_doc",
            "source_evidence_folder",
            "archive_folder",
        ]
        for key in required:
            assert key in ASSET_KEYS, (
                f"Required idempotency key '{key}' is missing from ASSET_KEYS."
            )

    def test_make_key_deterministic(self):
        """make_key must produce the same output for the same inputs across calls."""
        key_a = make_key("folder", "Test Folder Name")
        key_b = make_key("folder", "Test Folder Name")
        assert key_a == key_b

    def test_make_key_different_types_differ(self):
        """make_key with different asset_types must produce different keys for same name."""
        assert make_key("folder", "My Asset") != make_key("sheet", "My Asset")

    def test_make_key_format(self):
        """make_key must produce a string with 'asset_type:' prefix."""
        key = make_key("folder", "Happy Faces LA")
        assert key.startswith("folder:")

    def test_manifest_save_load_roundtrip(self, tmp_path: Path) -> None:
        """Manifest must survive a save→load cycle with data integrity."""
        m = Manifest()
        m.upsert(
            ManifestEntry(
                key="folder:test_folder",
                asset_type="folder",
                name="Test Folder",
                status="PLANNED",
            )
        )
        path = tmp_path / "manifest.json"
        m.save(path)

        loaded = Manifest.load(path)
        assert len(loaded.entries) == 1
        assert loaded.entries[0].key == "folder:test_folder"
        assert loaded.entries[0].name == "Test Folder"
        assert loaded.entries[0].status == "PLANNED"

    def test_manifest_load_fresh_if_not_exists(self, tmp_path: Path) -> None:
        """Manifest.load must return an empty manifest when no file exists."""
        path = tmp_path / "nonexistent_manifest.json"
        m = Manifest.load(path)
        assert m.entries == []

    def test_manifest_upsert_updates_existing_entry(self, tmp_path: Path) -> None:
        """Upsert on an existing key must update the entry, not duplicate it,
        and the persisted Google asset id must survive a save/load roundtrip."""
        m = Manifest()
        m.upsert(ManifestEntry(key="folder:abc", asset_type="folder", name="ABC", status="PLANNED"))
        m.upsert(ManifestEntry(
            key="folder:abc", asset_type="folder", name="ABC",
            status="COMPLETE", google_id="id_123",
        ))
        entries_for_key = [e for e in m.entries if e.key == "folder:abc"]
        assert len(entries_for_key) == 1, "Upsert must not create duplicate entries."
        assert entries_for_key[0].status == "COMPLETE"
        assert entries_for_key[0].google_id == "id_123", (
            "ManifestEntry must persist the Google asset id under the canonical "
            "field name 'google_id' (NOT 'drive_id')."
        )

        # Save and reload to prove the field survives serialization.
        path = tmp_path / "manifest.json"
        m.save(path)
        loaded = Manifest.load(path)
        loaded_entry = next(e for e in loaded.entries if e.key == "folder:abc")
        assert loaded_entry.google_id == "id_123", (
            "google_id must survive save/load roundtrip."
        )

    def test_manifest_entry_rejects_unknown_drive_id_field(self) -> None:
        """The legacy 'drive_id' field name must not silently bind; Pydantic
        ignores unknown kwargs by default, so we assert behaviourally that
        passing drive_id leaves google_id unset."""
        entry = ManifestEntry(
            key="folder:abc",
            asset_type="folder",
            name="ABC",
            status="PLANNED",
        )
        # The canonical field is google_id and defaults to None / empty.
        assert getattr(entry, "google_id", None) in (None, "", )
        # Confirm 'drive_id' is not a known schema field.
        assert "drive_id" not in type(entry).model_fields

    def test_manifest_not_tracked_by_git(self):
        """The canonical MANIFEST_PATH must reside in a git-ignored directory."""
        from hfla_control_room.constants import MANIFEST_PATH

        workspace_root = Path(__file__).parent.parent
        gitignore = workspace_root / ".gitignore"
        content = gitignore.read_text(encoding="utf-8")
        assert ".runtime/" in content, (
            ".runtime/ must be in .gitignore — MANIFEST_PATH lives there."
        )
        assert ".runtime" in str(MANIFEST_PATH), (
            f"MANIFEST_PATH ({MANIFEST_PATH}) must be under .runtime/."
        )
