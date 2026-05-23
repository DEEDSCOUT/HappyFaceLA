"""
Happy Faces LA — Commercial Control Room
Audit report generator.

Produces a post-run receipt listing every asset that was created,
updated, or skipped during a provisioning run.

In Phase 1 the report reflects dry-run planned operations only.
In future live phases it will record actual Google resource IDs.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from hfla_control_room.manifest import Manifest

logger = logging.getLogger(__name__)


def generate_audit_report(
    manifest: Manifest,
    operation_log: list[str],
    output_path: Path,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Generate an audit receipt and write it to *output_path*.

    Args:
        manifest: The current manifest (may contain PLANNED or CREATED entries).
        operation_log: Ordered log lines from all provisioners.
        output_path: Where to write the JSON receipt.
        dry_run: True if no live API calls were made.

    Returns:
        The report dict (also written to disk).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    entries_by_status: dict[str, list[dict[str, Any]]] = {}
    for entry in manifest.entries:
        entries_by_status.setdefault(entry.status, []).append(
            {
                "key": entry.key,
                "name": entry.name,
                "asset_type": entry.asset_type,
                "google_id": entry.google_id,
            }
        )

    report: dict[str, Any] = {
        "report_metadata": {
            "generated_at_utc": datetime.now(tz=UTC).isoformat(timespec="seconds"),
            "phase": "PHASE_1_DRY_RUN",
            "dry_run": dry_run,
            "live_google_mutations": False,
            "total_manifest_entries": len(manifest.entries),
        },
        "entries_by_status": entries_by_status,
        "operation_log": operation_log,
    }

    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info("Audit report written: %s", output_path)
    return report
