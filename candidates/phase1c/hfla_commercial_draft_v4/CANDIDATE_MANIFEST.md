# HFLA Commercial Candidate - DRAFT v4 Manifest

Version: DRAFT v4
Research/access date: 2026-05-24
Status: DRAFT only. No approved, released, or active content.
Replaces: rejected v3 commit c94970df19c2fc60606f5c96f79921ea1263f4eb

## File inventory

- candidate.yaml
- CEO_REVIEW_SUMMARY.md
- SOURCE_EVIDENCE_SUMMARY.md
- RESEARCH_LOG.md
- CANDIDATE_MANIFEST.md
- receipts/candidate_sha256.txt
- receipts/validation_result.txt

## DRAFT-only invariants

- Exactly one DRAFT release shell.
- Exactly one DRAFT activation per projected channel.
- approved_channel_text is empty for every projection.
- authorized_channels is empty.
- QA evidence is empty.
- No RESTRICTED_OPERATIONS_PII projection.

## Projection distribution target

- WEBSITE_PUBLIC: 8
- GOOGLE_ADS_PUBLIC: 6
- CUSTOMER_CHATBOT_PUBLIC: 6
- COPILOT_INTERNAL_DECISION_SUPPORT: 5
- QUOTE_OPERATOR_INTERNAL: 5

## Intended use

This package is for controller audit of v4 only. It does not authorize
implementation, publication, export, or activation.
