# Happy Faces LA — Commercial Control Room Dry-Run Build Plan

**Phase:** PHASE_1_DRY_RUN  
**Spec fingerprint (SHA-256):** `76a5eff8e00f316edfbc3eadcdedbce3e05611cea458bc259a9d40c3a3621056`  
**Live Google API calls:** False  
**Total operations:** 31  

> This file is a deterministic snapshot.  The same configuration always
> produces a byte-identical file.  Run-time timestamps and receipts are
> written separately under `.runtime/audit/last_plan_run.json`.

## Summary

| Operation Type | Count |
|---|---|
| CREATE_FOLDER | 14 |
| CREATE_SPREADSHEET_FILE | 2 |
| CREATE_DOCUMENT_FILE | 2 |
| CONFIGURE_SPREADSHEET | 2 |
| CONFIGURE_DOCUMENT | 2 |
| POPULATE_* | 5 |
| DERIVE_* | 4 |

## Operations

### 1. `CREATE_FOLDER` — Happy Faces LA — Commercial Control Room

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room

### 2. `CREATE_FOLDER` — 00_ACTIVE_GOVERNANCE

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE

### 3. `CREATE_SPREADSHEET_FILE` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE/HF-LA Commercial Policy & Channel Governance Master

### 4. `CREATE_DOCUMENT_FILE` — HF-LA Active Commercial Policy Manual

- **asset_type:** doc
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE/HF-LA Active Commercial Policy Manual

### 5. `CREATE_FOLDER` — 01_RESTRICTED_OPERATIONS_PII

- **asset_type:** folder
- **classification:** RESTRICTED_PII
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/01_RESTRICTED_OPERATIONS_PII

### 6. `CREATE_SPREADSHEET_FILE` — HF-LA Leads, Quotes, Bookings & Profitability Control

- **asset_type:** sheet
- **classification:** RESTRICTED_PII
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/01_RESTRICTED_OPERATIONS_PII/HF-LA Leads, Quotes, Bookings & Profitability Control

### 7. `CREATE_FOLDER` — 02_RELEASE_PACKAGES

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES

### 8. `CREATE_DOCUMENT_FILE` — TEMPLATE — Website Ads AI Implementation Release Brief

- **asset_type:** template
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES/TEMPLATE — Website Ads AI Implementation Release Brief

### 9. `CREATE_FOLDER` — Release Packages

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES/Release Packages

### 10. `CREATE_FOLDER` — 03_SOURCE_EVIDENCE_COMPLIANCE

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE

### 11. `CREATE_FOLDER` — Website Audit Evidence

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Website Audit Evidence

### 12. `CREATE_FOLDER` — Google Ads Policy Evidence

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Google Ads Policy Evidence

### 13. `CREATE_FOLDER` — Tax Compliance Evidence

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Tax Compliance Evidence

### 14. `CREATE_FOLDER` — Safety Materials Insurance Evidence

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Safety Materials Insurance Evidence

### 15. `CREATE_FOLDER` — Competitor Market Research

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Competitor Market Research

### 16. `CREATE_FOLDER` — 99_ARCHIVE_SUPERSEDED

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED

### 17. `CREATE_FOLDER` — Original Pricing Rule Approval Form

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED/Original Pricing Rule Approval Form

### 18. `CREATE_FOLDER` — Superseded Versions

- **asset_type:** folder
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED/Superseded Versions

### 19. `CONFIGURE_SPREADSHEET` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False
- **tab_count:** 15
- **tab_titles:** 00_CONTROL_CENTER, 01_CEO_APPROVAL_QUEUE, 02_OPEN_BLOCKERS, 03_RULE_REGISTER_MASTER, 04_ACTIVE_RULES_EXPORT, 05_PUBLIC_PRICING_PACKAGES, 06_INTERNAL_QUOTE_TRAVEL_RULES, 07_BOOKING_POLICY_COMPLIANCE, 08_VENDOR_SCHOOL_CORPORATE_RULES, 09_CHANNEL_IMPLEMENTATION_MAP, 10_CHANNEL_PROJECTION_REGISTER, 11_AI_CUSTOMER_RESPONSE_MATRIX, 12_SOURCE_EVIDENCE, 13_RELEASE_CHANGELOG, 99_VALIDATION_CONFIG

### 20. `CONFIGURE_SPREADSHEET` — HF-LA Leads, Quotes, Bookings & Profitability Control

- **asset_type:** sheet
- **classification:** RESTRICTED_PII
- **live_action:** False
- **tab_count:** 9
- **tab_titles:** 00_ACCESS_AND_USAGE_RULES, 01_QUOTE_WORKBENCH, 02_LEAD_PIPELINE, 03_BOOKINGS_EVENTS, 04_EVENT_DELIVERY_METRICS, 05_UNIT_ECONOMICS, 06_GOOGLE_ADS_PERFORMANCE, 07_KPI_DASHBOARD, 99_VALIDATION_CONFIG

### 21. `CONFIGURE_DOCUMENT` — HF-LA Active Commercial Policy Manual

