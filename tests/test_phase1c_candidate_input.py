"""Phase 1B.5A/5B/5C-R — candidate Phase 1C intake gate.

Tests the non-mutating ``validate-phase1c-input`` CLI command and the
``validate_phase1c_candidate_input`` validator.  The validator must:

* accept a clean, complete DRAFT-only candidate dataset (all six register
  families, exactly one DRAFT release shell, exactly one DRAFT activation
  per projected channel),
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
* refuse any candidate with zero or more-than-one DRAFT ReleaseRecord,
* refuse projected channels lacking exactly one DRAFT activation,
* refuse activations that target a channel absent from the projections,
* verify every required governance field has exactly one column mapping to
  the model's authorized destination tab,
* refuse ``--mode`` / ``-m`` option (removed; no partial-fixture bypass),
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

# Phase 1B.5C-R: complete fixtures — all six register families present.
SAFE_FIXTURE = FIXTURES / "phase1c_candidate_safe_complete_draft"
BLOCKED_FIXTURE = FIXTURES / "phase1c_candidate_blocked_structural_complete"
INCOMPLETE_FIXTURE = FIXTURES / "phase1c_candidate_incomplete_rules_only"
# Legacy single-concern fixtures (still used by targeted tests).
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
# Phase 1B.5B / 5C-R — Production-intake completeness contract.
# ---------------------------------------------------------------------------


class TestProductionIntakeCompletenessContract:
    """The candidate MUST contain all six DRAFT record families.  There is
    no operator bypass; the completeness contract is always enforced."""

    def _safe(self):
        return _load_candidate(SAFE_FIXTURE)

    def test_rules_only_payload_is_refused(self):
        spec = _load_spec()
        cand = _load_candidate(INCOMPLETE_FIXTURE)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        # Five missing families must be flagged.
        for key in (
            "evidence_records",
            "blocker_records",
            "channel_projection_records",
            "release_records",
            "channel_release_activations",
        ):
            assert any(
                "Candidate intake is missing" in e and f"'{key}'" in e
                for e in errors
            ), (key, errors)

    def test_missing_evidence_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["evidence_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Candidate intake is missing" in e and "'evidence_records'" in e
            for e in errors
        ), errors

    def test_missing_blocker_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["blocker_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Candidate intake is missing" in e and "'blocker_records'" in e
            for e in errors
        ), errors

    def test_missing_projection_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_projection_records"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Candidate intake is missing" in e
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
            "Candidate intake is missing" in e and "'release_records'" in e
            for e in errors
        ), errors

    def test_missing_activation_family_is_refused(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_release_activations"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Candidate intake is missing" in e
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
            "WEBSITE_PUBLIC" in e
            and "channel_release_activation" in e
            for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5B / 5C-R — Workbook destination + canonical-list contracts.
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
        prevents intake — candidate records lose addressable destinations."""
        spec = _load_spec()
        cand = _load_candidate(SAFE_FIXTURE)
        # Simulate a corrupted baseline workbook in-memory only.
        spec.governance_workbook.tabs.clear()
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "Baseline governance workbook has no tabs" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5C-R — CLI surface: --mode must not exist.
# ---------------------------------------------------------------------------


class TestCLISurface:
    """The ``--mode`` / ``-m`` operator escape hatch was removed in
    Phase 1B.5C-R.  These tests confirm the removal at the CLI level."""

    def test_help_does_not_expose_mode_option(self):
        runner = CliRunner()
        result = runner.invoke(app, ["validate-phase1c-input", "--help"])
        assert result.exit_code == 0, result.output
        assert "--mode" not in result.output
        assert "partial-fixture" not in result.output
        assert "partial_fixture" not in result.output

    def test_mode_partial_fixture_is_rejected_as_unknown_option(self):
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
                "partial-fixture",
            ],
        )
        assert result.exit_code != 0, result.output

    def test_rules_only_fixture_fails_through_cli(self):
        runner = CliRunner()
        result = runner.invoke(
            app,
            [
                "validate-phase1c-input",
                "-c",
                str(CONFIG_DIR),
                "-i",
                str(INCOMPLETE_FIXTURE),
            ],
        )
        assert result.exit_code == 1, result.output
        assert "BLOCKED" in result.output
        # No "Validation mode:" line should be present.
        assert "Validation mode:" not in result.output


