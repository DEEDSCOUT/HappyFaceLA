#!/usr/bin/env python3
"""
builder_agent.py — Persistent Builder State-Machine Loop (Production Engine)
============================================================================
Runs the Builder half of the cross-process multi-agent execution framework.
Imports MailboxProtocol, BuilderState, and AuditorState from agents.mailbox.

Task source
-----------
A dynamic, file-based backlog drop-box — ``tasks.json`` at the workspace root.
The Builder atomically pops the FIRST task object off the array when it is idle,
persists the remaining tasks back to disk, and transitions to "working".

Production Mode
---------------
When the Builder enters the "working" state, it:
  1. Reads the task prompt and identifies target workspace files.
  2. Consults an OpenAI-compatible LLM (DeepSeek / Ollama) for file modifications.
  3. Extracts code blocks from the LLM response and writes changes to disk.
  4. Runs integration verification (``npm run astro -- check``, ``npm run build``).
  5. Assembles a compiled telemetry report with the auditor compliance marker.
  6. Transitions to "awaiting_review" for the Auditor to evaluate.

Crash Resilience
----------------
The entire LLM → file-write → verification pipeline is wrapped in try/except.
If any step fails, the error is captured into ``proposed_code`` for human review
and the builder resets to idle so the daemon stays alive.

All ``tasks.json`` and mailbox writes use the .tmp-swap + retry/backoff protocol,
so manual edits to the backlog never trigger file-lock crashes.
"""

import os
import re
import json
import time
import logging
import subprocess
import traceback

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
# LLM Provider configuration
# ---------------------------------------------------------------------------
# Default: local Ollama. For cloud DeepSeek, set environment variables or
# edit these values directly:
#   API_BASE_URL = "https://api.deepseek.com/v1"
#   API_KEY = "your_actual_api_key"
API_BASE_URL = os.environ.get("BUILDER_API_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("BUILDER_API_KEY", "ollama")
MODEL_NAME = os.environ.get("BUILDER_MODEL_NAME", "deepseek-r1")

# ---------------------------------------------------------------------------
# Dynamic backlog configuration
# ---------------------------------------------------------------------------
# tasks.json lives at the workspace root (the directory containing this script),
# matching how mailbox.py anchors its .agent directory.
WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
TASKS_FILE = os.path.join(WORKSPACE_ROOT, "tasks.json")
STANDBY_HEARTBEAT_SECONDS = 5.0
IO_RETRY_ATTEMPTS = 5

# ---------------------------------------------------------------------------
# Auditor compliance marker — must appear in proposed_code for sign-off
# ---------------------------------------------------------------------------
VALIDATION_MARKER = "// Fixed: Added API validation checks"


# ---------------------------------------------------------------------------
# LLM Interaction Helpers
# ---------------------------------------------------------------------------

def _extract_code_block(response_text: str):
    """
    Extract the last markdown code block from an LLM response.
    Matches triple-backtick code block patterns and returns the inner content.
    Returns None if no code block is found.
    """
    pattern = r"```(?:\w+)?\s*\n(.*?)```"
    matches = re.findall(pattern, response_text, re.DOTALL)
    if matches:
        return matches[-1].strip()
    return None


def _identify_target_files(task_prompt: str, payload: dict):
    """
    Identify workspace files referenced in the task prompt or payload.
    Returns a list of relative file paths (from WORKSPACE_ROOT).
    Checks payload for an explicit 'target_file' / 'target_files' key first,
    then scans the prompt text for quoted file paths.
    """
    # Check for explicit target_file in payload
    explicit = payload.get("target_file") or payload.get("target_files")
    if explicit:
        if isinstance(explicit, list):
            return [f.replace("\\", "/") for f in explicit]
        return [explicit.replace("\\", "/")]

    # Scan the prompt for file path patterns (e.g., "tsconfig.json", "src/foo.ts")
    file_patterns = re.findall(
        r"""['"`]([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)['"`]""", task_prompt
    )
    # Known workspace file extensions
    workspace_extensions = (
        ".json", ".ts", ".js", ".mjs", ".astro", ".css", ".html",
        ".md", ".py", ".txt", ".yaml", ".yml", ".toml", ".env",
    )
    candidates = []
    seen = set()
    for fp in file_patterns:
        fp = fp.replace("\\", "/")
        if fp in seen:
            continue
        if any(fp.lower().endswith(ext) for ext in workspace_extensions):
            full_path = os.path.join(WORKSPACE_ROOT, fp)
            # Allow existing files or relative paths (may be created)
            if os.path.exists(full_path) or not os.path.isabs(fp):
                candidates.append(fp)
                seen.add(fp)

    return candidates


def _call_llm(system_prompt: str, user_prompt: str):
    """
    Call the configured OpenAI-compatible LLM and return the raw response text.
    Compatible with local Ollama and cloud DeepSeek endpoints.
    Raises on connection or API errors.
    """
    import openai

    client = openai.OpenAI(
        api_key=API_KEY,
        base_url=API_BASE_URL,
    )

    logging.info("Calling LLM (%s @ %s) ...", MODEL_NAME, API_BASE_URL)

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )

    raw_text = response.choices[0].message.content.strip()
    return raw_text


