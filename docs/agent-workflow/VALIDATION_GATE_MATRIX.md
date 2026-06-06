# Validation Gate Matrix

**Project:** Happy Faces LA — Commercial Control Room  
**Last updated:** 2026-06-05  
**Discovery date:** 2026-06-05

---

## Discovery Summary

Gates were discovered by searching the repository root for config files on 2026-06-05. Only gates backed by actual repository files are listed.

---

## Active Gates

| Gate ID | Tool     | Command                        | Source File    | Section                          | Status   |
|---------|----------|--------------------------------|----------------|----------------------------------|----------|
| G-01    | pytest   | `python -m pytest`             | `pyproject.toml` | `[tool.pytest.ini_options]`    | ACTIVE   |
| G-02    | ruff     | `python -m ruff check src`     | `pyproject.toml` | `[tool.ruff]` / `[tool.ruff.lint]` | ACTIVE |

---

## Gate Details

### G-01 — pytest

- **Source:** `pyproject.toml` lines 49–54
- **Test paths:** `tests/`
- **File pattern:** `test_*.py`
- **Options:** `-v --tb=short`
- **Requires:** `pytest>=8.2` (listed in `[project.optional-dependencies] dev`)
- **Run command:** `python -m pytest`

### G-02 — ruff (lint)

- **Source:** `pyproject.toml` lines 35–47
- **Target:** `src/`
- **Line length:** 100
- **Python target:** py312
- **Selected rules:** E, F, W, I, UP, B, S
- **Ignored:** S101 (assert in tests)
- **Run command:** `python -m ruff check src`

---

## Skipped / Not Found

| Gate candidate     | Reason skipped                                                      |
|--------------------|---------------------------------------------------------------------|
| `package.json` (root) | Not found at repository root — only found inside `vendor/` subtree |
| `pytest.ini`       | Not found                                                           |
| `tox.ini`          | Not found                                                           |
| `setup.cfg` (root) | Not found at root — found only inside `.venv/` (not a project file)|
| `tsconfig.json` (root) | Not found at root — only inside `vendor/`                      |
| `vite.config.*`    | Not found                                                           |
| `next.config.*`    | Not found                                                           |
| `Makefile` (root)  | Not found at root — found only inside `vendor/`                    |
| `justfile`         | Not found                                                           |
| `docker-compose.*` | Not found                                                           |
| `.github/workflows/` | Not found                                                         |

---

## Notes

- `ruff format` (auto-format) is NOT listed as an active gate here because it is a mutating operation. Run manually when authorized.
- Add new gates to this matrix when new config files are added to the repository root.
