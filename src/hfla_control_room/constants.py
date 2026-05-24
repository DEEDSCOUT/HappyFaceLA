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
    # Legacy enum-tag values retained for backward compatibility with
    # ``RuleRow.blockers``.  Phase 1B.2 introduces the structured
    # :class:`BlockerRecord` model — see ``models.py``.
    CEO_INPUT_REQUIRED = "CEO_INPUT_REQUIRED"
    COMPLIANCE_REVIEW_REQUIRED = "COMPLIANCE_REVIEW_REQUIRED"
    LEGAL_REVIEW_REQUIRED = "LEGAL_REVIEW_REQUIRED"
    DATA_MISSING = "DATA_MISSING"


class BlockerPriority(StrEnum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class BlockerStatus(StrEnum):
    OPEN_CEO_INPUT_REQUIRED = "OPEN_CEO_INPUT_REQUIRED"
    OPEN_COMPLIANCE_REVIEW_REQUIRED = "OPEN_COMPLIANCE_REVIEW_REQUIRED"
    OPEN_EVIDENCE_REQUIRED = "OPEN_EVIDENCE_REQUIRED"
    RESOLVED = "RESOLVED"
    DEFERRED = "DEFERRED"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class BannerSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    RESTRICTED = "RESTRICTED"


class ExportChannel(StrEnum):
    # DEPRECATED in Phase 1B.2 — use :class:`ConsumerChannel` instead.
    # Retained only as a backward-compatible migration alias for the existing
    # ``RuleRow.export_channels`` column.  New code (validators, projection
    # records, blocker records, plan operations) MUST use
    # :class:`ConsumerChannel`.
    WEBSITE = "website"
    GOOGLE_ADS = "google_ads"
    AI_COPILOT = "ai_copilot"
    CHATBOT = "chatbot"
    INTERNAL = "internal"


class ConsumerChannel(StrEnum):
    """Controlled consumer-channel vocabulary (Phase 1B.2).

    Each value names a distinct downstream consumer with its own approval
    pipeline, content projection and PII boundary.  These channels MUST NOT
    be conflated.  In particular, ``CUSTOMER_CHATBOT_PUBLIC`` and
    ``COPILOT_INTERNAL_DECISION_SUPPORT`` have independent review statuses.
    """

    WEBSITE_PUBLIC = "WEBSITE_PUBLIC"
    GOOGLE_ADS_PUBLIC = "GOOGLE_ADS_PUBLIC"
    CUSTOMER_CHATBOT_PUBLIC = "CUSTOMER_CHATBOT_PUBLIC"
    COPILOT_INTERNAL_DECISION_SUPPORT = "COPILOT_INTERNAL_DECISION_SUPPORT"
    QUOTE_OPERATOR_INTERNAL = "QUOTE_OPERATOR_INTERNAL"
    RESTRICTED_OPERATIONS_PII = "RESTRICTED_OPERATIONS_PII"


# Channels that may reach a customer/public surface.  Anything destined here
# must pass the public-safe review gate AND its channel-specific review gate.
PUBLIC_CONSUMER_CHANNELS: frozenset[ConsumerChannel] = frozenset(
    {
        ConsumerChannel.WEBSITE_PUBLIC,
        ConsumerChannel.GOOGLE_ADS_PUBLIC,
        ConsumerChannel.CUSTOMER_CHATBOT_PUBLIC,
    }
)

# Channels that are internal-only by design and MUST NOT receive public content
# automatically just because another internal channel approved it.
INTERNAL_CONSUMER_CHANNELS: frozenset[ConsumerChannel] = frozenset(
    {
        ConsumerChannel.COPILOT_INTERNAL_DECISION_SUPPORT,
        ConsumerChannel.QUOTE_OPERATOR_INTERNAL,
    }
)

# Channel that is the strictest gate; PII may flow here ONLY when an explicit
# future authorization is granted.  Today it is unreachable from any export op.
RESTRICTED_CONSUMER_CHANNELS: frozenset[ConsumerChannel] = frozenset(
    {ConsumerChannel.RESTRICTED_OPERATIONS_PII}
)


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
    # DEPRECATED in Phase 1B.2 — split into ``ChatbotResponseReviewStatus``
    # (customer-facing) and ``CopilotInternalReviewStatus`` (internal
    # decision support).  Retained only on legacy ``RuleRow`` for migration.
    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_AI = "APPROVED_FOR_AI"
    REJECTED = "REJECTED"


class ChatbotResponseReviewStatus(StrEnum):
    """Review gate for ``CUSTOMER_CHATBOT_PUBLIC`` content only."""

    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_CUSTOMER_CHATBOT = "APPROVED_FOR_CUSTOMER_CHATBOT"
    REJECTED = "REJECTED"


class CopilotInternalReviewStatus(StrEnum):
    """Review gate for ``COPILOT_INTERNAL_DECISION_SUPPORT`` content only.

    Approval here does NOT imply customer-chatbot eligibility.
    """

    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_COPILOT_INTERNAL = "APPROVED_FOR_COPILOT_INTERNAL"
    REJECTED = "REJECTED"


class QuoteOperatorReviewStatus(StrEnum):
    """Review gate for ``QUOTE_OPERATOR_INTERNAL`` content only.

    Approval here does NOT imply Copilot or chatbot visibility.
    """

    NOT_REVIEWED = "NOT_REVIEWED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED_FOR_QUOTE_OPERATOR = "APPROVED_FOR_QUOTE_OPERATOR"
    REJECTED = "REJECTED"


class ProjectionReleaseStatus(StrEnum):
    DRAFT = "DRAFT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED_FOR_RELEASE = "APPROVED_FOR_RELEASE"
    RELEASED = "RELEASED"
    SUPERSEDED = "SUPERSEDED"


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
        "10_CHANNEL_PROJECTION_REGISTER",
        "11_AI_CUSTOMER_RESPONSE_MATRIX",
        "12_SOURCE_EVIDENCE",
        "13_RELEASE_CHANGELOG",
        "99_VALIDATION_CONFIG",
    }
)

