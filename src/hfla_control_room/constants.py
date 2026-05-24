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


class ReleaseStatus(StrEnum):
    """Lifecycle of a :class:`ReleaseRecord` (Phase 1B.3).

    Only ``RELEASED`` records may feed active website / Ads / Copilot /
    customer-chatbot / quote-operator output.  ``APPROVED_FOR_IMPLEMENTATION``
    is NOT sufficient to publish content.
    """

    DRAFT = "DRAFT"
    READY_FOR_CEO_REVIEW = "READY_FOR_CEO_REVIEW"
    APPROVED_FOR_IMPLEMENTATION = "APPROVED_FOR_IMPLEMENTATION"
    RELEASED = "RELEASED"
    SUPERSEDED = "SUPERSEDED"
    REJECTED = "REJECTED"


class CEOReleaseDecision(StrEnum):
    """CEO decision recorded on a :class:`ReleaseRecord`."""

    PENDING_CEO_REVIEW = "PENDING_CEO_REVIEW"
    APPROVED_AS_RECOMMENDED = "APPROVED_AS_RECOMMENDED"
    APPROVED_WITH_CONDITIONS = "APPROVED_WITH_CONDITIONS"
    REJECTED_REPLACE_RELEASE = "REJECTED_REPLACE_RELEASE"
    DEFERRED_NEED_MORE_EVIDENCE = "DEFERRED_NEED_MORE_EVIDENCE"


class ImplementationStatus(StrEnum):
    """Implementation status for a channel surface (website / Ads / etc.)."""

    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    IMPLEMENTED = "IMPLEMENTED"
    SUSPENDED = "SUSPENDED"


class QAStatus(StrEnum):
    """Quality-assurance verification status for an active release."""

    NOT_VERIFIED = "NOT_VERIFIED"
    IN_VERIFICATION = "IN_VERIFICATION"
    VERIFIED_PASS = "VERIFIED_PASS"  # noqa: S105 - QA status, not a credential
    VERIFIED_FAIL = "VERIFIED_FAIL"


class ActivationStatus(StrEnum):
    """Lifecycle of a :class:`ChannelReleaseActivationRecord` (Phase 1B.4).

    A ``ChannelReleaseActivationRecord`` is the per-channel current-output
    pointer.  Only one ``ACTIVE`` activation may exist per channel at any
    time.  A new activation explicitly supersedes its predecessor; the
    superseded record remains immutable for audit.
    """

    DRAFT = "DRAFT"
    READY_FOR_QA = "READY_FOR_QA"
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"
    ROLLED_BACK = "ROLLED_BACK"
    BLOCKED = "BLOCKED"


class SnapshotMode(StrEnum):
    """Activation snapshot mode (Phase 1B.4).

    Phase 1B.4 supports a single mode: the activation publishes the entire
    set of projections that the underlying RELEASED ReleaseRecord
    authorises for the channel.  Partial / delta snapshots are deferred.
    """

    FULL_CHANNEL_SNAPSHOT = "FULL_CHANNEL_SNAPSHOT"


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
PLAN_SCHEMA_VERSION = "1.2.0"
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


