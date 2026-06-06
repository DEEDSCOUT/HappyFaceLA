# Agent Routing Policy

**Project:** Happy Faces LA — Commercial Control Room  
**Last updated:** 2026-06-06  
**Authority:** This document is the single source of truth for agent selection and task routing. All agents and the human operator must follow it.

---

## Core Constraints (Non-Negotiable)

1. **No agent approves its own work.** The ChatGPT Auditor is the final approval gate for all agents.
2. **The Auditor must issue a Route Decision before implementation begins.** No agent starts implementation work without a written Route Decision from ChatGPT.
3. **Production code changes require explicit human authorization.** "Production" means `src/`, `tests/`, `candidates/`, `pyproject.toml`, and any file in the blocked list below.
4. **Staging and committing are prohibited** unless the Auditor's Route Decision or Approval explicitly names the exact files to be staged/committed.
5. **Destructive commands are prohibited** for all agents (no `git reset --hard`, `git push --force`, `git clean`, `rm -rf`, `DROP TABLE`, or equivalent).

---

## Approved Agent Stack

| Agent | Type | Status |
|-------|------|--------|
| Claude Code | Primary Developer Agent | APPROVED |
| Cline + Claude Opus/Sonnet | Secondary Developer Agent | APPROVED |
| Cline + DeepSeek V4 Pro | Secondary Developer Agent | APPROVED |
| Cline + GLM-5.1 | Secondary Developer Agent | APPROVED |
| Cline + local Qwen | Secondary Developer Agent (local/offline) | APPROVED |
| Copilot | Inline Assist / Suggestion | APPROVED |
| Codex | Secondary Developer / Reviewer / PR Agent | APPROVED |
| Manual / no-agent | Direct human editing | APPROVED |
| Roo | Any role | **REJECTED** |

### Roo — Rejection Rationale

Roo is explicitly prohibited in this repository. It must not be used in any mode or for any task. If Roo configuration files appear in the repository (e.g., `.roo/`), they must not be executed and should be flagged to the human operator for removal authorization.

---

## Agent Definitions and Routing Rules

### Claude Code (Primary Developer Agent)

**Allowed:**
- All governance, documentation, and script changes in authorized paths
- Running safe validation gates (`pytest`, `ruff`, `validate_agent_environment.ps1`, `run_project_gates.ps1`)
- Any task authorized by a Route Decision

**Prohibited:**
- Approving own work
- Production code changes without explicit human authorization
- Staging or committing without explicit Auditor approval of exact files
- Destructive commands

**Default mode:** `implementation` for authorized tasks; `validation` after implementation

---

### Cline + Claude Opus/Sonnet

**Allowed:**
- Implementation of tasks explicitly routed to this agent by Route Decision
- Validation gate execution
- Diff review and comparison

**Prohibited:**
- Tasks not covered by a Route Decision
- Production code changes without explicit human authorization
- Self-approval

**Default mode:** `implementation` or `inspect-only` per Route Decision

---

### Cline + DeepSeek V4 Pro

**Allowed:**
- Implementation of tasks explicitly routed to this agent by Route Decision
- Code generation and refactoring within authorized scope
- Validation gate execution

**Prohibited:**
- Tasks not covered by a Route Decision
- Production code changes without explicit human authorization
- Self-approval

**Default mode:** `inspect-only`; `implementation` only when explicitly routed by Route Decision

**Note:** DeepSeek V4 Pro output must be reviewed by Claude Code or Codex before Auditor submission when used for production-adjacent work.

---

### Cline + GLM-5.1

**Allowed:**
- Implementation of tasks explicitly routed to this agent by Route Decision
- Code generation within authorized scope
- Validation gate execution

**Prohibited:**
- Tasks not covered by a Route Decision
- Production code changes without explicit human authorization
- Self-approval

**Default mode:** `inspect-only`; `implementation` only when explicitly routed by Route Decision

**Note:** GLM-5.1 output must be reviewed by Claude Code or Codex before Auditor submission when used for production-adjacent work.

---

### Cline + local Qwen

**Allowed:**
- `inspect-only` exploration: read files, `git status`, `git diff`, `git log`, grep
- Simple local validation gate execution (`pytest`, `ruff`) under explicit Route Decision
- Git status and diff checks
- Low-risk local support tasks explicitly routed by Route Decision

**Prohibited:**
- Production implementation of any kind
- Final approval decisions or release decisions
- Credential logic, secrets handling, or authentication changes
- Live or customer-facing changes
- Tasks not covered by a Route Decision
- Self-approval
- Pushing output directly to remote without review by Claude Code or Codex

**Default mode:** `inspect-only` only; `implementation` requires an explicit Route Decision and is limited to low-risk, non-production tasks

**Note:** All Qwen output must be reviewed by Claude Code or Codex before submission to the Auditor. Local model version must be recorded in the session Evidence Register entry.

---

### Copilot

**Allowed:**
- Inline code suggestions within files being actively edited by an authorized agent or the human operator
- Autocomplete assistance