- **asset_type:** doc
- **classification:** INTERNAL_CONTROLLED
- **initial_status:** DRAFT SHELL — NO ACTIVE COMMERCIAL POLICY RELEASE UNTIL CEO APPROVAL
- **live_action:** False
- **section_count:** 12
- **section_headings:** 1. Document Status and Active Version, 2. CEO Approval Record, 3. Approved Public Pricing, 4. Approved Service Descriptions, 5. Approved Quote and Travel Rules, 6. Approved Deposit and Payment Rules, 7. Approved Cancellation, Rescheduling and Overtime Rules, 8. Approved School, Festival and Corporate Event Rules, 9. Approved Vendor / Community Event Rules, 10. Approved Safety and Customer-Care Wording, 11. Approved AI / Customer Response Boundaries, 12. Superseded Policy References

### 22. `CONFIGURE_DOCUMENT` — TEMPLATE — Website Ads AI Implementation Release Brief

- **asset_type:** template
- **classification:** INTERNAL_CONTROLLED
- **initial_status:** TEMPLATE — Populate from CEO-approved release package only
- **live_action:** False
- **section_count:** 13
- **section_headings:** 1. Release Version, 2. CEO Approval and Effective Date, 3. Rules Activated in This Release, 4. Website Pages Requiring Change, 5. Exact Website Copy Authorized for Publication, 6. Google Ads Claims Authorized for Use, 7. Claims Prohibited from Use, 8. Quote Form / CRM Field Changes, 9. AI / Copilot Rules Activated, 10. Developer Acceptance Checklist, 11. QA Evidence, 12. Rollback Procedure, 13. Final Release Sign-Off

### 23. `POPULATE_RULE_REGISTER` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **is_derived_view:** False
- **live_action:** False
- **record_count:** 19
- **rule_ids:** RULE-AI-001, RULE-AI-002, RULE-AI-003, RULE-AI-004, RULE-AI-005, RULE-FACT-001, RULE-FACT-002, RULE-FACT-003, RULE-POL-001, RULE-POL-002, RULE-POL-003, RULE-POL-004, RULE-POL-005, RULE-POL-006, RULE-POL-007, RULE-PRICE-001, RULE-PRICE-002, RULE-PRICE-003, RULE-PRICE-004
- **source:** config/seed_data/*.yaml (rules)
- **target_tab:** 03_RULE_REGISTER_MASTER

### 24. `POPULATE_SOURCE_EVIDENCE` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **evidence_ids:** EVD-001, EVD-002, EVD-003
- **is_derived_view:** False
- **live_action:** False
- **record_count:** 3
- **source:** config/seed_data/source_evidence.yaml (evidence_records)
- **target_tab:** 12_SOURCE_EVIDENCE

### 25. `POPULATE_OPEN_BLOCKERS` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **blocker_ids:** BLK-DRAFT-001, BLK-DRAFT-002, BLK-DRAFT-003
- **is_derived_view:** False
- **live_action:** False
- **record_count:** 3
- **source:** config/seed_data/blocker_placeholders.yaml (blocker_records)
- **target_tab:** 02_OPEN_BLOCKERS

### 26. `POPULATE_CHANNEL_PROJECTION_REGISTER` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **is_derived_view:** False
- **live_action:** False
- **projection_ids:** PROJ-DRAFT-001, PROJ-DRAFT-002, PROJ-DRAFT-003
- **record_count:** 3
- **source:** config/seed_data/channel_projection_placeholders.yaml (channel_projection_records)
- **target_tab:** 10_CHANNEL_PROJECTION_REGISTER

### 27. `POPULATE_RELEASE_CHANGELOG` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **is_derived_view:** False
- **live_action:** False
- **record_count:** 1
- **release_ids:** REL-2026-001
- **source:** config/seed_data/release_placeholders.yaml (release_records)
- **target_tab:** 13_RELEASE_CHANGELOG

### 28. `DERIVE_ACTIVE_RULES_EXPORT` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **derivation:** FILTER where status in (APPROVED_AS_RECOMMENDED, APPROVED_WITH_CONDITIONS) AND ceo_decision is non-empty
- **is_derived_view:** True
- **live_action:** False
- **source_tab:** 03_RULE_REGISTER_MASTER
- **target_tab:** 04_ACTIVE_RULES_EXPORT

### 29. `DERIVE_PUBLIC_PRICING_PACKAGES` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **derivation:** FILTER where rule_category=PUBLIC_PRICING AND public_safe_review_status=APPROVED_PUBLIC_SAFE
- **is_derived_view:** True
- **live_action:** False
- **source_tab:** 03_RULE_REGISTER_MASTER
- **target_tab:** 05_PUBLIC_PRICING_PACKAGES

### 30. `DERIVE_CUSTOMER_CHATBOT_RESPONSE_MATRIX` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **derivation:** FILTER where channel=CUSTOMER_CHATBOT_PUBLIC AND release_status=APPROVED_FOR_RELEASE
- **is_derived_view:** True
- **live_action:** False
- **source_tab:** 10_CHANNEL_PROJECTION_REGISTER
- **target_tab:** 11_AI_CUSTOMER_RESPONSE_MATRIX

### 31. `DERIVE_COPILOT_INTERNAL_GUIDANCE_EXPORT` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **derivation:** FILTER where channel=COPILOT_INTERNAL_DECISION_SUPPORT AND release_status=APPROVED_FOR_RELEASE
- **is_derived_view:** True
- **live_action:** False
- **source_tab:** 10_CHANNEL_PROJECTION_REGISTER
- **target_tab:** 04_ACTIVE_RULES_EXPORT

