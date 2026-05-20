"""Mutation plan builder. Plans are JSON files saved before any mutate call."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Config, redact


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "plan"


def build_plan(
    cfg: Config,
    *,
    tool: str,
    reason: str,
    risk_level: str,
    resources_touched: list[str],
    operations: list[dict[str, Any]],
    before_snapshot_path: str | None,
    validate_only_supported: bool = True,
) -> dict[str, Any]:
    return {
        "plan_id": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "customer_id": cfg.customer_id,
        "tool": tool,
        "reason": reason,
        "risk_level": risk_level,
        "resources_touched": resources_touched,
        "before_snapshot_path": before_snapshot_path,
        "validate_only_supported": validate_only_supported,
        "operations": operations,
        "approval_required": True,
    }


def save_plan(cfg: Config, plan: dict[str, Any], label: str) -> Path:
    out_dir = cfg.docs_dir / "mutation-plans"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    path = out_dir / f"{ts}-{_slug(label)}.json"
    body = redact(json.dumps(plan, indent=2, ensure_ascii=False), cfg.secret_values)
    path.write_text(body, encoding="utf-8")
    return path
