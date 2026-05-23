"""
Happy Faces LA — Commercial Control Room
CLI entry point (Typer).

Commands:
  validate           Validate all YAML configuration specs.
  plan               Generate a dry-run build plan.
  validate-release   Validate a future approved export payload.
  provision          Provision scaffold (dry-run only in Phase 1;
                     --apply is BLOCKED).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import typer

from hfla_control_room.constants import (
    AUDIT_REPORT_PATH,
    LAST_PLAN_RUN_PATH,
    MANIFEST_PATH,
    PHASE_1_BLOCK_MESSAGE,
)
from hfla_control_room.validation import assert_authorized_workspace

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

app = typer.Typer(
    name="hfla-control-room",
    help="Happy Faces LA — Commercial Control Room provisioner (Phase 1 dry-run).",
    no_args_is_help=True,
)


@app.command()
def validate(
    config: Path = typer.Option(  # noqa: B008
        ..., "--config", "-c", help="Path to the config/ directory.", exists=True, file_okay=False
    ),
) -> None:
    """Validate all YAML specification files in CONFIG."""
    assert_authorized_workspace()

    from hfla_control_room.spec_loader import load_full_spec
    from hfla_control_room.validation import validate_full_spec

    typer.echo(f"Loading configuration from: {config.resolve()}")
    spec = load_full_spec(config)
    errors = validate_full_spec(spec)

    if errors:
        typer.secho("VALIDATION FAILED:", fg=typer.colors.RED, bold=True)
        for err in errors:
            typer.secho(f"  ✗ {err}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    typer.secho("VALIDATION PASSED.", fg=typer.colors.GREEN, bold=True)
    typer.echo(
        f"  Governance workbook: {spec.governance_workbook.spreadsheet_name} "
        f"({len(spec.governance_workbook.tabs)} tabs)"
    )
    typer.echo(
        f"  Restricted workbook: {spec.restricted_operations_workbook.spreadsheet_name} "
        f"({len(spec.restricted_operations_workbook.tabs)} tabs)"
    )
    typer.echo(f"  Documents: {len(spec.documents)}")
    typer.echo(f"  Seed rules: {len(spec.seed_rules)} (all DRAFT — no approved rules in Phase 1)")


@app.command()
def plan(
    config: Path = typer.Option(  # noqa: B008
        ..., "--config", "-c", help="Path to the config/ directory.", exists=True, file_okay=False
    ),
    output: Path = typer.Option(  # noqa: B008
        Path("artifacts/dry_run"), "--output", "-o", help="Output directory for plan files."
    ),
) -> None:
    """Generate a dry-run build plan from CONFIG and write to OUTPUT."""
    assert_authorized_workspace()

    from hfla_control_room.plan_builder import (
        build_plan,
        validate_plan_destination_tabs,
        write_plan,
        write_plan_runtime_receipt,
    )
    from hfla_control_room.spec_loader import load_full_spec

    typer.echo(f"Loading configuration from: {config.resolve()}")
    spec = load_full_spec(config)
    plan_data = build_plan(spec)

    tab_errors = validate_plan_destination_tabs(plan_data)
    if tab_errors:
        typer.secho("PLAN DESTINATION TAB VALIDATION FAILED:", fg=typer.colors.RED, bold=True)
        for err in tab_errors:
            typer.secho(f"  ✗ {err}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    json_path, md_path = write_plan(plan_data, output)
    receipt_path = write_plan_runtime_receipt(plan_data, LAST_PLAN_RUN_PATH)

    typer.secho("DRY-RUN PLAN GENERATED.", fg=typer.colors.GREEN, bold=True)
    typer.echo(f"  JSON:    {json_path}")
    typer.echo(f"  Markdown:{md_path}")
    typer.echo(f"  Receipt: {receipt_path}")
    meta = plan_data["plan_metadata"]
    typer.echo(
        f"  Operations: {meta['operation_count']}  "
        f"(folders={meta['folder_count']}, "
        f"spreadsheet_files={meta['spreadsheet_asset_count']}, "
        f"spreadsheet_configs={meta['sheet_configuration_count']}, "
        f"document_files={meta['document_asset_count']}, "
        f"document_configs={meta['document_configuration_count']}, "
        f"populate={meta['populate_operation_count']}, "
        f"derive={meta['derive_operation_count']})"
    )
    typer.echo(f"  Spec fingerprint: {meta['spec_fingerprint']}")
    typer.echo("  Live Google API calls: FALSE")


@app.command(name="validate-release")
def validate_release(
    input: Path = typer.Option(  # noqa: B008
        ..., "--input", "-i", help="Path to a release export JSON file to validate.", exists=True
    ),
) -> None:
    """Validate a future approved-rules export payload at INPUT."""
    assert_authorized_workspace()

    from hfla_control_room.models import RuleRow
    from hfla_control_room.validation import (
        validate_no_pii_in_export,
        validate_rules_batch,
    )

    raw = json.loads(input.read_text(encoding="utf-8"))
    rules_raw = raw.get("rules", raw.get("approved_rules", []))
    rules = [RuleRow.model_validate(r) for r in rules_raw]

    errors = validate_rules_batch(rules)
    pii_violations = validate_no_pii_in_export(rules)

    all_ok = not errors and not pii_violations
    if not all_ok:
        typer.secho("RELEASE VALIDATION FAILED:", fg=typer.colors.RED, bold=True)
        for rule_id, errs in errors.items():
            for err in errs:
                typer.secho(f"  ✗ [{rule_id}] {err}", fg=typer.colors.RED)
        for v in pii_violations:
            typer.secho(f"  ✗ [PII] {v}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    typer.secho("RELEASE VALIDATION PASSED.", fg=typer.colors.GREEN, bold=True)
    typer.echo(f"  Rules validated: {len(rules)}")
    typer.echo("  PII violations: 0")


@app.command()
def provision(
    config: Path = typer.Option(  # noqa: B008
        ..., "--config", "-c", help="Path to the config/ directory.", exists=True, file_okay=False
    ),
    dry_run: bool = typer.Option(  # noqa: B008
        False, "--dry-run", help="Simulate provisioning without calling Google APIs."
    ),
    apply: bool = typer.Option(  # noqa: B008
        False, "--apply", help="[BLOCKED IN PHASE 1] Execute live provisioning."
    ),
) -> None:
    """Provision the Commercial Control Room in Google Drive.

    Requires explicit --dry-run or --apply flag.
    --apply is BLOCKED in Phase 1.
    """
    assert_authorized_workspace()

    if apply:
        typer.secho(PHASE_1_BLOCK_MESSAGE, fg=typer.colors.RED, bold=True)
        raise typer.Exit(code=1)

    if not dry_run:
        typer.secho(
            "Specify either --dry-run (simulate) or --apply (live, blocked in Phase 1).",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(code=1)

    from hfla_control_room.audit_report import generate_audit_report
    from hfla_control_room.docs_provisioner import DocsProvisioner
    from hfla_control_room.drive_provisioner import DriveProvisioner
    from hfla_control_room.manifest import Manifest
    from hfla_control_room.sheets_provisioner import SheetsProvisioner
    from hfla_control_room.spec_loader import load_full_spec

    typer.echo("[DRY-RUN] Loading configuration …")
    spec = load_full_spec(config)
    manifest = Manifest.load(MANIFEST_PATH)
    all_log: list[str] = []

    drive_p = DriveProvisioner(manifest=manifest, dry_run=True)
    all_log.extend(drive_p.provision_structure(spec.drive_structure))

    sheets_p = SheetsProvisioner(manifest=manifest, dry_run=True)
    all_log.extend(sheets_p.provision_workbook(spec.governance_workbook))
    all_log.extend(sheets_p.provision_workbook(spec.restricted_operations_workbook))

    docs_p = DocsProvisioner(manifest=manifest, dry_run=True)
    for doc_spec in spec.documents:
        all_log.extend(docs_p.provision_document(doc_spec))

    report_path = AUDIT_REPORT_PATH
    generate_audit_report(manifest, all_log, report_path, dry_run=True)

    manifest.save(MANIFEST_PATH)

    typer.secho("[DRY-RUN] PROVISION SIMULATION COMPLETE.", fg=typer.colors.GREEN, bold=True)
    for line in all_log:
        typer.echo(f"  {line}")
    typer.echo(f"\n  Audit report: {report_path}")
    typer.echo("  Live Google API calls: FALSE")


if __name__ == "__main__":
    app()
