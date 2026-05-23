"""
Happy Faces LA — Commercial Control Room
Enumerations and fixed constants shared across modules.
"""

from enum import StrEnum
from pathlib import Path


class AssetType(StrEnum):
    FOLDER = "folder"
    SHEET = "sheet"
    DOC = "doc"
    TEMPLATE = "template"
    EXPORT = "export"


class SensitivityClassification(StrEnum):
    INTERNAL_CONTROLLED = "INTERNAL_CONTROLLED"
    RESTRICTED_PII = "RESTRICTED_PII"
    CHANNEL_SAFE_AFTER_RELEASE = "CHANNEL_SAFE_AFTER_RELEASE"


class RuleStatus(StrEnum):
    DRAFT = "DRAFT"
    CEO_REVIEW = "CEO_REVIEW"
    APPROVED_AS_RECOMMENDED = "APPROVED_AS_RECOMMENDED"
    APPROVED_WITH_CONDITIONS = "APPROVED_WITH_CONDITIONS"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class BlockerType(StrEnum):
    CEO_INPUT_REQUIRED = "CEO_INPUT_REQUIRED"
    COMPLIANCE_REVIEW_REQUIRED = "COMPLIANCE_REVIEW_REQUIRED"
    LEGAL_REVIEW_REQUIRED = "LEGAL_REVIEW_REQUIRED"
    DATA_MISSING = "DATA_MISSING"


class BannerSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    RESTRICTED = "RESTRICTED"


class ExportChannel(StrEnum):
    WEBSITE = "website"
    GOOGLE_ADS = "google_ads"
    AI_COPILOT = "ai_copilot"
    CHATBOT = "chatbot"
    INTERNAL = "internal"


class ChannelVisibility(StrEnum):
    INTERNAL_ONLY = "INTERNAL_ONLY"         # Never exported to any channel
    RESTRICTED_PII = "RESTRICTED_PII"       # Never exported — PII or sensitive financial data
    INTERNAL_APPROVED = "INTERNAL_APPROVED" # Eligible for internal/copilot channel only
    CHANNEL_SAFE = "CHANNEL_SAFE"           # Eligible for public channels after per-channel review


class PublicSafeReviewStatus(StrEnum):
    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_PUBLIC_SAFE = "APPROVED_PUBLIC_SAFE"
    REJECTED = "REJECTED"


class AdsReviewStatus(StrEnum):
    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_ADS = "APPROVED_FOR_ADS"
    REJECTED = "REJECTED"


class AIReviewStatus(StrEnum):
    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_AI = "APPROVED_FOR_AI"
    REJECTED = "REJECTED"


class EvidenceStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    VERIFIED = "VERIFIED"
    SUPERSEDED = "SUPERSEDED"


class EvidenceReliabilityTier(StrEnum):
    TIER_1_PRIMARY = "TIER_1_PRIMARY"         # Official source, direct observation
    TIER_2_SECONDARY = "TIER_2_SECONDARY"     # Derived/calculated from primary
    TIER_3_INDICATIVE = "TIER_3_INDICATIVE"   # Third-party, pending verification
    UNCLASSIFIED = "UNCLASSIFIED"


# Sentinel values used in seed data
CEO_INPUT_REQUIRED = "CEO_INPUT_REQUIRED"
COMPLIANCE_REVIEW_REQUIRED = "COMPLIANCE_REVIEW_REQUIRED"
TBD = "TBD"

# PII field names that must never appear in channel-safe exports
PII_FIELD_NAMES = frozenset(
    {
        "customer_name",
        "customer_email",
        "customer_phone",
        "event_address",
        "billing_address",
        "client_name",
        "contact_email",
        "contact_phone",
        "lead_name",
        "quote_recipient",
        "booking_contact",
    }
)

# Fields classified as internal-only that must never appear in channel-safe exports
INTERNAL_ONLY_FIELD_NAMES = frozenset(
    {
        "ceo_notes",
        "internal_profitability_input",
        "dispatch_origin",
        "unapproved_price",
        "draft_policy",
        "internal_cost",
        "margin",
        "vendor_rate",
        "performer_cost",
    }
)

# Required banner text for public-facing / channel-safe tabs
DRAFT_CHANNEL_BANNER = (
    "DRAFT — NOT AUTHORIZED FOR PUBLICATION UNTIL CEO RELEASE APPROVAL"
)

# Required banner text for restricted operations workbook
RESTRICTED_OPERATIONS_BANNER = (
    "RESTRICTED BUSINESS DATA — CUSTOMER AND FINANCIAL INFORMATION"
    " — DO NOT SHARE WITH PUBLIC AI SYSTEMS OR UNAUTHORIZED AGENTS"
)

# Governance workbook — controlled destination tabs for data-population and
# derived-view plan operations.  Any plan operation that targets a governance
# tab must use one of these exact titles.  Tabs not listed here may not be
# populated by `POPULATE_*` operations and may not be the target of
# `DERIVE_*` operations.
GOVERNANCE_DESTINATION_TABS: frozenset[str] = frozenset(
    {
        "00_CONTROL_CENTER",
        "01_CEO_APPROVAL_QUEUE",
        "02_OPEN_BLOCKERS",
        "03_RULE_REGISTER_MASTER",
        "04_ACTIVE_RULES_EXPORT",
        "05_PUBLIC_PRICING_PACKAGES",
        "06_INTERNAL_QUOTE_TRAVEL_RULES",
        "07_BOOKING_POLICY_COMPLIANCE",
        "08_VENDOR_SCHOOL_CORPORATE_RULES",
        "09_CHANNEL_IMPLEMENTATION_MAP",
        "10_AI_CUSTOMER_RESPONSE_MATRIX",
        "11_SOURCE_EVIDENCE",
        "12_RELEASE_CHANGELOG",
        "99_VALIDATION_CONFIG",
    }
)

# Governance workbook — required tab count
GOVERNANCE_TAB_COUNT = 14

# Restricted operations workbook — required tab count
RESTRICTED_OPS_TAB_COUNT = 9

# Authorized workspace path (Windows)
AUTHORIZED_WORKSPACE_PATH = r"C:\Dev\happyfacesla-commercial-control-room"

# Phase gate label
PHASE_1_BLOCK_MESSAGE = "BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1."

# ---------------------------------------------------------------------------
# Canonical local path constants (all git-ignored, never tracked)
# ---------------------------------------------------------------------------

_WORKSPACE_ROOT = Path(AUTHORIZED_WORKSPACE_PATH)

# OAuth credential storage — git-ignored .secrets/
SECRETS_DIR = _WORKSPACE_ROOT / ".secrets"
CLIENT_SECRET_PATH = SECRETS_DIR / "client_secret.json"

# Runtime state — git-ignored .runtime/
RUNTIME_DIR = _WORKSPACE_ROOT / ".runtime"
TOKEN_PATH = RUNTIME_DIR / "token.json"
MANIFEST_PATH = RUNTIME_DIR / "manifests" / "manifest.json"
AUDIT_REPORT_PATH = RUNTIME_DIR / "audit" / "audit_report.json"
LAST_PLAN_RUN_PATH = RUNTIME_DIR / "audit" / "last_plan_run.json"

# Private exports — git-ignored .exports/private/
PRIVATE_EXPORT_DIR = _WORKSPACE_ROOT / ".exports" / "private"
