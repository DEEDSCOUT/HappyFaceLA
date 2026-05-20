"""Configuration loaded from environment / .env.local. No secrets are logged."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent

load_dotenv(HERE / ".env.local")


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    developer_token: str
    client_id: str
    client_secret: str
    refresh_token: str
    customer_id: str
    login_customer_id: str
    api_version: str
    allow_mutate: bool
    require_approval: bool
    approval_token: str
    default_validate_only: bool
    max_daily_budget_delta_percent: int
    log_level: str
    docs_dir: Path

    @property
    def secret_values(self) -> list[str]:
        """Values that must never appear in tool output or written files."""
        return [
            v for v in (
                self.developer_token,
                self.client_secret,
                self.refresh_token,
                self.client_id,
                self.approval_token,
            ) if v and len(v) >= 6
        ]


def load_config() -> Config:
    docs_dir = REPO_ROOT / os.environ.get("GOOGLE_ADS_DOCS_DIR", "docs/google-ads")
    return Config(
        developer_token=os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip(),
        client_id=os.environ.get("GOOGLE_ADS_CLIENT_ID", "").strip(),
        client_secret=os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "").strip(),
        refresh_token=os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", "").strip(),
        customer_id=os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "").replace("-", "").strip(),
        login_customer_id=os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "").replace("-", "").strip(),
        api_version=os.environ.get("GOOGLE_ADS_API_VERSION", "v18").strip(),
        allow_mutate=_bool("GOOGLE_ADS_ALLOW_MUTATE", False),
        require_approval=_bool("GOOGLE_ADS_REQUIRE_APPROVAL", True),
        approval_token=os.environ.get("GOOGLE_ADS_APPROVAL_TOKEN", "").strip(),
        default_validate_only=_bool("GOOGLE_ADS_DEFAULT_VALIDATE_ONLY", True),
        max_daily_budget_delta_percent=_int("GOOGLE_ADS_MAX_DAILY_BUDGET_DELTA_PERCENT", 25),
        log_level=os.environ.get("GOOGLE_ADS_MCP_LOG_LEVEL", "INFO").strip(),
        docs_dir=docs_dir,
    )


def mask_cid(cid: str) -> str:
    cid = (cid or "").replace("-", "")
    return f"***{cid[-4:]}" if len(cid) >= 4 else "***"


def redact(text: str, secrets: list[str]) -> str:
    for s in secrets:
        if s:
            text = text.replace(s, "[REDACTED]")
    return text
