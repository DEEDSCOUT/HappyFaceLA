# Agent System Architecture

**Project:** Happy Faces LA — Commercial Control Room  
**Last updated:** 2026-06-05

---

## Overview

This project uses a two-agent workflow for controlled, auditable development:

```
Human Operator
     │
     ├──► Developer Agent (Claude Code / claude-sonnet-4-6)
     │         │  implements, runs gates, reports
     │         │
     │         ▼
     │    Session Transcript
     │         │
     └──► Auditor Agent (ChatGPT)
               │  reviews evidence, approves or rejects
               ▼
          Approval / Rejection
```

---

## Agent Definitions

### Developer Agent
- **Tool:** Claude Code CLI (`claude` v2.1.167)
- **Model:** `claude-sonnet-4-6`
- **Responsibilities:** Implement changes, run validation gates, produce evidence reports.
- **Constraints:** Cannot approve its own work. Cannot modify production code without authorization.

### Auditor Agent
- **Tool:** ChatGPT (OpenAI)
- **Responsibilities:** Review Developer Agent transcripts, validate evidence, approve or reject.
- **Constraints:** Does not implement. Does not run commands on the repo. Reviews transcript only.

### Human Operator
- **Responsibilities:** Authorize production code changes, provide session prompts, relay transcripts to Auditor.
- **Authority:** The only party who can authorize changes to `src/`, `tests/`, `candidates/`.

---

## Information Flow

1. Human Operator issues a prompt to Developer Agent.
2. Developer Agent executes the prompt, running only discoverable gates.
3. Developer Agent produces a Final Report with full command evidence.
4. Human Operator relays the Final Report to Auditor Agent.
5. Auditor Agent reviews and issues Approval or Rejection.
6. If approved: Human Operator may authorize next steps.
7. If rejected: Developer Agent addresses the specific issue and re-reports.

---

## Repository Layout (Agent Governance)

```
AGENTS.md                              # Role definitions and core rules
CLAUDE.md                              # Developer Agent behavior config
CODEX.md                               # Auditor Agent behavior config
docs/agent-workflow/
  AGENT_SYSTEM_ARCHITECTURE.md        # This file
  DEVELOPER_PROTOCOL.md               # Developer step-by-step protocol
  AUDITOR_PROTOCOL.md                 # Auditor review protocol
  VALIDATION_GATE_MATRIX.md           # Discovered gates and commands
  EVIDENCE_REGISTER.md                # Session evidence log
scripts/agent/
  validate_agent_environment.ps1      # Environment snapshot script
  run_project_gates.ps1               # Gate discovery and execution script
```

---

## Production Code Boundary

The following paths are **production code** and require explicit human authorization to modify:

| Path           | Description                          |
|----------------|--------------------------------------|
| `src/`         | Application source code              |
| `tests/`       | Test suite                           |
| `candidates/`  | Phase 1c candidate YAML and evidence |
| `pyproject.toml` | Build and dependency configuration |

---

## Stop Conditions

An agent session must stop (and not proceed to application work) when:
- A validation gate fails
- A required discovery cannot be completed
- The Final Report has been delivered
- The Auditor has not yet approved the previous session

---

## Environment (Captured 2026-06-05)

| Component     | Value                            |
|---------------|----------------------------------|
| OS            | Windows 11 Home 10.0.26200       |
| Shell         | PowerShell / Bash (Git Bash)     |
| Python        | 3.12.10                          |
| Node          | v25.2.1                          |
| npm           | 11.6.2                           |
| Claude CLI    | 2.1.167 (Claude Code)            |
| Ollama        | 0.30.6                           |
| Git branch    | main                             |
| Repo root     | C:/Dev/happyfacesla-commercial-control-room |
