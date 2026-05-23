"""
Tests proving validate and provision --dry-run do not dirty the tracked git tree.

Verifies:
- audit_report.json is NOT tracked by git after Phase 1B remediation.
- .runtime/ is git-ignored.
- AUDIT_REPORT_PATH constant points to .runtime/ (not artifacts/).
- The stable plan snapshot artifact IS tracked.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).parent.parent
_GIT = shutil.which("git") or "git"


def _git_tracked_files() -> list[str]:
    """Return all file paths currently tracked in the git index."""
    result = subprocess.run(  # noqa: S603
        [_GIT, "ls-files"],
        capture_output=True,
        text=True,
        cwd=WORKSPACE_ROOT,
        check=True,
    )
    return result.stdout.splitlines()


class TestDirtyTreeGuard:
    def test_audit_report_not_in_tracked_files(self):
        """audit_report.json must NOT be tracked by git after Phase 1B remediation.

        The dirty-tree defect (C-1) is the original sin: running provision --dry-run
        during the Phase 1A audit overwrote the committed audit_report.json.
        After remediation, audit_report.json is written to .runtime/ (git-ignored).
        """
        tracked = _git_tracked_files()
        tracked_audit = [
            f for f in tracked
            if "audit_report.json" in f and "dry_run" in f
        ]
        assert tracked_audit == [], (
            f"artifacts/dry_run/audit_report.json must not be git-tracked after "
            f"Phase 1B remediation. Still tracked: {tracked_audit}"
        )

    def test_runtime_dir_is_gitignored(self):
        """.runtime/ must be listed in .gitignore."""
        gitignore = WORKSPACE_ROOT / ".gitignore"
        content = gitignore.read_text(encoding="utf-8")
        assert ".runtime/" in content, (
            ".runtime/ must be in .gitignore so dynamic outputs never dirty the tree."
        )

    def test_audit_report_path_under_runtime(self):
        """AUDIT_REPORT_PATH constant must resolve under .runtime/, not artifacts/."""
        from hfla_control_room.constants import AUDIT_REPORT_PATH

        assert ".runtime" in str(AUDIT_REPORT_PATH), (
            f"AUDIT_REPORT_PATH ({AUDIT_REPORT_PATH}) must be under .runtime/ "
            f"so provision --dry-run never dirties the tracked tree."
        )
        assert "artifacts" not in str(AUDIT_REPORT_PATH), (
            f"AUDIT_REPORT_PATH must not point into artifacts/. Got: {AUDIT_REPORT_PATH}"
        )

    def test_plan_artifacts_dir_is_tracked(self):
        """The stable plan snapshot control_room_build_plan.json IS tracked.

        The plan JSON is deterministic (no timestamps) so it is safe to commit
        as a record of the intended Phase 1 structure.
        """
        tracked = _git_tracked_files()
        assert any(
            "control_room_build_plan.json" in f for f in tracked
        ), (
            "control_room_build_plan.json must be in the git index as a stable plan snapshot."
        )

    def test_manifest_path_under_runtime(self):
        """MANIFEST_PATH must be under .runtime/ (never tracked)."""
        from hfla_control_room.constants import MANIFEST_PATH

        assert ".runtime" in str(MANIFEST_PATH), (
            f"MANIFEST_PATH ({MANIFEST_PATH}) must be under .runtime/."
        )

    def test_secrets_dir_not_tracked(self):
        """No file under .secrets/ must appear in the git index."""
        tracked = _git_tracked_files()
        secrets_files = [f for f in tracked if f.startswith(".secrets/")]
        assert secrets_files == [], (
            f".secrets/ files must never be tracked: {secrets_files}"
        )

    def test_runtime_dir_not_tracked(self):
        """No file under .runtime/ must appear in the git index."""
        tracked = _git_tracked_files()
        runtime_files = [f for f in tracked if f.startswith(".runtime/")]
        assert runtime_files == [], (
            f".runtime/ files must never be tracked: {runtime_files}"
        )
