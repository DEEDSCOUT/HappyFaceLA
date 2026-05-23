"""
Happy Faces LA — Commercial Control Room
Pydantic specification models for Drive, Sheet, Doc and Rule structures.

All models enforce the governance constraints described in ARCHITECTURE_DECISION_RECORD.md.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from hfla_control_room.constants import (
    AdsReviewStatus,
    AIReviewStatus,
    AssetType,
    BannerSeverity,
    BlockerType,
    ChannelVisibility,
    EvidenceReliabilityTier,
    EvidenceStatus,
    ExportChannel,
    PublicSafeReviewStatus,
    RuleStatus,
    SensitivityClassification,
)

# ---------------------------------------------------------------------------
# Drive structure models
# ---------------------------------------------------------------------------


class DriveFolder(BaseModel):
    name: str
    classification: SensitivityClassification = SensitivityClassification.INTERNAL_CONTROLLED
    children: list[DriveFolder | DriveAsset] = Field(default_factory=list)


class DriveAsset(BaseModel):
    name: str
    asset_type: AssetType
    classification: SensitivityClassification = SensitivityClassification.INTERNAL_CONTROLLED


DriveFolder.model_rebuild()


class DriveStructureSpec(BaseModel):
    root_folder_name: str
    children: list[DriveFolder | DriveAsset] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sheet tab models
# ---------------------------------------------------------------------------


class DataValidationRule(BaseModel):
    column: str
    validation_type: str  # e.g. "dropdown", "date", "number_range", "regex"
    values: list[str] | None = None
    min_value: float | None = None
    max_value: float | None = None
    pattern: str | None = None
    error_message: str = ""


class ConditionalFormattingRule(BaseModel):
    column: str
    condition: str  # e.g. "EQUALS", "TEXT_CONTAINS", "LESS_THAN"
    value: str
    background_color: str | None = None
    text_color: str | None = None
    bold: bool = False


class TabSpec(BaseModel):
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


class WorkbookSpec(BaseModel):
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


class DocSection(BaseModel):
    heading: str
    level: int = 1  # heading level 1–6
    placeholder_text: str = ""
    notes: str = ""


class DocumentSpec(BaseModel):
    document_name: str
    asset_type: AssetType
    classification: SensitivityClassification
    initial_status: str
    sections: list[DocSection] = Field(default_factory=list)
    draft_banner: str = ""


# ---------------------------------------------------------------------------
# Rule / governance models
# ---------------------------------------------------------------------------


class RuleRow(BaseModel):
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
    ai_response_review_status: AIReviewStatus = AIReviewStatus.NOT_REVIEWED
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


class RuleRegister(BaseModel):
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


class ApprovedRuleExport(BaseModel):
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


class EvidenceRecord(BaseModel):
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


class EvidenceRegister(BaseModel):
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


class ValidationList(BaseModel):
    list_name: str
    values: list[str]


class ValidationListsSpec(BaseModel):
    lists: list[ValidationList] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Rule schema model
# ---------------------------------------------------------------------------


class FieldSchema(BaseModel):
    name: str
    field_type: str  # "string", "enum", "date", "boolean", "list"
    required: bool = False
    pii: bool = False
    internal_only: bool = False
    allowed_values: list[str] | None = None
    description: str = ""


class RuleSchema(BaseModel):
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
    raw: dict[str, Any] = Field(default_factory=dict, exclude=True)
