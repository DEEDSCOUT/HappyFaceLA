# PHASE 1C-A.4S - V4 Artifact Integrity Correction

Date: 2026-05-24
Scope: Receipt/documentation correction only.

## Commit history retained without rewrite

- V4 candidate package was first created in commit `977a1ffda2088d45ea18a8c3712598722db0997b`.
- A Google Ads description-length defect was discovered after that commit and corrected in commit `e1963b2a8cf15eea1d391b999f280421b9c81075`.
- This two-commit history is retained exactly as committed; no amend or history rewrite is authorized.

## DRAFT governance state

- Candidate content at commit `e1963b2a8cf15eea1d391b999f280421b9c81075` remains DRAFT.
- The v4 candidate has not been accepted for CEO review.

## Receipt defect and correction basis

- Previous receipt SHA (rejected working-tree byte hash):
  `8b017698faa357e8078e814b230ee52df5e83b92933702dedbbfba0d818e6641`
- Canonical committed Git-blob SHA-256 for v4 candidate:
  `506ef804ec58924306851a3932caeb394e7911dc78e9516acd300780c31cd5f4`
- The previous receipt is rejected because it identified working-tree bytes instead of committed repository blob bytes.

## Change boundary confirmation

- This correction changes receipt/documentation only.
- No candidate-content field in `candidates/phase1c/hfla_commercial_draft_v4/candidate.yaml` was altered.

## CEO review gate

- CEO review remains blocked pending a separate read-only v4 content/evidence audit.
