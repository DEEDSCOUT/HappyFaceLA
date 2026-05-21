"""OAuth refresh-token bootstrap for a Desktop app OAuth 2.0 client.

Run once locally to obtain a refresh token for the Google Ads API.

PREREQUISITE
------------
Create an OAuth 2.0 credential in Google Cloud Console:
  APIs & Services > Credentials > Create credentials > OAuth client ID
  Application type: Desktop app   <-- REQUIRED. Web Application will fail.

For Desktop app clients Google allows any loopback port (127.0.0.1:*);
you do NOT need to register the redirect URI in Cloud Console.

Usage
-----
    python generate_refresh_token.py

Override the callback port via env if the default is occupied:
    GOOGLE_ADS_OAUTH_PORT=53683 python generate_refresh_token.py

The script prints ONLY the refresh token. Paste it into .env.local as
GOOGLE_ADS_REFRESH_TOKEN. Never commit that file.
"""
from __future__ import annotations

import getpass
import os
import socket
import sys

CALLBACK_HOST = "127.0.0.1"  # explicit loopback IP; avoids OS-level DNS resolution
FALLBACK_PORTS = [53682, 53683, 53684, 53685]
SCOPES = ["https://www.googleapis.com/auth/adwords"]


def _find_free_port() -> int:
    """Return the first available port from FALLBACK_PORTS (or env override)."""
    env_port = os.environ.get("GOOGLE_ADS_OAUTH_PORT", "").strip()
    if env_port:
        try:
            candidates = [int(env_port)]
        except ValueError:
            print(f"WARNING: GOOGLE_ADS_OAUTH_PORT='{env_port}' is not a number; using defaults.",
                  file=sys.stderr)
            candidates = FALLBACK_PORTS
    else:
        candidates = FALLBACK_PORTS

    for port in candidates:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((CALLBACK_HOST, port))
            return port
        except OSError:
            continue

    tried = ", ".join(str(p) for p in candidates)
    print(
        f"ERROR: All candidate ports are occupied or blocked ({tried}).\n"
        "  Set GOOGLE_ADS_OAUTH_PORT=<free-port> and retry.",
        file=sys.stderr,
    )
    sys.exit(1)


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

    port = _find_free_port()
    callback_url = f"http://{CALLBACK_HOST}:{port}/"

    # Desktop app client config — 'installed' key is the correct type for Desktop.
    # If you created a 'Web application' client you will get redirect_uri_mismatch;
    # delete it and create a new 'Desktop app' client instead.
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [callback_url],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

    print(f"\nOAuth callback URL : {callback_url}")
    print("Opening browser for Google sign-in ...")
    try:
        creds = flow.run_local_server(
            host=CALLBACK_HOST,
            port=port,
            open_browser=True,
            # Suppress the library's own token-dump to stdout
            success_message=(
                "Authorization complete. You may close this tab and return to the terminal."
            ),
        )
    except OSError as exc:
        msg = str(exc)
        if "address already in use" in msg.lower() or "winerror 10013" in msg.lower() or "10048" in msg:
            print(
                f"ERROR: Port {port} is occupied or blocked (WinError 10013 / EADDRINUSE).\n"
                "  This usually means another process (e.g. Apache/httpd) owns that port.\n"
                f"  Set GOOGLE_ADS_OAUTH_PORT=<free-port> and retry, or kill the process\n"
                f"  blocking port {port}.",
                file=sys.stderr,
            )
        else:
            print(f"ERROR starting local server: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "redirect_uri_mismatch" in msg.lower():
            print(
                f"ERROR: redirect_uri_mismatch\n"
                f"  Callback tried: http://{CALLBACK_HOST}:{port}/\n"
                f"  This means either:\n"
                f"  1. Your OAuth client type is 'Web application' instead of 'Desktop app'.\n"
                f"     Fix: Delete it in Cloud Console and create a new Desktop app client.\n"
                f"  2. (Web app clients only) The URI above is not listed in Cloud Console.\n"
                f"  The correct fix is almost always option 1.",
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
