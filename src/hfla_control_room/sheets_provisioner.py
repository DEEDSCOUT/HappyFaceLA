"""
Happy Faces LA — Commercial Control Room
Google Sheets provisioner.

PHASE 1: Dry-run stub only.
The future live implementation will use Sheets API v4 batchUpdate to:
- Create spreadsheets with named tabs.
- Apply column headers, frozen rows, filters.
- Set data validation (dropdown lists, date constraints, number ranges).
- Apply conditional formatting.
- Set protected ranges for formula-driven columns.
- Write banners to header rows.
"""

from __future__ import annotations

import logging

from hfla_control_room.constants import PHASE_1_BLOCK_MESSAGE
from hfla_control_room.manifest import Manifest, ManifestEntry, make_key
from hfla_control_room.models import WorkbookSpec

logger = logging.getLogger(__name__)


class SheetsProvisioner:
    """Provisions Google Sheets workbooks.

    In Phase 1, all methods operate in dry-run mode only.
    """

    def __init__(self, manifest: Manifest, dry_run: bool = True) -> None:
        if not dry_run:
            raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
        self.manifest = manifest
        self.dry_run = dry_run

    def provision_workbook(self, spec: WorkbookSpec) -> list[str]:
        """Simulate workbook and tab creation.  Returns operation log lines."""
        log: list[str] = []
        key = make_key("sheet", spec.spreadsheet_name)
        existing = self.manifest.get(key)
        if existing and existing.google_id:
            log.append(
                f"[DRY-RUN] SKIP_EXISTING sheet: {spec.spreadsheet_name} (id={existing.google_id})"
            )
        else:
            log.append(f"[DRY-RUN] WOULD CREATE sheet: {spec.spreadsheet_name}")
            self.manifest.upsert(
                ManifestEntry(
                    key=key,
                    asset_type="sheet",
                    name=spec.spreadsheet_name,
                    status="PLANNED",
                )
            )

        for tab in spec.tabs:
            tab_key = make_key("tab", f"{spec.spreadsheet_name}:{tab.title}")
            log.append(
                f"[DRY-RUN]   WOULD CREATE tab: '{tab.title}' "
                f"(cols={len(tab.column_headers)}, "
                f"frozen={tab.frozen_row_count}, "
                f"sensitivity={tab.sensitivity.value})"
            )
            self.manifest.upsert(
                ManifestEntry(
                    key=tab_key,
                    asset_type="tab",
                    name=tab.title,
                    status="PLANNED",
                )
            )
            if tab.banner_content:
                log.append(
                    f"[DRY-RUN]     WOULD SET banner [{tab.banner_severity.value}]: "
                    f'"{tab.banner_content[:60]}…"'
                )
            if tab.protected_formula_columns:
                log.append(
                    f"[DRY-RUN]     WOULD PROTECT formula columns: "
                    f"{tab.protected_formula_columns}"
                )
            if tab.data_validation_rules:
                log.append(
                    f"[DRY-RUN]     WOULD APPLY {len(tab.data_validation_rules)} "
                    "validation rule(s)."
                )
            if tab.conditional_formatting_rules:
                log.append(
                    f"[DRY-RUN]     WOULD APPLY "
                    f"{len(tab.conditional_formatting_rules)} conditional format(s)."
                )

        return log

    def create_spreadsheet(self, name: str) -> str:
        """BLOCKED IN PHASE 1."""
        raise RuntimeError(PHASE_1_BLOCK_MESSAGE)

    def batch_update(self, spreadsheet_id: str, requests: list[dict]) -> dict:
        """BLOCKED IN PHASE 1."""
        raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
