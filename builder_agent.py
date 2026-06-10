#!/usr/bin/env python3
"""
builder_agent.py — Persistent Builder State-Machine Loop
=========================================================
Runs the Builder half of the cross-process multi-agent execution framework.
Imports MailboxProtocol, BuilderState, and AuditorState from agents.mailbox.

Task source
-----------
A dynamic, file-based backlog drop-box — ``tasks.json`` at the workspace root.
The Builder atomically pops the FIRST task object off the array when it is idle,
persists the remaining tasks back to disk, and transitions to "working".

When the backlog is empty or the file is missing, the Builder does NOT exit.
Instead it emits a "Standby: Awaiting tasks..." heartbeat every 5 seconds and
stays alive indefinitely, ready for tasks to be dropped in live.

All ``tasks.json`` writes use the same .tmp-swap + retry/backoff protocol as
mailbox.py, so manual edits to the backlog never trigger file-lock crashes.
"""

import os
import json
import time
import logging

# ---------------------------------------------------------------------------
# Logging setup — structured stdout output for the test harness
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[Builder %(asctime)s] %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# Mailbox Integration
# ---------------------------------------------------------------------------
from agents.mailbox import MailboxProtocol, BuilderState, AuditorState

# ---------------------------------------------------------------------------
# Dynamic backlog configuration
# ---------------------------------------------------------------------------
# tasks.json lives at the workspace root (the directory containing this script),
# matching how mailbox.py anchors its .agent directory.
TASKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.json")
STANDBY_HEARTBEAT_SECONDS = 5.0
IO_RETRY_ATTEMPTS = 5


