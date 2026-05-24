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
    AIReviewStatus,
    AssetType,
    BannerSeverity,
    BlockerPriority,
    BlockerStatus,
    BlockerType,
    ChannelVisibility,
    ChatbotResponseReviewStatus,
    ConsumerChannel,
    CopilotInternalReviewStatus,
    EvidenceReliabilityTier,
    EvidenceStatus,
    ExportChannel,
    ProjectionReleaseStatus,
    PublicSafeReviewStatus,
    QuoteOperatorReviewStatus,
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
    export_channels: list[ExportChannel] = Field(default_factory=list)
    blockers: list[BlockerType] = Field(default_factory=list)
    internal_notes: str = ""
    ceo_notes: str = ""
    source_evidence_ref: str = ""
    # Channel-safe export controls (populated in Phase 1C+ CEO data payload)
    channel_visibility: ChannelVisibility = ChannelVisibility.INTERNAL_ONLY
    public_safe_review_status: PublicSafeReviewStatus = PublicSafeReviewStatus.NOT_REVIEWED
    # Legacy combined AI review status — retained for backward compatibility
    # only.  New code MUST consult ``customer_chatbot_review_status`` or
    # ``copilot_internal_review_status`` instead.
    ai_response_review_status: AIReviewStatus = AIReviewStatus.NOT_REVIEWED
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
    # Separately reviewed public-safe text; never raw CEO/internal notes
    approved_export_text: str = ""
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


class ApprovedRuleExport(StrictControlledModel):
    """Channel-safe export record.

    Serialises ONLY fields that are safe for public/AI/Ads consumption.
    Strips: final_effective_rule, ceo_notes, internal_notes, draft_recommendation,
            blockers, source_evidence_ref, contains_* flags.
    Exports approved_export_text (separately reviewed text) not raw CEO rule text.
    """

    rule_id: str
    rule_category: str
    rule_title: str
    approved_export_text: str  # Separately reviewed public-safe text; never raw CEO/internal notes
    release_version: str
    effective_date: str
    policy_version: str
    export_channels: list[ExportChannel]
    channel_visibility: ChannelVisibility

    @model_validator(mode="after")
    def validate_all_required_fields_populated(self) -> ApprovedRuleExport:
        empty = [
            f
            for f in (
                "approved_export_text",
                "release_version",
                "effective_date",
                "policy_version",
            )
            if not getattr(self, f).strip()
        ]
        if empty:
            raise ValueError(
                f"Rule '{self.rule_id}' export is missing required fields: {empty}"
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


class FullConfigSpec(BaseModel):
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

FullConfigSpec.model_rebuild()

