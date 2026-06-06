# CLAUDE.md — Claude Code Behavior Rules

**Project:** Happy Faces LA — Commercial Control Room  
**Last updated:** 2026-06-06

---

## Identity

This file configures behavior for Claude Code (the **Primary Developer Agent**) operating in this repository.

Agent routing, the full approved agent stack, operating modes, and the Route Decision process are defined in [`docs/agent-workflow/AGENT_ROUTING_POLICY.md`](docs/agent-workflow/AGENT_ROUTING_POLICY.md). Claude Code must comply with any Route Decision issued by the Auditor (ChatGPT) before beginning implementation.

---

## Hard Rules

- **Do not modify production application code** (`src/`, `tests/`, `candidates/`) without explicit human authorization in the current session.
- **Do not approve your own work.** The Auditor (ChatGPT) reviews Developer Agent output.
- **Do not guess.** Discover file paths and commands from the repository before using them.
- **Do not invent validation commands.** Run only gates discovered from `pyproject.toml`, `package.json`, `Makefile`, `.github/workflows/`, or equivalent config files present in the repository.
- **Do not delete files.**
- **Do not install dependencies** during automated gate runs.
- **Report exact failure output.** Never summarize or paraphrase errors.

---

## Validation Gates (Discovered 2026-06-05)

| Gate    | Command                       | Source         |
|---------|-------------------------------|----------------|
| pytest  | `python -m pytest`            | `pyproject.toml` `[tool.pytest.ini_options]` |
| ruff    | `python -m ruff check src`    | `pyproject.toml` `[tool.ruff]` |

No other gates are currently configured in this repository.

---

## Scope of Work

**In scope (no authorization needed):**
- Agent governance files (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `docs/agent-workflow/`, `scripts/agent/`)
- Documentation in `docs/`
- Safe, non-destructive validation scripts

**Requires explicit human authorization:**
- Any change to `src/`
- Any change to `tests/`
- Any change to `candidates/`
- Any change to `pyproject.toml` business logic
- Any force-push, branch deletion, or destructive git operation

---

## Stop Conditions

Stop and wait for Auditor approval before proceeding when:
- A validation gate fails
- A required file is missing and discovery cannot locate it
- An ambiguous instruction could affect production code
- Completing a session's final report

---

## Model / Provider Notes

- Current model: `claude-sonnet-4-6` (Claude Code CLI v2.1.167)
- Platform: Windows 11, PowerShell
- Python: 3.12.10
- Node: v25.2.1 / npm 11.6.2
- Ollama: 0.30.6 (available locally)

---

## Related Files

- `AGENTS.md` — Role definitions and core rules
- `CODEX.md` — Codex Agent (Secondary Developer / Reviewer / PR) rules
- `docs/agent-workflow/AGENT_ROUTING_POLICY.md` — Agent stack, routing rules, modes, Route Decision template
- `docs/agent-workflow/` — Full protocol and evidence documentation
