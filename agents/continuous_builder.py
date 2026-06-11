"""
Continuous Builder Engine (Path B)
===================================
An infinite-workspace terminal daemon that autonomously proposes, watches,
and reacts to auditor directives through the MailboxProtocol.

Runs as an independent background process. Exits only after auditor sign-off
on a successful "proceed" directive, or if task_backlog.txt needs seeding.
"""

import os
import sys
import json
import time

# ---------------------------------------------------------------------------
# Mailbox Integration — import the canonical atomic, lock-protected classes
# ---------------------------------------------------------------------------
from agents.mailbox import MailboxProtocol, BuilderState, AuditorState

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TASK_BACKLOG_FILENAME = "task_backlog.txt"
POLL_INTERVAL_SECONDS = 0.5

TASK_BACKLOG_TEMPLATE = """\
# ==============================================
# TASK BACKLOG — Continuous Builder Master Goal
# ==============================================
#
# This file is the single source of truth for the Continuous Builder daemon.
# Write your master goal below as plain text. The builder will read this
# file, generate a structured JSON proposal via the LLM, and submit it for
# auditor review before writing any files to the workspace.
#
# Lines starting with '#' are treated as comments and stripped before
# the goal is sent to the model.
#
# Replace the placeholder below with your actual task definition:
#
MASTER_GOAL:
(Define your master goal here. Be specific about which files to create
or modify, the desired content structure, and any constraints.)
"""

# ---------------------------------------------------------------------------
# LLM Proposal Generator
# ---------------------------------------------------------------------------

def generate_proposal(master_goal: str) -> dict:
    """
    Call the OpenAI API to produce a strict JSON proposal blueprint that
    conforms to the required schema.  Returns the parsed dict or raises
    on unrecoverable failure.
    """
    import openai

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "OPENAI_API_KEY environment variable is not set. "
            "The continuous builder cannot generate proposals without it."
        )

    base_url = os.environ.get("OPENAI_BASE_URL")  # optional — may be None
    client = openai.OpenAI(api_key=api_key, base_url=base_url)

    system_prompt = (
        "You are a meticulous builder agent. You receive a master goal and "
        "must return ONLY a raw JSON object — no markdown fences, no "
        "commentary — matching this schema exactly:\n\n"
        "{\n"
        '  "current_task": "String detailing the target assignment",\n'
        '  "proposed_plan": ["Step 1...", "Step 2..."],\n'
        '  "exact_markdown_text_changes": [\n'
        '    {"file": "path/to/target_file.md", "operation": "replace", '
        '"new_markdown": "Literal updated content"}\n'
        "  ],\n"
        '  "proposal_verdict_line": "VERDICT: PROCEED"\n'
        "}\n\n"
        "Rules:\n"
        "- The `exact_markdown_text_changes` array must contain one entry per "
        "file that needs to be created or overwritten.\n"
        "- Each `new_markdown` value must be the COMPLETE final content for "
        "that file.\n"
        "- The `operation` field must always be \"replace\".\n"
        "- Return ONLY the JSON object. No prose, no code fences.\n"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": master_goal},
            ],
            temperature=0.2,
        )
        raw_text = response.choices[0].message.content.strip()

        # Strip markdown code fences if the model wraps them despite instructions
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            # Remove opening fence (e.g. ```json)
            lines = lines[1:]
            # Remove closing fence
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_text = "\n".join(lines).strip()

        proposal = json.loads(raw_text)

        # ---- Schema validation (lightweight) ----
        required_keys = {"current_task", "proposed_plan", "exact_markdown_text_changes", "proposal_verdict_line"}
        missing = required_keys - set(proposal.keys())
        if missing:
            raise ValueError(f"LLM response missing required keys: {missing}")

        if not isinstance(proposal["exact_markdown_text_changes"], list):
            raise ValueError("exact_markdown_text_changes must be a list")

        for entry in proposal["exact_markdown_text_changes"]:
            for key in ("file", "operation", "new_markdown"):
                if key not in entry:
                    raise ValueError(f"exact_markdown_text_changes entry missing key: {key}")

        return proposal

    except json.JSONDecodeError as exc:
        print(f"[ContinuousBuilder] ERROR: LLM returned non-JSON output. {exc}")
        raise
    except openai.APIError as exc:
        print(f"[ContinuousBuilder] ERROR: OpenAI API call failed. {exc}")
        raise
    except Exception as exc:
        print(f"[ContinuousBuilder] ERROR: Unexpected error generating proposal. {exc}")
        raise


# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------

def apply_markdown_changes(changes: list) -> None:
    """
    Safely iterate through the allowlisted exact_markdown_text_changes,
    create any missing directories, and write the physical files to the
    local workspace.  All file operations use encoding='utf-8'.
    """
    for entry in changes:
        target_path = entry["file"]
        new_content = entry["new_markdown"]

        # Ensure parent directories exist
        parent_dir = os.path.dirname(target_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)

        # Write the file atomically to protect against partial writes
        tmp_path = f"{target_path}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            os.replace(tmp_path, target_path)
            print(f"[ContinuousBuilder] Wrote file: {target_path}")
        except (OSError, IOError) as exc:
            # Clean up temp file on failure
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            print(f"[ContinuousBuilder] ERROR writing {target_path}: {exc}")


# ---------------------------------------------------------------------------
# Task Backlog Ingestion
# ---------------------------------------------------------------------------

def read_master_goal(workspace_root: str) -> str | None:
    """
    Implements the Task Ingestion Boundary:
      - If task_backlog.txt does not exist, create it with the template and
        return None (signalling the caller should exit).
      - If it exists, read and return its contents as the active master goal,
        stripping comment lines that start with '#'.
    """
    backlog_path = os.path.join(workspace_root, TASK_BACKLOG_FILENAME)

    if not os.path.exists(backlog_path):
        # Seed the template and signal first-run exit
        try:
            with open(backlog_path, "w", encoding="utf-8") as f:
                f.write(TASK_BACKLOG_TEMPLATE)
            print(f"[ContinuousBuilder] Created {TASK_BACKLOG_FILENAME} template in workspace root.")
            print(f"[ContinuousBuilder] Please edit {TASK_BACKLOG_FILENAME} with your master goal and re-run.")
        except (OSError, IOError) as exc:
            print(f"[ContinuousBuilder] ERROR: Could not create {TASK_BACKLOG_FILENAME}: {exc}")
        return None

    try:
        with open(backlog_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except (OSError, IOError) as exc:
        print(f"[ContinuousBuilder] ERROR: Could not read {TASK_BACKLOG_FILENAME}: {exc}")
        return None

    # Strip comment lines
    lines = [
        line for line in raw.splitlines()
        if not line.lstrip().startswith("#")
    ]
    goal = "\n".join(lines).strip()

    if not goal:
        print(f"[ContinuousBuilder] {TASK_BACKLOG_FILENAME} exists but contains no actionable goal text.")
        return None

    return goal


# ---------------------------------------------------------------------------
# Main Daemon Loop
# ---------------------------------------------------------------------------

def main():
    """
    Infinite State Machine:
      Phase 1 (Propose) — Read backlog, generate proposal, write mailbox
      Phase 2 (Watch)   — Poll auditor mailbox for directives
      Phase 3 (React)  — Apply changes (proceed) or re-propose (edit_required)
    """

    workspace_root = os.getcwd()
    mailbox = MailboxProtocol(workspace_root=os.path.join(workspace_root, ".agent"))

    # Initialize builder state to idle
    mailbox.write_builder(BuilderState(status="idle", payload={}))
    print("[ContinuousBuilder] ▶ Infinite Workspace Execution Loop Initialized.")

    # ---- Task Ingestion Boundary ----
    master_goal = read_master_goal(workspace_root)
    if master_goal is None:
        # Template was seeded or backlog was empty — exit cleanly
        print("[ContinuousBuilder] Exiting after task_backlog.txt setup. Re-run after editing.")
        sys.exit(0)

    print(f"[ContinuousBuilder] Master goal loaded ({len(master_goal)} chars).")

    # Track the active goal so edits can be appended as constraints
    active_goal = master_goal

    # ================================================================
    # Phase 1 — Propose
    # ================================================================
    print("[ContinuousBuilder] Phase 1 (Propose): Generating LLM proposal…")

    try:
        proposal = generate_proposal(active_goal)
    except Exception as exc:
        print(f"[ContinuousBuilder] FATAL: Initial proposal generation failed: {exc}")
        print("[ContinuousBuilder] Daemon will exit. Fix the error and re-run.")
        sys.exit(1)

    current_task = proposal.get("current_task", "Unspecified task")
    print(f"[ContinuousBuilder] Current task: {current_task}")
    print(f"[ContinuousBuilder] Proposed plan: {proposal.get('proposed_plan', [])}")
    print(f"[ContinuousBuilder] File changes count: {len(proposal.get('exact_markdown_text_changes', []))}")

    # Write the proposal to the mailbox with status awaiting_review
    mailbox.write_builder(BuilderState(
        status="awaiting_review",
        payload=proposal,
    ))

    # Lock the submission timestamp so we can detect fresh auditor responses
    submission_timestamp = time.time()
    print(f"[ContinuousBuilder] Proposal written to mailbox @ t={submission_timestamp:.3f}")
    print("[ContinuousBuilder] Status: AWAITING_REVIEW — locked until auditor responds.")

    # ================================================================
    # Phase 2 — Watch (infinite loop)
    # ================================================================
    print("[ContinuousBuilder] Phase 2 (Watch): Entering auditor poll loop…")

    while True:
        try:
            auditor_state = mailbox.read_auditor()
        except Exception as exc:
            print(f"[ContinuousBuilder] WARNING: Mailbox read failed: {exc}")
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        # Only act on fresh auditor writes — timestamp must exceed our
        # last submission time to guarantee out-of-band freshness
        if auditor_state.timestamp > submission_timestamp:

            # ============================================================
            # Phase 3 — React
            # ============================================================

            # --- PROCEED ---
            if auditor_state.directive == "proceed":
                print("[ContinuousBuilder] Phase 3 (React): Auditor → PROCEED")
                print("[ContinuousBuilder] Applying allowlisted markdown changes…")

                try:
                    apply_markdown_changes(proposal.get("exact_markdown_text_changes", []))
                except Exception as exc:
                    print(f"[ContinuousBuilder] WARNING: Error during file write: {exc}")

                # Update mailbox to terminal status
                mailbox.write_builder(BuilderState(
                    status="tasks_completed_awaiting_final_signoff",
                    payload={
                        "current_task": current_task,
                        "files_modified": [
                            e["file"] for e in proposal.get("exact_markdown_text_changes", [])
                        ],
                        "proposal_verdict_line": proposal.get("proposal_verdict_line", ""),
                    },
                ))
                print("[ContinuousBuilder] All files written. Status → tasks_completed_awaiting_final_signoff")
                print("[ContinuousBuilder] Safe exit. Daemon terminating.")
                sys.exit(0)

            # --- EDIT REQUIRED ---
            elif auditor_state.directive == "edit_required":
                feedback = auditor_state.feedback or "(no feedback provided)"
                print(f"[ContinuousBuilder] Phase 3 (React): Auditor → EDIT_REQUIRED")
                print(f"[ContinuousBuilder] Feedback received:\n  → {feedback}")

                # Append correction constraint to the active master goal
                active_goal = (
                    f"{active_goal}\n\n"
                    f"[AUDITOR CORRECTION CONSTRAINT]: {feedback}"
                )
                print("[ContinuousBuilder] Re-querying LLM with adjusted goal…")

                try:
                    proposal = generate_proposal(active_goal)
                except Exception as exc:
                    print(f"[ContinuousBuilder] WARNING: Re-proposal generation failed: {exc}")
                    print("[ContinuousBuilder] Will retry poll loop on next auditor cycle.")
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue

                current_task = proposal.get("current_task", "Unspecified task (revision)")
                print(f"[ContinuousBuilder] Revised task: {current_task}")

                # Write adjusted proposal back to mailbox
                mailbox.write_builder(BuilderState(
                    status="awaiting_review",
                    payload=proposal,
                ))
                submission_timestamp = time.time()
                print(f"[ContinuousBuilder] Revised proposal written @ t={submission_timestamp:.3f}")
                print("[ContinuousBuilder] Status: AWAITING_REVIEW — returning to watch loop.")

            # --- HOLD ---
            elif auditor_state.directive == "hold":
                print("[ContinuousBuilder] Phase 3 (React): Auditor → HOLD. Pausing…")
                # Remains in the watch loop; no action taken

            else:
                print(f"[ContinuousBuilder] WARNING: Unrecognised auditor directive: "
                      f"'{auditor_state.directive}'. Ignoring.")

        # ---- Poll cadence ----
        time.sleep(POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    main()
