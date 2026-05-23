# Google OAuth Scope Decision — PENDING

## Happy Faces LA — Commercial Control Room

**Document Status:** PENDING — No OAuth authorization has occurred.
**Date:** 2026-05-23

---

## Phase 1 Confirmation

**No Google authentication occurred in Phase 1.**

**No OAuth scope is approved, selected, or in use.**

No credential file (`client_secret.json`, `token.json`) was created, read, or copied at any point during Phase 1 execution.

---

## Scope Selection Requirements for Future Live Provisioning

Before live provisioning is authorized (Phase 2+), the following research and decisions are required:

### 1. Official Scope Research Required

The agent must research the **current, official** Google OAuth 2.0 scope documentation for:

- **Google Drive API v3** — scopes for folder creation and file organization
- **Google Sheets API v4** — scopes for spreadsheet creation and batchUpdate operations
- **Google Docs API v1** — scopes for document creation and batchUpdate operations

Scope documentation should be sourced from the current official Google API documentation at time of implementation.

### 2. Minimum Scope Principle

The final live authorization **must use the minimum working scopes** required to:

- Create and organize folders within Google Drive
- Create Google Sheets spreadsheets and perform batchUpdate operations on them
- Create Google Docs documents and perform batchUpdate operations on them

**Broad full-Drive authorization (`https://www.googleapis.com/auth/drive`) is PROHIBITED** unless specifically justified with a documented reason why narrower scopes are technically insufficient, and explicitly approved by the CEO/Controller.

### 3. Scope Candidates for Research

These are candidate scope prefixes for research — actual scope strings must be verified against current official documentation before use:

- `https://www.googleapis.com/auth/drive.file` — Access to files created or opened by the app only (preferred candidate for Drive)
- `https://www.googleapis.com/auth/spreadsheets` — Full Sheets access (evaluate if `.readonly` suffix is needed)
- `https://www.googleapis.com/auth/documents` — Full Docs access
- `https://www.googleapis.com/auth/drive.metadata.readonly` — Read-only metadata (evaluate if required)

**Do not hard-code these scope strings until verified against current Google API documentation.**

### 4. Account Selection

The live OAuth flow must use:

- The **business-owned Google account** selected by the CEO for Happy Faces LA commercial operations.
- **Not** an unapproved personal Google account.
- **Not** a test account with access to production business data.

The CEO must explicitly select and confirm the business account before any live provisioning.

### 5. Credential Storage Requirements

OAuth credential and token files **must remain outside version control** at all times:

- `client_secret.json` → store in `.secrets/` (git-ignored; constant `CLIENT_SECRET_PATH`)
- `token.json` → store in `.runtime/` (git-ignored; constant `TOKEN_PATH`)
- Service account keys (if applicable) → store in `.secrets/` (git-ignored)

### 6. Scope Approval Gate

Before the `provision --apply` command is authorized:

1. Research current official Google scope documentation.
2. Document the proposed minimum scope set with justification.
3. Present to CEO/Controller for explicit approval.
4. Record the approved scope set in this document (update status to APPROVED).
5. Only then proceed with OAuth consent flow.

---

## Document Update Instructions

When OAuth scope approval is granted, update this document:

- Change status from `PENDING` to `APPROVED`
- Record: Approved scopes, justification, CEO approval date, account selected
- Record: Token storage location — `.runtime/token.json` (constant `TOKEN_PATH`)

---

*This document must be updated before any live Google API call is authorized.*
