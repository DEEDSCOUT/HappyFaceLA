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
    ConsumerChannel,
)
from hfla_control_room.manifest import ManifestEntry
from hfla_control_room.models import (
    BlockerRecord,
    ChannelProjectionRecord,
    EvidenceRecord,
    RuleRow,
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
