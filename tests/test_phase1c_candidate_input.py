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
