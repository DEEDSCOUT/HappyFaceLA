#!/usr/bin/env python3
"""
run_test_harness.py — Cross-Process State Machine Test Harness
==============================================================
Orchestrates a complete cold start, executes builder and auditor agents
concurrently, monitors state transitions in real-time, and asserts final
state correctness.

Phases:
  Phase 1 — Baseline Clean Reset
  Phase 2 — Concurrent Subprocess Execution
  Phase 3 — State Watcher Monitoring (30-second timeout)
  Phase 4 — Completion Verification & Final Report
"""

import os
import sys
import json
import time
import shutil
import logging
import subprocess
from dataclasses import asdict

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[Harness %(asctime)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("run_test_harness")

# ---------------------------------------------------------------------------
# Mailbox Integration
# ---------------------------------------------------------------------------
from agents.mailbox import MailboxProtocol, BuilderState, AuditorState

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AGENT_DIR = ".agent"
BUILDER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "builder_agent.py")
AUDITOR_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditor_agent.py")
TASKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.json")
MAX_TIMEOUT_SECONDS = 30
POLL_INTERVAL = 0.25  # How often the harness polls state files

# Two-task backlog seeded into tasks.json for the end-to-end run. Task names are
# deliberately kept as "Task 1"/"Task 2" so milestone detection via auditor
# feedback substrings continues to work.
SEED_TASKS = [
    {
        "current_task": "Task 1: Generate Data Ingestion Pipeline",
        "proposed_code": "// Artifacts for Task 1: Generate Data Ingestion Pipeline",
    },
    {
        "current_task": "Task 2: Implement Database Schemas",
        "proposed_code": "// Artifacts for Task 2: Implement Database Schemas",
    },
]


