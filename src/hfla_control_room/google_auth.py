"""
Happy Faces LA — Commercial Control Room
Google authentication scaffold.

PHASE 1: This module is a guarded stub only.
No OAuth consent, no credential file reading, and no Google API connection
is performed in Phase 1.

In a future authorized phase, this module will:
1. Read the minimum required OAuth scopes from configuration.
2. Use google-auth-oauthlib InstalledAppFlow with the CEO-selected account.
3. Persist token.json to .secrets/ (git-ignored).
4. Refresh credentials automatically.

OAuth scope decisions are deferred — see:
  docs/GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md
"""

from __future__ import annotations

from hfla_control_room.constants import PHASE_1_BLOCK_MESSAGE


def get_credentials(scopes: list[str] | None = None):  # noqa: ANN201
    """Return Google OAuth credentials.

    BLOCKED IN PHASE 1 — raises RuntimeError unconditionally.
    """
    raise RuntimeError(PHASE_1_BLOCK_MESSAGE)


def get_drive_service():  # noqa: ANN201
    """Return an authenticated Google Drive API service resource.

    BLOCKED IN PHASE 1 — raises RuntimeError unconditionally.
    """
    raise RuntimeError(PHASE_1_BLOCK_MESSAGE)


def get_sheets_service():  # noqa: ANN201
    """Return an authenticated Google Sheets API service resource.

    BLOCKED IN PHASE 1 — raises RuntimeError unconditionally.
    """
    raise RuntimeError(PHASE_1_BLOCK_MESSAGE)


def get_docs_service():  # noqa: ANN201
    """Return an authenticated Google Docs API service resource.

    BLOCKED IN PHASE 1 — raises RuntimeError unconditionally.
    """
    raise RuntimeError(PHASE_1_BLOCK_MESSAGE)