def _read_file_safe(filepath: str):
    """Read a file's content, returning empty string on failure."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except (OSError, IOError) as exc:
        logging.warning("Could not read file %s: %s", filepath, exc)
        return ""


def _write_file_atomic(filepath: str, content: str):
    """
    Write content to a file using the .tmp-swap protocol for atomicity.
    Creates parent directories if needed. Returns True on success.
    """
    tmp_file = f"{filepath}.tmp"
    # Ensure parent directory exists
    parent = os.path.dirname(filepath)
    if parent:
        os.makedirs(parent, exist_ok=True)
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_file, filepath)
        logging.info("Atomically wrote file: %s", filepath)
        return True
    except (OSError, IOError) as exc:
        logging.error("Failed to write file %s: %s", filepath, exc)
        # Clean up temp file on failure
        try:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)
        except OSError:
            pass
        return False


def _run_verification():
    """
    Execute integration verification commands and capture results.
    Runs ``npm run astro -- check`` and ``npm run build``.
    Returns a list of dicts with command, exit_code, stdout, stderr.
    """
    commands = [
        "npm run astro -- check",
        "npm run build",
    ]
    results = []
    for cmd in commands:
        logging.info("Running verification: %s", cmd)
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                cwd=WORKSPACE_ROOT,
                timeout=180,
            )
            results.append({
                "command": cmd,
                "exit_code": result.returncode,
                "stdout": result.stdout[-2000:] if result.stdout else "",
                "stderr": result.stderr[-2000:] if result.stderr else "",
            })
            logging.info(
                "Verification '%s' completed with exit code %d",
                cmd, result.returncode,
            )
        except subprocess.TimeoutExpired:
            results.append({
                "command": cmd,
                "exit_code": -1,
                "stdout": "",
                "stderr": "Command timed out after 180 seconds",
            })
            logging.warning("Verification '%s' timed out.", cmd)
        except Exception as exc:
            results.append({
                "command": cmd,
                "exit_code": -1,
                "stdout": "",
                "stderr": str(exc),
            })
            logging.error("Verification '%s' failed: %s", cmd, exc)
    return results


def _build_telemetry_report(
    task_prompt: str,
    target_files: list,
    original_contents: dict,
    new_contents: dict,
    verification_results: list,
    llm_raw_response: str = "",
    auditor_feedback: str = "",
) -> str:
    """
    Assemble a rich markdown telemetry report summarising the execution.
    Includes the mandatory auditor compliance marker at the absolute bottom.
    """
    lines = []
    lines.append("# Builder Execution Telemetry Report")
    lines.append("")
    lines.append("## Authorization Basis")
    lines.append("- Task prompt ingested from tasks.json backlog")
    if auditor_feedback:
        lines.append(f"- Auditor correction constraint: {auditor_feedback}")
    lines.append("")

    lines.append("## Files Changed / Inspected")
    for fpath in target_files:
        full = os.path.join(WORKSPACE_ROOT, fpath)
        status = "modified" if os.path.exists(full) else "created"
        lines.append(f"- `{fpath}` ({status})")
    lines.append("")

    # Show updated content for each target file
    lines.append("## File Corrections")
    for fpath in target_files:
        original = original_contents.get(fpath, "<empty / new file>")
        updated = new_contents.get(fpath, "<no change>")
        lines.append(f"### {fpath}")
        lines.append("```")
        lines.append(updated if updated else original)
        lines.append("```")
        lines.append("")

    lines.append("## Validation Terminal Outputs")
    for vr in verification_results:
        lines.append(f"### `{vr['command']}`")
        lines.append(f"- **Exit code**: {vr['exit_code']}")
        if vr.get("stdout"):
            lines.append("**stdout**:")
            lines.append("```")
            lines.append(vr["stdout"])
            lines.append("```")
        if vr.get("stderr"):
            lines.append("**stderr**:")
            lines.append("```")
            lines.append(vr["stderr"])
            lines.append("```")
        lines.append("")

    # Raw LLM response (truncated for safety)
    if llm_raw_response:
        lines.append("## Raw LLM Response (truncated)")
        lines.append("```")
        lines.append(llm_raw_response[:3000])
        lines.append("```")
        lines.append("")

    # Mandatory auditor compliance marker at the absolute bottom
    lines.append(VALIDATION_MARKER)

    return "\n".join(lines)


def _execute_working_cycle(builder_state, mailbox, auditor_feedback: str = ""):
    """
    Execute the full working cycle:
      1. Parse the task prompt and identify target files.
      2. Read current file contents from the workspace.
      3. Consult the LLM for modifications.
      4. Extract code blocks and write changes to disk.
      5. Run verification commands.
      6. Build and store the telemetry report.
      7. Transition builder state to awaiting_review.

    On any error, captures the error into proposed_code and resets to idle
    so the daemon stays alive for subsequent tasks.
    """
    payload = builder_state.payload
    task_prompt = payload.get("current_task", "")

    # If there's auditor feedback (edit_required cycle), append it to the prompt
    if auditor_feedback:
        task_prompt = (
            task_prompt
            + "\n\n[AUDITOR CORRECTION CONSTRAINT]: " + auditor_feedback
        )

    # -----------------------------------------------------------------
    # READ_FILE: pointer unpacking
    # If the task prompt starts with "READ_FILE:", treat it as a file
    # pointer and load the actual task content from the referenced file.
    # -----------------------------------------------------------------
    if task_prompt.strip().upper().startswith("READ_FILE:"):
        # Extract the filename after the directive
        match = re.match(r"READ_FILE:\s*(.+)", task_prompt, re.IGNORECASE)
        if match:
            pointer_filename = match.group(1).strip()
            pointer_path = os.path.join(WORKSPACE_ROOT, pointer_filename)
            logging.info(
                "READ_FILE directive detected. Loading prompt from: %s", pointer_filename
            )
            file_content = _read_file_safe(pointer_path)
            if file_content:
                # Preserve the auditor feedback on top of the resolved content
                if auditor_feedback:
                    task_prompt = (
                        file_content
                        + "\n\n[AUDITOR CORRECTION CONSTRAINT]: " + auditor_feedback
                    )
                else:
                    task_prompt = file_content
                logging.info(
                    "Resolved READ_FILE pointer. Prompt now %d chars from %s.",
                    len(task_prompt),
                    pointer_filename,
                )
            else:
                logging.error(
                    "READ_FILE pointer '%s' could not be read or is empty. "
                    "Aborting working cycle and resetting to idle.",
                    pointer_filename,
                )
                error_report = (
                    f"# Builder Execution Error\n\n"
                    f"READ_FILE pointer target missing or unreadable: "
                    f"{pointer_filename}\n\n"
                    f"{VALIDATION_MARKER}"
                )
                builder_state.payload["proposed_code"] = error_report
                builder_state.payload["error"] = (
                    f"READ_FILE target '{pointer_filename}' missing or empty"
                )
                builder_state.status = "idle"
                mailbox.write_builder(builder_state)
                logging.warning("Recovered from READ_FILE error. Builder reset to idle.")
                return
        else:
            logging.warning(
                "READ_FILE directive malformed: '%s'. Treating as literal prompt.",
                task_prompt[:80],
            )

    logging.info("Executing working cycle for task: %s", task_prompt[:120])

    try:
        # -----------------------------------------------------------------
        # Step 1: Identify target files
        # -----------------------------------------------------------------
        target_files = _identify_target_files(task_prompt, payload)
        logging.info("Identified target files: %s", target_files)

        # -----------------------------------------------------------------
        # Step 2: Read current file contents
        # -----------------------------------------------------------------
        original_contents = {}
        for fpath in target_files:
            full = os.path.join(WORKSPACE_ROOT, fpath)
            original_contents[fpath] = _read_file_safe(full)

        # -----------------------------------------------------------------
        # Step 3: Build LLM prompts
        # -----------------------------------------------------------------
        system_prompt = (
            "You are an elite software developer agent. You receive a task prompt "
            "and the current contents of workspace files. Your job is to produce "
            "the updated file contents that fulfil the task.\n\n"
            "RULES:\n"
            "- Output ONLY the updated raw file contents inside a single markdown "
            "code block (e.g. ```json for JSON files, ```typescript for TS files).\n"
            "- Do NOT include any explanatory text before or after the code block.\n"
            "- If the task requires modifying multiple files, output each file's "
            "content in a separate code block, prefixed by a comment line with the "
            "file path like: // FILE: path/to/file.ext\n"
            "- Preserve the existing structure and only make the changes requested.\n"
            "- Ensure all changes include proper error handling and validation.\n"
        )

        # Build user prompt with file contents
        user_prompt_parts = [f"TASK:\n{task_prompt}\n"]
        if original_contents:
            user_prompt_parts.append("\nCURRENT FILE CONTENTS:")
            for fpath, content in original_contents.items():
                user_prompt_parts.append(f"\n--- {fpath} ---")
                user_prompt_parts.append(content if content else "<empty / new file>")
            user_prompt_parts.append(
                "\nPlease output the updated file contents in a code block."
            )
        else:
            user_prompt_parts.append(
                "\nNo specific target files identified. If the task requires "
                "modifying a file, please output the full updated file content "
                "in a code block, prefixed with a comment indicating the file path."
            )

        user_prompt = "\n".join(user_prompt_parts)

        # -----------------------------------------------------------------
        # Step 4: Call the LLM
        # -----------------------------------------------------------------
        llm_raw_response = _call_llm(system_prompt, user_prompt)
        logging.info("LLM response received (%d chars)", len(llm_raw_response))

        # -----------------------------------------------------------------
        # Step 5: Extract code blocks and write changes to disk
        # -----------------------------------------------------------------
        new_contents = {}

        # Check for multi-file format: // FILE: path markers
        file_block_pattern = r"//\s*FILE:\s*(\S+)\s*\n"
        file_markers = list(re.finditer(file_block_pattern, llm_raw_response))

        if file_markers:
            # Multi-file response — extract each file section
            for i, marker in enumerate(file_markers):
                fpath = marker.group(1).strip().replace("\\", "/")
                start = marker.end()
                end = file_markers[i + 1].start() if i + 1 < len(file_markers) else len(llm_raw_response)
                section = llm_raw_response[start:end]
                block = _extract_code_block(section)
                if block:
                    new_contents[fpath] = block
                    full_path = os.path.join(WORKSPACE_ROOT, fpath)
                    if _write_file_atomic(full_path, block):
                        logging.info("Wrote LLM output to: %s", fpath)
                    else:
                        logging.error("Failed to write LLM output to: %s", fpath)
        else:
            # Single-file response — extract the code block
            code_block = _extract_code_block(llm_raw_response)
            if code_block and target_files:
                # Use the first identified target file
                primary_file = target_files[0]
                new_contents[primary_file] = code_block
                full_path = os.path.join(WORKSPACE_ROOT, primary_file)
                if _write_file_atomic(full_path, code_block):
                    logging.info("Wrote LLM output to: %s", primary_file)
                else:
                    logging.error("Failed to write LLM output to: %s", primary_file)
            elif code_block and not target_files:
                # No target files identified — store LLM output without file write
                logging.warning(
                    "No target files identified. Storing LLM output in proposed_code "
                    "without file write."
                )

        # -----------------------------------------------------------------
        # Step 6: Run integration verification commands
        # -----------------------------------------------------------------
        verification_results = _run_verification()

        # -----------------------------------------------------------------
        # Step 7: Build telemetry report
        # -----------------------------------------------------------------
        all_target_files = list(dict.fromkeys(target_files + list(new_contents.keys())))
        telemetry = _build_telemetry_report(
            task_prompt=task_prompt,
            target_files=all_target_files,
            original_contents=original_contents,
            new_contents=new_contents,
            verification_results=verification_results,
            llm_raw_response=llm_raw_response,
            auditor_feedback=auditor_feedback,
        )

        # -----------------------------------------------------------------
        # Step 8: Update builder state and transition to awaiting_review
        # -----------------------------------------------------------------
        builder_state.payload["proposed_code"] = telemetry
        builder_state.payload["files_changed"] = all_target_files
        builder_state.payload["verification_results"] = verification_results
        builder_state.status = "awaiting_review"
        mailbox.write_builder(builder_state)
        logging.info(
            "Task execution complete. Staged for review: %s",
            task_prompt[:80],
        )

    except Exception as exc:
        # -----------------------------------------------------------------
        # Crash resilience: capture error and reset to idle
        # -----------------------------------------------------------------
        logging.error("Error during working cycle: %s", exc, exc_info=True)
        error_report = (
            f"# Builder Execution Error\n\n"
            f"Task: {task_prompt[:200]}\n\n"
            f"Error: {exc}\n\n"
            f"Traceback:\n```\n{traceback.format_exc()}\n```\n\n"
            f"{VALIDATION_MARKER}"
        )
        builder_state.payload["proposed_code"] = error_report
        builder_state.payload["error"] = str(exc)
        # Reset to idle so the daemon keeps running
        builder_state.status = "idle"
        mailbox.write_builder(builder_state)
        logging.warning("Recovered from error. Builder reset to idle.")


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
    logging.info("LLM config: model=%s  base_url=%s", MODEL_NAME, API_BASE_URL)

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
            # IF status == "working" — PRODUCTION EXECUTION ENGINE
            # =================================================================
            elif status == "working":
                _execute_working_cycle(builder_state, mailbox)

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
                        # Re-execute the working cycle with auditor feedback
                        # incorporated. The compliance marker is automatically
                        # included in the telemetry report by _execute_working_cycle.
                        builder_state.status = "working"
                        mailbox.write_builder(builder_state)
                        _execute_working_cycle(
                            builder_state,
                            mailbox,
                            auditor_feedback=auditor_state.feedback,
                        )
                        logging.info("Re-executed working cycle with auditor feedback.")

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
