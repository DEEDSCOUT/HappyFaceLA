#!/usr/bin/env python3
"""
builder_agent.py — Persistent Builder State-Machine Loop
=========================================================
Runs the Builder half of the cross-process multi-agent execution framework.
Imports MailboxProtocol, BuilderState, and AuditorState from agents.mailbox.
"""

import sys
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
# Static task queue — two sequential test items
# ---------------------------------------------------------------------------
TASK_QUEUE = [
    {
        "current_task": "Task 1: Generate Data Ingestion Pipeline",
        "proposed_code": "// Artifacts for Task 1: Generate Data Ingestion Pipeline",
    },
    {
        "current_task": "Task 2: Implement Database Schemas",
        "proposed_code": "// Artifacts for Task 2: Implement Database Schemas",
    },
]


def main() -> None:
    """Main builder state-machine loop."""
    mailbox = MailboxProtocol()
    queue = list(TASK_QUEUE)  # shallow copy so we can pop

    logging.info("Builder agent started. Task queue size: %d", len(queue))

    # Ensure a clean starting state
    builder_state = mailbox.read_builder()
    if builder_state.status not in ("idle", "tasks_completed_awaiting_final_signoff"):
        # If we somehow restart mid-cycle, preserve the existing state
        logging.warning("Builder restarting in non-idle state: %s", builder_state.status)
    else:
        builder_state = BuilderState(status="idle", payload={})
        mailbox.write_builder(builder_state)
        logging.info("Builder initialized to idle.")

    while True:
        try:
            # -----------------------------------------------------------------
            # Read current states from mailbox
            # -----------------------------------------------------------------
            builder_state = mailbox.read_builder()
            auditor_state = mailbox.read_auditor()

            status = builder_state.status

            # =================================================================
            # IF status == "idle"
            # =================================================================
            if status == "idle":
                if queue:
                    task_data = queue.pop(0)
                    builder_state.status = "working"
                    builder_state.payload = task_data
                    mailbox.write_builder(builder_state)
                    logging.info(
                        "Picked up task: %s",
                        task_data.get("current_task", "<unknown>"),
                    )
                else:
                    # No more tasks — signal completion and exit
                    builder_state.status = "tasks_completed_awaiting_final_signoff"
                    builder_state.payload = {"session": "all_tasks_done"}
                    mailbox.write_builder(builder_state)
                    logging.info(
                        "All tasks completed. Status → tasks_completed_awaiting_final_signoff. Exiting."
                    )
                    sys.exit(0)

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
                # Only react when the auditor has written a FRESH response
                if auditor_state.timestamp <= builder_state.timestamp:
                    # Auditor has not yet responded — keep idling
                    pass
                else:
                    # Fresh auditor response detected
                    directive = auditor_state.directive
                    if directive == "proceed":
                        logging.info(
                            "Audit APPROVED for: %s — Feedback: %s",
                            builder_state.payload.get("current_task", "<unknown>"),
                            auditor_state.feedback,
                        )
                        # Clear current task and return to idle for next task
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
                        # Append modification marker to proposed_code
                        existing_code = builder_state.payload.get("proposed_code", "")
                        builder_state.payload["proposed_code"] = (
                            existing_code + "\n// Fixed: Added API validation checks"
                        )
                        # Reset to working so the loop re-stages for review
                        builder_state.status = "working"
                        mailbox.write_builder(builder_state)
                        logging.info(
                            "Applied edit constraint. Re-staging task as working."
                        )

                    elif directive == "hold":
                        logging.info("Auditor issued HOLD. Remaining in awaiting_review.")
                        # Do nothing — keep polling

                    else:
                        logging.warning(
                            "Unknown auditor directive: '%s'. Ignoring.", directive
                        )

            # =================================================================
            # IF status == "tasks_completed_awaiting_final_signoff"
            # =================================================================
            elif status == "tasks_completed_awaiting_final_signoff":
                logging.info("Already at final sign-off. Exiting.")
                sys.exit(0)

            else:
                logging.warning("Unrecognised builder status: '%s'. Resetting to idle.", status)
                builder_state.status = "idle"
                builder_state.payload = {}
                mailbox.write_builder(builder_state)

        except Exception as exc:
            logging.error("Unhandled exception in builder loop: %s", exc, exc_info=True)
            # Do NOT terminate — keep the loop alive for resilience
            time.sleep(1)

        # Main loop cadence
        time.sleep(1)


if __name__ == "__main__":
    main()
