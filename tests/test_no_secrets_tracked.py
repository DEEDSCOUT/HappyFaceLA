"""
Security gate: no OAuth tokens or secrets appear in git-tracked files.

Design principle: use git ls-files to enumerate tracked files so that
legitimately git-ignored credential files in .secrets/ or .runtime/ do not
produce false-positive failures.  This test class survives a Phase 2 install
where client_secret.json exists at .secrets/client_secret.json but is ignored.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from hfla_control_room.validation import check_no_secrets_in_tree

WORKSPACE_ROOT = Path(__file__).parent.parent
_GIT = shutil.which("git") or "git"

# Credential file names that must NEVER appear in the git index
_CREDENTIAL_FILE_NAMES = frozenset(
    {
        "client_secret.json",
        "client_secrets.json",
        "token.json",
        "token.pickle",
        "credentials.json",
        "service_account.json",
    }
)

_CREDENTIAL_EXTENSIONS = frozenset({".pem", ".p12", ".key"})


def _git_tracked_files() -> list[str]:
    """Return all paths currently tracked by git (from the index)."""
    result = subprocess.run(  # noqa: S603
        [_GIT, "ls-files"],
        capture_output=True,
        text=True,
        cwd=WORKSPACE_ROOT,
        check=True,
    )
    return result.stdout.splitlines()


class TestTrackedFileSecurityCheck:
    """Confirm no credential files are tracked by git (git-index-aware)."""

    def test_no_credential_files_in_git_index(self):
        """git ls-files must not include any credential file names."""
        tracked = _git_tracked_files()
        violations = [
            f
            for f in tracked
            if Path(f).name.lower() in _CREDENTIAL_FILE_NAMES
            or Path(f).suffix.lower() in _CREDENTIAL_EXTENSIONS
        ]
        assert violations == [], (
            "Credential files found in git index (git ls-files):\n"
            + "\n".join(f"  - {v}" for v in violations)
        )

    def test_audit_report_not_tracked(self):
        """audit_report.json must NOT be tracked after Phase 1B remediation."""
        tracked = _git_tracked_files()
        tracked_set = {Path(f).name for f in tracked}
        assert "audit_report.json" not in tracked_set or not any(
            "audit_report.json" in f for f in tracked
            if "artifacts/dry_run" in f
        ), "artifacts/dry_run/audit_report.json must not be git-tracked"

    def test_control_room_plan_is_tracked(self):
        """control_room_build_plan.json IS a stable artifact — must be tracked."""
        tracked = _git_tracked_files()
        assert any(
            "control_room_build_plan.json" in f for f in tracked
        ), "control_room_build_plan.json must be in git index as a stable plan snapshot"


class TestGitIgnoreRules:
    """Verify .gitignore blocks the canonical credential and runtime paths."""

    def _gitignore(self) -> str:
        return (WORKSPACE_ROOT / ".gitignore").read_text(encoding="utf-8")

    def test_gitignore_blocks_secrets_dir(self):
        """.gitignore must exclude .secrets/ directory."""
        assert ".secrets/" in self._gitignore()

    def test_gitignore_blocks_secrets_dir_without_dot(self):
        """.gitignore must also exclude secrets/ (no dot) in case of documentation drift."""
        assert "secrets/" in self._gitignore()

    def test_gitignore_blocks_runtime_dir(self):
        """.gitignore must exclude .runtime/ directory."""
        assert ".runtime/" in self._gitignore()

    def test_gitignore_blocks_token_json(self):
        """.gitignore must exclude token.json."""
        assert "token.json" in self._gitignore()

    def test_gitignore_blocks_client_secret_json(self):
        """.gitignore must exclude client_secret.json."""
        assert "client_secret.json" in self._gitignore()

    def test_gitignore_blocks_private_exports(self):
        """.gitignore must exclude .exports/private/."""
        assert ".exports/private/" in self._gitignore()

    def test_client_secret_would_be_ignored(self):
        """git check-ignore must recognise .secrets/client_secret.json."""
        result = subprocess.run(  # noqa: S603
            [_GIT, "check-ignore", "-q", ".secrets/client_secret.json"],
            cwd=WORKSPACE_ROOT,
            capture_output=True,
        )
        # Exit 0 = ignored; exit 1 = not ignored; exit 128 = git error
        assert result.returncode == 0, (
            ".secrets/client_secret.json must be git-ignored but was not recognised. "
            "Check .gitignore contains '.secrets/' pattern."
        )

    def test_runtime_token_would_be_ignored(self):
        """git check-ignore must recognise .runtime/token.json."""
        result = subprocess.run(  # noqa: S603
            [_GIT, "check-ignore", "-q", ".runtime/token.json"],
            cwd=WORKSPACE_ROOT,
            capture_output=True,
        )
        assert result.returncode == 0, (
            ".runtime/token.json must be git-ignored but was not recognised."
        )


class TestRuntimeCredentialExistence:
    """Prove check_no_secrets_in_tree does not raise false positives for
    legitimately ignored credentials in .secrets/ or .runtime/.

    This class is forward-compatible: it passes both before (Phase 1, no creds
    installed) and after (Phase 2, real creds in .secrets/) credential install.
    """

    def test_check_no_secrets_skips_secrets_dir(self, tmp_path: Path) -> None:
        """A credential file placed inside .secrets/ must NOT be flagged.

        create a temporary workspace-like tree with a .secrets/ dir and confirm
        check_no_secrets_in_tree does not flag files inside it.
        """
        fake_root = tmp_path / "workspace"
        secrets_dir = fake_root / ".secrets"
        secrets_dir.mkdir(parents=True)
        (secrets_dir / "client_secret.json").write_text('{"placeholder": true}', encoding="utf-8")
        # No violations expected — .secrets/ is in skip_dirs
        violations = check_no_secrets_in_tree(fake_root)
        assert violations == [], (
            f"check_no_secrets_in_tree incorrectly flagged .secrets/ contents: {violations}"
        )

    def test_check_no_secrets_skips_runtime_dir(self, tmp_path: Path) -> None:
        """A token file placed inside .runtime/ must NOT be flagged."""
        fake_root = tmp_path / "workspace"
        runtime_dir = fake_root / ".runtime"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "token.json").write_text('{"placeholder": true}', encoding="utf-8")
        violations = check_no_secrets_in_tree(fake_root)
        assert violations == [], (
            f"check_no_secrets_in_tree incorrectly flagged .runtime/ contents: {violations}"
        )

    def test_check_no_secrets_detects_misplaced_credential(self, tmp_path: Path) -> None:
        """A credential file placed OUTSIDE the ignored dirs MUST be flagged."""
        fake_root = tmp_path / "workspace"
        wrong_dir = fake_root / "docs"
        wrong_dir.mkdir(parents=True)
        (wrong_dir / "client_secret.json").write_text('{"placeholder": true}', encoding="utf-8")
        violations = check_no_secrets_in_tree(fake_root)
        assert len(violations) == 1, (
            f"Expected 1 violation for misplaced credential, got: {violations}"
        )

    def test_workspace_clean_on_check(self):
        """The actual workspace tree must return no violations from check_no_secrets_in_tree."""
        violations = check_no_secrets_in_tree(WORKSPACE_ROOT)
        assert violations == [], (
            "Secret or credential files found in workspace tree:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )
