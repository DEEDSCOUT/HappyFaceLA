"""Unit tests with no live API. Run: python -m pytest tools/google_ads_mcp/tests -q"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

# Make `tools.google_ads_mcp.*` importable
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from tools.google_ads_mcp import gaql, mutations  # noqa: E402
from tools.google_ads_mcp.audit import write_audit  # noqa: E402
from tools.google_ads_mcp.config import Config, mask_cid, redact  # noqa: E402
from tools.google_ads_mcp.mutation_plans import build_plan, save_plan  # noqa: E402
from tools.google_ads_mcp.schemas import (  # noqa: E402
    CampaignBudgetInput,
    CampaignStatusInput,
    NegativeKeywordsInput,
)
from tools.google_ads_mcp.snapshots import write_snapshot  # noqa: E402


def _cfg(tmp_path: Path, **overrides) -> Config:
    base = dict(
        developer_token="dev-token-xyz-1234567890",
        client_id="cid",
        client_secret="client-secret-abcdef",
        refresh_token="refresh-token-zzzzzz",
        customer_id="4699120105",
        login_customer_id="",
        api_version="v24",
        allow_mutate=True,
        require_approval=True,
        approval_token="I_APPROVE_GOOGLE_ADS_MUTATION",
        default_validate_only=True,
        max_daily_budget_delta_percent=25,
        log_level="INFO",
        docs_dir=tmp_path / "docs" / "google-ads",
    )
    base.update(overrides)
    return Config(**base)


# ---------- GAQL guard ----------

def test_gaql_guard_accepts_select():
    assert gaql.assert_read_only("SELECT campaign.id FROM campaign") == "SELECT campaign.id FROM campaign"


def test_gaql_guard_strips_trailing_semicolon():
    assert gaql.assert_read_only("SELECT campaign.id FROM campaign;") == "SELECT campaign.id FROM campaign"


def test_gaql_guard_rejects_multistatement():
    with pytest.raises(gaql.GAQLGuardError):
        gaql.assert_read_only("SELECT campaign.id FROM campaign; SELECT 1")


def test_gaql_guard_rejects_non_select():
    with pytest.raises(gaql.GAQLGuardError):
        gaql.assert_read_only("UPDATE campaign SET status='PAUSED'")


def test_gaql_guard_rejects_mutate_keyword():
    with pytest.raises(gaql.GAQLGuardError):
        gaql.assert_read_only("SELECT * FROM x MUTATE foo")


def test_gaql_guard_empty():
    with pytest.raises(gaql.GAQLGuardError):
        gaql.assert_read_only("")


# ---------- Budget micros ----------

def test_budget_to_micros_round_trip():
    assert mutations.budget_usd_to_micros(20.0) == 20_000_000
    assert mutations.micros_to_usd(20_000_000) == 20.0


def test_budget_to_micros_rejects_zero():
    with pytest.raises(ValueError):
        mutations.budget_usd_to_micros(0)


def test_budget_delta_blocks_above_threshold(tmp_path):
    cfg = _cfg(tmp_path)
    with pytest.raises(mutations.MutationRefused):
        mutations.check_budget_delta(cfg, old_micros=20_000_000, new_micros=40_000_000, force=False)


def test_budget_delta_allowed_with_force(tmp_path):
    cfg = _cfg(tmp_path)
    mutations.check_budget_delta(cfg, old_micros=20_000_000, new_micros=40_000_000, force=True)


def test_budget_delta_allowed_below_threshold(tmp_path):
    cfg = _cfg(tmp_path)
    mutations.check_budget_delta(cfg, old_micros=20_000_000, new_micros=22_000_000, force=False)


# ---------- Approval enforcement ----------

def test_enforce_blocks_when_allow_mutate_false(tmp_path):
    cfg = _cfg(tmp_path, allow_mutate=False)
    with pytest.raises(mutations.MutationRefused):
        mutations.enforce_approval(cfg, validate_only=True, approval_token=None)


def test_enforce_allows_validate_only(tmp_path):
    cfg = _cfg(tmp_path)
    mutations.enforce_approval(cfg, validate_only=True, approval_token=None)


def test_enforce_blocks_without_token(tmp_path):
    cfg = _cfg(tmp_path)
    with pytest.raises(mutations.MutationRefused):
        mutations.enforce_approval(cfg, validate_only=False, approval_token=None)


def test_enforce_blocks_with_wrong_token(tmp_path):
    cfg = _cfg(tmp_path)
    with pytest.raises(mutations.MutationRefused):
        mutations.enforce_approval(cfg, validate_only=False, approval_token="WRONG")


def test_enforce_allows_with_correct_token(tmp_path):
    cfg = _cfg(tmp_path)
    mutations.enforce_approval(cfg, validate_only=False, approval_token="I_APPROVE_GOOGLE_ADS_MUTATION")


# ---------- Redaction ----------

def test_redact_replaces_secrets():
    secrets = ["dev-token-xyz-1234567890", "refresh-token-zzzzzz"]
    text = "the token is dev-token-xyz-1234567890 and refresh refresh-token-zzzzzz"
    out = redact(text, secrets)
    assert "dev-token-xyz-1234567890" not in out
    assert "refresh-token-zzzzzz" not in out
    assert "[REDACTED]" in out


def test_mask_cid():
    assert mask_cid("4699120105") == "***0105"
    assert mask_cid("") == "***"


# ---------- Writers ----------

def test_write_snapshot_creates_file(tmp_path):
    cfg = _cfg(tmp_path)
    p = write_snapshot(cfg, "test-snap", {"k": "v", "secret_echo": "dev-token-xyz-1234567890"})
    assert p.exists()
    body = p.read_text(encoding="utf-8")
    assert "dev-token-xyz-1234567890" not in body
    assert "[REDACTED]" in body


def test_write_audit_appends_jsonl(tmp_path):
    cfg = _cfg(tmp_path)
    p = write_audit(cfg, {"tool": "x", "result": "success"})
    write_audit(cfg, {"tool": "x", "result": "failure"})
    lines = p.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    parsed = [json.loads(l) for l in lines]
    assert parsed[0]["tool"] == "x"
    assert "timestamp" in parsed[0]


def test_save_plan_writes_json(tmp_path):
    cfg = _cfg(tmp_path)
    plan = build_plan(
        cfg, tool="t", reason="r", risk_level="low",
        resources_touched=["a"], operations=[{"op": "noop"}], before_snapshot_path=None,
    )
    p = save_plan(cfg, plan, "t")
    body = json.loads(p.read_text(encoding="utf-8"))
    assert body["tool"] == "t"
    assert body["customer_id"] == "4699120105"
    assert body["risk_level"] == "low"


# ---------- Schemas ----------

def test_campaign_status_remove_requires_reason_token():
    payload = {"campaign_name_or_id": "1", "status": "REMOVED", "reason": "tidy up"}
    # Schema itself parses; the REMOVE-in-reason check lives in the tool body.
    obj = CampaignStatusInput.model_validate(payload)
    assert obj.status == "REMOVED"


def test_campaign_budget_rejects_non_positive():
    with pytest.raises(Exception):
        CampaignBudgetInput.model_validate({
            "campaign_name_or_id": "Kids Party Face Painting",
            "new_daily_budget_usd": 0,
            "reason": "test",
        })


def test_negative_keywords_input_defaults_phrase():
    obj = NegativeKeywordsInput.model_validate({
        "campaign_name_or_id": "X",
        "keywords": ["jobs", "hiring"],
        "reason": "tidy up search intent",
    })
    assert obj.match_type == "PHRASE"
    assert obj.validate_only is True