# ---------------------------------------------------------------------------
# tasks.json I/O — atomic, lock-resilient, shape-preserving
# ---------------------------------------------------------------------------
def _read_tasks(tasks_file: str):
    """
    Safely read the backlog with retry/backoff for cross-process resilience.

    Accepts two on-disk shapes so a human can drop in whichever is convenient:
      * a bare JSON array:          [ {..task..}, {..task..} ]
      * a wrapper object:           { "tasks": [ {..task..} ] }

    Returns a tuple ``(kind, tasks)`` where ``kind`` is "list" or "dict" so the
    original shape can be preserved on write-back. A missing, empty, or
    transiently unreadable file is treated as an empty backlog: ``("list", [])``.
    """
    if not os.path.exists(tasks_file):
        return "list", []

    for attempt in range(IO_RETRY_ATTEMPTS):
        try:
            with open(tasks_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if not content:
                return "list", []

            data = json.loads(content)
            if isinstance(data, dict):
                tasks = data.get("tasks", [])
                return "dict", list(tasks) if isinstance(tasks, list) else []
            if isinstance(data, list):
                return "list", list(data)
            # Unexpected scalar/other — treat as empty backlog.
            return "list", []
        except (PermissionError, IOError, json.JSONDecodeError):
            # File is locked or being mid-written by a manual editor — back off.
            time.sleep(0.05 * (2 ** attempt))

    # Could not read cleanly after retries; treat as empty for THIS cycle only.
    logging.warning("tasks.json unreadable after retries — treating as empty this cycle.")
    return "list", []


def _write_tasks(tasks_file: str, kind: str, tasks: list) -> bool:
    """
    Atomically persist the remaining tasks using the .tmp-swap protocol with
    retry/backoff. Preserves the original on-disk shape (bare list vs wrapper
    object). Returns True on success, False if it could not persist after
    retries (caller must then NOT consider the popped task consumed).
    """
    payload = {"tasks": tasks} if kind == "dict" else tasks
    tmp_file = f"{tasks_file}.tmp"

    for attempt in range(IO_RETRY_ATTEMPTS):
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            os.replace(tmp_file, tasks_file)
            return True
        except (PermissionError, IOError):
            time.sleep(0.05 * (2 ** attempt))

    # Best-effort cleanup of a stranded temp file.
    try:
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
    except OSError:
        pass
    return False


def _normalise_task(task) -> dict:
    """
    Coerce a backlog entry into the dict payload shape the state machine expects
    (``current_task`` / ``proposed_code``). Strings or malformed entries are
    wrapped so downstream ``payload.get(...)`` calls never crash.
    """
    if isinstance(task, dict):
        return task
    return {"current_task": str(task), "proposed_code": ""}


def main() -> None:
    """Main builder state-machine loop."""
    mailbox = MailboxProtocol()

    logging.info("Builder agent started. Backlog file: %s", TASKS_FILE)

    # Ensure a clean starting state. If we restart mid-cycle, preserve it.
    builder_state = mailbox.read_builder()
    if builder_state.status not in ("idle", "tasks_completed_awaiting_final_signoff"):
        logging.warning("Builder restarting in non-idle state: %s", builder_state.status)
    else:
        builder_state = BuilderState(status="idle", payload={})
        mailbox.write_builder(builder_state)
        logging.info("Builder initialized to idle.")

    # Heartbeat throttle for the standby state. 0.0 forces an immediate first
    # heartbeat the moment the backlog is found empty.
    last_standby_log = 0.0

    while True:
        try:
            # -----------------------------------------------------------------
            # Read current states from mailbox
            # -----------------------------------------------------------------
            builder_state = mailbox.read_builder()
            auditor_state = mailbox.read_auditor()

            status = builder_state.status

            # =================================================================
            # IF status == "idle" — dynamic ingestion from tasks.json
            # =================================================================
            if status == "idle":
                kind, tasks = _read_tasks(TASKS_FILE)

                if tasks:
                    next_task = _normalise_task(tasks[0])
                    remaining = tasks[1:]

                    # Persist the pop FIRST. Only consume the task if the
                    # backlog was durably updated — otherwise defer to the next
                    # cycle so a write failure never loses or double-runs a task.
                    if _write_tasks(TASKS_FILE, kind, remaining):
                        builder_state.status = "working"
                        builder_state.payload = next_task
                        mailbox.write_builder(builder_state)
                        last_standby_log = 0.0  # re-arm heartbeat for next idle gap
                        logging.info(
                            "Ingested task from tasks.json: %s  (remaining in backlog: %d)",
                            next_task.get("current_task", "<unknown>"),
                            len(remaining),
                        )
                    else:
                        logging.error(
                            "Could not persist tasks.json after pop — deferring task to next cycle."
                        )
                else:
                    # Empty/missing backlog — stay alive and heartbeat.
                    now = time.time()
                    if now - last_standby_log >= STANDBY_HEARTBEAT_SECONDS:
                        logging.info("Standby: Awaiting tasks...")
                        last_standby_log = now

            # =================================================================
            # IF status == "working"
            # =================================================================
            elif status == "working":
                # Simulate brief work delay
                time.sleep(0.5)
                builder_state.status = "awaiting_review"
                mailbox.write_builder(builder_state)
                logging.info(
                    "Task staged for review: %s",
                    builder_state.payload.get("current_task", "<unknown>"),
                )

            # =================================================================
            # IF status == "awaiting_review"
            # =================================================================
            elif status == "awaiting_review":
                # Only react when the auditor has written a FRESH response.
                if auditor_state.timestamp <= builder_state.timestamp:
                    # Auditor has not yet responded — keep idling.
                    pass
                else:
                    directive = auditor_state.directive
                    if directive == "proceed":
                        logging.info(
                            "Audit APPROVED for: %s — Feedback: %s",
                            builder_state.payload.get("current_task", "<unknown>"),
                            auditor_state.feedback,
                        )
                        # Clear current task and return to idle for next task.
                        builder_state.status = "idle"
                        builder_state.payload = {}
                        mailbox.write_builder(builder_state)
                        logging.info("Transitioning back to idle for next task.")

                    elif directive == "edit_required":
                        logging.info(
                            "Audit EDIT REQUIRED for: %s — Feedback: %s",
                            builder_state.payload.get("current_task", "<unknown>"),
                            auditor_state.feedback,
                        )
                        # Append modification marker to proposed_code.
                        existing_code = builder_state.payload.get("proposed_code", "")
                        builder_state.payload["proposed_code"] = (
                            existing_code + "\n// Fixed: Added API validation checks"
                        )
                        # Reset to working so the loop re-stages for review.
                        builder_state.status = "working"
                        mailbox.write_builder(builder_state)
                        logging.info("Applied edit constraint. Re-staging task as working.")

                    elif directive == "hold":
                        logging.info("Auditor issued HOLD. Remaining in awaiting_review.")
                        # Do nothing — keep polling.

                    else:
                        logging.warning(
                            "Unknown auditor directive: '%s'. Ignoring.", directive
                        )

            # =================================================================
            # Any other / stale status — recover to idle so the loop keeps
            # serving the live backlog rather than getting stuck or exiting.
            # =================================================================
            else:
                logging.warning(
                    "Unrecognised builder status: '%s'. Recovering to idle.", status
                )
                builder_state.status = "idle"
                builder_state.payload = {}
                mailbox.write_builder(builder_state)

        except Exception as exc:
            logging.error("Unhandled exception in builder loop: %s", exc, exc_info=True)
            # Do NOT terminate — keep the loop alive for resilience.
            time.sleep(1)

        # Main loop cadence
        time.sleep(1)


if __name__ == "__main__":
    main()
