"""
Happy Faces LA — Commercial Control Room
YAML specification loader with Pydantic validation.

Loads all config/*.yaml files and constructs a FullConfigSpec.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from hfla_control_room.models import (
    DocumentSpec,
    DriveStructureSpec,
    EvidenceRecord,
    EvidenceRegister,
    FullConfigSpec,
    RuleRegister,
    RuleRow,
    RuleSchema,
    ValidationListsSpec,
    WorkbookSpec,
)

logger = logging.getLogger(__name__)


def _load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a YAML mapping at root of {path}, got {type(data).__name__}.")
    return data


def load_full_spec(config_dir: Path) -> FullConfigSpec:
    """Load and validate all YAML configuration files from *config_dir*.

    Returns a fully validated :class:`FullConfigSpec`.
    Raises :class:`ValueError` or :class:`pydantic.ValidationError` on any
    spec integrity failure.
    """
    config_dir = config_dir.resolve()
    if not config_dir.is_dir():
        raise FileNotFoundError(f"Config directory not found: {config_dir}")

    logger.info("Loading config from: %s", config_dir)

    drive_raw = _load_yaml(config_dir / "drive_structure.yaml")
    governance_raw = _load_yaml(config_dir / "governance_workbook.yaml")
    restricted_raw = _load_yaml(config_dir / "restricted_operations_workbook.yaml")
    documents_raw = _load_yaml(config_dir / "documents.yaml")
    validation_lists_raw = _load_yaml(config_dir / "validation_lists.yaml")
    rule_schema_raw = _load_yaml(config_dir / "rule_schema.yaml")

    # Load seed data (DRAFT — no CEO-approved content in Phase 1)
    seed_dir = config_dir / "seed_data"
    seed_rules: list[RuleRow] = []
    evidence_records: list[EvidenceRecord] = []
    for seed_file in sorted(seed_dir.glob("*.yaml")):
        seed_data = yaml.safe_load(seed_file.read_text(encoding="utf-8"))
        if not seed_data:
            continue
        if isinstance(seed_data, dict):
            if "rules" in seed_data:
                for raw_rule in seed_data["rules"]:
                    seed_rules.append(RuleRow.model_validate(raw_rule))
            if "evidence_records" in seed_data:
                for raw_ev in seed_data["evidence_records"]:
                    evidence_records.append(EvidenceRecord.model_validate(raw_ev))

    # Validate rule-ID uniqueness across all seed files
    RuleRegister(rules=seed_rules)

    # Validate evidence-ID uniqueness across all seed files
    EvidenceRegister(records=evidence_records)

    drive_spec = DriveStructureSpec.model_validate(drive_raw)
    governance_spec = WorkbookSpec.model_validate(governance_raw)
    restricted_spec = WorkbookSpec.model_validate(restricted_raw)

    docs_list_raw = documents_raw.get("documents", [])
    documents = [DocumentSpec.model_validate(d) for d in docs_list_raw]

    validation_lists = ValidationListsSpec.model_validate(validation_lists_raw)
    rule_schema = RuleSchema.model_validate(rule_schema_raw)

    spec = FullConfigSpec(
        drive_structure=drive_spec,
        governance_workbook=governance_spec,
        restricted_operations_workbook=restricted_spec,
        documents=documents,
        validation_lists=validation_lists,
        rule_schema=rule_schema,
        seed_rules=seed_rules,
        evidence_records=evidence_records,
        raw={
            "drive": drive_raw,
            "governance": governance_raw,
            "restricted": restricted_raw,
            "documents": documents_raw,
            "validation_lists": validation_lists_raw,
            "rule_schema": rule_schema_raw,
        },
    )
    logger.info("Config loaded and validated successfully.")
    return spec
