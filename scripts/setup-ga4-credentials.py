#!/usr/bin/env python3
"""
One-time OAuth2 flow to generate GA4 Application Default Credentials.

Uses the existing OAuth client secret for happyfacesla.com (deedscout project).
Run this script once; it opens a browser for Google sign-in with info@happyfacesla.com.

Output: C:\\Users\\shawn\\Documents\\happyfacesla-secrets\\ga4_application_default_credentials.json
"""

import json
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/analytics",
]

CLIENT_SECRETS = Path(
    r"C:\Dev\happyfacesla-commercial-control-room\.secrets\credentials.json"
)

OUTPUT_CREDENTIALS = Path(
    r"C:\Dev\happyfacesla-commercial-control-room\.secrets\ga4_token.json"
)

QUOTA_PROJECT = "deedscout"


def main():
    if not CLIENT_SECRETS.exists():
        raise FileNotFoundError(f"Client secret not found: {CLIENT_SECRETS}")

    print("Starting GA4 OAuth2 flow — a browser window will open.")
    print("Sign in with info@happyfacesla.com and grant Analytics access.\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS), scopes=SCOPES)
    credentials = flow.run_local_server(port=0)

    creds_data = {
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "refresh_token": credentials.refresh_token,
        "type": "authorized_user",
        "universe_domain": "googleapis.com",
        "quota_project_id": QUOTA_PROJECT,
    }

    OUTPUT_CREDENTIALS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_CREDENTIALS.write_text(json.dumps(creds_data, indent=2))

    print(f"\nCredentials saved to:\n  {OUTPUT_CREDENTIALS}")
    print("\nGA4 authentication complete. Restart VS Code to activate analytics-mcp.")


if __name__ == "__main__":
    main()