def _read_tasks_file() -> list:
    """Best-effort read of tasks.json; returns [] when missing/empty/unreadable."""
    if not os.path.exists(TASKS_FILE):
        return []
    try:
        with open(TASKS_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            return []
        data = json.loads(content)
        if isinstance(data, dict):
            return data.get("tasks", []) or []
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


# ===========================================================================
# Phase 1: Baseline Clean Reset
# ===========================================================================
def phase1_baseline_reset() -> MailboxProtocol:
    """
    Wipe any residual .agent directory contents and write a hard
    initialization baseline for both builder and auditor states.
    """
    logger.info("=" * 60)
    logger.info("PHASE 1: Baseline Clean Reset")
    logger.info("=" * 60)

    # Remove residual .agent directory if it exists
    if os.path.exists(AGENT_DIR):
        logger.info("Removing residual .agent directory...")
        shutil.rmtree(AGENT_DIR)
    else:
        logger.info("No residual .agent directory found — clean start.")

    # Instantiate protocol (creates .agent dir)
    mailbox = MailboxProtocol()

    # Write initial states
    builder_init = BuilderState(status="idle", payload={}, timestamp=0.0)
    auditor_init = AuditorState(directive="proceed", feedback="", timestamp=0.0)

    mailbox.write_builder(builder_init)
    mailbox.write_auditor(auditor_init)

    # Seed the dynamic backlog drop-box (tasks.json) with the two-task workload.
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(SEED_TASKS, f, indent=2)
    logger.info("Seeded tasks.json with %d tasks.", len(SEED_TASKS))

    # Verify initial state
    bs = mailbox.read_builder()
    aus = mailbox.read_auditor()
    logger.info("Builder state initialised:  status=%s  timestamp=%.3f", bs.status, bs.timestamp)
    logger.info("Auditor state initialised: directive=%s  timestamp=%.3f", aus.directive, aus.timestamp)
    logger.info("Phase 1 complete.\n")

    return mailbox


# ===========================================================================
# Phase 2: Concurrent Subprocess Execution
# ===========================================================================
def phase2_launch_agents():
    """
    Launch builder_agent.py and auditor_agent.py as concurrent background
    processes using subprocess.Popen. Returns (builder_proc, auditor_proc).
    """
    logger.info("=" * 60)
    logger.info("PHASE 2: Concurrent Subprocess Execution")
    logger.info("=" * 60)

    # Determine the Python executable (use same interpreter running this harness)
    python_exe = sys.executable

    logger.info("Launching builder_agent.py with: %s", python_exe)
    builder_proc = subprocess.Popen(
        [python_exe, BUILDER_SCRIPT],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,  # line-buffered
        text=True,
    )

    logger.info("Launching auditor_agent.py with: %s", python_exe)
    auditor_proc = subprocess.Popen(
        [python_exe, AUDITOR_SCRIPT],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
    )

    logger.info("Builder PID: %d", builder_proc.pid)
    logger.info("Auditor PID: %d", auditor_proc.pid)
    logger.info("Phase 2 complete — both agents running.\n")

    return builder_proc, auditor_proc


# ===========================================================================
# Helper: stream subprocess output in background thread
# ===========================================================================
import threading

def _stream_output(proc, prefix):
    """Read lines from proc.stdout and log them with a prefix."""
    try:
        for line in iter(proc.stdout.readline, ""):
            line = line.rstrip()
            if line:
                print(f"  [{prefix}] {line}")
    except (ValueError, OSError):
        # Process stdout closed — normal during shutdown
        pass


def _start_output_threads(builder_proc, auditor_proc):
    """Start daemon threads that forward subprocess output to the harness console."""
    bt = threading.Thread(target=_stream_output, args=(builder_proc, "Builder"), daemon=True)
    at = threading.Thread(target=_stream_output, args=(auditor_proc, "Auditor"), daemon=True)
    bt.start()
    at.start()
    return bt, at


# ===========================================================================
# Phase 3: State Watcher Monitoring
# ===========================================================================
def phase3_monitor(mailbox, builder_proc, auditor_proc):
    """
    Monitor .agent state files for real-time changes. Prints status
    whenever builder_state or auditor_state transitions. Times out
    after MAX_TIMEOUT_SECONDS.

    Returns a dict of observed events for Phase 4 verification.
    """
    logger.info("=" * 60)
    logger.info("PHASE 3: State Watcher Monitoring (timeout=%ds)", MAX_TIMEOUT_SECONDS)
    logger.info("=" * 60)

    # Start forwarding subprocess output
    _start_output_threads(builder_proc, auditor_proc)

    events = {
        "builder_transitions": [],
        "auditor_transitions": [],
        "task1_edit_cycle": False,
        "task1_proceed": False,
        "task2_proceed": False,
        "backlog_drained": False,
        "timed_out": False,
    }

    last_builder_ts = 0.0
    last_auditor_ts = 0.0
    start_time = time.time()

    while True:
        elapsed = time.time() - start_time
        if elapsed > MAX_TIMEOUT_SECONDS:
            logger.warning("TIMEOUT: %d seconds elapsed without completion.", MAX_TIMEOUT_SECONDS)
            events["timed_out"] = True
            break

        # -----------------------------------------------------------------
        # Poll builder state
        # -----------------------------------------------------------------
        try:
            builder_state = mailbox.read_builder()
            if builder_state.timestamp > last_builder_ts:
                last_builder_ts = builder_state.timestamp
                logger.info(
                    "  → Builder: status='%s'  timestamp=%.3f  task='%s'",
                    builder_state.status,
                    builder_state.timestamp,
                    builder_state.payload.get("current_task", ""),
                )
                events["builder_transitions"].append({
                    "status": builder_state.status,
                    "timestamp": builder_state.timestamp,
                    "task": builder_state.payload.get("current_task", ""),
                })

        except Exception as exc:
            logger.warning("Error reading builder state: %s", exc)

        # -----------------------------------------------------------------
        # Poll auditor state
        # -----------------------------------------------------------------
        try:
            auditor_state = mailbox.read_auditor()
            if auditor_state.timestamp > last_auditor_ts:
                last_auditor_ts = auditor_state.timestamp
                logger.info(
                    "  → Auditor: directive='%s'  feedback='%s'  timestamp=%.3f",
                    auditor_state.directive,
                    auditor_state.feedback,
                    auditor_state.timestamp,
                )
                events["auditor_transitions"].append({
                    "directive": auditor_state.directive,
                    "feedback": auditor_state.feedback,
                    "timestamp": auditor_state.timestamp,
                })

                # Track specific milestones for verification
                if auditor_state.directive == "edit_required":
                    events["task1_edit_cycle"] = True

                if "Approved" in auditor_state.feedback or auditor_state.directive == "proceed":
                    if "Task 1" in auditor_state.feedback:
                        events["task1_proceed"] = True
                    elif "Task 2" in auditor_state.feedback:
                        events["task2_proceed"] = True

        except Exception as exc:
            logger.warning("Error reading auditor state: %s", exc)

        # -----------------------------------------------------------------
        # Completion: both tasks approved AND backlog fully drained AND the
        # builder has returned to idle/standby. The dynamic builder never
        # exits, so completion is defined by drained state, not process exit.
        # -----------------------------------------------------------------
        if events["task1_proceed"] and events["task2_proceed"] and not events["backlog_drained"]:
            try:
                latest = mailbox.read_builder()
                if _read_tasks_file() == [] and latest.status == "idle":
                    events["backlog_drained"] = True
                    logger.info("Backlog drained, both tasks proceeded, builder back to standby.")
                    break
            except Exception as exc:
                logger.warning("Error during completion check: %s", exc)

        # Guard: the dynamic builder is expected to stay alive indefinitely.
        # If it died, surface it and stop monitoring (failure path).
        builder_poll = builder_proc.poll()
        if builder_poll is not None:
            logger.warning("Builder process exited unexpectedly with code: %d", builder_poll)
            break

        time.sleep(POLL_INTERVAL)

    logger.info("Phase 3 monitoring complete.\n")
    return events


# ===========================================================================
# Milestone computation (shared by the harness report and the pytest layer)
# ===========================================================================
def compute_milestones(events) -> dict:
    """
    Derive the canonical milestone invariant dict from a raw events dict.

    This is the single source of truth for pass/fail criteria so that both
    the human-facing verification report and the automated pytest layer
    assert against identical keys and semantics.
    """
    return {
        "Task 1 edit cycle triggered": events["task1_edit_cycle"],
        "Task 1 approved (proceed)": events["task1_proceed"],
        "Task 2 approved (proceed)": events["task2_proceed"],
        "Backlog drained (all tasks completed)": events["backlog_drained"],
        "Timed out": events["timed_out"],
    }


# ===========================================================================
# Phase 4: Completion Verification
# ===========================================================================
def phase4_verify(events, mailbox, builder_proc, auditor_proc):
    """
    Print a final verification report confirming:
      - Task 1 entered an edit cycle, recovered, and proceeded.
      - Task 2 finished successfully.
      - The tasks.json backlog was fully drained and the builder returned
        to idle/standby.
    Then terminate both subprocesses cleanly.
    """
    logger.info("=" * 60)
    logger.info("PHASE 4: Completion Verification")
    logger.info("=" * 60)

    # Read final states
    try:
        final_builder = mailbox.read_builder()
        final_auditor = mailbox.read_auditor()
    except Exception as exc:
        logger.error("Could not read final states: %s", exc)
        final_builder = None
        final_auditor = None

    # -------------------------------------------------------------------
    # Verification Report
    # -------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  VERIFICATION REPORT")
    print("=" * 60)

    # Builder state transitions
    print(f"\n  Builder transitions observed: {len(events['builder_transitions'])}")
    for i, t in enumerate(events["builder_transitions"], 1):
        print(f"    {i}. status='{t['status']}'  task='{t['task']}'  ts={t['timestamp']:.3f}")

    # Auditor state transitions
    print(f"\n  Auditor transitions observed: {len(events['auditor_transitions'])}")
    for i, t in enumerate(events["auditor_transitions"], 1):
        fb = t["feedback"][:60] + "..." if len(t["feedback"]) > 60 else t["feedback"]
        print(f"    {i}. directive='{t['directive']}'  feedback='{fb}'  ts={t['timestamp']:.3f}")

    # Milestone checks
    print("\n  Milestone Checks:")
    checks = compute_milestones(events)

    all_passed = True
    for label, result in checks.items():
        status_icon = "✓" if result else "✗"
        # Flip logic for timeout — it's a negative outcome
        if label == "Timed out":
            status_icon = "✗" if result else "✓"
            if result:
                all_passed = False
        elif not result:
            all_passed = False
        print(f"    [{status_icon}] {label}: {result}")

    # Final state summary
    if final_builder:
        print(f"\n  Final Builder State:")
        print(f"    status:    {final_builder.status}")
        print(f"    timestamp: {final_builder.timestamp:.3f}")
        print(f"    payload:   {final_builder.payload}")
    if final_auditor:
        print(f"\n  Final Auditor State:")
        print(f"    directive: {final_auditor.directive}")
        print(f"    feedback:  {final_auditor.feedback}")
        print(f"    timestamp: {final_auditor.timestamp:.3f}")

    print("\n" + "=" * 60)
    if all_passed and events["backlog_drained"]:
        print("  RESULT: ALL CHECKS PASSED ✓")
    else:
        print("  RESULT: SOME CHECKS FAILED ✗")
    print("=" * 60 + "\n")

    # -------------------------------------------------------------------
    # Terminate subprocesses
    # -------------------------------------------------------------------
    logger.info("Terminating subprocesses...")

    for name, proc in [("Builder", builder_proc), ("Auditor", auditor_proc)]:
        if proc.poll() is None:
            logger.info("Terminating %s (PID %d)...", name, proc.pid)
            try:
                proc.terminate()
                proc.wait(timeout=5)
                logger.info("%s terminated cleanly.", name)
            except subprocess.TimeoutExpired:
                logger.warning("%s did not terminate in time — killing.", name)
                proc.kill()
                proc.wait(timeout=3)
                logger.info("%s killed.", name)
            except Exception as exc:
                logger.warning("Error terminating %s: %s", name, exc)
        else:
            logger.info("%s already exited with code %d.", name, proc.poll())

    logger.info("Phase 4 complete. Harness finished.")
    return all_passed and events["backlog_drained"]


# ===========================================================================
# Reusable Orchestrator (used by both __main__ and the pytest layer)
# ===========================================================================
def run_harness() -> dict:
    """
    Execute the full Phase 1–4 lifecycle end-to-end and return a structured
    result dict:

        {
            "success": bool,        # overall pass/fail
            "events": dict,         # raw observed transitions/milestone flags
            "milestones": dict,     # canonical invariant dict (compute_milestones)
        }

    Subprocesses are always terminated in phase4_verify, even on the failure
    path, so callers do not leak background processes.
    """
    logger.info("Starting Cross-Process State Machine Test Harness")
    logger.info("Working directory: %s", os.getcwd())

    # Phase 1: Baseline Clean Reset
    mailbox = phase1_baseline_reset()

    # Phase 2: Launch agents concurrently
    builder_proc, auditor_proc = phase2_launch_agents()

    # Small grace period for processes to initialise
    time.sleep(0.5)

    try:
        # Phase 3: Monitor
        events = phase3_monitor(mailbox, builder_proc, auditor_proc)

        # Phase 4: Verify & cleanup (always terminates subprocesses)
        success = phase4_verify(events, mailbox, builder_proc, auditor_proc)
    finally:
        # Defensive: guarantee no orphaned agents if an exception escapes a phase
        for proc in (builder_proc, auditor_proc):
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=3)
                except Exception:
                    pass

    return {
        "success": success,
        "events": events,
        "milestones": compute_milestones(events),
    }


# ===========================================================================
# Main Entry Point
# ===========================================================================
def main():
    """Orchestrate the complete test harness run."""
    result = run_harness()
    success = result["success"]

    # Exit code based on verification result
    if success:
        logger.info("Test harness PASSED.")
        sys.exit(0)
    else:
        logger.error("Test harness FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    main()