# ---------------------------------------------------------------------------
# Phase 1B.5C-R — Exact projection ↔ activation coverage.
# ---------------------------------------------------------------------------


class TestExactProjectionActivationCoverage:
    """Every distinct projected channel must have EXACTLY ONE DRAFT
    activation.  No orphan activations allowed."""

    def _safe(self):
        return _load_candidate(SAFE_FIXTURE)

    def test_exact_one_activation_per_projected_channel_passes(self):
        spec = _load_spec()
        errors, _w, _c = validate_phase1c_candidate_input(
            spec, self._safe()
        )
        assert errors == [], errors

    def test_rejects_missing_activation_for_projected_channel(self):
        spec = _load_spec()
        cand = self._safe()
        cand["channel_release_activations"] = []
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "WEBSITE_PUBLIC" in e and "channel_release_activation" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_activation_for_same_channel(self):
        """Two DRAFT activation shells for the same projected channel violates
        the exactly-one invariant."""
        spec = _load_spec()
        cand = self._safe()
        second_act = dict(cand["channel_release_activations"][0])
        second_act["activation_id"] = "SYNTH-ACT-002"
        cand["channel_release_activations"].append(second_act)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "WEBSITE_PUBLIC" in e
            and ("2 DRAFT activation" in e or "exactly one" in e.lower())
            for e in errors
        ), errors

    def test_rejects_activation_for_unprojected_channel(self):
        """An activation that targets a channel with no projection record
        must be refused."""
        spec = _load_spec()
        cand = self._safe()
        # Add a second activation on a channel with no projection.
        extra_act = {
            "activation_id": "SYNTH-ACT-ORPHAN",
            "release_id": "SYNTH-REL-001",
            "channel": "GOOGLE_ADS_PUBLIC",
            "activation_status": "DRAFT",
        }
        cand["channel_release_activations"].append(extra_act)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "GOOGLE_ADS_PUBLIC" in e
            and "channel_projection_record" in e
            for e in errors
        ), errors

    def test_rejects_restricted_pii_projection(self):
        spec = _load_spec()
        cand = self._safe()
        cand["rules"][0]["channel_visibility"] = "RESTRICTED_PII"
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "SYNTH-RULE-001" in e and "RESTRICTED_PII" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5C-R — Exactly one DRAFT ReleaseRecord shell.
# ---------------------------------------------------------------------------


class TestExactOneRelease:
    """The candidate must carry exactly one DRAFT ReleaseRecord shell."""

    def _safe(self):
        return _load_candidate(SAFE_FIXTURE)

    def test_exactly_one_release_passes(self):
        spec = _load_spec()
        errors, _w, _c = validate_phase1c_candidate_input(
            spec, self._safe()
        )
        assert errors == [], errors

    def test_rejects_multiple_draft_releases(self):
        spec = _load_spec()
        cand = self._safe()
        second_rel = {
            "release_id": "SYNTH-REL-002",
            "release_version": "",
            "release_title": "Second synthetic DRAFT release (test-only)",
            "status": "DRAFT",
        }
        cand["release_records"].append(second_rel)
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        assert any(
            "exactly one DRAFT ReleaseRecord" in e for e in errors
        ), errors

    def test_rejects_activation_referencing_wrong_release(self):
        """When the activation's release_id differs from the single DRAFT
        release, it must be rejected."""
        spec = _load_spec()
        cand = self._safe()
        cand["channel_release_activations"][0]["release_id"] = (
            "SYNTH-REL-WRONG"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, cand)
        # Both FK error and wrong-release error should fire.
        assert any(
            "SYNTH-ACT-001" in e for e in errors
        ), errors


# ---------------------------------------------------------------------------
# Phase 1B.5C-R — Field-to-column mapping compatibility (Section 4).
# ---------------------------------------------------------------------------


