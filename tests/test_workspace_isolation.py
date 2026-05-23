"""
Tests for workspace isolation enforcement.

The provisioner must refuse to run outside the authorized workspace path.
"""

from pathlib import Path

import pytest

from hfla_control_room.constants import AUTHORIZED_WORKSPACE_PATH
from hfla_control_room.validation import assert_authorized_workspace


class TestWorkspaceIsolation:
    def test_authorized_workspace_passes(self):
        """assert_authorized_workspace does not raise when given the correct path."""
        authorized = Path(AUTHORIZED_WORKSPACE_PATH)
        # Should not raise
        assert_authorized_workspace(cwd=authorized)

    def test_wrong_workspace_raises(self, tmp_path):
        """assert_authorized_workspace raises RuntimeError for any other path."""
        with pytest.raises(RuntimeError, match="BLOCKED — WRONG WORKSPACE"):
            assert_authorized_workspace(cwd=tmp_path)

    def test_parent_of_authorized_raises(self):
        """A parent directory of the authorized path is still rejected."""
        parent = Path(AUTHORIZED_WORKSPACE_PATH).parent
        with pytest.raises(RuntimeError, match="BLOCKED — WRONG WORKSPACE"):
            assert_authorized_workspace(cwd=parent)

    def test_child_of_authorized_raises(self):
        """A subdirectory of the authorized path is also rejected (exact match required)."""
        child = Path(AUTHORIZED_WORKSPACE_PATH) / "src"
        with pytest.raises(RuntimeError, match="BLOCKED — WRONG WORKSPACE"):
            assert_authorized_workspace(cwd=child)

    def test_nonexistent_path_raises(self, tmp_path):
        """A completely fabricated path is rejected."""
        fake = tmp_path / "not" / "a" / "real" / "path"
        with pytest.raises(RuntimeError, match="BLOCKED — WRONG WORKSPACE"):
            assert_authorized_workspace(cwd=fake)
