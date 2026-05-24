"""
Happy Faces LA — Commercial Control Room
Pydantic specification models for Drive, Sheet, Doc and Rule structures.

All models enforce the governance constraints described in ARCHITECTURE_DECISION_RECORD.md.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from hfla_control_room.constants import (
    AdsReviewStatus,
    AssetType,
    BannerSeverity,
    BlockerPriority,
    BlockerStatus,
    BlockerType,
    CEOReleaseDecision,
    ChannelVisibility,
    ChatbotResponseReviewStatus,
    ConsumerChannel,
    CopilotInternalReviewStatus,
    EvidenceReliabilityTier,
    EvidenceStatus,
    ImplementationStatus,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QAStatus,
    QuoteOperatorReviewStatus,
    ReleaseStatus,
    RuleStatus,
    SensitivityClassification,
)

# ---------------------------------------------------------------------------
# Strict-schema base for all controlled-data models (Phase 1B.2)
# ---------------------------------------------------------------------------
#
# Every governance model that stores controlled commercial data MUST forbid
# unknown fields.  Silently absorbing a misspelled field (e.g. ``drive_id=``
# instead of ``google_id=``) is a confirmed defect class — it allowed
# governance fields to be dropped at construction time without any error.
#
# All new and existing controlled models below inherit from
# :class:`StrictControlledModel`.  Non-controlled helper structures (e.g.
# loose YAML wrappers, ``raw`` payload mirrors) may use plain BaseModel.


class StrictControlledModel(BaseModel):
    """BaseModel that forbids unknown fields on input.

    Misspelled or unknown attributes raise a Pydantic validation error at
    construction time instead of being silently dropped.  This is a hard
    governance requirement for every controlled-data record.
    """

    model_config = ConfigDict(extra="forbid")

# ---------------------------------------------------------------------------
# Drive structure models
# ---------------------------------------------------------------------------


class DriveFolder(StrictControlledModel):
    name: str
    classification: SensitivityClassification = SensitivityClassification.INTERNAL_CONTROLLED
    children: list[DriveFolder | DriveAsset] = Field(default_factory=list)


class DriveAsset(StrictControlledModel):
    name: str
    asset_type: AssetType
    classification: SensitivityClassification = SensitivityClassification.INTERNAL_CONTROLLED


DriveFolder.model_rebuild()


class DriveStructureSpec(StrictControlledModel):
    root_folder_name: str
    children: list[DriveFolder | DriveAsset] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sheet tab models
# ---------------------------------------------------------------------------


class DataValidationRule(StrictControlledModel):
    column: str
    validation_type: str  # e.g. "dropdown", "date", "number_range", "regex"
    values: list[str] | None = None
    min_value: float | None = None
    max_value: float | None = None
    pattern: str | None = None
    error_message: str = ""


class ConditionalFormattingRule(StrictControlledModel):
    column: str
    condition: str  # e.g. "EQUALS", "TEXT_CONTAINS", "LESS_THAN"
    value: str
    background_color: str | None = None
    text_color: str | None = None
    bold: bool = False


class TabSpec(StrictControlledModel):
    title: str
    purpose: str
    sensitivity: SensitivityClassification
    column_headers: list[str] = Field(default_factory=list)
    frozen_row_count: int = 1
    filter_enabled: bool = True
    editable_columns: list[str] = Field(default_factory=list)
    protected_formula_columns: list[str] = Field(default_factory=list)
    data_validation_rules: list[DataValidationRule] = Field(default_factory=list)
    conditional_formatting_rules: list[ConditionalFormattingRule] = Field(default_factory=list)
    banner_content: str = ""
    banner_severity: BannerSeverity = BannerSeverity.INFO
    formula_requirements: list[str] = Field(default_factory=list)
    notes: str = ""

    @model_validator(mode="after")
    def validate_no_overlap_editable_protected(self) -> TabSpec:
        overlap = set(self.editable_columns) & set(self.protected_formula_columns)
        if overlap:
            raise ValueError(
                f"Tab '{self.title}': columns cannot be both editable and protected: {overlap}"
            )
        return self


class WorkbookSpec(StrictControlledModel):
    spreadsheet_name: str
    classification: SensitivityClassification
    tabs: list[TabSpec] = Field(default_factory=list)
    required_tab_count: int | None = None
    global_banner: str = ""

    @model_validator(mode="after")
    def validate_unique_tab_titles(self) -> WorkbookSpec:
        titles = [t.title for t in self.tabs]
        if len(titles) != len(set(titles)):
            seen: set[str] = set()
            dupes = [t for t in titles if t in seen or seen.add(t)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate tab titles in '{self.spreadsheet_name}': {dupes}")
        return self

    @model_validator(mode="after")
    def validate_tab_count(self) -> WorkbookSpec:
        if self.required_tab_count is not None:
            actual = len(self.tabs)
            if actual != self.required_tab_count:
                raise ValueError(
                    f"Workbook '{self.spreadsheet_name}' requires exactly "
                    f"{self.required_tab_count} tabs, got {actual}."
                )
        return self


# ---------------------------------------------------------------------------
# Document section / document models
# ---------------------------------------------------------------------------


class DocSection(StrictControlledModel):
    heading: str
    level: int = 1  # heading level 1–6
    placeholder_text: str = ""
    notes: str = ""


class DocumentSpec(StrictControlledModel):
    document_name: str
    asset_type: AssetType
    classification: SensitivityClassification
    initial_status: str
    sections: list[DocSection] = Field(default_factory=list)
    draft_banner: str = ""


# ---------------------------------------------------------------------------
# Rule / governance models
# ---------------------------------------------------------------------------


class RuleRow(StrictControlledModel):
    rule_id: str
    rule_category: str
    rule_title: str
    status: RuleStatus = RuleStatus.DRAFT
    draft_recommendation: str = ""
    ceo_decision: str = ""
    final_effective_rule: str = ""
    release_version: str = ""
    effective_date: str = ""
    policy_version: str = ""
    blockers: list[BlockerType] = Field(default_factory=list)
    internal_notes: str = ""
    ceo_notes: str = ""
    source_evidence_ref: str = ""
    # Channel-safe export controls (populated in Phase 1C+ CEO data payload)
    channel_visibility: ChannelVisibility = ChannelVisibility.INTERNAL_ONLY
    public_safe_review_status: PublicSafeReviewStatus = PublicSafeReviewStatus.NOT_REVIEWED
    customer_chatbot_review_status: ChatbotResponseReviewStatus = (
        ChatbotResponseReviewStatus.NOT_REVIEWED
    )
    copilot_internal_review_status: CopilotInternalReviewStatus = (
        CopilotInternalReviewStatus.NOT_REVIEWED
    )
    quote_operator_review_status: QuoteOperatorReviewStatus = (
        QuoteOperatorReviewStatus.NOT_REVIEWED
    )
    ads_claim_review_status: AdsReviewStatus = AdsReviewStatus.NOT_REVIEWED
    contains_internal_only_logic: bool = False
    contains_pii: bool = False
    requires_human_quote: bool = False

    @field_validator("rule_id")
    @classmethod
    def rule_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("rule_id must not be empty.")
        return v


class RuleRegister(StrictControlledModel):
    rules: list[RuleRow] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_rule_ids(self) -> RuleRegister:
        ids = [r.rule_id for r in self.rules]
        if len(ids) != len(set(ids)):
            seen: set[str] = set()
            dupes = [i for i in ids if i in seen or seen.add(i)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate rule IDs: {dupes}")
        return self


# ---------------------------------------------------------------------------
# Release export / channel-safe models
# ---------------------------------------------------------------------------


class ApprovedProjectionExport(StrictControlledModel):
    """Channel-safe export record (Phase 1B.3).

    Serialises a single :class:`ChannelProjectionRecord` after it has been
    gated by:

    1. ``release_status == RELEASED`` on the projection itself.
    2. A :class:`ReleaseRecord` with ``status == RELEASED`` that authorises
       the same channel and lists the projection in
       ``related_projection_ids``.
    3. The governing rule(s) carry an APPROVED status and a CEO decision.
    4. No open :class:`BlockerRecord` blocks the channel and live
       provisioning.

    Strips every internal-only / draft / CEO-private field; the only
    content payload is ``approved_channel_text`` (separately reviewed for
    the specific consumer channel \u2014 never raw CEO/internal notes).
    """

    projection_id: str
    related_rule_ids: list[str]
    channel: ConsumerChannel
    content_type: str
    approved_channel_text: str
    release_id: str
    release_version: str
    policy_version: str
    effective_date: str

    @model_validator(mode="after")
    def validate_required_fields_populated(self) -> ApprovedProjectionExport:
        empty = [
            f
            for f in (
                "approved_channel_text",
                "release_id",
                "release_version",
                "policy_version",
                "effective_date",
            )
            if not getattr(self, f).strip()
        ]
        if empty:
            raise ValueError(
                f"Projection '{self.projection_id}' export is missing "
                f"required fields: {empty}"
            )
        return self


# ---------------------------------------------------------------------------
# Source evidence models
# ---------------------------------------------------------------------------


class EvidenceRecord(StrictControlledModel):
    """A source evidence record supporting one or more governance rules.

    Phase 1: all records are DRAFT placeholders.
    Phase 2+: populated with real source citations under CEO direction.
    """

    evidence_id: str
    source_category: str = ""     # e.g. WEBSITE, INTERNAL_CALCULATION, SAFETY_MATERIAL
    source_name: str = ""
    source_locator: str = ""      # URL or Drive path (PLACEHOLDER in Phase 1)
    access_or_extraction_date: str = ""
    verified_fact: str = ""
    related_rule_ids: list[str] = Field(default_factory=list)
    reliability_tier: EvidenceReliabilityTier = EvidenceReliabilityTier.UNCLASSIFIED
    notes: str = ""
    status: EvidenceStatus = EvidenceStatus.DRAFT
    # Legacy fields from Phase 1 seed YAML — mapped in model_validator
    linked_rule_id: str | None = None
    evidence_type: str = ""
    description: str = ""
    source_url: str = ""
    date_captured: str = ""
    captured_by: str = ""
    drive_folder_link: str = ""
    expiry_date: str = ""

    @field_validator("evidence_id")
    @classmethod
    def evidence_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("evidence_id must not be empty.")
        return v

    @model_validator(mode="after")
    def normalise_related_rule_ids(self) -> EvidenceRecord:
        if not self.related_rule_ids and self.linked_rule_id:
            self.related_rule_ids = [self.linked_rule_id]
        if not self.source_category and self.evidence_type:
            self.source_category = self.evidence_type
        if not self.source_locator and self.source_url:
            self.source_locator = self.source_url
        if not self.access_or_extraction_date and self.date_captured:
            self.access_or_extraction_date = self.date_captured
        return self


class EvidenceRegister(StrictControlledModel):
    records: list[EvidenceRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_evidence_ids(self) -> EvidenceRegister:
        ids = [r.evidence_id for r in self.records]
        if len(ids) != len(set(ids)):
            seen: set[str] = set()
            dupes = [i for i in ids if i in seen or seen.add(i)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate evidence IDs: {dupes}")
        return self


# ---------------------------------------------------------------------------
# Validation list models
# ---------------------------------------------------------------------------


class ValidationList(StrictControlledModel):
    list_name: str
    values: list[str]


class ValidationListsSpec(StrictControlledModel):
    lists: list[ValidationList] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Rule schema model
# ---------------------------------------------------------------------------


class FieldSchema(StrictControlledModel):
    name: str
    field_type: str  # "string", "enum", "date", "boolean", "list"
    required: bool = False
    pii: bool = False
    internal_only: bool = False
    allowed_values: list[str] | None = None
    description: str = ""


class RuleSchema(StrictControlledModel):
    fields: list[FieldSchema] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Full config spec (aggregated)
# ---------------------------------------------------------------------------


class FullConfigSpec(StrictControlledModel):
    drive_structure: DriveStructureSpec
    governance_workbook: WorkbookSpec
    restricted_operations_workbook: WorkbookSpec
    documents: list[DocumentSpec]
    validation_lists: ValidationListsSpec
    rule_schema: RuleSchema
    seed_rules: list[RuleRow] = Field(default_factory=list)
    evidence_records: list[EvidenceRecord] = Field(default_factory=list)
    blocker_records: list[BlockerRecord] = Field(default_factory=list)
    channel_projection_records: list[ChannelProjectionRecord] = Field(default_factory=list)
    release_records: list[ReleaseRecord] = Field(default_factory=list)
    column_mappings: list[ColumnMappingRecord] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict, exclude=True)


# ---------------------------------------------------------------------------
# Blocker register (Phase 1B.2)
# ---------------------------------------------------------------------------


class BlockerRecord(StrictControlledModel):
    """Structured commercial governance blocker.

    Replaces the legacy ``RuleRow.blockers: list[BlockerType]`` 4-tag enum
    with a first-class CEO-reviewable record.  Each open blocker carries the
    decision required, the risk if missing, the exact channels it blocks, and
    whether it blocks live provisioning and / or Phase 1C content loading.
    """

    blocker_id: str
    category: BlockerType
    decision_required: str
    why_it_matters: str
    risk_if_missing: str
    priority: BlockerPriority
    ceo_input_final_answer: str = ""
    status: BlockerStatus
    related_rule_ids: list[str] = Field(default_factory=list)
    related_evidence_ids: list[str] = Field(default_factory=list)
    blocked_channels: list[ConsumerChannel] = Field(default_factory=list)
    blocks_live_provisioning: bool = True
    blocks_phase_1c_content_loading: bool = True
    responsible_owner: str = ""
    resolution_evidence: str = ""
    notes_internal_only: str = ""

    @field_validator("blocker_id")
    @classmethod
    def blocker_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("blocker_id must not be empty.")
        return v

    @model_validator(mode="after")
    def validate_resolved_has_evidence(self) -> BlockerRecord:
        if self.status == BlockerStatus.RESOLVED and not self.resolution_evidence.strip():
            raise ValueError(
                f"Blocker '{self.blocker_id}' is RESOLVED but has no resolution_evidence."
            )
        return self


class BlockerRegister(StrictControlledModel):
    records: list[BlockerRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_blocker_ids(self) -> BlockerRegister:
        ids = [r.blocker_id for r in self.records]
        if len(ids) != len(set(ids)):
            seen: set[str] = set()
            dupes = [i for i in ids if i in seen or seen.add(i)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate blocker IDs: {dupes}")
        return self


# ---------------------------------------------------------------------------
# Channel projection register (Phase 1B.2)
# ---------------------------------------------------------------------------


class ChannelProjectionRecord(StrictControlledModel):
    """Per-channel approved-content projection of one or more rules.

    The Channel Projection Register is the single source of truth for which
    channel-specific text has been approved for which consumer surface.
    Public derived views (e.g. customer chatbot response matrix) read from
    APPROVED_FOR_RELEASE rows only and never duplicate policy text.
    """

    projection_id: str
    related_rule_ids: list[str] = Field(default_factory=list)
    channel: ConsumerChannel
    content_type: str
    draft_channel_text: str = ""
    approved_channel_text: str = ""
    review_status: str = "NOT_REVIEWED"
    release_status: ProjectionReleaseStatus = ProjectionReleaseStatus.DRAFT
    policy_version: str = ""
    effective_date: str = ""
    requires_human_escalation: bool = False
    escalation_reason: str = ""
    source_evidence_ids: list[str] = Field(default_factory=list)
    contains_pii: bool = False
    contains_internal_only_logic: bool = False
    notes_internal_only: str = ""

    @field_validator("projection_id")
    @classmethod
    def projection_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("projection_id must not be empty.")
        return v

    @model_validator(mode="after")
    def validate_release_has_text(self) -> ChannelProjectionRecord:
        if (
            self.release_status
            in (
                ProjectionReleaseStatus.APPROVED_FOR_RELEASE,
                ProjectionReleaseStatus.RELEASED,
            )
            and not self.approved_channel_text.strip()
        ):
            raise ValueError(
                f"Projection '{self.projection_id}' release_status={self.release_status.value} "
                "requires non-empty approved_channel_text."
            )
        return self

    @model_validator(mode="after")
    def validate_no_pii_on_public_channel(self) -> ChannelProjectionRecord:
        from hfla_control_room.constants import PUBLIC_CONSUMER_CHANNELS

        if self.channel in PUBLIC_CONSUMER_CHANNELS and self.contains_pii:
            raise ValueError(
                f"Projection '{self.projection_id}' targets public channel "
                f"{self.channel.value} but contains_pii=True. Forbidden."
            )
        return self


class ChannelProjectionRegister(StrictControlledModel):
    records: list[ChannelProjectionRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_projection_ids(self) -> ChannelProjectionRegister:
        ids = [r.projection_id for r in self.records]
        if len(ids) != len(set(ids)):
            seen: set[str] = set()
            dupes = [i for i in ids if i in seen or seen.add(i)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate projection IDs: {dupes}")
        return self

# ---------------------------------------------------------------------------
# Release register (Phase 1B.3)
# ---------------------------------------------------------------------------


class ReleaseRecord(StrictControlledModel):
    """Single-source-of-truth CEO release authority.

    A ReleaseRecord is the ONLY artifact that can promote one or more
    ChannelProjectionRecord rows from internal-approved to actively published
    on a specific consumer channel.  RuleRow governs policy approval but
    never publishes channel text; ChannelProjectionRecord owns per-channel
    approved text; ReleaseRecord gates whether any approved content becomes
    active for a specific channel.

    Phase 1: all release records are DRAFT placeholders.  No release may
    carry ``status=RELEASED`` until a CEO decision is recorded.
    """

    release_id: str
    release_version: str
    release_title: str
    status: ReleaseStatus = ReleaseStatus.DRAFT
    ceo_decision: CEOReleaseDecision = CEOReleaseDecision.PENDING_CEO_REVIEW
    ceo_decision_date: str = ""
    effective_date: str = ""
    policy_version: str = ""
    authorized_channels: list[ConsumerChannel] = Field(default_factory=list)
    related_rule_ids: list[str] = Field(default_factory=list)
    related_projection_ids: list[str] = Field(default_factory=list)
    resolved_blocker_ids: list[str] = Field(default_factory=list)
    implementation_status: ImplementationStatus = ImplementationStatus.NOT_STARTED
    qa_status: QAStatus = QAStatus.NOT_VERIFIED
    rollback_plan: str = ""
    release_notes: str = ""
    notes_internal_only: str = ""

    @field_validator("release_id")
    @classmethod
    def release_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("release_id must not be empty.")
        return v

    @model_validator(mode="after")
    def validate_released_has_required_fields(self) -> ReleaseRecord:
        if self.status == ReleaseStatus.RELEASED:
            missing = [
                f
                for f in (
                    "release_version",
                    "ceo_decision_date",
                    "effective_date",
                    "policy_version",
                )
                if not getattr(self, f).strip()
            ]
            if missing:
                raise ValueError(
                    f"Release '{self.release_id}' status=RELEASED requires "
                    f"non-empty fields: {missing}."
                )
            if not self.authorized_channels:
                raise ValueError(
                    f"Release '{self.release_id}' status=RELEASED requires "
                    "at least one authorized channel."
                )
            if not self.related_projection_ids:
                raise ValueError(
                    f"Release '{self.release_id}' status=RELEASED requires "
                    "at least one related projection ID."
                )
            approved_decisions = (
                CEOReleaseDecision.APPROVED_AS_RECOMMENDED,
                CEOReleaseDecision.APPROVED_WITH_CONDITIONS,
            )
            if self.ceo_decision not in approved_decisions:
                raise ValueError(
                    f"Release '{self.release_id}' status=RELEASED requires "
                    f"ceo_decision in {[d.value for d in approved_decisions]}, "
                    f"got '{self.ceo_decision.value}'."
                )
        return self

    @model_validator(mode="after")
    def validate_draft_has_no_authorization(self) -> ReleaseRecord:
        if self.status == ReleaseStatus.DRAFT and self.authorized_channels:
            raise ValueError(
                f"Release '{self.release_id}' is DRAFT but lists authorized "
                "channels \u2014 forbidden.  Only RELEASED records may authorize "
                "channels."
            )
        return self


class ReleaseRegister(StrictControlledModel):
    records: list[ReleaseRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_release_ids(self) -> ReleaseRegister:
        ids = [r.release_id for r in self.records]
        if len(ids) != len(set(ids)):
            seen: set[str] = set()
            dupes = [i for i in ids if i in seen or seen.add(i)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate release IDs: {dupes}")
        return self


# ---------------------------------------------------------------------------
# Column mapping register (Phase 1B.3)
# ---------------------------------------------------------------------------


class ColumnMappingRecord(StrictControlledModel):
    """One row of the column-to-tab mapping contract.

    Moved from a Python constant in ``constants.py`` into governed YAML so
    that any mapping change participates in the deterministic
    ``spec_fingerprint`` and therefore appears in plan drift.
    """

    source_model: str
    source_field: str
    destination_tab: str
    column_header: str
    required: bool = False
    editable_by_ceo: bool = False
    formula_derived: bool = False
    exportable: bool = False
    visibility: SensitivityClassification = SensitivityClassification.INTERNAL_CONTROLLED


class ColumnMappingRegister(StrictControlledModel):
    records: list[ColumnMappingRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_destination_column(self) -> ColumnMappingRegister:
        seen: set[tuple[str, str, str]] = set()
        dupes: list[tuple[str, str, str]] = []
        for r in self.records:
            key = (r.source_model, r.destination_tab, r.column_header)
            if key in seen:
                dupes.append(key)
            seen.add(key)
        if dupes:
            raise ValueError(f"Duplicate column mappings: {dupes}")
        return self


FullConfigSpec.model_rebuild()

