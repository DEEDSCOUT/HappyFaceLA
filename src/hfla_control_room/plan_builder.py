"""
Happy Faces LA — Commercial Control Room
Dry-run build plan generator.

Produces a deterministic JSON + Markdown plan of all assets that the live
provisioner *would* create, without touching any Google API.

Determinism contract (Phase 1B.1):

- The tracked plan artifacts (``control_room_build_plan.json`` and
  ``control_room_build_plan.md``) must be byte-identical for unchanged
  configuration.  They MUST NOT include any current timestamp.
- Each tracked snapshot embeds a SHA-256 ``spec_fingerprint`` computed over
  the canonical serialised plan body (operations + sorted seed/evidence IDs).
- All run-time receipts (when the plan was last regenerated, by whom, with
  which exit code) belong under ``.runtime/audit/last_plan_run.json`` only.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from hfla_control_room.constants import (
    GOVERNANCE_DESTINATION_TABS,
    PLAN_SCHEMA_VERSION,
    SPEC_FINGERPRINT_ALGORITHM,
    AssetType,
)
from hfla_control_room.models import FullConfigSpec

logger = logging.getLogger(__name__)


# Controlled vocabulary of plan operation types.
# Any operation written into the plan MUST use one of these exact op strings.
PLAN_OPERATION_TYPES: frozenset[str] = frozenset(
    {
        "CREATE_FOLDER",
        "CREATE_SPREADSHEET_FILE",
        "CREATE_DOCUMENT_FILE",
        "CONFIGURE_SPREADSHEET",
        "CONFIGURE_DOCUMENT",
        "POPULATE_RULE_REGISTER",
        "POPULATE_SOURCE_EVIDENCE",
        "POPULATE_OPEN_BLOCKERS",
        "POPULATE_CHANNEL_PROJECTION_REGISTER",
        "POPULATE_RELEASE_CHANGELOG",
        "DERIVE_ACTIVE_RULES_EXPORT",
        "DERIVE_PUBLIC_PRICING_PACKAGES",
        "DERIVE_CUSTOMER_CHATBOT_RESPONSE_MATRIX",
        "DERIVE_COPILOT_INTERNAL_GUIDANCE_EXPORT",
    }
)

_POPULATE_OPS: frozenset[str] = frozenset(
    {
        "POPULATE_RULE_REGISTER",
        "POPULATE_SOURCE_EVIDENCE",
        "POPULATE_OPEN_BLOCKERS",
        "POPULATE_CHANNEL_PROJECTION_REGISTER",
        "POPULATE_RELEASE_CHANGELOG",
    }
)

_DERIVE_OPS: frozenset[str] = frozenset(
    {
        "DERIVE_ACTIVE_RULES_EXPORT",
        "DERIVE_PUBLIC_PRICING_PACKAGES",
        "DERIVE_CUSTOMER_CHATBOT_RESPONSE_MATRIX",
        "DERIVE_COPILOT_INTERNAL_GUIDANCE_EXPORT",
    }
)


def _utcnow() -> str:
    return datetime.now(tz=UTC).isoformat(timespec="seconds")


def _compute_spec_fingerprint(spec: FullConfigSpec, plan_body: dict[str, Any]) -> str:
    """Return a deterministic SHA-256 hex digest covering BOTH the resolved
    spec inputs and the plan body.

    Phase 1B.2: the fingerprint MUST change whenever any controlled spec input
    changes — even when the operation count is unchanged.  In particular,
    mutating a single rule's ``draft_recommendation`` text, an evidence
    record's ``verified_fact`` text, or any blocker / projection field MUST
    flip the fingerprint, because those values feed Phase 1C downstream
    consumers (CEO review, channel projection, public derived views).

    The fingerprint is computed over the full Pydantic JSON dump of the
    resolved :class:`FullConfigSpec` (excluding the loose ``raw`` mirror)
    combined with the canonical serialised plan body.  Keys are sorted; no
    whitespace variation; no timestamp content.
    """
    spec_payload = spec.model_dump(mode="json")  # ``raw`` is excluded via Field(exclude=True)
    composite = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "spec": spec_payload,
        "plan_body": plan_body,
    }
    canonical = json.dumps(composite, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_plan(spec: FullConfigSpec) -> dict[str, Any]:
    """Generate a deterministic dry-run plan dict from *spec*.

    The returned plan is timestamp-free.  Identical *spec* input always
    produces a byte-identical serialisation.
    """
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

    # --- Data-population operations (Phase 1B.1) ---
    #
    # These operations document how seed records map to controlled
    # governance-workbook tabs.  They are deterministic; no live API call is
    # made.  The actual population is performed by the Phase 1D provisioner.
    governance_sheet_name = spec.governance_workbook.spreadsheet_name

    operations.append(
        {
            "op": "POPULATE_RULE_REGISTER",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "03_RULE_REGISTER_MASTER",
            "source": "config/seed_data/*.yaml (rules)",
            "record_count": len(spec.seed_rules),
            "rule_ids": sorted(r.rule_id for r in spec.seed_rules),
            "is_derived_view": False,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "POPULATE_SOURCE_EVIDENCE",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "12_SOURCE_EVIDENCE",
            "source": "config/seed_data/source_evidence.yaml (evidence_records)",
            "record_count": len(spec.evidence_records),
            "evidence_ids": sorted(e.evidence_id for e in spec.evidence_records),
            "is_derived_view": False,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "POPULATE_OPEN_BLOCKERS",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "02_OPEN_BLOCKERS",
            "source": "config/seed_data/blocker_placeholders.yaml (blocker_records)",
            "record_count": len(spec.blocker_records),
            "blocker_ids": sorted(b.blocker_id for b in spec.blocker_records),
            "is_derived_view": False,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "POPULATE_CHANNEL_PROJECTION_REGISTER",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "10_CHANNEL_PROJECTION_REGISTER",
            "source": (
                "config/seed_data/channel_projection_placeholders.yaml "
                "(channel_projection_records)"
            ),
            "record_count": len(spec.channel_projection_records),
            "projection_ids": sorted(
                p.projection_id for p in spec.channel_projection_records
            ),
            "is_derived_view": False,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "POPULATE_RELEASE_CHANGELOG",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "13_RELEASE_CHANGELOG",
            "source": (
                "config/seed_data/release_placeholders.yaml (release_records)"
            ),
            "record_count": len(spec.release_records),
            "release_ids": sorted(r.release_id for r in spec.release_records),
            "is_derived_view": False,
            "live_action": False,
        }
    )

    # --- Derived-view operations ---
    #
    # Derived tabs are populated by formula / query / filter logic from
    # 03_RULE_REGISTER_MASTER and 10_CHANNEL_PROJECTION_REGISTER.  They are
    # NOT independently maintained copies of policy text; that is a governance
    # violation (single-source-of-truth).  ``02_OPEN_BLOCKERS`` is now a
    # POPULATE target (its rows are first-class ``BlockerRecord`` data) and
    # is no longer a DERIVE_* output.
    operations.append(
        {
            "op": "DERIVE_ACTIVE_RULES_EXPORT",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "04_ACTIVE_RULES_EXPORT",
            "source_tab": "03_RULE_REGISTER_MASTER",
            "derivation": (
                "FILTER where status in (APPROVED_AS_RECOMMENDED,"
                " APPROVED_WITH_CONDITIONS) AND ceo_decision is non-empty"
            ),
            "is_derived_view": True,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "DERIVE_PUBLIC_PRICING_PACKAGES",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "05_PUBLIC_PRICING_PACKAGES",
            "source_tab": "03_RULE_REGISTER_MASTER",
            "derivation": (
                "FILTER where rule_category=PUBLIC_PRICING AND"
                " public_safe_review_status=APPROVED_PUBLIC_SAFE"
            ),
            "is_derived_view": True,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "DERIVE_CUSTOMER_CHATBOT_RESPONSE_MATRIX",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "11_AI_CUSTOMER_RESPONSE_MATRIX",
            "source_tab": "10_CHANNEL_PROJECTION_REGISTER",
            "derivation": (
                "FILTER where channel=CUSTOMER_CHATBOT_PUBLIC AND"
                " release_status=APPROVED_FOR_RELEASE"
            ),
            "is_derived_view": True,
            "live_action": False,
        }
    )

    operations.append(
        {
            "op": "DERIVE_COPILOT_INTERNAL_GUIDANCE_EXPORT",
            "asset_type": AssetType.SHEET.value,
            "name": governance_sheet_name,
            "target_tab": "04_ACTIVE_RULES_EXPORT",
            "source_tab": "10_CHANNEL_PROJECTION_REGISTER",
            "derivation": (
                "FILTER where channel=COPILOT_INTERNAL_DECISION_SUPPORT AND"
                " release_status=APPROVED_FOR_RELEASE"
            ),
            "is_derived_view": True,
            "live_action": False,
        }
    )

    plan_body: dict[str, Any] = {
        "plan_metadata": {
            "phase": "PHASE_1_DRY_RUN",
            "plan_schema_version": PLAN_SCHEMA_VERSION,
            "spec_fingerprint_algorithm": SPEC_FINGERPRINT_ALGORITHM,
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
            "populate_operation_count": sum(
                1 for o in operations if o["op"] in _POPULATE_OPS
            ),
            "derive_operation_count": sum(
                1 for o in operations if o["op"] in _DERIVE_OPS
            ),
            "data_population": {
                "rule_record_count": len(spec.seed_rules),
                "evidence_record_count": len(spec.evidence_records),
                "blocker_record_count": len(spec.blocker_records),
                "channel_projection_record_count": len(spec.channel_projection_records),
                "release_record_count": len(spec.release_records),
            },
            "authorized_workspace": r"C:\Dev\happyfacesla-commercial-control-room",
        },
        "operations": operations,
    }

    # Compute fingerprint AFTER plan_body is fully assembled (excluding itself).
    plan_body["plan_metadata"]["spec_fingerprint"] = _compute_spec_fingerprint(
        spec, plan_body
    )

    meta = plan_body["plan_metadata"]
    logger.info(
        "Dry-run plan generated: %d operations "
        "(%d folders, %d spreadsheet files, %d document files, "
        "%d sheet configs, %d doc configs, %d populate, %d derive); "
        "spec_fingerprint=%s",
        meta["operation_count"],
        meta["folder_count"],
        meta["spreadsheet_asset_count"],
        meta["document_asset_count"],
        meta["sheet_configuration_count"],
        meta["document_configuration_count"],
        meta["populate_operation_count"],
        meta["derive_operation_count"],
        meta["spec_fingerprint"][:12],
    )
    return plan_body


def write_plan(plan: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    """Write plan as JSON and Markdown to *output_dir*.

    The written content is fully deterministic: identical plan input yields
    byte-identical output.  No timestamp, run id, or environment-specific
    value is written into these files.

    Returns ``(json_path, md_path)``.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "control_room_build_plan.json"
    md_path = output_dir / "control_room_build_plan.md"

    # Trailing newline keeps the file POSIX-friendly and consistent with the
    # markdown writer, ensuring a deterministic last byte.
    json_path.write_text(
        json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    logger.info("Plan JSON written: %s", json_path)

    pm = plan["plan_metadata"]
    md_lines = [
        "# Happy Faces LA — Commercial Control Room Dry-Run Build Plan",
        "",
        f"**Phase:** {pm['phase']}  ",
        f"**Spec fingerprint (SHA-256):** `{pm['spec_fingerprint']}`  ",
        f"**Live Google API calls:** {pm['live_google_calls']}  ",
        f"**Total operations:** {pm['operation_count']}  ",
        "",
        "> This file is a deterministic snapshot.  The same configuration always",
        "> produces a byte-identical file.  Run-time timestamps and receipts are",
        "> written separately under `.runtime/audit/last_plan_run.json`.",
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
        f"| POPULATE_* | {pm['populate_operation_count']} |",
        f"| DERIVE_* | {pm['derive_operation_count']} |",
        "",
        "## Operations",
        "",
    ]

    for i, op in enumerate(plan["operations"], start=1):
        md_lines.append(f"### {i}. `{op['op']}` — {op['name']}")
        md_lines.append("")
        for k in sorted(k for k in op if k not in ("op", "name")):
            v = op[k]
            if isinstance(v, list):
                md_lines.append(f"- **{k}:** {', '.join(str(x) for x in v)}")
            else:
                md_lines.append(f"- **{k}:** {v}")
        md_lines.append("")

    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    logger.info("Plan Markdown written: %s", md_path)

    return json_path, md_path


def write_plan_runtime_receipt(plan: dict[str, Any], receipt_path: Path) -> Path:
    """Write a run-time receipt of plan generation under ``.runtime/audit/``.

    The receipt is *intentionally* non-deterministic — it carries the wall-clock
    timestamp of the run so operators can audit when the plan was last
    regenerated, while keeping the tracked snapshot byte-stable.
    """
    receipt = {
        "phase": plan["plan_metadata"]["phase"],
        "spec_fingerprint": plan["plan_metadata"]["spec_fingerprint"],
        "operation_count": plan["plan_metadata"]["operation_count"],
        "generated_at_utc": _utcnow(),
        "live_google_calls": False,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    logger.info("Plan runtime receipt written: %s", receipt_path)
    return receipt_path


def validate_plan_destination_tabs(plan: dict[str, Any]) -> list[str]:
    """Return violation messages for any plan operation that targets an unknown
    governance destination tab.

    Operations carrying a ``target_tab`` or ``source_tab`` field must reference
    a tab present in :data:`hfla_control_room.constants.GOVERNANCE_DESTINATION_TABS`.
    """
    errors: list[str] = []
    for op in plan["operations"]:
        for key in ("target_tab", "source_tab"):
            value = op.get(key)
            if value is not None and value not in GOVERNANCE_DESTINATION_TABS:
                errors.append(
                    f"Operation '{op['op']}' references unknown governance tab "
                    f"({key}='{value}')."
                )
    return errors

