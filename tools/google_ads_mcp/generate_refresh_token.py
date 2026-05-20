"""OAuth refresh-token bootstrap. Run once locally; prints the refresh token."""
from __future__ import annotations

import os
import sys


def main() -> int:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore
    except ImportError:
        print("Install requirements first: pip install -r requirements.txt", file=sys.stderr)
        return 2

    client_id = os.environ.get("GOOGLE_ADS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        client_id = input("OAuth client_id: ").strip()
        client_secret = input("OAuth client_secret: ").strip()

    flow = InstalledAppFlow.from_client_config(
        {"installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": ["http://localhost"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=["https://www.googleapis.com/auth/adwords"],
    )
    creds = flow.run_local_server(port=0)
    # Print ONLY the refresh token. Do not write to disk.
    print("\n=== Paste this into .env.local as GOOGLE_ADS_REFRESH_TOKEN ===")
    print(creds.refresh_token)
    print("=== Do not commit this value. ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