# Governance workbook — required tab count (Phase 1B.2 added
# ``10_CHANNEL_PROJECTION_REGISTER``; existing tabs 10/11/12 renumbered to
# 11/12/13.)
GOVERNANCE_TAB_COUNT = 15

# Plan schema version — bump on any structural change to the tracked plan.
# Independent from the deterministic ``spec_fingerprint``; this version is
# embedded in tracked plan output for generator-drift detection.
PLAN_SCHEMA_VERSION = "1.1.0"
SPEC_FINGERPRINT_ALGORITHM = "SHA-256"

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


# ---------------------------------------------------------------------------
# Column-level data-to-sheet mapping contracts (Phase 1B.2)
# ---------------------------------------------------------------------------
#
# Each entry maps a structured controlled source record to a deterministic
# destination governance tab and column header.  The contract is enforced by
# `tests/test_column_mapping_contract.py`; required source fields must
# resolve to known destination columns in the governance workbook spec.
#
# Schema for each mapping entry:
#   - source_field:    Python attribute on the source model
#   - destination_tab: governance tab title (must appear in
#                      GOVERNANCE_DESTINATION_TABS)
#   - column_header:   exact column header text in the destination tab
#   - required:        True if the field MUST be present in the destination
#   - editable_by_ceo: True if the destination column is CEO-editable
#   - formula_derived: True if the destination column is formula-derived
#   - exportable:      True if the field is allowed to flow to channel-safe
#                      exports
#   - visibility:      INTERNAL_ONLY | INTERNAL_CONTROLLED | CHANNEL_SAFE_AFTER_RELEASE
COLUMN_MAPPING_CONTRACTS: dict[str, list[dict[str, object]]] = {
    # RuleRow -> 03_RULE_REGISTER_MASTER
    "RuleRow": [
        {"source_field": "rule_id",                       "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Rule ID",               "required": True,  "editable_by_ceo": False, "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "rule_category",                 "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Rule Category",         "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "rule_title",                    "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Rule Title",            "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "status",                        "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Status",                "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "draft_recommendation",          "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Draft Recommendation",  "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "ceo_decision",                  "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "CEO Decision",          "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "final_effective_rule",          "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Final Effective Rule",  "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "release_version",               "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Release Version",       "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "effective_date",                "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Effective Date",        "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "policy_version",                "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Policy Version",        "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "export_channels",               "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Export Channels",       "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "source_evidence_ref",           "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Source Evidence Ref",   "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "blockers",                      "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Blockers",              "required": False, "editable_by_ceo": False, "formula_derived": True,  "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "internal_notes",                "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "Internal Notes",        "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "ceo_notes",                     "destination_tab": "03_RULE_REGISTER_MASTER", "column_header": "CEO Notes",             "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
    ],
    # EvidenceRecord -> 12_SOURCE_EVIDENCE (renumbered in Phase 1B.2)
    "EvidenceRecord": [
        {"source_field": "evidence_id",       "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Evidence ID",            "required": True,  "editable_by_ceo": False, "formula_derived": True,  "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "related_rule_ids",  "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Linked Rule ID",         "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "source_category",   "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Evidence Type",          "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "verified_fact",     "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Description",            "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "source_locator",    "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Source URL / Location",  "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "source_name",       "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Captured By",            "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "reliability_tier",  "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Reliability Tier",       "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "status",            "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Status",                 "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "notes",             "destination_tab": "12_SOURCE_EVIDENCE", "column_header": "Notes",                  "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
    ],
    # BlockerRecord -> 02_OPEN_BLOCKERS
    "BlockerRecord": [
        {"source_field": "blocker_id",                       "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Blocker ID",                       "required": True,  "editable_by_ceo": False, "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "category",                         "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Category",                         "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "decision_required",                "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Decision Required",                "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "why_it_matters",                   "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Why It Matters",                   "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "risk_if_missing",                  "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Risk if Missing",                  "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "priority",                         "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Priority",                         "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "ceo_input_final_answer",           "destination_tab": "02_OPEN_BLOCKERS", "column_header": "CEO Input / Final Answer",         "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "status",                           "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Status",                           "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "related_rule_ids",                 "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Related Rule IDs",                 "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "related_evidence_ids",             "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Related Evidence IDs",             "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "blocked_channels",                 "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Blocked Channels",                 "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "blocks_live_provisioning",         "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Blocks Live Provisioning",         "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "blocks_phase_1c_content_loading",  "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Blocks Phase 1C Content Loading",  "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "responsible_owner",                "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Responsible Owner",                "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "resolution_evidence",              "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Resolution Evidence",              "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "notes_internal_only",              "destination_tab": "02_OPEN_BLOCKERS", "column_header": "Notes (Internal Only)",            "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
    ],
    # ChannelProjectionRecord -> 10_CHANNEL_PROJECTION_REGISTER
    "ChannelProjectionRecord": [
        {"source_field": "projection_id",                "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Projection ID",                "required": True,  "editable_by_ceo": False, "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "related_rule_ids",             "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Related Rule IDs",             "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "channel",                      "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Consumer Channel",             "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "content_type",                 "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Content Type",                 "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "draft_channel_text",           "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Draft Channel Text",           "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
        {"source_field": "approved_channel_text",        "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Approved Channel Text",        "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "CHANNEL_SAFE_AFTER_RELEASE"},
        {"source_field": "review_status",                "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Review Status",                "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "release_status",               "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Release Status",               "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "policy_version",               "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Policy Version",               "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "effective_date",               "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Effective Date",               "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": True,  "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "requires_human_escalation",    "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Requires Human Escalation",    "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "escalation_reason",            "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Escalation Reason",            "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "source_evidence_ids",          "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Source Evidence IDs",          "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "contains_pii",                 "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Contains PII",                 "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "contains_internal_only_logic", "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Contains Internal Only Logic", "required": True,  "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_CONTROLLED"},
        {"source_field": "notes_internal_only",          "destination_tab": "10_CHANNEL_PROJECTION_REGISTER", "column_header": "Notes (Internal Only)",        "required": False, "editable_by_ceo": True,  "formula_derived": False, "exportable": False, "visibility": "INTERNAL_ONLY"},
    ],
}
