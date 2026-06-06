# Auditor Protocol

**Project:** Happy Faces LA — Commercial Control Room  
**Role:** Auditor Agent (ChatGPT)  
**Last updated:** 2026-06-05

---

## Purpose

The Auditor Agent reviews Developer Agent session transcripts and issues Approvals or Rejections. The Auditor does not implement, does not run commands, and does not have direct repository access.

---

## Step-by-Step Review Protocol

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
- [ ] Only the files specified in the session prompt were modified.
- [ ] No files in `src/`, `tests/`, or `candidates/` were modified (unless explicitly authorized in the prompt).
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
