"""
Tests for deterministic plan generation (Phase 1B.1 closure).

The tracked plan artifacts (``artifacts/dry_run/control_room_build_plan.json``
and ``.md``) must be byte-identical when regenerated against unchanged
configuration.  Wall-clock timestamps must live only under ``.runtime/audit/``.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from hfla_control_room.plan_builder import (
    build_plan,
    write_plan,
    write_plan_runtime_receipt,
)
from hfla_control_room.spec_loader import load_full_spec

REPO_ROOT = Path(__file__).parent.parent
CONFIG_DIR = REPO_ROOT / "config"
TRACKED_PLAN_JSON = REPO_ROOT / "artifacts" / "dry_run" / "control_room_build_plan.json"
TRACKED_PLAN_MD = REPO_ROOT / "artifacts" / "dry_run" / "control_room_build_plan.md"


class TestPlanDeterminism:
    def test_build_plan_twice_is_byte_identical_in_memory(self):
        """Two consecutive build_plan calls must produce equal dicts."""
        spec_a = load_full_spec(CONFIG_DIR)
        spec_b = load_full_spec(CONFIG_DIR)
        plan_a = build_plan(spec_a)
        plan_b = build_plan(spec_b)
        assert plan_a == plan_b

    def test_write_plan_twice_is_byte_identical(self, tmp_path: Path):
        """Two write_plan calls into separate dirs must produce identical bytes."""
        spec = load_full_spec(CONFIG_DIR)

        out_a = tmp_path / "a"
        out_b = tmp_path / "b"
        plan = build_plan(spec)

        json_a, md_a = write_plan(plan, out_a)
        json_b, md_b = write_plan(plan, out_b)

        assert json_a.read_bytes() == json_b.read_bytes(), (
            "Two writes of the same plan produced different JSON bytes."
        )
        assert md_a.read_bytes() == md_b.read_bytes(), (
            "Two writes of the same plan produced different Markdown bytes."
        )

    def test_plan_does_not_contain_timestamp_in_serialized_output(self, tmp_path: Path):
        """Tracked plan files must not contain a 'generated_at_utc' field."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        json_path, md_path = write_plan(plan, tmp_path)

        json_text = json_path.read_text(encoding="utf-8")
        md_text = md_path.read_text(encoding="utf-8")

        assert "generated_at_utc" not in json_text, (
            "Tracked plan JSON must not embed a wall-clock timestamp."
        )
        assert "generated_at_utc" not in md_text, (
            "Tracked plan Markdown must not embed a wall-clock timestamp."
        )

    def test_plan_contains_deterministic_spec_fingerprint(self, tmp_path: Path):
        """The tracked plan JSON must include a SHA-256 spec_fingerprint."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        json_path, _ = write_plan(plan, tmp_path)

        payload = json.loads(json_path.read_text(encoding="utf-8"))
        fingerprint = payload["plan_metadata"].get("spec_fingerprint")
        assert isinstance(fingerprint, str)
        assert len(fingerprint) == 64, "spec_fingerprint must be a 64-char SHA-256 hex."
        assert all(c in "0123456789abcdef" for c in fingerprint), (
            "spec_fingerprint must be lowercase hex."
        )

    def test_runtime_receipt_contains_timestamp_but_tracked_plan_does_not(
        self, tmp_path: Path
    ):
        """Wall-clock timestamps may appear ONLY in the runtime receipt."""
        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)

        tracked_dir = tmp_path / "tracked"
        receipt_path = tmp_path / "runtime" / "last_plan_run.json"

        json_path, md_path = write_plan(plan, tracked_dir)
        write_plan_runtime_receipt(plan, receipt_path)

        assert "generated_at_utc" not in json_path.read_text(encoding="utf-8")
        assert "generated_at_utc" not in md_path.read_text(encoding="utf-8")

        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        assert "generated_at_utc" in receipt
        assert receipt["spec_fingerprint"] == plan["plan_metadata"]["spec_fingerprint"]

    @pytest.mark.skipif(
        not (REPO_ROOT / ".git").exists(),
        reason="Not a git checkout — clean-tree determinism check skipped.",
    )
    def test_regenerating_tracked_plan_leaves_git_tree_clean(self):
        """Regenerating the tracked plan against the committed config must
        produce a git-clean worktree for the tracked artifacts."""
        # Skip if the file isn't tracked yet (e.g. first-time bootstrap).
        if not TRACKED_PLAN_JSON.exists() or not TRACKED_PLAN_MD.exists():
            pytest.skip("Tracked plan artifacts not present yet.")

        spec = load_full_spec(CONFIG_DIR)
        plan = build_plan(spec)
        write_plan(plan, TRACKED_PLAN_JSON.parent)

        git_args = ["git", "status", "--porcelain", "--",
                    str(TRACKED_PLAN_JSON), str(TRACKED_PLAN_MD)]
        result = subprocess.run(  # noqa: S603, S607
            git_args,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        assert result.stdout.strip() == "", (
            "Regenerating the plan produced a dirty worktree:\n"
            f"{result.stdout}\n"
            "The tracked plan must be byte-identical against unchanged config."
        )

    def test_runtime_receipt_path_is_under_runtime_dir(self):
        """The receipt constant must point inside .runtime/ (git-ignored)."""
        from hfla_control_room.constants import LAST_PLAN_RUN_PATH, RUNTIME_DIR

        # Resolve both to absolute paths to compare safely on Windows.
        try:
            LAST_PLAN_RUN_PATH.resolve().relative_to(RUNTIME_DIR.resolve())
        except ValueError:  # pragma: no cover - guard
            pytest.fail(
                f"LAST_PLAN_RUN_PATH={LAST_PLAN_RUN_PATH} is not under RUNTIME_DIR={RUNTIME_DIR}"
            )

    def test_cli_module_is_invokable(self):
        """The CLI entry point module must be importable as a script."""
        # Just verify the import path resolves; do not actually call APIs.
        proc = subprocess.run(  # noqa: S603
            [sys.executable, "-c", "import hfla_control_room.cli as c; assert hasattr(c, 'app')"],
            capture_output=True,
            text=True,
            check=False,
        )
        assert proc.returncode == 0, proc.stderr
