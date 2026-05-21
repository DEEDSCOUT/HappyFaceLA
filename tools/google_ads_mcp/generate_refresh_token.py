"""OAuth refresh-token bootstrap for a Desktop app OAuth 2.0 client.

Run once locally to obtain a refresh token for the Google Ads API.

PREREQUISITE
------------
Create an OAuth 2.0 credential in Google Cloud Console:
  APIs & Services > Credentials > Create credentials > OAuth client ID
  Application type: Desktop app   <-- REQUIRED. Web Application will fail.

The redirect URI http://localhost:8080 is handled automatically by this
script. You do NOT need to add it manually in the Cloud Console for
Desktop app clients (Google handles loopback URIs for Desktop apps).

Usage
-----
    python generate_refresh_token.py

The script prints ONLY the refresh token. Paste it into .env.local as
GOOGLE_ADS_REFRESH_TOKEN. Never commit that file.
"""
from __future__ import annotations

import getpass
import os
import sys

CALLBACK_PORT = 8080  # stable loopback port; must match Cloud Console for Web clients
SCOPES = ["https://www.googleapis.com/auth/adwords"]


def _load_credentials() -> tuple[str, str]:
    """Read client_id / client_secret from env or prompt. Never echoes the secret."""
    client_id = os.environ.get("GOOGLE_ADS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "").strip()

    if not client_id:
        client_id = input("OAuth client_id (from Cloud Console): ").strip()
    if not client_secret:
        # getpass hides input — the secret is never echoed to the terminal
        client_secret = getpass.getpass("OAuth client_secret (input hidden): ").strip()

    return client_id, client_secret


def _validate_client_id(client_id: str) -> None:
    """Catch the common mistake of pasting the auth URL instead of the client ID."""
    if client_id.startswith(("http://", "https://")):
        print(
            "ERROR: GOOGLE_ADS_CLIENT_ID looks like a URL, not a client ID.\n"
            "       It should look like: 123456789-abc...apps.googleusercontent.com\n"
            "       Go to Cloud Console > APIs & Services > Credentials and copy"
            " the Client ID value.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not client_id:
        print("ERROR: client_id is empty.", file=sys.stderr)
        sys.exit(1)


def main() -> int:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore
    except ImportError:
        print("Install requirements first:  pip install -r requirements.txt", file=sys.stderr)
        return 2

    client_id, client_secret = _load_credentials()
    _validate_client_id(client_id)

    # Desktop app client config — 'installed' key is the correct type for Desktop.
    # If you created a 'Web application' client you will get redirect_uri_mismatch;
    # delete it and create a new 'Desktop app' client instead.
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [
                f"http://localhost:{CALLBACK_PORT}",
                "urn:ietf:wg:oauth:2.0:oob",
            ],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

    print(f"\nOpening browser for Google sign-in. Listening on http://localhost:{CALLBACK_PORT} ...")
    try:
        creds = flow.run_local_server(
            port=CALLBACK_PORT,
            open_browser=True,
            # Suppress the library's own token-dump to stdout
            success_message=(
                "Authorization complete. You may close this tab and return to the terminal."
            ),
        )
    except OSError as exc:
        if "redirect_uri_mismatch" in str(exc).lower() or "address already in use" in str(exc).lower():
            print(
                f"ERROR: Port {CALLBACK_PORT} is already in use. Close the process using it and retry.",
                file=sys.stderr,
            )
        else:
            print(f"ERROR starting local server: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "redirect_uri_mismatch" in msg.lower():
            print(
                "ERROR: redirect_uri_mismatch\n"
                "  This means either:\n"
                "  1. Your OAuth client type is 'Web application' instead of 'Desktop app'.\n"
                "     Fix: Delete it in Cloud Console and create a new Desktop app client.\n"
                "  2. The redirect URI http://localhost:{CALLBACK_PORT} is not listed in the\n"
                "     Cloud Console (only relevant for Web application clients).\n"
                "  The correct fix is almost always option 1.",
                file=sys.stderr,
            )
        elif "access_denied" in msg.lower():
            print(
                "ERROR: access_denied\n"
                "  You declined the consent screen, or the Google account does not have\n"
                "  access to the Google Ads MCC account.",
                file=sys.stderr,
            )
        else:
            print(f"ERROR during OAuth flow: {exc}", file=sys.stderr)
        return 1

    if not creds.refresh_token:
        print(
            "ERROR: No refresh token returned. This can happen if the account already\n"
            "  granted consent to this client. Revoke access at\n"
            "  https://myaccount.google.com/permissions and run this script again.",
            file=sys.stderr,
        )
        return 1

    # Print ONLY the refresh token — no access token, no client secret.
    print("\n" + "=" * 60)
    print("SUCCESS — paste the line below into .env.local")
    print("=" * 60)
    print(f"GOOGLE_ADS_REFRESH_TOKEN={creds.refresh_token}")
    print("=" * 60)
    print("Do NOT commit .env.local to version control.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
