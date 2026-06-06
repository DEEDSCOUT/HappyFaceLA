"""
Happy Faces LA — Commercial Control Room
Google Drive provisioner.

PHASE 1: Dry-run stub only.
All methods that would create or modify Drive assets raise RuntimeError
unless called with dry_run=True.

Future implementation will use:
  googleapiclient.discovery.build('drive', 'v3', credentials=creds)
with the minimum authorized scopes.
"""

from __future__ import annotations

import logging

from hfla_control_room.constants import PHASE_1_BLOCK_MESSAGE
from hfla_control_room.manifest import Manifest, ManifestEntry, make_key
from hfla_control_room.models import DriveStructureSpec

logger = logging.getLogger(__name__)


class DriveProvisioner:
    """Provisions Google Drive folder structure.

    In Phase 1, all methods operate in dry-run mode only.
    Pass ``dry_run=True`` explicitly; any attempt to pass ``dry_run=False``
    raises RuntimeError.
    """

    def __init__(self, manifest: Manifest, dry_run: bool = True) -> None:
        if not dry_run:
            raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
        self.manifest = manifest
        self.dry_run = dry_run

    def provision_structure(self, spec: DriveStructureSpec) -> list[str]:
        """Simulate folder/asset creation and return operation log lines."""
        log: list[str] = []

        def _process_folder(parent_path: str, folder: object) -> None:
            name = getattr(folder, "name", "UNKNOWN")
            path = f"{parent_path}/{name}" if parent_path else name
            key = make_key("folder", path)
            existing = self.manifest.get(key)
            if existing and existing.google_id:
                log.append(f"[DRY-RUN] SKIP_EXISTING folder: {path}")
            else:
                log.append(f"[DRY-RUN] WOULD CREATE folder: {path}")
                self.manifest.upsert(
                    ManifestEntry(key=key, asset_type="folder", name=name, status="PLANNED")
                )
            for child in getattr(folder, "children", []):
                if hasattr(child, "children"):
                    _process_folder(path, child)
                else:
                    child_key = make_key(child.asset_type.value, f"{path}/{child.name}")
                    log.append(
                        f"[DRY-RUN] WOULD CREATE {child.asset_type.value}: {path}/{child.name}"
                    )
                    self.manifest.upsert(
                        ManifestEntry(
                            key=child_key,
                            asset_type=child.asset_type.value,
                            name=child.name,
                            status="PLANNED",
                        )
                    )

        root = spec.root_folder_name
        root_key = make_key("folder", root)
        log.append(f"[DRY-RUN] WOULD CREATE root folder: {root}")
        self.manifest.upsert(
            ManifestEntry(key=root_key, asset_type="folder", name=root, status="PLANNED")
        )
        for child in spec.children:
            if hasattr(child, "children"):
                _process_folder(root, child)
            else:
                child_key = make_key(child.asset_type.value, f"{root}/{child.name}")
                log.append(f"[DRY-RUN] WOULD CREATE {child.asset_type.value}: {root}/{child.name}")
                self.manifest.upsert(
                    ManifestEntry(
                        key=child_key,
                        asset_type=child.asset_type.value,
                        name=child.name,
                        status="PLANNED",
                    )
                )

        return log

    def create_folder(self, name: str, parent_id: str | None = None) -> str:
        """BLOCKED IN PHASE 1."""
        if not self.dry_run:
            raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
        raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
