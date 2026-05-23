# Happy Faces LA — Commercial Control Room

**Phase 1 — Local Provisioner & Dry-Run Specification**

## Status

> **PHASE 1 — LOCAL BUILD AND DRY-RUN ONLY**
> No Google authentication, no live Google Drive mutations, no OAuth consent.
> All commercial rules are in DRAFT status.
> No CEO-approved pricing or policy is encoded here.

---

## Purpose

This repository contains the local, version-controlled Python provisioning system that will
later create the Happy Faces LA Commercial Control Room in Google Drive.

The system will ultimately create:

- A Google Drive folder hierarchy under `Happy Faces LA — Commercial Control Room/`
- One Google Sheet for policy, pricing, website, ads and AI governance (Sheet A)
- One restricted Google Sheet for leads, quotes, bookings, profitability and ad performance (Sheet B)
- One Google Doc for the approved commercial policy manual (Doc A)
- One Google Doc template for implementation releases (Doc B)
- A sanitized machine-readable approved-rules export for website, Google Ads, Copilot and chatbot use

---

## Prerequisites

- Python 3.12+
- A virtual environment (see below)

---

## Setup

```powershell
# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install package in editable mode with dev dependencies
pip install -e ".[dev]"
```

---

## CLI Commands (Phase 1 — no live Google execution)

```powershell
# Validate all YAML configuration specifications
python -m hfla_control_room.cli validate --config config

# Produce dry-run build plan
python -m hfla_control_room.cli plan --config config --output artifacts/dry_run

# Validate a future approved export payload
python -m hfla_control_room.cli validate-release --input <path>

# Dry-run provision scaffold (no Google API calls)
python -m hfla_control_room.cli provision --config config --dry-run

# Live provision — BLOCKED IN PHASE 1
python -m hfla_control_room.cli provision --config config --apply
# → BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1.
```

---

## Quality Gates

```powershell
python -m pytest
python -m ruff check .
```

---

## Security Boundaries

- **`.secrets/`**, **`.runtime/`**, **`.exports/private/`** are git-ignored.
- No `client_secret.json` or `token.json` may be tracked.
- No PII (customer names, emails, phone numbers, event addresses) in any tracked file.
- No CEO-approved commercial rules encoded in Phase 1.
- See `docs/SECURITY_AND_DATA_BOUNDARIES.md` for full policy.

---

## Repository Structure

```
happyfacesla-commercial-control-room/
├── .gitignore                          # Security-first ignore rules
├── README.md
├── pyproject.toml                      # Package + tool configuration
├── src/hfla_control_room/             # Main package
│   ├── cli.py                         # Typer CLI entry point
│   ├── models.py                      # Pydantic specification models
│   ├── constants.py                   # Enumerations and fixed values
│   ├── spec_loader.py                 # YAML config loader with validation
│   ├── plan_builder.py                # Dry-run plan generator
│   ├── manifest.py                    # Asset manifest (IDs, idempotency)
│   ├── validation.py                  # Rule and spec validation logic
│   ├── google_auth.py                 # Auth scaffold (Phase 1: stub)
│   ├── drive_provisioner.py           # Drive folder/file provisioner stub
│   ├── sheets_provisioner.py          # Sheets batchUpdate provisioner stub
│   ├── docs_provisioner.py            # Docs batchUpdate provisioner stub
│   ├── release_exporter.py            # Sanitized rules export engine
│   └── audit_report.py               # Post-run audit receipt generator
├── config/                            # YAML specifications (no secrets)
│   ├── drive_structure.yaml
│   ├── governance_workbook.yaml       # Sheet A — 14 tabs
│   ├── restricted_operations_workbook.yaml  # Sheet B — 9 tabs
│   ├── documents.yaml
│   ├── validation_lists.yaml
│   ├── rule_schema.yaml
│   └── seed_data/                     # DRAFT placeholders only
├── docs/                              # Architecture and governance docs
├── tests/                             # Full test suite
└── artifacts/dry_run/                 # Generated plan outputs
```

---

## Authorization Status

| Operation | Phase 1 Status |
|---|---|
| Google authentication | BLOCKED |
| OAuth consent | BLOCKED |
| Google Drive mutations | BLOCKED |
| Google Sheets creation | BLOCKED |
| Google Docs creation | BLOCKED |
| Live `--apply` provision | BLOCKED |
| Local spec validation | AUTHORIZED |
| Dry-run plan generation | AUTHORIZED |
| Local tests | AUTHORIZED |

---

*Internal use only — Happy Faces LA. Not for distribution.*
