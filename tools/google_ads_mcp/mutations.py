"""Mutation framework: approval gate, validate-only, snapshot, plan, audit.

Every write tool calls `with_safety(...)` which:
  1. enforces ALLOW_MUTATE
  2. validates approval token when not validate_only
  3. captures a before-snapshot
  4. builds and saves a mutation plan
  5. runs the mutation under validate_only first if requested
  6. captures an after-snapshot
  7. appends an audit-log entry
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Callable

from .audit import write_audit
from .config import Config
from .mutation_plans import build_plan, save_plan
from .snapshots import write_snapshot

log = logging.getLogger("google_ads_mcp.mutations")


class MutationRefused(RuntimeError):
    pass


def enforce_approval(cfg: Config, validate_only: bool, approval_token: str | None) -> None:
    if not cfg.allow_mutate:
        raise MutationRefused(
            "Mutations disabled: set GOOGLE_ADS_ALLOW_MUTATE=true in .env.local."
        )
    if validate_only:
        return
    if not cfg.require_approval:
        return
    if not approval_token or approval_token != cfg.approval_token:
        raise MutationRefused(
            "Approval token missing or incorrect. "
            "Pass approval_token=<value of GOOGLE_ADS_APPROVAL_TOKEN> or set validate_only=true."
        )


def budget_usd_to_micros(usd: float) -> int:
    if usd <= 0:
        raise ValueError("Budget must be > 0.")
    return int(round(usd * 1_000_000))


def micros_to_usd(micros: int | str | None) -> float:
    if micros is None:
        return 0.0
    return int(micros) / 1_000_000


def check_budget_delta(cfg: Config, old_micros: int, new_micros: int, force: bool) -> None:
    if old_micros <= 0:
        return
    pct = abs(new_micros - old_micros) / old_micros * 100
    if pct > cfg.max_daily_budget_delta_percent and not force:
        raise MutationRefused(
            f"Budget change {pct:.1f}% exceeds threshold "
            f"{cfg.max_daily_budget_delta_percent}%. Pass force_large_budget_change=true to override."
        )


@contextmanager
def with_safety(
    cfg: Config,
    *,
    tool: str,
    reason: str,
    risk_level: str,
    validate_only: bool,
    approval_token: str | None,
    resources_touched: list[str],
    before_data: Any,
):
    enforce_approval(cfg, validate_only, approval_token)
    snap_before = write_snapshot(cfg, f"{tool}-before", before_data)
    plan_holder: dict[str, Any] = {"operations": [], "after": None}

    try:
        yield plan_holder
        plan = build_plan(
            cfg,
            tool=tool,
            reason=reason,
            risk_level=risk_level,
            resources_touched=resources_touched,
            operations=plan_holder["operations"],
            before_snapshot_path=str(snap_before.relative_to(cfg.docs_dir.parent.parent)),
        )
        plan_path = save_plan(cfg, plan, tool)
        snap_after = None
        if plan_holder["after"] is not None:
            snap_after = write_snapshot(cfg, f"{tool}-after", plan_holder["after"])
        write_audit(cfg, {
            "actor": "copilot_mcp",
            "tool": tool,
            "validate_only": validate_only,
            "approval_token_present": bool(approval_token),
            "customer_id": cfg.customer_id,
            "plan_id": plan["plan_id"],
            "plan_path": str(plan_path),
            "before_snapshot": str(snap_before),
            "after_snapshot": str(snap_after) if snap_after else None,
            "resources": resources_touched,
            "result": "success",
            "error": None,
        })
        plan_holder["plan"] = plan
        plan_holder["plan_path"] = str(plan_path)
        plan_holder["before_snapshot"] = str(snap_before)
        plan_holder["after_snapshot"] = str(snap_after) if snap_after else None
    except Exception as exc:
        write_audit(cfg, {
            "actor": "copilot_mcp",
            "tool": tool,
            "validate_only": validate_only,
            "approval_token_present": bool(approval_token),
            "customer_id": cfg.customer_id,
            "resources": resources_touched,
            "result": "failure",
            "error": str(exc)[:500],
        })
        raise


def run_mutate(client, service_name: str, customer_id: str, operations: list, validate_only: bool, partial_failure: bool = False):
    """Generic mutate caller. Returns the response object.

    The Google Ads Python SDK v21+ accepts mutate calls via a typed request
    object rather than keyword arguments. Passing validate_only / partial_failure
    as kwargs causes a TypeError against the underlying gRPC stub. Build the
    appropriate Mutate*Request type so the fields are set on the proto message.
    """
    service = client.get_service(service_name)
    service_to_method = {
        "CampaignService": ("mutate_campaigns", "MutateCampaignsRequest"),
        "CampaignBudgetService": ("mutate_campaign_budgets", "MutateCampaignBudgetsRequest"),
        "CampaignCriterionService": ("mutate_campaign_criteria", "MutateCampaignCriteriaRequest"),
        "ConversionActionService": ("mutate_conversion_actions", "MutateConversionActionsRequest"),
        "CustomerConversionGoalService": ("mutate_customer_conversion_goals", "MutateCustomerConversionGoalsRequest"),
        "CampaignConversionGoalService": ("mutate_campaign_conversion_goals", "MutateCampaignConversionGoalsRequest"),
        "AdGroupCriterionService": ("mutate_ad_group_criteria", "MutateAdGroupCriteriaRequest"),
        "AssetService": ("mutate_assets", "MutateAssetsRequest"),
        "AssetGroupAssetService": ("mutate_asset_group_assets", "MutateAssetGroupAssetsRequest"),
        "RecommendationService": ("apply_recommendation", None),
    }
    mutate_method_name, request_type_name = service_to_method[service_name]
    method = getattr(service, mutate_method_name)

    if request_type_name is None:
        # apply_recommendation uses its own request shape — pass kwargs as before
        return method(customer_id=customer_id, operations=operations)

    req = client.get_type(request_type_name)
    req.customer_id = customer_id
    req.operations.extend(operations)
    req.validate_only = validate_only
    req.partial_failure = partial_failure
    return method(req)
