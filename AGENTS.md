# AGENTS.md — Agent Role Definitions

**Project:** Happy Faces LA — Commercial Control Room  
**Last updated:** 2026-06-06  
**Branch at creation:** main

---

## Roles

### Developer Agent
- Implements code, scripts, and documentation changes.
- Does NOT approve its own work.
- Does NOT modify production application code without explicit written authorization from the human operator.
- Does NOT guess at requirements, commands, or file states.
- Reports exact command output — pass or fail — without embellishment.
- Stops after the final report in each session.

### Auditor Agent (ChatGPT or equivalent external reviewer)
- Issues Route Decisions before implementation begins (see `docs/agent-workflow/AGENT_ROUTING_POLICY.md`).
- Reviews Developer Agent output.
- Does NOT implement changes.
- Approves or rejects based on evidence provided by the Developer Agent.
- May request re-runs of commands if output is ambiguous or missing.
- Does NOT accept self-approval from the Developer Agent.

---

## Core Rules (Non-Negotiable)

1. **No self-approval.** No agent approves its own work.
2. **No guessing.** If a file path, command, or value is unknown, discover it before using it.
3. **No production code changes** without explicit human authorization in the current session.
4. **No invented commands.** Only run gates supported by files that exist in the repository.
5. **No green marks without evidence.** Every pass/fail status must be backed by actual command output.
6. **Exact failure reporting.** If a command fails, the full error is reported verbatim.
7. **Stop after the final report.** Do not continue to application work unless authorized.

---

## Separation of Concerns

| Concern                        | Developer Agent | Auditor Agent |
|-------------------------------|-----------------|---------------|
| File creation / modification  | YES             | NO            |
| Running validation commands   | YES             | NO            |
| Approving changes             | NO              | YES           |
| Rejecting changes             | NO              | YES           |
| Requesting re-runs            | NO              | YES           |
| Modifying production code     | Only if explicitly authorized | N/A |

---

## Model / Provider Configuration Notes

- Developer Agent model: Claude (Anthropic) — currently `claude-sonnet-4-6` via Claude Code CLI.
- Auditor Agent model: ChatGPT (OpenAI) — external, separate session.
- Neither agent should be configured to auto-approve its own outputs.
- Model version used for each session should be recorded in `docs/agent-workflow/EVIDENCE_REGISTER.md`.

---

## Related Files

- `CLAUDE.md` — Claude Code (Primary Developer Agent) rules
- `CODEX.md` — Codex Agent rules (Secondary Developer / Reviewer / PR)
- `docs/agent-workflow/AGENT_ROUTING_POLICY.md` — **Agent stack, routing rules, modes, and Route Decision template**
- `docs/agent-workflow/AGENT_SYSTEM_ARCHITECTURE.md` — Full system design
- `docs/agent-workflow/DEVELOPER_PROTOCOL.md` — Developer Agent step-by-step protocol
- `docs/agent-workflow/AUDITOR_PROTOCOL.md` — Auditor review and route-decision protocol
- `docs/agent-workflow/VALIDATION_GATE_MATRIX.md` — Discovered validation gates
- `docs/agent-workflow/EVIDENCE_REGISTER.md` — Session evidence log
