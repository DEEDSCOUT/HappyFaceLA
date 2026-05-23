"""
Tests confirming no OAuth tokens or secrets appear in tracked workspace files.

check_no_secrets_in_tree must return an empty list for a clean workspace.
Tracked files must not contain credential file names.
"""

from pathlib import Path

from hfla_control_room.validation import check_no_secrets_in_tree

# Root of the workspace
WORKSPACE_ROOT = Path(__file__).parent.parent


class TestNoSecretsTracked:
    def test_check_no_secrets_passes_on_workspace_root(self):
        """check_no_secrets_in_tree must return no violations for this workspace.

        .secrets/, .runtime/, and credential files are all git-ignored and must
        not exist in the tracked workspace tree.
        """
        violations = check_no_secrets_in_tree(WORKSPACE_ROOT)
        assert violations == [], (
            "Secret or credential files found in workspace tree:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )

    def test_no_client_secret_file(self):
        """client_secret.json must not exist anywhere in the tracked workspace."""
        hits = list(WORKSPACE_ROOT.rglob("client_secret.json"))
        assert hits == [], f"client_secret.json found: {hits}"

    def test_no_token_json_file(self):
        """token.json must not exist anywhere in the tracked workspace."""
        hits = list(WORKSPACE_ROOT.rglob("token.json"))
        assert hits == [], f"token.json found: {hits}"

    def test_no_token_pickle_file(self):
        """token.pickle must not exist anywhere in the tracked workspace."""
        hits = list(WORKSPACE_ROOT.rglob("token.pickle"))
        assert hits == [], f"token.pickle found: {hits}"

    def test_no_credentials_json_file(self):
        """credentials.json must not exist anywhere in the tracked workspace."""
        hits = list(WORKSPACE_ROOT.rglob("credentials.json"))
        assert hits == [], f"credentials.json found: {hits}"

    def test_no_service_account_json(self):
        """service_account.json must not exist anywhere in the tracked workspace."""
        hits = list(WORKSPACE_ROOT.rglob("service_account.json"))
        assert hits == [], f"service_account.json found: {hits}"

    def test_no_pem_files(self):
        """No .pem private key files may exist in the tracked workspace."""
        # Exclude .venv to avoid false positives from installed packages
        hits = [
            p for p in WORKSPACE_ROOT.rglob("*.pem")
            if ".venv" not in p.parts
        ]
        assert hits == [], f".pem files found: {hits}"

    def test_no_p12_files(self):
        """No .p12 key files may exist in the tracked workspace."""
        hits = [
            p for p in WORKSPACE_ROOT.rglob("*.p12")
            if ".venv" not in p.parts
        ]
        assert hits == [], f".p12 files found: {hits}"

    def test_gitignore_blocks_secrets_dir(self):
        """.gitignore must contain an entry blocking the .secrets/ directory."""
        gitignore = WORKSPACE_ROOT / ".gitignore"
        assert gitignore.exists(), ".gitignore not found in workspace root"
        content = gitignore.read_text(encoding="utf-8")
        assert ".secrets/" in content, ".gitignore must exclude .secrets/ directory"

    def test_gitignore_blocks_token_json(self):
        """.gitignore must contain an entry blocking token.json."""
        gitignore = WORKSPACE_ROOT / ".gitignore"
        content = gitignore.read_text(encoding="utf-8")
        assert "token.json" in content, ".gitignore must exclude token.json"

    def test_gitignore_blocks_client_secret(self):
        """.gitignore must contain an entry blocking client_secret.json."""
        gitignore = WORKSPACE_ROOT / ".gitignore"
        content = gitignore.read_text(encoding="utf-8")
        assert "client_secret.json" in content, ".gitignore must exclude client_secret.json"
