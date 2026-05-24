"""Phase 1B.2 — strict-schema (extra=\"forbid\") contract tests.

Misspelled or unknown attributes on controlled models MUST raise a Pydantic
validation error at construction time \u2014 silently dropping unknown fields
is a confirmed defect class that allowed governance fields to be lost.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from hfla_control_room.constants import (
    BlockerPriority,
    BlockerStatus,
    BlockerType,
    CEOReleaseDecision,
    ConsumerChannel,
    ImplementationStatus,
    QAStatus,
    ReleaseStatus,
)
from hfla_control_room.manifest import ManifestEntry
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    ColumnMappingRecord,
    DocSection,
    DocumentSpec,
    EvidenceRecord,
    FullConfigSpec,
    ReleaseRecord,
    RuleRow,
    TabSpec,
    WorkbookSpec,
)


class TestStrictSchema:
    def test_manifest_entry_rejects_misspelled_drive_id(self):
        with pytest.raises(ValidationError):
            ManifestEntry(
                key="k",
                asset_type="folder",
                name="n",
                drive_id="bogus",  # type: ignore[call-arg]
            )

    def test_rule_row_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            RuleRow(
                rule_id="R-1",
                rule_category="X",
                rule_title="Y",
                bogus_field="oops",  # type: ignore[call-arg]
            )

    def test_evidence_record_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            EvidenceRecord(
                evidence_id="E-1",
                bogus_evidence_field="oops",  # type: ignore[call-arg]
            )

    def test_blocker_record_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            BlockerRecord(
                blocker_id="B-1",
                category=BlockerType.CEO_INPUT_REQUIRED,
                decision_required="X",
                why_it_matters="Y",
                risk_if_missing="Z",
                priority=BlockerPriority.LOW,
                status=BlockerStatus.OPEN_CEO_INPUT_REQUIRED,
                bogus_blocker_field="oops",  # type: ignore[call-arg]
            )

    def test_channel_projection_record_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            ChannelProjectionRecord(
                projection_id="P-1",
                channel=ConsumerChannel.WEBSITE_PUBLIC,
                content_type="X",
                bogus_projection_field="oops",  # type: ignore[call-arg]
            )


class TestStrictSchemaAllInputs:
    def test_workbook_spec_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            WorkbookSpec(
                spreadsheet_name="X",
                classification="INTERNAL_CONTROLLED",
                bogus="oops",  # type: ignore[call-arg]
            )

    def test_tab_spec_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            TabSpec(
                title="T",
                purpose="P",
                sensitivity="INTERNAL_CONTROLLED",
                bogus_tab_field="oops",  # type: ignore[call-arg]
            )

    def test_document_spec_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            DocumentSpec(
                document_name="D",
                asset_type="document",
                classification="INTERNAL_CONTROLLED",
                initial_status="DRAFT",
                bogus_doc_field="oops",  # type: ignore[call-arg]
            )

    def test_doc_section_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            DocSection(
                heading="H",
                level=1,
                bogus_section_field="oops",  # type: ignore[call-arg]
            )

    def test_full_config_spec_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            FullConfigSpec(
                bogus_full_config_field="oops",  # type: ignore[call-arg]
            )

    def test_release_record_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            ReleaseRecord(
                release_id="REL-001",
                release_version="v1",
                release_title="t",
                status=ReleaseStatus.DRAFT,
                ceo_decision=CEOReleaseDecision.PENDING_CEO_REVIEW,
                policy_version="POL-1",
                implementation_status=ImplementationStatus.NOT_STARTED,
                qa_status=QAStatus.NOT_VERIFIED,
                bogus_release_field="oops",  # type: ignore[call-arg]
            )

    def test_column_mapping_record_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            ColumnMappingRecord(
                source_model="RuleRow",
                source_field="rule_id",
                destination_tab="03_RULE_REGISTER_MASTER",
                column_header="Rule ID",
                bogus_mapping_field="oops",  # type: ignore[call-arg]
            )
