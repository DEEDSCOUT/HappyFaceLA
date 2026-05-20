"""Audit log writer. JSONL, append-only. Never logs secrets."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Config, redact


def write_audit(cfg: Config, entry: dict[str, Any]) -> Path:
    cfg.docs_dir.mkdir(parents=True, exist_ok=True)
    path = cfg.docs_dir / "audit-log.jsonl"
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"), **entry}
    line = redact(json.dumps(entry, ensure_ascii=False), cfg.secret_values)
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    return path
