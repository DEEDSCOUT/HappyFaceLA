import os
import json
import time
from dataclasses import dataclass, asdict
from typing import Dict, Any, Optional

@dataclass
class BuilderState:
    status: str  # "idle", "working", "awaiting_review", "tasks_completed_awaiting_final_signoff"
    payload: Dict[str, Any]
    timestamp: float = 0.0

@dataclass
class AuditorState:
    directive: str  # "proceed", "hold", "edit_required"
    feedback: str
    timestamp: float = 0.0

class MailboxProtocol:
    def __init__(self, workspace_root: str = ".agent"):
        self.dir = workspace_root
        self.builder_file = os.path.join(self.dir, "builder_state.json")
        self.auditor_file = os.path.join(self.dir, "auditor_state.json")
        os.makedirs(self.dir, exist_ok=True)

    def _atomic_write(self, file_path: str, data: dict) -> None:
        """Writes to a temporary file and replaces atomically to avoid file locks."""
        tmp_file = f"{file_path}.tmp"
        data["timestamp"] = time.time()

        for attempt in range(5):
            try:
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                os.replace(tmp_file, file_path)
                return
            except (PermissionError, IOError):
                time.sleep(0.05 * (2 ** attempt)) # Exponential backoff
        raise IOError(f"Failed to write to lock-protected file: {file_path}")

    def _safe_read(self, file_path: str) -> Optional[dict]:
        """Reads file content with retries for cross-process access resilience."""
        if not os.path.exists(file_path):
            return None
        for attempt in range(5):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (PermissionError, json.JSONDecodeError):
                time.sleep(0.05 * (2 ** attempt))
        return None

    def write_builder(self, state: BuilderState) -> None:
        self._atomic_write(self.builder_file, asdict(state))

    def read_builder(self) -> BuilderState:
        data = self._safe_read(self.builder_file)
        if not data:
            return BuilderState(status="idle", payload={})
        return BuilderState(status=data["status"], payload=data.get("payload", {}), timestamp=data.get("timestamp", 0.0))

    def write_auditor(self, state: AuditorState) -> None:
        self._atomic_write(self.auditor_file, asdict(state))

    def read_auditor(self) -> AuditorState:
        data = self._safe_read(self.auditor_file)
        if not data:
            return AuditorState(directive="proceed", feedback="")
        return AuditorState(directive=data["directive"], feedback=data.get("feedback", ""), timestamp=data.get("timestamp", 0.0))