**Prohibited:**
- Autonomous multi-file edits without a supervising authorized agent
- Final implementation decisions (Copilot suggests; Claude Code or Codex accepts/rejects)
- Self-approval
- Running validation gates autonomously

**Default mode:** `inspect-only` / suggestion only

---

### Codex (Secondary Developer / Reviewer / PR Agent)

**Allowed:**
- Implementation of tasks routed by Route Decision
- Diff review and PR preparation
- Validation gate execution
- Comparing implementations from other agents

**Prohibited:**
- Tasks not covered by a Route Decision
- Self-approval
- Production code changes without explicit human authorization
- Destructive commands

**Default mode:** `implementation` or `validation` per Route Decision

**Full rules:** See `CODEX.md`.

---

### Manual / No-Agent

**Allowed:**
- Any authorized task performed directly by the human operator
- Emergency changes where agent tooling is unavailable

**Prohibited:**
- Bypassing the Auditor approval requirement (human operator must self-audit or submit to ChatGPT review)
- Staging or committing production changes without a Route Decision on record

**Default mode:** All modes available to the human operator

---

## Operating Modes

### `inspect-only`

- Read files, `git diff`, `git log`, `git status`, grep, glob — no writes.
- No file creation or modification.
- No gate execution that causes side effects.
- Any agent may operate in this mode at any time without a Route Decision.

### `implementation`

- Create or modify files within the authorized scope defined by the Route Decision.
- Requires a written Route Decision naming the authorized files.
- Production files (`src/`, `tests/`, `candidates/`) require explicit human authorization in addition to Route Decision.
- Must be followed by `validation` mode before submitting to Auditor.

### `validation`

- Run only safe, non-destructive gates discoverable from repository config files.
- Current gates: `python -m pytest`, `python -m ruff check src` (source: `pyproject.toml`).
- Report exact output — pass or fail — without modification.
- Must precede Final Report delivery.

### `commit-preparation`

- Stage only the exact files named in the Auditor's written Approval.
- Draft commit message for human operator review.
- Do not execute `git commit` or `git push` without human operator confirmation.
- Requires prior Auditor Approval that explicitly names the files.

### `final-audit`

- ChatGPT (Auditor) reviews the complete session transcript.
- Issues Approval or Rejection using the standard format in `AUDITOR_PROTOCOL.md`.
- Auditor may issue a new Route Decision for follow-up work as part of the Approval.

---

## Route Decision Process

1. Human operator describes the task to the Auditor (ChatGPT).
2. Auditor selects the appropriate agent and mode from this policy.
3. Auditor issues a written Route Decision (see template below).
4. Human operator relays the Route Decision to the assigned agent.
5. Agent executes within the authorized scope and delivers a Final Report.
6. Human operator relays the Final Report to the Auditor.
7. Auditor issues Approval or Rejection.

**No agent begins implementation without a Route Decision on record in the session.**

---

## Route Decision Output Template

```
ROUTE DECISION — [YYYY-MM-DD]
Auditor: [ChatGPT model / session identifier]
Task: [one-line description of the task]
Assigned agent: [agent name from approved stack]
Mode: [inspect-only | implementation | validation | commit-preparation | final-audit]
Authorized files:
  - [path/to/file1]
  - [path/to/file2]
Blocked files (must not be touched):
  - src/**
  - tests/**
  - candidates/**
  - [any additional blocked paths]
Authorized commands:
  - [exact command 1]
  - [exact command 2]
Gate requirement: [YES — run G-01 pytest and G-02 ruff | NO]
Commit authorized: [NO | YES — exact files: list]
Notes: [any additional constraints or context]
```

---

## Production Code Boundary

The following paths are production code. Changes require explicit human operator authorization AND a Route Decision:

| Path | Description |
|------|-------------|
| `src/` | Application source code |
| `tests/` | Test suite |
| `candidates/` | Phase 1c candidate YAML and evidence |
| `pyproject.toml` | Build and dependency configuration |
| `booking_engine/` | Booking engine module |

---

## Blocked Paths (All Agents, All Modes)

No agent may write to these paths under any circumstances:

- `artifacts/` — output artifacts only; no agent-initiated writes
- `vendor/` — vendored dependencies; no modifications
- `.roo/` — rejected agent config; do not execute or extend
- `.vscode/` — editor config; not agent scope
- `Modelfile.*` — local model configs; not agent scope
- Any credential, token, secret, `.env`, or local config file

---

## Escalation

If an agent encounters a task that falls outside its Route Decision scope, it must:

1. Stop immediately.
2. Report the out-of-scope request in its Final Report.
3. Wait for a new or amended Route Decision from the Auditor.

Agents do not self-escalate permissions.

---

## Related Files

- `AGENTS.md` — Role definitions and core rules
- `CLAUDE.md` — Claude Code (Primary Developer Agent) rules
- `CODEX.md` — Codex Agent rules
- `docs/agent-workflow/AUDITOR_PROTOCOL.md` — Auditor review and route-decision protocol
- `docs/agent-workflow/AGENT_SYSTEM_ARCHITECTURE.md` — Full system design
- `docs/agent-workflow/EVIDENCE_REGISTER.md` — Session evidence log
