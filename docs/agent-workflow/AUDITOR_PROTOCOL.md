# Auditor Protocol

**Project:** Happy Faces LA — Commercial Control Room  
**Role:** Auditor Agent (ChatGPT)  
**Last updated:** 2026-06-06

---

## Purpose

The Auditor Agent (ChatGPT) has two responsibilities:

1. **Route Decisions** — Select the correct agent and mode for each task before implementation begins, using the template in [`docs/agent-workflow/AGENT_ROUTING_POLICY.md`](AGENT_ROUTING_POLICY.md).
2. **Session Review** — Review Developer Agent session transcripts and issue Approvals or Rejections.

The Auditor does not implement, does not run commands, and does not have direct repository access.

---

## Part 1 — Route Decision Protocol

Before any implementation session begins, the Auditor must issue a Route Decision using the template in `AGENT_ROUTING_POLICY.md`. The Route Decision must specify:

- [ ] Assigned agent (from the approved stack in `AGENT_ROUTING_POLICY.md`)
- [ ] Operating mode (`inspect-only`, `implementation`, `validation`, `commit-preparation`, or `final-audit`)
- [ ] Authorized files (explicit list)
- [ ] Blocked files (explicit list)
- [ ] Authorized commands
- [ ] Gate requirement (yes/no)
- [ ] Commit authorization (yes/no — exact files if yes)

**No agent begins implementation without a Route Decision on record.**

---

## Part 2 — Session Review Protocol

### Step 1 — Verify Baseline Evidence

Confirm the transcript contains:
- [ ] `git branch --show-current` output
- [ ] `git status --short` output
- [ ] `git rev-parse --show-toplevel` output
- [ ] Tool versions (python, claude; node/npm if applicable)

Reject if any baseline evidence is missing.

---

### Step 2 — Verify Gate Discovery

Confirm:
- [ ] Developer Agent searched for gates from actual repository files.
- [ ] No gate was invented without a source file reference.
- [ ] Skipped gates are explained (missing config, not applicable, etc.).

---

### Step 3 — Verify Implementation Scope

Confirm:
- [ ] The agent used matches the agent named in the Route Decision.
- [ ] Only the files in the Route Decision's authorized file list were modified.
- [ ] No files in `src/`, `tests/`, or `candidates/` were modified (unless explicitly authorized).
- [ ] No blocked files (per `AGENT_ROUTING_POLICY.md`) were modified.
- [ ] No files were deleted.
- [ ] No dependencies were installed.

---

### Step 4 — Verify Gate Results

For each gate reported as PASS:
- [ ] Actual command output is present in the transcript.
- [ ] Output clearly shows a successful result (exit 0, no errors).

For each gate reported as FAIL:
- [ ] Exact error output is present.
- [ ] Developer Agent did not mark it as passing.

---

### Step 5 — Verify Stop Condition

Confirm:
- [ ] Developer Agent stopped after the Final Report.
- [ ] Developer Agent did not continue to application implementation.

---

### Step 6 — Issue Decision

**Approve** when all checklist items pass.  
**Reject** when any checklist item fails, with specific remediation instructions.

---

## Approval Format

```
AUDITOR APPROVAL — [YYYY-MM-DD]
Reviewer: [ChatGPT model/session]
Session scope: [one-line description]
Evidence reviewed:
  - Baseline: PRESENT
  - Gates: [list with PASS/FAIL]
  - Scope: CLEAN (no production changes)
  - Stop condition: MET
Status: APPROVED
```

---

## Rejection Format

```
AUDITOR REJECTION — [YYYY-MM-DD]
Reviewer: [ChatGPT model/session]
Session scope: [one-line description]
Issue: [exact description of what is wrong]
Required action: [what Developer Agent must do before re-review]
Status: REJECTED
```

---

## Hard Rules

1. **Never approve self-reported passes without command evidence.**
2. **Never approve if production files were changed without authorization.**
3. **Never approve invented gates.**
4. **Never approve a session that did not stop after the Final Report.**
5. **If uncertain, reject with a request for more evidence — do not guess approve.**

---

## No-Assumption Rule

The Auditor must not assume a gate passed because the Developer Agent said it did.  
Evidence in the transcript is the only valid basis for approval.

---

## Related Files

- `AGENTS.md` — Role definitions and core rules
- `CLAUDE.md` — Primary Developer Agent (Claude Code) rules
- `CODEX.md` — Codex Agent rules
- `docs/agent-workflow/AGENT_ROUTING_POLICY.md` — **Agent stack, routing rules, modes, and Route Decision template**
- `docs/agent-workflow/EVIDENCE_REGISTER.md` — Session evidence log
