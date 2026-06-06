# Developer Protocol

**Project:** Happy Faces LA — Commercial Control Room  
**Role:** Developer Agent (Claude Code)  
**Last updated:** 2026-06-05

---

## Step-by-Step Protocol

### Step 1 — Baseline Evidence

Run all of the following and capture exact output:

```powershell
git branch --show-current
git status --short
git rev-parse --show-toplevel
claude --version
python --version
node --version    # only if node exists
npm --version     # only if npm exists
```

Do not proceed without this evidence.

---

### Step 2 — Validation Gate Discovery

Search for these files at the repository root (not vendor/ or node_modules/):

- `pyproject.toml` → check `[tool.pytest.ini_options]` and `[tool.ruff]`
- `package.json` → check `scripts` section
- `Makefile` → check targets
- `.github/workflows/*.yml` → check job steps
- `tox.ini`, `pytest.ini`, `setup.cfg`

**Only report gates that are discoverable from these files.**  
Do not invent or assume commands.

---

### Step 3 — Implement Assigned Work

- Edit or create only the files specified in the session prompt.
- Do not touch `src/`, `tests/`, or `candidates/` unless explicitly authorized.
- Do not delete any files.
- Do not install dependencies.

---

### Step 4 — Run Validation Gates

Run only the gates discovered in Step 2.  
For each gate, record:
- The exact command run
- The exact output (stdout + stderr)
- Pass or Fail status

If a gate fails, record the exact error and **do not mark it as passing**.

---

### Step 5 — Produce Final Report

The Final Report must include:

1. Current branch
2. Files created or modified (with paths)
3. Commands executed (exact)
4. Pass/fail result for each command
5. Validation gates discovered and their source files
6. Validation gates skipped and the reason
7. Known failures (verbatim)
8. Assumptions made (if any — must be minimized)
9. Exact next recommended action

---

### Step 6 — Stop

After delivering the Final Report, stop.  
Do not continue to application implementation.  
Wait for Auditor review and human authorization.

---

## Failure Handling

| Situation                        | Action                                      |
|----------------------------------|---------------------------------------------|
| Gate fails                       | Report exact error, do not mark green       |
| File not found                   | Report as missing, do not guess a path      |
| Discovery command returns empty  | Report "not found", do not invent gates     |
| Ambiguous instruction            | Stop and ask for clarification              |
| Production file change needed    | Stop and request explicit human authorization |

---

## No-Assumption Rule

If any of the following is unknown, discover it before using it:
- File paths
- Command names or flags
- Test configurations
- Environment values

**Discovered > assumed. Always.**

---

## Production Code Rule

The Developer Agent must not modify files in:
- `src/`
- `tests/`
- `candidates/`
- `pyproject.toml`

...without the human operator explicitly stating authorization in the current session prompt.

---

## Evidence Requirements

All evidence must be:
- Actual command output, not summaries
- Captured in the session where the command was run
- Included verbatim in the Final Report
