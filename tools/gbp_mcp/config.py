"""Configuration for the GBP MCP server — loaded from .env.local."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env.local")


class Config:
    token_file: Path
    account_name: Optional[str]
    location_name: Optional[str]
    allow_mutate: bool
    require_approval: bool
    approval_token: str
    log_level: str

    def __init__(self) -> None:
        token_raw = os.getenv("GBP_TOKEN_FILE", "")
        if not token_raw:
            raise ValueError(
                "GBP_TOKEN_FILE is not set. "
                "Run tools/gbp_mcp/generate_token.py first, then set GBP_TOKEN_FILE in .env.local."
            )
        self.token_file = Path(token_raw)
        self.account_name = os.getenv("GBP_ACCOUNT_NAME") or None
        self.location_name = os.getenv("GBP_LOCATION_NAME") or None
        self.allow_mutate = os.getenv("GBP_ALLOW_MUTATE", "false").lower() == "true"
        self.require_approval = (
            os.getenv("GBP_REQUIRE_APPROVAL", "true").lower() == "true"
        )
        self.approval_token = os.getenv("GBP_APPROVAL_TOKEN", "")
        self.log_level = os.getenv("GBP_MCP_LOG_LEVEL", "INFO")


def load_config() -> Config:
    return Config()