class TestFieldToColumnMappingCompatibility:
    """Every required governance field must have exactly one column mapping
    entry pointing to the model's authorized destination tab."""

    def _spec_without_field(self, source_model: str, field: str):
        """Return a spec copy with the mapping for (source_model, field) removed."""
        spec = _load_spec()
        spec.column_mappings = [
            m for m in spec.column_mappings
            if not (m.source_model == source_model and m.source_field == field)
        ]
        return spec

    def _spec_with_duplicate_field(self, source_model: str, field: str):
        """Return a spec copy with a duplicate mapping entry for (source_model, field)."""
        spec = _load_spec()
        match = next(
            (m for m in spec.column_mappings
             if m.source_model == source_model and m.source_field == field),
            None,
        )
        if match is not None:
            from hfla_control_room.models import ColumnMappingRecord
            spec.column_mappings = list(spec.column_mappings) + [
                ColumnMappingRecord(
                    source_model=match.source_model,
                    source_field=match.source_field,
                    destination_tab=match.destination_tab,
                    column_header=match.column_header,
                )
            ]
        return spec

    def _spec_with_wrong_tab(self, source_model: str, field: str, wrong_tab: str):
        """Return a spec copy with the field's mapping destination_tab changed."""
        from hfla_control_room.models import ColumnMappingRecord
        spec = _load_spec()
        new_mappings = []
        for m in spec.column_mappings:
            if m.source_model == source_model and m.source_field == field:
                new_mappings.append(ColumnMappingRecord(
                    source_model=m.source_model,
                    source_field=m.source_field,
                    destination_tab=wrong_tab,
                    column_header=m.column_header,
                ))
            else:
                new_mappings.append(m)
        spec.column_mappings = new_mappings
        return spec

    def _cand(self):
        return _load_candidate(SAFE_FIXTURE)

    # --- ChannelProjectionRecord ---

    def test_rejects_missing_publication_key_mapping(self):
        spec = self._spec_without_field("ChannelProjectionRecord", "publication_key")
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelProjectionRecord.publication_key" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_missing_approved_channel_text_mapping(self):
        spec = self._spec_without_field(
            "ChannelProjectionRecord", "approved_channel_text"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelProjectionRecord.approved_channel_text" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_wrong_tab_for_publication_key(self):
        spec = self._spec_with_wrong_tab(
            "ChannelProjectionRecord", "publication_key", "03_RULE_REGISTER_MASTER"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelProjectionRecord.publication_key" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_duplicate_publication_key_mapping(self):
        spec = self._spec_with_duplicate_field(
            "ChannelProjectionRecord", "publication_key"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelProjectionRecord.publication_key" in e
            and "mapping entries" in e
            for e in errors
        ), errors

    # --- BlockerRecord ---

    def test_rejects_missing_blocked_channels_mapping(self):
        spec = self._spec_without_field("BlockerRecord", "blocked_channels")
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "BlockerRecord.blocked_channels" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_missing_blocks_phase_1c_content_loading_mapping(self):
        spec = self._spec_without_field(
            "BlockerRecord", "blocks_phase_1c_content_loading"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "BlockerRecord.blocks_phase_1c_content_loading" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    # --- ReleaseRecord ---

    def test_rejects_missing_qa_evidence_mapping_on_release(self):
        spec = self._spec_without_field("ReleaseRecord", "qa_evidence")
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ReleaseRecord.qa_evidence" in e and "no column mapping" in e
            for e in errors
        ), errors

    # --- ChannelReleaseActivationRecord ---

    def test_rejects_missing_qa_evidence_mapping_on_activation(self):
        spec = self._spec_without_field(
            "ChannelReleaseActivationRecord", "qa_evidence"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelReleaseActivationRecord.qa_evidence" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_missing_supersedes_activation_id_mapping(self):
        spec = self._spec_without_field(
            "ChannelReleaseActivationRecord", "supersedes_activation_id"
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelReleaseActivationRecord.supersedes_activation_id" in e
            and "no column mapping" in e
            for e in errors
        ), errors

    def test_rejects_wrong_tab_for_activation_qa_evidence(self):
        spec = self._spec_with_wrong_tab(
            "ChannelReleaseActivationRecord",
            "qa_evidence",
            "03_RULE_REGISTER_MASTER",
        )
        errors, _w, _c = validate_phase1c_candidate_input(spec, self._cand())
        assert any(
            "ChannelReleaseActivationRecord.qa_evidence" in e
            and "no column mapping" in e
            for e in errors
        ), errors
