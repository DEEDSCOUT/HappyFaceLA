"""Phase 1B.5A \u2014 candidate Phase 1C intake gate.

Tests the non-mutating ``validate-phase1c-input`` CLI command and the
``validate_phase1c_candidate_input`` validator.  The validator must:

* accept a clean DRAFT-only candidate dataset,
* refuse any candidate that carries an OPEN structural Phase-1C blocker,
* permit ordinary OPEN business-decision blockers (reported as warnings),
* operate independently of baseline scaffold placeholder blockers
  (BLK-DRAFT-001/002/003) which must not block a controlled replacement,
* refuse any APPROVED / RELEASED / ACTIVE business state in candidate,
* refuse non-empty ``approved_channel_text`` in candidate projections,
* refuse non-DRAFT releases / activations and any QA evidence on them,
* refuse broken foreign keys and duplicate identifiers,
* refuse unknown / misspelled fields via Pydantic strict schema,
* refuse RESTRICTED_PII channel-visibility content in the intake payload,
* write nothing to disk and trigger no Google API / OAuth activity,
* report intake counts and unresolved non-structural decisions.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from typer.testing import CliRunner

from hfla_control_room.cli import app
from hfla_control_room.validation import (
    load_phase1c_candidate_records,
    validate_phase1c_candidate_input,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

SAFE_FIXTURE = FIXTURES / "phase1c_candidate_safe_draft"
BLOCKED_FIXTURE = FIXTURES / "phase1c_candidate_blocked_structural"
INVALID_APPROVED_FIXTURE = FIXTURES / "phase1c_candidate_invalid_approved"
INVALID_FK_FIXTURE = FIXTURES / "phase1c_candidate_invalid_reference"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _snapshot_tree(root: Path) -> dict[str, str]:
    """Return ``{relpath: sha256-hex}`` for every regular file under ``root``."""
    snap: dict[str, str] = {}
    for p in sorted(root.rglob("*")):
        if p.is_file():
            snap[str(p.relative_to(root))] = hashlib.sha256(
                p.read_bytes()
            ).hexdigest()
    return snap


def _load_spec():
    from hfla_control_room.spec_loader import load_full_spec

    return load_full_spec(CONFIG_DIR)


def _load_candidate(path: Path):
    records, parse_errors = load_phase1c_candidate_records(path)
    assert parse_errors == [], parse_errors
    return records


# ---------------------------------------------------------------------------
# 1-3.  Acceptance of safe DRAFT-only candidate; rejection of structural
#       blocker; permitting ordinary blockers as warnings.
# ---------------------------------------------------------------------------


class TestSafeAndBlockedCandidates:
    def test_accepts_safe_draft_candidate(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        errors, warnings, counts = validate_phase1c_candidate_input(spec, cand)
        assert errors == [], errors
        assert counts["rules"] == 1
        assert counts["evidence_records"] == 1
        assert counts["blocker_records"] == 1
        assert counts["channel_projection_records"] == 1
        assert counts["release_records"] == 1
        assert counts["channel_release_activations"] == 1

    def test_rejects_open_structural_phase1c_blocker(self):
        spec = _load_spec()
        cand = _load_candidate(BLOCKED_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "blocks_phase_1c_content_loading=True" in e
            and "SYNTH-BLK-STRUCTURAL-001" in e
            for e in errors
        ), errors

    def test_permits_ordinary_open_blocker_as_warning(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        errors, warnings, _c = validate_phase1c_candidate_input(spec, cand)
        assert errors == [], errors
        assert any(
            "SYNTH-BLK-ORDINARY-001" in w
            and "blocks_phase_1c_content_loading=False" in w
            for w in warnings
        ), warnings


# ---------------------------------------------------------------------------
# 4. Baseline scaffold placeholder blockers must NOT contaminate the
#    candidate effective state.
# ---------------------------------------------------------------------------


class TestBaselineScaffoldIsolation:
    def test_baseline_scaffold_placeholder_blockers_do_not_block_candidate(self):
        spec = _load_spec()
        scaffold_blocker_ids = {b.blocker_id for b in spec.blocker_records}
        # Sanity: baseline scaffold contains the placeholder blockers and at
        # least one of them carries blocks_phase_1c_content_loading=True.
        assert "BLK-DRAFT-001" in scaffold_blocker_ids
        assert any(
            b.blocks_phase_1c_content_loading for b in spec.blocker_records
        )
        cand = _load_candidate(SAFE_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        # Scaffold placeholder blockers must NOT appear in errors.
        for sid in scaffold_blocker_ids:
            assert all(sid not in e for e in errors), (sid, errors)


# ---------------------------------------------------------------------------
# 5. DRAFT-only state checks: rule, projection, release, activation.
# ---------------------------------------------------------------------------


class TestDraftOnlyStateChecks:
    def _safe(self):
        return _load_candidate(SAFE_FIXTURE)

    def test_rejects_non_draft_rule(self):
        spec = _load_spec()
        cand = self._safe()
        cand["rules"][0]["status"] = "APPROVED_AS_RECOMMENDED"
        cand["rules"][0]["ceo_decision"] = "Approved as Recommended"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-RULE-001" in e and "DRAFT" in e for e in errors
        ), errors

    def test_rejects_non_empty_approved_channel_text(self):
        spec = _load_spec()
        cand = _load_candidate(INVALID_APPROVED_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "approved_channel_text" in e and "SYNTH-PROJ-001" in e
            for e in errors
        ), errors

    def test_rejects_non_draft_projection_release_status(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_projection_records"][0]["release_status"] = (
            "APPROVED_FOR_RELEASE"
        )
        cand["channel_projection_records"][0]["approved_channel_text"] = (
            "synthetic approved"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-PROJ-001" in e
            and ("release_status=APPROVED_FOR_RELEASE" in e
                 or "approved_channel_text" in e)
            for e in errors
        ), errors

    def test_rejects_non_draft_release(self):
        spec = _load_spec()
        cand = self._safe()
        cand["release_records"][0]["status"] = "READY_FOR_CEO_REVIEW"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e and "READY_FOR_CEO_REVIEW" in e
            for e in errors
        ), errors

    def test_rejects_release_with_authorized_channels(self):
        spec = _load_spec()
        cand = self._safe()
        # Pydantic rejects DRAFT releases with authorized_channels at
        # model_validate time; surfaces as an intake error.
        cand["release_records"][0]["authorized_channels"] = ["WEBSITE_PUBLIC"]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any("SYNTH-REL-001" in e for e in errors), errors
        assert any(
            "authorized" in e.lower() for e in errors
        ), errors

    def test_rejects_release_with_ceo_approval(self):
        spec = _load_spec()
        cand = self._safe()
        cand["release_records"][0]["ceo_decision"] = "APPROVED_AS_RECOMMENDED"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e and "ceo_decision" in e for e in errors
        ), errors

    def test_rejects_release_with_qa_evidence(self):
        spec = _load_spec()
        cand = self._safe()
        cand["release_records"][0]["qa_evidence"] = "qa-evidence://x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e and "qa_evidence" in e for e in errors
        ), errors

    def test_rejects_non_draft_activation(self):
        spec = _load_spec()
        cand = self._safe()
        # Cannot use ACTIVE without QA, so use READY_FOR_ACTIVATION-equivalent
        # via SUPERSEDED which is not DRAFT.
        cand["channel_release_activations"][0]["activation_status"] = (
            "SUPERSEDED"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-ACT-001" in e and "SUPERSEDED" in e for e in errors
        ), errors

    def test_rejects_activation_with_qa_evidence(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_release_activations"][0]["qa_evidence"] = (
            "qa-evidence://x"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-ACT-001" in e and "qa_evidence" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# 6. Foreign-key integrity and uniqueness.
# ---------------------------------------------------------------------------


class TestForeignKeysAndUniqueness:
    def test_rejects_projection_referencing_unknown_rule(self):
        spec = _load_spec()
        cand = _load_candidate(INVALID_FK_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-PROJ-001" in e and "SYNTH-RULE-NONEXISTENT" in e
            for e in errors
        ), errors

    def test_rejects_release_referencing_unknown_projection(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["release_records"][0]["related_projection_ids"] = [
            "SYNTH-PROJ-MISSING"
        ]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e and "SYNTH-PROJ-MISSING" in e for e in errors
        ), errors

    def test_rejects_activation_referencing_unknown_release(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["channel_release_activations"][0]["release_id"] = (
            "SYNTH-REL-MISSING"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-ACT-001" in e and "SYNTH-REL-MISSING" in e for e in errors
        ), errors

    def test_rejects_duplicate_rule_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["rules"].append(dict(cand["rules"][0]))
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate rule IDs" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# 7. Strict schema (unknown / misspelled fields) and restricted PII.
# ---------------------------------------------------------------------------


class TestSchemaAndRestrictedPII:
    def test_rejects_unknown_field_on_rule(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["rules"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-RULE-001" in e
            and "totally_invented_field" in e
            for e in errors
        ), errors

    def test_rejects_restricted_pii_channel_visibility(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["rules"][0]["channel_visibility"] = "RESTRICTED_PII"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-RULE-001" in e and "RESTRICTED_PII" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# 8. Non-mutating contract: no tracked-file writes, no Google auth.
# ---------------------------------------------------------------------------


class TestNonMutatingContract:
    def test_validation_does_not_modify_tracked_files(self, tmp_path):
        before = _snapshot_tree(CONFIG_DIR)
        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(SAFE_FIXTURE),
            ],
        )
        assert result.exit_code == 0, result.output
        after = _snapshot_tree(CONFIG_DIR)
        assert before == after, (
            "validate-phase1c-input MUST NOT mutate any file under config/."
        )

    def test_validation_does_not_import_google_auth(self):
        # Drop any cached import of google_auth and validation modules so we
        # can detect a fresh import triggered by the validator.
        for mod in list(sys.modules):
            if mod.startswith("hfla_control_room.google_auth"):
                del sys.modules[mod]
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        validate_phase1c_candidate_input(spec, cand)
        loaded = [
            m for m in sys.modules if m.startswith("hfla_control_room.google_auth")
        ]
        assert loaded == [], (
            "validate_phase1c_candidate_input must not import google_auth; "
            f"found: {loaded}"
        )


# ---------------------------------------------------------------------------
# 9. CLI behaviour: PASS/FAIL banners and exit codes.
# ---------------------------------------------------------------------------


class TestCLIInterface:
    def test_cli_passes_on_safe_fixture(self):
        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(SAFE_FIXTURE),
            ],
        )
        assert result.exit_code == 0, result.output
        assert "PHASE 1C INPUT VALIDATION PASSED" in result.output
        assert "DRAFT CONTENT MAY BE LOADED ONLY AFTER SEPARATE" in result.output
        # Counts and warnings present.
        assert "Candidate rules:        1" in result.output
        assert "Unresolved non-structural" in result.output

    def test_cli_blocks_on_structural_blocker_fixture(self):
        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(BLOCKED_FIXTURE),
            ],
        )
        assert result.exit_code == 1, result.output
        assert "BLOCKED \u2014 PHASE 1C INPUT VALIDATION FAILED" in result.output
        assert "SYNTH-BLK-STRUCTURAL-001" in result.output


# ---------------------------------------------------------------------------
# 10. Single-file loader sanity.
# ---------------------------------------------------------------------------


class TestLoader:
    def test_load_rejects_missing_path(self, tmp_path):
        missing = tmp_path / "does_not_exist.yaml"
        records, errors = load_phase1c_candidate_records(missing)
        assert errors and "does not exist" in errors[0]
        assert all(records[k] == [] for k in records)

    def test_load_rejects_unknown_top_level_keys(self, tmp_path):
        f = tmp_path / "bad.yaml"
        f.write_text("totally_invented_top_level: []\n", encoding="utf-8")
        records, errors = load_phase1c_candidate_records(f)
        assert any("unknown top-level keys" in e for e in errors)


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Direct coverage of every duplicate-ID branch.
# ---------------------------------------------------------------------------


class TestDuplicateIDBranches:
    """Each register's duplicate-ID branch must be exercised directly so a
    regression that silently disables a single duplicate check is caught."""

    def test_rejects_duplicate_evidence_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["evidence_records"].append(dict(cand["evidence_records"][0]))
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate evidence IDs" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_blocker_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["blocker_records"].append(dict(cand["blocker_records"][0]))
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate blocker IDs" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_projection_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["channel_projection_records"].append(
            dict(cand["channel_projection_records"][0])
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate projection IDs" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_release_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["release_records"].append(dict(cand["release_records"][0]))
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate release IDs" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_activation_ids(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["channel_release_activations"].append(
            dict(cand["channel_release_activations"][0])
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "register integrity" in e and "Duplicate activation IDs" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Direct coverage of every remaining FK branch.
# ---------------------------------------------------------------------------


class TestForeignKeyBranchesAdditional:
    def test_rejects_blocker_referencing_unknown_rule(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["blocker_records"][0]["related_rule_ids"] = ["SYNTH-RULE-MISSING"]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-BLK-ORDINARY-001" in e
            and "related_rule_ids" in e
            and "SYNTH-RULE-MISSING" in e
            for e in errors
        ), errors

    def test_rejects_blocker_referencing_unknown_evidence(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["blocker_records"][0]["related_evidence_ids"] = [
            "SYNTH-EVD-MISSING"
        ]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-BLK-ORDINARY-001" in e
            and "related_evidence_ids" in e
            and "SYNTH-EVD-MISSING" in e
            for e in errors
        ), errors

    def test_rejects_evidence_referencing_unknown_rule(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["evidence_records"][0]["related_rule_ids"] = [
            "SYNTH-RULE-MISSING"
        ]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-EVD-001" in e
            and "related_rule_ids" in e
            and "SYNTH-RULE-MISSING" in e
            for e in errors
        ), errors

    def test_rejects_release_referencing_unknown_rule(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["release_records"][0]["related_rule_ids"] = [
            "SYNTH-RULE-MISSING"
        ]
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e
            and "related_rule_ids" in e
            and "SYNTH-RULE-MISSING" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Strict-schema unknown-field branch on every record type.
# ---------------------------------------------------------------------------


class TestSchemaUnknownFieldBranchesAdditional:
    def test_rejects_unknown_field_on_evidence(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["evidence_records"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-EVD-001" in e and "totally_invented_field" in e
            for e in errors
        ), errors

    def test_rejects_unknown_field_on_blocker(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["blocker_records"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-BLK-ORDINARY-001" in e and "totally_invented_field" in e
            for e in errors
        ), errors

    def test_rejects_unknown_field_on_projection(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["channel_projection_records"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-PROJ-001" in e and "totally_invented_field" in e
            for e in errors
        ), errors

    def test_rejects_unknown_field_on_release(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["release_records"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-REL-001" in e and "totally_invented_field" in e
            for e in errors
        ), errors

    def test_rejects_unknown_field_on_activation(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["channel_release_activations"][0]["totally_invented_field"] = "x"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        # Activation records are identified by their release_id in the
        # validator's strict-schema error message.
        assert any(
            "channel_release_activations" in e
            and "totally_invented_field" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Production-intake completeness contract.
# ---------------------------------------------------------------------------


class TestProductionIntakeCompletenessContract:
    """In production_intake mode (default), the candidate MUST contain all
    six DRAFT record families AND every projected output channel MUST have
    a paired DRAFT channel_release_activation row."""

    def _safe(self):
        return _load_candidate(SAFE_FIXTURE)

    def test_rules_only_payload_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            cand[key] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        # All five missing families must be flagged.
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            assert any(
                "production_intake" in e and f"'{key}'" in e for e in errors
            ), (key, errors)

    def test_missing_evidence_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["evidence_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "production_intake" in e and "'evidence_records'" in e
            for e in errors
        ), errors

    def test_missing_blocker_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["blocker_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "production_intake" in e and "'blocker_records'" in e
            for e in errors
        ), errors

    def test_missing_projection_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_projection_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "production_intake" in e
            and "'channel_projection_records'" in e
            for e in errors
        ), errors

    def test_missing_release_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["release_records"] = []
        # Also drop the activation that FK-references the release so the
        # error we want to assert is the missing-release-family one, not
        # an FK error.
        cand["channel_release_activations"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "production_intake" in e and "'release_records'" in e
            for e in errors
        ), errors

    def test_missing_activation_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_release_activations"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "production_intake" in e
            and "'channel_release_activations'" in e
            for e in errors
        ), errors

    def test_rejects_projection_channel_without_paired_activation(self):
        """Every projected output channel must already have a DRAFT
        channel_release_activation row on that channel."""
        spec = _load_spec()
        cand = self._safe()
        # Change activation channel so the projection's WEBSITE_PUBLIC
        # output channel has no paired DRAFT activation row.
        cand["channel_release_activations"][0]["channel"] = "GOOGLE_BUSINESS"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-PROJ-001" in e
            and "WEBSITE_PUBLIC" in e
            and "channel_release_activation" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Workbook destination + canonical-list contracts.
# ---------------------------------------------------------------------------


class TestWorkbookDestinationContract:
    def test_rejects_rule_category_outside_canonical_list(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["rules"][0]["rule_category"] = "TOTALLY_INVENTED_CATEGORY"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-RULE-001" in e
            and "TOTALLY_INVENTED_CATEGORY" in e
            and "canonical rule_category validation list" in e
            for e in errors
        ), errors

    def test_rejects_when_workbook_has_no_tabs(self, monkeypatch):
        """Removing all workbook tabs surfaces a structural error that
        prevents intake \u2014 candidate records lose addressable destinations."""
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        # Simulate a corrupted baseline workbook in-memory only.
        spec.governance_workbook.tabs.clear()
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Baseline governance workbook has no tabs" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 Partial-fixture mode (test-only escape hatch).
# ---------------------------------------------------------------------------


class TestPartialFixtureMode:
    """``validation_mode='partial_fixture'`` is permitted ONLY for synthetic
    test fixtures that intentionally isolate a single rejection branch.  It
    skips the production_intake completeness / channel-activation /
    workbook-destination / canonical-rule_category checks but every other
    check (DRAFT-only state, FK, duplicates, strict schema, restricted-PII,
    structural blockers) still runs."""

    def test_rejects_unknown_validation_mode(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        import pytest

        with pytest.raises(ValueError):
            validate_phase1c_candidate_input(
                spec, cand, validation_mode="not_a_real_mode"
            )

    def test_partial_fixture_mode_skips_completeness_checks(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        # Empty every family except rules - production_intake would refuse,
        # partial_fixture must NOT emit completeness errors.
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            cand[key] = []
        errors, _w, _c = validate_phase1c_candidate_input(
            spec, cand, validation_mode="partial_fixture"
        )
        assert not any("production_intake" in e for e in errors), errors

    def test_partial_fixture_mode_still_runs_structural_blocker_check(self):
        spec = _load_spec()
        cand = _load_candidate(BLOCKED_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(
            spec, cand, validation_mode="partial_fixture"
        )
        # Structural-blocker rejection still fires; production_intake
        # completeness noise is suppressed.
        assert any(
            "blocks_phase_1c_content_loading=True" in e
            and "SYNTH-BLK-STRUCTURAL-001" in e
            for e in errors
        ), errors
        assert not any("production_intake" in e for e in errors), errors

    def test_partial_fixture_mode_skips_canonical_rule_category(self):
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        cand["rules"][0]["rule_category"] = "SYNTHETIC_TEST_CATEGORY"
        errors, _w, _c = validate_phase1c_candidate_input(
            spec, cand, validation_mode="partial_fixture"
        )
        assert not any(
            "canonical rule_category validation list" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B \u2014 CLI --mode wiring.
# ---------------------------------------------------------------------------


class TestCLIModeOption:
    def test_cli_blocks_rules_only_payload_under_default_production_intake(
        self, tmp_path
    ):
        # Build a rules-only candidate fixture on the fly.
        partial = tmp_path / "candidate.yaml"
        partial.write_text(
            (SAFE_FIXTURE / "candidate.yaml").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        # Now blank out every family except `rules`.
        import yaml

        data = yaml.safe_load(partial.read_text(encoding="utf-8"))
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            data[key] = []
        partial.write_text(yaml.safe_dump(data), encoding="utf-8")

        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(tmp_path),
            ],
        )
        assert result.exit_code == 1, result.output
        assert "BLOCKED \u2014 PHASE 1C INPUT VALIDATION FAILED" in result.output
        assert "production_intake" in result.output
        assert "Validation mode: production-intake" in result.output

    def test_cli_partial_fixture_mode_allows_rules_only_payload(
        self, tmp_path
    ):
        partial = tmp_path / "candidate.yaml"
        partial.write_text(
            (SAFE_FIXTURE / "candidate.yaml").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        import yaml

        data = yaml.safe_load(partial.read_text(encoding="utf-8"))
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            data[key] = []
        partial.write_text(yaml.safe_dump(data), encoding="utf-8")

        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(tmp_path),
                "--mode",
                "partial-fixture",
            ],
        )
        # No structural blocker, no FK breaks, no completeness checks \u2014
        # the rules-only synthetic fixture is admissible under
        # partial_fixture mode.
        assert result.exit_code == 0, result.output
        assert "PHASE 1C INPUT VALIDATION PASSED" in result.output
        assert "Validation mode: partial-fixture" in result.output

    def test_cli_rejects_unknown_mode(self):
        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(SAFE_FIXTURE),
                "--mode",
                "not-a-real-mode",
            ],
        )
        assert result.exit_code == 1, result.output
        assert "unknown --mode" in result.output

