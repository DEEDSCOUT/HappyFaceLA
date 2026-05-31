"""Google Business Profile API client builders and auth helpers."""

from __future__ import annotations

from pathlib import Path

import google.auth.transport.requests as _gauth_requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/business.manage"]

# v4 base URL for REST-only APIs (reviews, posts, media, Q&A)
MYBUSINESS_BASE = "https://mybusiness.googleapis.com/v4"

# Discovery URLs for the split GBP APIs (not in standard discovery index)
_ACCT_MGMT_DISCOVERY = (
    "https://mybusinessaccountmanagement.googleapis.com/$discovery/rest?version=v1"
)
_BIZ_INFO_DISCOVERY = (
    "https://mybusinessbusinessinformation.googleapis.com/$discovery/rest?version=v1"
)


def load_credentials(token_file: Path) -> Credentials:
    """Load and auto-refresh OAuth2 credentials from token JSON file."""
    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(_gauth_requests.Request())
        with open(token_file, "w") as fh:
            fh.write(creds.to_json())
    return creds


def build_account_management_client(creds: Credentials):
    """mybusinessaccountmanagement v1 — accounts, admins, invitations."""
    return build(
        "mybusinessaccountmanagement",
        "v1",
        credentials=creds,
        discoveryServiceUrl=_ACCT_MGMT_DISCOVERY,
        static_discovery=False,
    )


def build_business_info_client(creds: Credentials):
    """mybusinessbusinessinformation v1 — location details, hours, categories."""
    return build(
        "mybusinessbusinessinformation",
        "v1",
        credentials=creds,
        discoveryServiceUrl=_BIZ_INFO_DISCOVERY,
        static_discovery=False,
    )


def build_performance_client(creds: Credentials):
    """businessprofileperformance v1 — daily metrics and keyword impressions."""
    return build("businessprofileperformance", "v1", credentials=creds)


def build_authed_session(creds: Credentials) -> _gauth_requests.AuthorizedSession:
    """AuthorizedSession for v4 REST endpoints (reviews, posts, media, Q&A)."""
    return _gauth_requests.AuthorizedSession(creds)
