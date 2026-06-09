#!/usr/bin/env python3
"""
auditor_agent.py — Background Auditor Evaluation Loop
======================================================
Runs the Auditor half of the cross-process multi-agent execution framework.
Imports MailboxProtocol, BuilderState, and AuditorState from agents.mailbox.

Key behaviour: Forces exactly ONE edit_required cycle on the first review of
Task 1, then approves every subsequent review to exercise the full state machine.
"""

import sys
import time
import logging

# ---------------------------------------------------------------------------
# Logging setup — structured stdout output for the test harness
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[Auditor %(asctime)s] %(message)s",
    datefmt="%H:%M:%S",
)

# ---------------------------------------------------------------------------
# Mailbox Integration
# ---------------------------------------------------------------------------
from agents.mailbox import MailboxProtocol, BuilderState, AuditorState


def main() -> None:
    """Main auditor evaluation loop."""
    mailbox = MailboxProtocol()

    # Internal toggle: we force exactly ONE edit_required before approving.
    # Once the edit cycle has been issued, this flips to True and all subsequent
    # reviews result in "proceed".
    edit_issued = False

    # Track the last builder timestamp we already evaluated so we never
    # re-evaluate a stale awaiting_review state after acting on it.
    last_evaluated_builder_timestamp = 0.0

    logging.info("Auditor agent started. edit_issued=%s", edit_issued)

    while True:
        try:
            # -----------------------------------------------------------------
            # Read current states from mailbox
            # -----------------------------------------------------------------
            builder_state = mailbox.read_builder()
            auditor_state = mailbox.read_auditor()

            # =================================================================
            # Condition to Act:
            #   builder must be "awaiting_review" AND
            #   builder timestamp must be NEWER than the last one we evaluated
            # =================================================================
            if builder_state.status == "awaiting_review" and builder_state.timestamp > last_evaluated_builder_timestamp:

                # Mark this builder submission as evaluated so we don't re-process
                last_evaluated_builder_timestamp = builder_state.timestamp

                current_task = builder_state.payload.get("current_task", "<unknown>")

                if not edit_issued:
                    # ---------------------------------------------------------
                    # FIRST review: force an edit_required cycle
                    # ---------------------------------------------------------
                    auditor_state.directive = "edit_required"
                    auditor_state.feedback = (
                        "Missing error handling for empty API payloads on line 12."
                    )
                    mailbox.write_auditor(auditor_state)
                    edit_issued = True
                    logging.info(
                        "Audit complete: Edits requested for '%s'. edit_issued=%s",
                        current_task,
                        edit_issued,
                    )
                else:
                    # ---------------------------------------------------------
                    # All subsequent reviews: approve
                    # ---------------------------------------------------------
                    auditor_state.directive = "proceed"
                    auditor_state.feedback = f"Approved: {current_task}"
                    mailbox.write_auditor(auditor_state)
                    logging.info(
                        "Audit complete: Task approved to proceed — '%s'",
                        current_task,
                    )

            # If builder is at final sign-off, log and keep monitoring
            elif builder_state.status == "tasks_completed_awaiting_final_signoff":
                # Only log once per distinct timestamp to avoid spamming
                if builder_state.timestamp > last_evaluated_builder_timestamp:
                    last_evaluated_builder_timestamp = builder_state.timestamp
                    logging.info(
                        "Builder reached final sign-off. All tasks complete."
                    )

        except Exception as exc:
            logging.error(
                "Unhandled exception in auditor loop: %s", exc, exc_info=True
            )
            # Do NOT terminate — keep the loop alive for resilience
            time.sleep(1)

        # Main loop cadence
        time.sleep(1)


if __name__ == "__main__":
    main()
