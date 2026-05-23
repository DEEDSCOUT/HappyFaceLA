"""
Happy Faces LA — Commercial Control Room
Asset manifest — deterministic IDs and idempotency tracking.

The manifest records folder, sheet, and document IDs returned by Google APIs
in the live provisioner.  In Phase 1 it is a typed stub only.

Design:
- Each asset has a deterministic key derived from its name and type.
- On each run, the provisioner reads the manifest first.
- If an asset key is already present, the provisioner skips creation.
- Deletion is not supported in the initial release.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ManifestEntry(BaseModel):
    key: str
    asset_type: str
    name: str
    google_id: str | None = None
    created_at_utc: str | None = None
    last_updated_utc: str | None = None
    status: str = "PLANNED"  # PLANNED | CREATED | VERIFIED | SKIPPED_EXISTING


class Manifest(BaseModel):
    phase: str = "PHASE_1_DRY_RUN"
    generated_at_utc: str = Field(
        default_factory=lambda: datetime.now(tz=UTC).isoformat(timespec="seconds")
    )
    entries: list[ManifestEntry] = Field(default_factory=list)

    def get(self, key: str) -> ManifestEntry | None:
        for entry in self.entries:
            if entry.key == key:
                return entry
        return None

    def upsert(self, entry: ManifestEntry) -> None:
        for i, existing in enumerate(self.entries):
            if existing.key == entry.key:
                self.entries[i] = entry
                return
        self.entries.append(entry)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2), encoding="utf-8")
        logger.info("Manifest saved: %s (%d entries)", path, len(self.entries))

    @classmethod
    def load(cls, path: Path) -> Manifest:
        if not path.exists():
            logger.info("No manifest found at %s — starting fresh.", path)
            return cls()
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        return cls.model_validate(data)


def make_key(asset_type: str, name: str) -> str:
    """Produce a deterministic, stable key for an asset."""
    safe_name = name.lower().replace(" ", "_").replace("/", "-")
    return f"{asset_type}:{safe_name}"
