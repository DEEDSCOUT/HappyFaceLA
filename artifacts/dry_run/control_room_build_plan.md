# Happy Faces LA — Commercial Control Room Dry-Run Build Plan

**Phase:** PHASE_1_DRY_RUN  
**Generated (UTC):** 2026-05-23T22:36:10+00:00  
**Live Google API calls:** False  
**Total operations:** 22  

## Summary

| Operation Type | Count |
|---|---|
| CREATE_FOLDER | 14 |
| CREATE_SPREADSHEET_FILE | 2 |
| CREATE_DOCUMENT_FILE | 2 |
| CONFIGURE_SPREADSHEET | 2 |
| CONFIGURE_DOCUMENT | 2 |

## Operations

### 1. `CREATE_FOLDER` — Happy Faces LA — Commercial Control Room

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 2. `CREATE_FOLDER` — 00_ACTIVE_GOVERNANCE

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 3. `CREATE_SPREADSHEET_FILE` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE/HF-LA Commercial Policy & Channel Governance Master
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 4. `CREATE_DOCUMENT_FILE` — HF-LA Active Commercial Policy Manual

- **asset_type:** doc
- **path:** Happy Faces LA — Commercial Control Room/00_ACTIVE_GOVERNANCE/HF-LA Active Commercial Policy Manual
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 5. `CREATE_FOLDER` — 01_RESTRICTED_OPERATIONS_PII

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/01_RESTRICTED_OPERATIONS_PII
- **classification:** RESTRICTED_PII
- **live_action:** False

### 6. `CREATE_SPREADSHEET_FILE` — HF-LA Leads, Quotes, Bookings & Profitability Control

- **asset_type:** sheet
- **path:** Happy Faces LA — Commercial Control Room/01_RESTRICTED_OPERATIONS_PII/HF-LA Leads, Quotes, Bookings & Profitability Control
- **classification:** RESTRICTED_PII
- **live_action:** False

### 7. `CREATE_FOLDER` — 02_RELEASE_PACKAGES

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 8. `CREATE_DOCUMENT_FILE` — TEMPLATE — Website Ads AI Implementation Release Brief

- **asset_type:** template
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES/TEMPLATE — Website Ads AI Implementation Release Brief
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 9. `CREATE_FOLDER` — Release Packages

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/02_RELEASE_PACKAGES/Release Packages
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 10. `CREATE_FOLDER` — 03_SOURCE_EVIDENCE_COMPLIANCE

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 11. `CREATE_FOLDER` — Website Audit Evidence

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Website Audit Evidence
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 12. `CREATE_FOLDER` — Google Ads Policy Evidence

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Google Ads Policy Evidence
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 13. `CREATE_FOLDER` — Tax Compliance Evidence

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Tax Compliance Evidence
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 14. `CREATE_FOLDER` — Safety Materials Insurance Evidence

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Safety Materials Insurance Evidence
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 15. `CREATE_FOLDER` — Competitor Market Research

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/03_SOURCE_EVIDENCE_COMPLIANCE/Competitor Market Research
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 16. `CREATE_FOLDER` — 99_ARCHIVE_SUPERSEDED

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 17. `CREATE_FOLDER` — Original Pricing Rule Approval Form

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED/Original Pricing Rule Approval Form
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 18. `CREATE_FOLDER` — Superseded Versions

- **asset_type:** folder
- **path:** Happy Faces LA — Commercial Control Room/99_ARCHIVE_SUPERSEDED/Superseded Versions
- **classification:** INTERNAL_CONTROLLED
- **live_action:** False

### 19. `CONFIGURE_SPREADSHEET` — HF-LA Commercial Policy & Channel Governance Master

- **asset_type:** sheet
- **classification:** INTERNAL_CONTROLLED
- **tab_count:** 14
- **tab_titles:** 00_CONTROL_CENTER, 01_CEO_APPROVAL_QUEUE, 02_OPEN_BLOCKERS, 03_RULE_REGISTER_MASTER, 04_ACTIVE_RULES_EXPORT, 05_PUBLIC_PRICING_PACKAGES, 06_INTERNAL_QUOTE_TRAVEL_RULES, 07_BOOKING_POLICY_COMPLIANCE, 08_VENDOR_SCHOOL_CORPORATE_RULES, 09_CHANNEL_IMPLEMENTATION_MAP, 10_AI_CUSTOMER_RESPONSE_MATRIX, 11_SOURCE_EVIDENCE, 12_RELEASE_CHANGELOG, 99_VALIDATION_CONFIG
- **live_action:** False

### 20. `CONFIGURE_SPREADSHEET` — HF-LA Leads, Quotes, Bookings & Profitability Control

- **asset_type:** sheet
- **classification:** RESTRICTED_PII
- **tab_count:** 9
- **tab_titles:** 00_ACCESS_AND_USAGE_RULES, 01_QUOTE_WORKBENCH, 02_LEAD_PIPELINE, 03_BOOKINGS_EVENTS, 04_EVENT_DELIVERY_METRICS, 05_UNIT_ECONOMICS, 06_GOOGLE_ADS_PERFORMANCE, 07_KPI_DASHBOARD, 99_VALIDATION_CONFIG
- **live_action:** False

### 21. `CONFIGURE_DOCUMENT` — HF-LA Active Commercial Policy Manual

- **asset_type:** doc
- **classification:** INTERNAL_CONTROLLED
- **initial_status:** DRAFT SHELL — NO ACTIVE COMMERCIAL POLICY RELEASE UNTIL CEO APPROVAL
- **section_count:** 12
- **section_headings:** 1. Document Status and Active Version, 2. CEO Approval Record, 3. Approved Public Pricing, 4. Approved Service Descriptions, 5. Approved Quote and Travel Rules, 6. Approved Deposit and Payment Rules, 7. Approved Cancellation, Rescheduling and Overtime Rules, 8. Approved School, Festival and Corporate Event Rules, 9. Approved Vendor / Community Event Rules, 10. Approved Safety and Customer-Care Wording, 11. Approved AI / Customer Response Boundaries, 12. Superseded Policy References
- **live_action:** False

### 22. `CONFIGURE_DOCUMENT` — TEMPLATE — Website Ads AI Implementation Release Brief

- **asset_type:** template
- **classification:** INTERNAL_CONTROLLED
- **initial_status:** TEMPLATE — Populate from CEO-approved release package only
- **section_count:** 13
- **section_headings:** 1. Release Version, 2. CEO Approval and Effective Date, 3. Rules Activated in This Release, 4. Website Pages Requiring Change, 5. Exact Website Copy Authorized for Publication, 6. Google Ads Claims Authorized for Use, 7. Claims Prohibited from Use, 8. Quote Form / CRM Field Changes, 9. AI / Copilot Rules Activated, 10. Developer Acceptance Checklist, 11. QA Evidence, 12. Rollback Procedure, 13. Final Release Sign-Off
- **live_action:** False
