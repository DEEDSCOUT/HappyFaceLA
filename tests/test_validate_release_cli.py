"""Phase 1B.4 — CLI validate-release contract."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent


def _run_cli(input_path: Path) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603
        [
            sys.executable,
            "-m",
            "hfla_control_room.cli",
            "validate-release",
            "--input",
            str(input_path),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def _write(tmp_path: Path, payload: dict) -> Path:
    p = tmp_path / "payload.json"
    p.write_text(json.dumps(payload), encoding="utf-8")
    return p


def _approved_rule() -> dict:
    return {
        "rule_id": "RULE-001",
        "rule_category": "PUBLIC_PRICING",
        "rule_title": "t",
        "status": "APPROVED_AS_RECOMMENDED",
        "ceo_decision": "Approved as Recommended",
        "final_effective_rule": "X",
        "release_version": "v1",
        "effective_date": "2026-06-15",
        "policy_version": "POL-1",
        "channel_visibility": "CHANNEL_SAFE",
        "public_safe_review_status": "APPROVED_PUBLIC_SAFE",
        "contains_pii": False,
        "contains_internal_only_logic": False,
    }


def _projection() -> dict:
    return {
        "projection_id": "PROJ-001",
        "publication_key": "website.pricing.disclosure",
        "related_rule_ids": ["RULE-001"],
        "channel": "WEBSITE_PUBLIC",
        "content_type": "POLICY_STATEMENT",
        "draft_channel_text": "draft",
        "approved_channel_text": "public-safe",
        "review_status": "APPROVED_FOR_RELEASE",
        "release_status": "RELEASED",
        "policy_version": "POL-1",
        "effective_date": "2026-06-15",
        "requires_human_escalation": False,
        "escalation_reason": "",
        "source_evidence_ids": [],
        "contains_pii": False,
        "contains_internal_only_logic": False,
        "notes_internal_only": "",
    }


def _release() -> dict:
    return {
        "release_id": "REL-001",
        "release_version": "v1",
        "release_title": "t",
        "status": "RELEASED",
        "ceo_decision": "APPROVED_AS_RECOMMENDED",
        "ceo_decision_date": "2026-06-01",
        "effective_date": "2026-06-15",
        "policy_version": "POL-1",
        "authorized_channels": ["WEBSITE_PUBLIC"],
        "related_rule_ids": ["RULE-001"],
        "related_projection_ids": ["PROJ-001"],
        "resolved_blocker_ids": [],
        "implementation_status": "IMPLEMENTED",
        "qa_status": "VERIFIED_PASS",
        "qa_evidence": "qa-evidence://signed-off",
        "rollback_plan": "",
        "release_notes": "",
        "notes_internal_only": "",
    }


def _activation() -> dict:
    return {
        "activation_id": "ACT-001",
        "release_id": "REL-001",
        "channel": "WEBSITE_PUBLIC",
        "activation_status": "ACTIVE",
        "supersedes_activation_id": "",
        "effective_date": "2026-06-15",
        "implementation_status": "IMPLEMENTED",
        "qa_status": "VERIFIED_PASS",
        "qa_evidence": "qa-evidence://signed-off",
        "snapshot_mode": "FULL_CHANNEL_SNAPSHOT",
        "notes_internal_only": "",
    }


def _open_publication_blocker() -> dict:
    return {
        "blocker_id": "BLK-001",
        "category": "COMPLIANCE_REVIEW_REQUIRED",
        "decision_required": "x",
        "why_it_matters": "x",
        "risk_if_missing": "x",
        "priority": "HIGH",
        "ceo_input_final_answer": "",
        "status": "OPEN_COMPLIANCE_REVIEW_REQUIRED",
        "related_rule_ids": ["RULE-001"],
        "related_evidence_ids": [],
        "blocked_channels": ["WEBSITE_PUBLIC"],
        "blocks_live_provisioning": False,
        "blocks_phase_1c_content_loading": False,
        "responsible_owner": "CEO",
        "resolution_evidence": "",
        "notes_internal_only": "",
    }


class TestValidateReleaseCLI:
    def test_rules_only_payload_rejected(self, tmp_path):
        payload = {"rules": [_approved_rule()]}
        r = _run_cli(_write(tmp_path, payload))
        assert r.returncode == 1
        assert "no projections" in r.stdout.lower() or "no projections" in r.stderr.lower()

    def test_projections_without_release_rejected(self, tmp_path):
        payload = {"rules": [_approved_rule()], "projections": [_projection()]}
        r = _run_cli(_write(tmp_path, payload))
        assert r.returncode == 1
        assert "no release" in r.stdout.lower() or "no release" in r.stderr.lower()

    def test_release_without_activation_rejected(self, tmp_path):
        payload = {
            "rules": [_approved_rule()],
            "projections": [_projection()],
            "releases": [_release()],
        }
        r = _run_cli(_write(tmp_path, payload))
        assert r.returncode == 1
        assert "no activation" in r.stdout.lower() or "no activation" in r.stderr.lower()

    def test_blocked_channel_rejected(self, tmp_path):
        payload = {
            "rules": [_approved_rule()],
            "projections": [_projection()],
            "releases": [_release()],
            "activations": [_activation()],
            "blockers": [_open_publication_blocker()],
        }
        r = _run_cli(_write(tmp_path, payload))
        assert r.returncode == 1
        msg = (r.stdout + r.stderr).lower()
        assert "publication blocker" in msg

    def test_complete_payload_accepted(self, tmp_path):
        payload = {
            "rules": [_approved_rule()],
            "projections": [_projection()],
            "releases": [_release()],
            "activations": [_activation()],
            "blockers": [],
        }
        r = _run_cli(_write(tmp_path, payload))
        assert r.returncode == 0, (
            f"expected PASS, got code={r.returncode}\n"
            f"STDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}"
        )
        assert "RELEASE VALIDATION PASSED" in r.stdout
