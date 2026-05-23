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

Phase 1D idempotency contract (live Google provisioning):

1. Asset keys are derived deterministically from asset type and name via
   :func:`make_key`; the same controlled spec always produces the same keys.
2. Before creating any Drive asset, the live provisioner MUST:
     a. consult the manifest for an entry under the deterministic key, AND
     b. if absent, search Drive within the controlled parent folder for a
        controlled-asset match (by name + parent + mimeType).
3. If exactly one match is found in Drive but the manifest is missing the
   entry, the provisioner reuses that asset and records its
   ``google_id`` in the manifest (the manifest is a cache/receipt, never the
   source of truth).
4. If multiple Drive matches are found, the provisioner FAILS CLOSED with a
   blocking error.  It MUST NOT guess, deduplicate, or delete.
5. The provisioner NEVER deletes assets in the initial release; superseded
   assets are flagged ``SUPERSEDED`` in the manifest and left untouched.
6. The persisted Google asset id is stored under the canonical field name
   ``google_id`` (NOT ``drive_id`` — that legacy field name is unsupported).
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


# ---------------------------------------------------------------------------
# Deterministic asset key registry
# Phase 2 live provisioner MUST use these keys for idempotency lookup.
# ---------------------------------------------------------------------------

_GOVERNANCE_SHEET_NAME = "HF-LA Commercial Policy & Channel Governance Master"
_RESTRICTED_SHEET_NAME = "HF-LA Leads, Quotes, Bookings & Profitability Control"
_RELEASE_BRIEF_NAME = "TEMPLATE — Website Ads AI Implementation Release Brief"
_ROOT_FOLDER_NAME = "Happy Faces LA — Commercial Control Room"

ASSET_KEYS: dict[str, str] = {
    "root_control_room_folder":     make_key("folder",   _ROOT_FOLDER_NAME),
    "active_governance_folder":     make_key("folder",   "00_ACTIVE_GOVERNANCE"),
    "governance_master_sheet":      make_key("sheet",    _GOVERNANCE_SHEET_NAME),
    "active_policy_manual_doc":     make_key("doc",      "HF-LA Active Commercial Policy Manual"),
    "restricted_operations_folder": make_key("folder",   "01_RESTRICTED_OPERATIONS_PII"),
    "restricted_operations_sheet":  make_key("sheet",    _RESTRICTED_SHEET_NAME),
    "release_packages_folder":      make_key("folder",   "02_RELEASE_PACKAGES"),
    "release_brief_template_doc":   make_key("template", _RELEASE_BRIEF_NAME),
    "source_evidence_folder":       make_key("folder",   "03_SOURCE_EVIDENCE_COMPLIANCE"),
    "archive_folder":               make_key("folder",   "99_ARCHIVE_SUPERSEDED"),
}
