"""Before/after snapshots of touched resources. Stored as JSON under docs/google-ads/snapshots."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Config, redact


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "snap"


def write_snapshot(cfg: Config, label: str, data: Any) -> Path:
    out_dir = cfg.docs_dir / "snapshots"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    path = out_dir / f"{ts}-{_slug(label)}.json"
    body = redact(json.dumps(data, indent=2, default=str, ensure_ascii=False), cfg.secret_values)
    path.write_text(body, encoding="utf-8")
    return path
