"""One-time OAuth2 flow to generate GBP credentials with business.manage scope.

Usage:
    python tools/gbp_mcp/generate_token.py

This opens a browser window for Google OAuth2 consent.
Sign in as info@happyfacesla.com and accept the 'Manage your business' permission.
The resulting token is saved to:
    C:\\Dev\\happyfacesla-commercial-control-room\\.secrets\\gbp_token.json

That path is already set as GBP_TOKEN_FILE in .env.example.
"""

from __future__ import annotations

from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_SECRETS = Path(
    r"C:\Dev\happyfacesla-commercial-control-room\.secrets\credentials.json"
)
OUTPUT_TOKEN = Path(
    r"C:\Dev\happyfacesla-commercial-control-room\.secrets\gbp_token.json"
)

SCOPES = ["https://www.googleapis.com/auth/business.manage"]
PORT = 8086  # Different from GA4 (8085) to avoid port conflicts


def main() -> None:
    if not CLIENT_SECRETS.exists():
        raise FileNotFoundError(
            f"OAuth client secrets not found at:\n  {CLIENT_SECRETS}\n"
            "Download from GCP Console → APIs & Services → Credentials → "
            "your OAuth 2.0 Client ID → Download JSON."
        )

    print("\nOpening browser for Google OAuth2 consent...")
    print(
        "Sign in as info@happyfacesla.com and accept the 'Manage your business' permission.\n"
    )

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS), SCOPES)
    creds = flow.run_local_server(port=PORT, prompt="consent", access_type="offline")

    OUTPUT_TOKEN.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_TOKEN, "w") as fh:
        fh.write(creds.to_json())

    print(f"\n✅ GBP token saved to: {OUTPUT_TOKEN}")
    print(f"   Scopes granted: {list(creds.scopes)}")
    print("\nNext steps:")
    print(
        "  1. Copy .env.example → .env.local (GBP_TOKEN_FILE is already set correctly)"
    )
    print("  2. Run gbp_health_check() to confirm connectivity")
    print(
        "  3. Run gbp_list_accounts() then gbp_list_locations() to find your resource names"
    )
    print(
        "  4. Set GBP_ACCOUNT_NAME and GBP_LOCATION_NAME in .env.local for convenience"
    )


if __name__ == "__main__":
    main()
