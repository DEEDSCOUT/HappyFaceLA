"""
Happy Faces LA — Commercial Control Room
CLI entry point (Typer).

Commands:
  validate               Validate all YAML configuration specs.
  plan                   Generate a dry-run build plan.
  validate-release       Validate a future approved export payload.
  validate-phase1c-input Non-mutating intake gate for an EXTERNAL
                         candidate Phase 1C DRAFT dataset (Phase 1B.5A).
  check-phase1c-gate     Scaffold/baseline diagnostic only — verifies
                         the currently loaded scaffold remains pre-load
                         safe.  Does NOT validate any external candidate
                         dataset; use ``validate-phase1c-input`` for that.
  provision              Provision scaffold (dry-run only in Phase 1;
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
    """Validate a future approved-rules export payload at INPUT.

    Phase 1B.4 contract: a release export payload is authoritative only if
    every link in the chain is intact and the channel is not blocked at
    the publication scope:

        rules \u2192 projections \u2192 release \u2192 activation \u2192
        per-channel-publication-blocker check.

    Accepted payload shape::

        {
          "rules":        [RuleRow, ...],
          "projections":  [ChannelProjectionRecord, ...],
          "releases":     [ReleaseRecord, ...],
          "activations":  [ChannelReleaseActivationRecord, ...],
          "blockers":     [BlockerRecord, ...]
        }

    Validation fails (exit 1) when:

      - the payload contains only ``rules`` (no projections);
      - the payload contains projections but no release;
      - the payload contains a release but no activation;
      - the channel has any OPEN blocker listing it in ``blocked_channels``;
      - any rule, projection, release, or activation invariant fails.
    """
    assert_authorized_workspace()

    from hfla_control_room.models import (
        BlockerRecord,
        ChannelProjectionRecord,
        ChannelReleaseActivationRecord,
        ReleaseRecord,
        RuleRow,
    )
    from hfla_control_room.release_exporter import (
        channel_publication_blockers_for_channel,
    )
    from hfla_control_room.validation import (
        validate_channel_activation_integrity,
        validate_channel_projection_integrity,
        validate_no_pii_in_export,
        validate_no_pii_in_projection_export,
        validate_release_integrity,
        validate_rules_batch,
    )

    raw = json.loads(input.read_text(encoding="utf-8"))
    rules_raw = raw.get("rules", raw.get("approved_rules", []))
    projections_raw = raw.get("projections", [])
    releases_raw = raw.get("releases", [])
    activations_raw = raw.get("activations", [])
    blockers_raw = raw.get("blockers", [])

    rules = [RuleRow.model_validate(r) for r in rules_raw]
    projections = [ChannelProjectionRecord.model_validate(p) for p in projections_raw]
    releases = [ReleaseRecord.model_validate(r) for r in releases_raw]
    activations = [
        ChannelReleaseActivationRecord.model_validate(a) for a in activations_raw
    ]
    blockers = [BlockerRecord.model_validate(b) for b in blockers_raw]

    errors_by_rule = validate_rules_batch(rules)
    pii_violations = validate_no_pii_in_export(rules)
    chain_errors: list[str] = []

    if rules and not projections:
        chain_errors.append(
            "Payload contains rules but no projections \u2014 rules alone "
            "cannot authorise a channel publication."
        )
    if projections and not releases:
        chain_errors.append(
            "Payload contains projections but no release \u2014 a "
            "ReleaseRecord is required to authorise publication."
        )
    if releases and not activations:
        chain_errors.append(
            "Payload contains release(s) but no activation \u2014 a "
            "ChannelReleaseActivationRecord is required to declare the "
            "current channel output."
        )

    chain_errors.extend(
        validate_channel_projection_integrity(projections, rules, None)
    )
    chain_errors.extend(validate_no_pii_in_projection_export(projections))
    chain_errors.extend(
        validate_release_integrity(releases, rules, projections, blockers)
    )
    chain_errors.extend(
        validate_channel_activation_integrity(activations, releases, projections)
    )

    # Per-channel publication blocker check across every activation channel.
    for act in activations:
        pub_blockers = channel_publication_blockers_for_channel(act.channel, blockers)
        if pub_blockers:
            chain_errors.append(
                f"Channel '{act.channel.value}' (activation "
                f"'{act.activation_id}') has open publication blockers: "
                f"{sorted(b.blocker_id for b in pub_blockers)}."
            )

    all_ok = not errors_by_rule and not pii_violations and not chain_errors
    if not all_ok:
        typer.secho("RELEASE VALIDATION FAILED:", fg=typer.colors.RED, bold=True)
        for rule_id, errs in errors_by_rule.items():
            for err in errs:
                typer.secho(f"  X [{rule_id}] {err}", fg=typer.colors.RED)
        for v in pii_violations:
            typer.secho(f"  X [PII] {v}", fg=typer.colors.RED)
        for v in chain_errors:
            typer.secho(f"  X [CHAIN] {v}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    typer.secho("RELEASE VALIDATION PASSED.", fg=typer.colors.GREEN, bold=True)
    typer.echo(f"  Rules:        {len(rules)}")
    typer.echo(f"  Projections:  {len(projections)}")
    typer.echo(f"  Releases:     {len(releases)}")
    typer.echo(f"  Activations:  {len(activations)}")
    typer.echo(f"  Blockers:     {len(blockers)}")
    typer.echo("  PII violations: 0")


@app.command(name="validate-phase1c-input")
def validate_phase1c_input(
    config: Path = typer.Option(  # noqa: B008
        ...,
        "--config",
        "-c",
        help="Path to the baseline config/ directory (schema source only).",
        exists=True,
        file_okay=False,
    ),
    input: Path = typer.Option(  # noqa: B008
        ...,
        "--input",
        "-i",
        help=(
            "Path to a candidate Phase 1C DRAFT dataset (YAML file or "
            "directory of *.yaml files)."
        ),
        exists=True,
    ),
    mode: str = typer.Option(  # noqa: B008
        "production-intake",
        "--mode",
        "-m",
        help=(
            "Validation mode.  'production-intake' (default) enforces a "
            "complete DRAFT commercial governance payload (all six record "
            "families, channel<->activation completeness, frozen workbook "
            "destinations).  'partial-fixture' is reserved for synthetic "
            "test fixtures and skips those completeness checks; it MUST "
            "NOT be used for any real candidate submission."
        ),
    ),
) -> None:
    """Non-mutating Phase 1C candidate-input intake gate (Phase 1B.5A/5B).

    Validates an EXTERNAL candidate Phase 1C DRAFT dataset supplied via
    ``--input`` against the baseline schema/workbook configuration in
    ``--config``.  The candidate dataset is treated as a FULL REPLACEMENT
    business-data payload: baseline scaffold ``BLK-DRAFT-*`` placeholder
    blockers are NOT carried into the candidate effective state, so they
    cannot permanently block a controlled candidate replacement path.

    In the default ``production-intake`` mode the candidate must be a
    COMPLETE DRAFT commercial governance payload: all six record families
    must be non-empty, every projected output channel must already have a
    DRAFT activation row in the same payload, and every used source_model
    must be addressable against the frozen workbook destinations.  Rule
    categories must come from the canonical ``rule_category`` validation
    list.

    The command writes nothing to disk and performs no Google API or OAuth
    activity.  It returns exit 0 with the PASS line below ONLY if the
    candidate is safe to load into draft seed storage under separate
    controller authorization; otherwise exit 1.

    On success::

        PHASE 1C INPUT VALIDATION PASSED \u2014 DRAFT CONTENT MAY BE LOADED
        ONLY AFTER SEPARATE CONTROLLER AUTHORIZATION.

    On failure::

        BLOCKED \u2014 PHASE 1C INPUT VALIDATION FAILED
    """
    assert_authorized_workspace()

    from hfla_control_room.spec_loader import load_full_spec
    from hfla_control_room.validation import (
        load_phase1c_candidate_records,
        validate_phase1c_candidate_input,
    )

    # Normalise CLI ``--mode`` value (kebab-case) to the validator's
    # snake_case mode identifier.
    cli_to_validator_mode = {
        "production-intake": "production_intake",
        "partial-fixture": "partial_fixture",
    }
    if mode not in cli_to_validator_mode:
        typer.secho(
            f"BLOCKED \u2014 unknown --mode '{mode}'.  Allowed: "
            f"{sorted(cli_to_validator_mode)}.",
            fg=typer.colors.RED,
            bold=True,
        )
        raise typer.Exit(code=1)
    validator_mode = cli_to_validator_mode[mode]

    typer.echo(f"Loading baseline schema from: {config.resolve()}")
    spec = load_full_spec(config)
    typer.echo(f"Loading candidate Phase 1C input from: {input.resolve()}")
    typer.echo(f"Validation mode: {mode}")

    candidate, parse_errors = load_phase1c_candidate_records(input)
    errors, warnings, counts = validate_phase1c_candidate_input(
        spec, candidate, validation_mode=validator_mode
    )
    errors = list(parse_errors) + list(errors)

    if errors:
        typer.secho(
            "BLOCKED \u2014 PHASE 1C INPUT VALIDATION FAILED",
            fg=typer.colors.RED,
            bold=True,
        )
        for err in errors:
            typer.secho(f"  X {err}", fg=typer.colors.RED)
        if warnings:
            typer.secho(
                "  (unresolved non-structural warnings also present:)",
                fg=typer.colors.YELLOW,
            )
            for w in warnings:
                typer.secho(f"  ! {w}", fg=typer.colors.YELLOW)
        raise typer.Exit(code=1)

    typer.secho(
        "PHASE 1C INPUT VALIDATION PASSED \u2014 DRAFT CONTENT MAY BE "
        "LOADED ONLY AFTER SEPARATE CONTROLLER AUTHORIZATION.",
        fg=typer.colors.GREEN,
        bold=True,
    )
    typer.echo(f"  Candidate rules:        {counts['rules']}")
    typer.echo(f"  Candidate evidence:     {counts['evidence_records']}")
    typer.echo(f"  Candidate blockers:     {counts['blocker_records']}")
    typer.echo(
        f"  Candidate projections:  {counts['channel_projection_records']}"
    )
    typer.echo(f"  Candidate releases:     {counts['release_records']}")
    typer.echo(
        f"  Candidate activations:  {counts['channel_release_activations']}"
    )
    if warnings:
        typer.secho(
            f"  Unresolved non-structural blocker decisions: {len(warnings)}",
            fg=typer.colors.YELLOW,
        )
        for w in warnings:
            typer.secho(f"  ! {w}", fg=typer.colors.YELLOW)
    else:
        typer.echo("  Unresolved non-structural blocker decisions: 0")


@app.command(name="check-phase1c-gate")
def check_phase1c_gate(
    config: Path = typer.Option(  # noqa: B008
        ..., "--config", "-c", help="Path to the config/ directory.", exists=True, file_okay=False
    ),
) -> None:
    """Scaffold / baseline diagnostic for the Phase 1C pre-load gate.

    THIS COMMAND VALIDATES THE CURRENTLY LOADED SCAFFOLD ONLY.  It does NOT
    validate any external candidate Phase 1C dataset.  Phase 1B.5A wires
    ``validate-phase1c-input`` as the non-mutating intake gate for an
    external candidate dataset; use that command before any Phase 1C
    content loading.

    Verifies that the currently loaded scaffold dataset is safe for Phase 1C
    content loading:

    1. No structural blocker (``blocks_phase_1c_content_loading=True``) is OPEN.
    2. No CEO-approved rules exist (all must be DRAFT).
    3. No RELEASED releases exist in the dataset.
    4. No ACTIVE channel activations exist in the dataset.
    5. No projection carries approved/released status with non-empty
       ``approved_channel_text``.

    Ordinary open CEO / business-decision blockers
    (``blocks_phase_1c_content_loading=False``) are NOT gate conditions and
    remain recordable in the draft workbook without blocking dataset loading.

    Exits 0 if all checks pass (PHASE 1C GATE: CLEAR).
    Exits 1 if any check fails (PHASE 1C GATE: BLOCKED).
    """
    assert_authorized_workspace()

    from hfla_control_room.spec_loader import load_full_spec
    from hfla_control_room.validation import validate_phase1c_preload_readiness

    typer.echo(f"Loading configuration from: {config.resolve()}")
    spec = load_full_spec(config)
    errors = validate_phase1c_preload_readiness(spec)

    if errors:
        typer.secho("PHASE 1C GATE: BLOCKED.", fg=typer.colors.RED, bold=True)
        for err in errors:
            typer.secho(f"  X {err}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    typer.secho("PHASE 1C GATE: CLEAR.", fg=typer.colors.GREEN, bold=True)
    n_structural = sum(
        1
        for b in spec.blocker_records
        if b.blocks_phase_1c_content_loading
    )
    typer.echo(f"  Structural blockers:  0 open ({n_structural} total in dataset)")
    typer.echo(f"  Rules:                {len(spec.seed_rules)} (all DRAFT)")
    typer.echo(f"  Releases:             {len(spec.release_records)} (none RELEASED)")
    typer.echo(f"  Activations:          {len(spec.channel_release_activations)} (none ACTIVE)")
    typer.echo(
        f"  Projections:          {len(spec.channel_projection_records)}"
        " (none with approved content)"
    )


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
