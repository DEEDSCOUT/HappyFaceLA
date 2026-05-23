"""
Happy Faces LA — Commercial Control Room
Google Docs provisioner.

PHASE 1: Dry-run stub only.
The future live implementation will use Docs API batchUpdate to:
- Create documents with structured heading sections.
- Apply named styles (HEADING_1 through HEADING_6).
- Insert placeholder body text and draft banners.
- Set document title metadata.
"""

from __future__ import annotations

import logging

from hfla_control_room.constants import PHASE_1_BLOCK_MESSAGE
from hfla_control_room.manifest import Manifest, ManifestEntry, make_key
from hfla_control_room.models import DocumentSpec

logger = logging.getLogger(__name__)


class DocsProvisioner:
    """Provisions Google Docs documents.

    In Phase 1, all methods operate in dry-run mode only.
    """

    def __init__(self, manifest: Manifest, dry_run: bool = True) -> None:
        if not dry_run:
            raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
        self.manifest = manifest
        self.dry_run = dry_run

    def provision_document(self, spec: DocumentSpec) -> list[str]:
        """Simulate document creation.  Returns operation log lines."""
        log: list[str] = []
        key = make_key("doc", spec.document_name)
        existing = self.manifest.get(key)
        if existing and existing.google_id:
            log.append(
                f"[DRY-RUN] SKIP_EXISTING doc: {spec.document_name} "
                f"(id={existing.google_id})"
            )
        else:
            log.append(
                f"[DRY-RUN] WOULD CREATE doc: {spec.document_name} "
                f"[{spec.classification.value}] "
                f"status={spec.initial_status}"
            )
            self.manifest.upsert(
                ManifestEntry(
                    key=key,
                    asset_type=spec.asset_type.value,
                    name=spec.document_name,
                    status="PLANNED",
                )
            )
        if spec.draft_banner:
            log.append(
                f"[DRY-RUN]   WOULD INSERT draft banner: "
                f'"{spec.draft_banner[:80]}…"'
            )
        for section in spec.sections:
            log.append(
                f"[DRY-RUN]   WOULD INSERT HEADING_{section.level}: {section.heading}"
            )
        return log

    def create_document(self, title: str) -> str:
        """BLOCKED IN PHASE 1."""
        raise RuntimeError(PHASE_1_BLOCK_MESSAGE)

    def batch_update(self, document_id: str, requests: list[dict]) -> dict:
        """BLOCKED IN PHASE 1."""
        raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
