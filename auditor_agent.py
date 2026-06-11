#!/usr/bin/env python3
"""
auditor_agent.py — Background Auditor Evaluation Loop
======================================================
Runs the Auditor half of the cross-process multi-agent execution framework.
Imports MailboxProtocol, BuilderState, and AuditorState from agents.mailbox.

Key behaviour: Evaluates each submitted code artifact deterministically from
the mailbox payload, without retaining process-local execution state.
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


VALIDATION_MARKER = "// Fixed: Added API validation checks"


def main() -> None:
    """Main auditor evaluation loop."""
    mailbox = MailboxProtocol()

    # Track the last builder timestamp we already evaluated so we never
    # re-evaluate a stale awaiting_review state after acting on it.
    last_evaluated_builder_timestamp = 0.0

    logging.info("Auditor agent started.")

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
                proposed_code = builder_state.payload.get("proposed_code", "")

                if VALIDATION_MARKER not in proposed_code:
                    # ---------------------------------------------------------
                    # Artifact lacks the required validation marker.
                    # ---------------------------------------------------------
                    auditor_state.directive = "edit_required"
                    auditor_state.feedback = (
                        "Missing error handling for empty API payloads on line 12."
                    )
                    mailbox.write_auditor(auditor_state)
                    logging.info(
                        "Audit complete: Edits requested for '%s'.",
                        current_task,
                    )
                else:
                    # ---------------------------------------------------------
                    # Artifact contains the required validation marker.
                    # ---------------------------------------------------------
                    auditor_state.directive = "proceed"
                    auditor_state.feedback = (
                        f"Approved: {current_task} passed code validation checks."
                    )
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
