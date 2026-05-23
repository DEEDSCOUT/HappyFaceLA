"""
Happy Faces LA — Commercial Control Room
Dry-run build plan generator.

Produces a deterministic JSON + Markdown plan of all assets that the live
provisioner *would* create, without touching any Google API.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from hfla_control_room.constants import AssetType
from hfla_control_room.models import FullConfigSpec

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(tz=UTC).isoformat(timespec="seconds")


def build_plan(spec: FullConfigSpec) -> dict[str, Any]:
    """Generate a deterministic dry-run plan dict from *spec*."""
    operations: list[dict[str, Any]] = []

    # --- Drive folder hierarchy ---
    def _add_folder(parent: str, folder: Any) -> None:
        path = f"{parent}/{folder.name}" if parent else folder.name
        operations.append(
            {
                "op": "CREATE_FOLDER",
                "asset_type": AssetType.FOLDER.value,
                "name": folder.name,
                "path": path,
                "classification": folder.classification.value,
                "live_action": False,
            }
        )
        for child in getattr(folder, "children", []):
            if hasattr(child, "children"):
                _add_folder(path, child)
            else:
                # Assets in the folder tree — CREATE_SPREADSHEET_FILE or CREATE_DOCUMENT_FILE
                if child.asset_type.value == AssetType.SHEET.value:
                    op = "CREATE_SPREADSHEET_FILE"
                else:
                    op = "CREATE_DOCUMENT_FILE"
                operations.append(
                    {
                        "op": op,
                        "asset_type": child.asset_type.value,
                        "name": child.name,
                        "path": f"{path}/{child.name}",
                        "classification": child.classification.value,
                        "live_action": False,
                    }
                )

    root_name = spec.drive_structure.root_folder_name
    operations.append(
        {
            "op": "CREATE_FOLDER",
            "asset_type": AssetType.FOLDER.value,
            "name": root_name,
            "path": root_name,
            "classification": "INTERNAL_CONTROLLED",
            "live_action": False,
        }
    )
    for child in spec.drive_structure.children:
        if hasattr(child, "children"):
            _add_folder(root_name, child)
        else:
            if child.asset_type.value == AssetType.SHEET.value:
                op = "CREATE_SPREADSHEET_FILE"
            else:
                op = "CREATE_DOCUMENT_FILE"
            operations.append(
                {
                    "op": op,
                    "asset_type": child.asset_type.value,
                    "name": child.name,
                    "path": f"{root_name}/{child.name}",
                    "classification": child.classification.value,
                    "live_action": False,
                }
            )

    # --- Governance workbook: CONFIGURE_SPREADSHEET (tabs/formatting) ---
    operations.append(
        {
            "op": "CONFIGURE_SPREADSHEET",
            "asset_type": AssetType.SHEET.value,
            "name": spec.governance_workbook.spreadsheet_name,
            "classification": spec.governance_workbook.classification.value,
            "tab_count": len(spec.governance_workbook.tabs),
            "tab_titles": [t.title for t in spec.governance_workbook.tabs],
            "live_action": False,
        }
    )

    # --- Restricted operations workbook: CONFIGURE_SPREADSHEET ---
    operations.append(
        {
            "op": "CONFIGURE_SPREADSHEET",
            "asset_type": AssetType.SHEET.value,
            "name": spec.restricted_operations_workbook.spreadsheet_name,
            "classification": spec.restricted_operations_workbook.classification.value,
            "tab_count": len(spec.restricted_operations_workbook.tabs),
            "tab_titles": [t.title for t in spec.restricted_operations_workbook.tabs],
            "live_action": False,
        }
    )

    # --- Documents: CONFIGURE_DOCUMENT ---
    for doc in spec.documents:
        operations.append(
            {
                "op": "CONFIGURE_DOCUMENT",
                "asset_type": doc.asset_type.value,
                "name": doc.document_name,
                "classification": doc.classification.value,
                "initial_status": doc.initial_status,
                "section_count": len(doc.sections),
                "section_headings": [s.heading for s in doc.sections],
                "live_action": False,
            }
        )

    plan = {
        "plan_metadata": {
            "phase": "PHASE_1_DRY_RUN",
            "generated_at_utc": _utcnow(),
            "live_google_calls": False,
            "operation_count": len(operations),
            "folder_count": sum(1 for o in operations if o["op"] == "CREATE_FOLDER"),
            "spreadsheet_asset_count": sum(
                1 for o in operations if o["op"] == "CREATE_SPREADSHEET_FILE"
            ),
            "document_asset_count": sum(
                1 for o in operations if o["op"] == "CREATE_DOCUMENT_FILE"
            ),
            "sheet_configuration_count": sum(
                1 for o in operations if o["op"] == "CONFIGURE_SPREADSHEET"
            ),
            "document_configuration_count": sum(
                1 for o in operations if o["op"] == "CONFIGURE_DOCUMENT"
            ),
            "authorized_workspace": r"C:\Dev\happyfacesla-commercial-control-room",
        },
        "operations": operations,
    }
    meta = plan["plan_metadata"]
    logger.info(
        "Dry-run plan generated: %d operations "
        "(%d folders, %d spreadsheet files, %d document files, "
        "%d sheet configs, %d doc configs).",
        meta["operation_count"],
        meta["folder_count"],
        meta["spreadsheet_asset_count"],
        meta["document_asset_count"],
        meta["sheet_configuration_count"],
        meta["document_configuration_count"],
    )
    return plan


def write_plan(plan: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    """Write plan as JSON and Markdown to *output_dir*.  Returns (json_path, md_path)."""
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "control_room_build_plan.json"
    md_path = output_dir / "control_room_build_plan.md"

    json_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    logger.info("Plan JSON written: %s", json_path)

    pm = plan["plan_metadata"]
    md_lines = [
        "# Happy Faces LA — Commercial Control Room Dry-Run Build Plan",
        "",
        f"**Phase:** {pm['phase']}  ",
        f"**Generated (UTC):** {pm['generated_at_utc']}  ",
        f"**Live Google API calls:** {pm['live_google_calls']}  ",
        f"**Total operations:** {pm['operation_count']}  ",
        "",
        "## Summary",
        "",
        "| Operation Type | Count |",
        "|---|---|",
        f"| CREATE_FOLDER | {pm['folder_count']} |",
        f"| CREATE_SPREADSHEET_FILE | {pm['spreadsheet_asset_count']} |",
        f"| CREATE_DOCUMENT_FILE | {pm['document_asset_count']} |",
        f"| CONFIGURE_SPREADSHEET | {pm['sheet_configuration_count']} |",
        f"| CONFIGURE_DOCUMENT | {pm['document_configuration_count']} |",
        "",
        "## Operations",
        "",
    ]

    for i, op in enumerate(plan["operations"], start=1):
        md_lines.append(f"### {i}. `{op['op']}` — {op['name']}")
        md_lines.append("")
        for k, v in op.items():
            if k not in ("op", "name"):
                if isinstance(v, list):
                    md_lines.append(f"- **{k}:** {', '.join(str(x) for x in v)}")
                else:
                    md_lines.append(f"- **{k}:** {v}")
        md_lines.append("")

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    logger.info("Plan Markdown written: %s", md_path)

    return json_path, md_path
