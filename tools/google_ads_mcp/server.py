"""MCP server entry point — read tools + safety-gated write tools.

Run via VS Code MCP host (see .vscode/mcp.json) or directly:
    python -m tools.google_ads_mcp.server
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Allow running both as `python -m tools.google_ads_mcp.server` and
# `python tools/google_ads_mcp/server.py`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from tools.google_ads_mcp import (  # type: ignore
        auth,
        diagnostics,
        gaql,
        mutations,
        schemas,
    )
    from tools.google_ads_mcp import config as cfg_mod
    from tools.google_ads_mcp.google_ads_client import build_client  # type: ignore
else:
    from . import auth, diagnostics, gaql, mutations, schemas
    from . import config as cfg_mod
    from .google_ads_client import build_client

from mcp.server.fastmcp import FastMCP

CFG = cfg_mod.load_config()
logging.basicConfig(
    level=getattr(logging, CFG.log_level.upper(), logging.INFO),
    stream=sys.stderr,  # stdout is reserved for the MCP protocol
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("google_ads_mcp")

mcp = FastMCP("happyfacesla-google-ads")


def _client():
    return build_client(CFG)


def _resolve_campaign(client, name_or_id: str) -> dict[str, Any]:
    """Return campaign + campaign_budget row dict by id or exact-ish name."""
    cid = CFG.customer_id
    where = (
        f"campaign.id = {int(name_or_id)}"
        if name_or_id.isdigit()
        else f"campaign.name = '{name_or_id}'"
    )
    q = f"""
        SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type,
               campaign.advertising_channel_type, campaign.advertising_channel_sub_type,
               campaign_budget.resource_name, campaign_budget.id, campaign_budget.name,
               campaign_budget.amount_micros
        FROM campaign WHERE {where} LIMIT 1
    """
    rows = gaql.stream_to_dicts(client, cid, q)
    if not rows:
        raise ValueError(f"Campaign not found: {name_or_id}")
    return rows[0]


def _as_geo_target_constant_rn(client: Any, value: str) -> str:
    """Normalize a geo target value to a resource name.

    Accepts either raw criterion IDs (e.g. "9057137") or full
    resource names (e.g. "geoTargetConstants/9057137").
    """
    token = (value or "").strip()
    if not token:
        raise ValueError("geo_target_constants contains an empty value")
    if token.startswith("geoTargetConstants/"):
        return token
    if token.isdigit():
        svc = client.get_service("GeoTargetConstantService")
        return svc.geo_target_constant_path(token)
    raise ValueError(
        "geo_target_constants values must be criterion IDs or "
        "resource names like geoTargetConstants/<id>"
    )


def _as_keyword_plan_network(client: Any, value: str):
    """Validate and return KeywordPlanNetwork enum value."""
    token = (value or "").strip().upper()
    allowed = {"GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"}
    if token not in allowed:
        raise ValueError(
            "keyword_plan_network must be GOOGLE_SEARCH or GOOGLE_SEARCH_AND_PARTNERS"
        )
    return client.enums.KeywordPlanNetworkEnum[token]


def _keyword_historical_metrics_rows(resp: Any) -> list[dict]:
    """Normalize GenerateKeywordHistoricalMetricsResponse into JSON-ready rows."""
    rows: list[dict] = []
    for result in resp.results:
        metrics = result.keyword_metrics
        monthly = [
            {
                "year": int(m.year),
                "month": m.month.name,
                "monthly_searches": int(m.monthly_searches),
            }
            for m in metrics.monthly_search_volumes
        ]
        low_micros = int(metrics.low_top_of_page_bid_micros)
        high_micros = int(metrics.high_top_of_page_bid_micros)
        rows.append(
            {
                "keyword": result.text,
                "close_variants": list(result.close_variants),
                "avg_monthly_searches": int(metrics.avg_monthly_searches),
                "competition": metrics.competition.name,
                "competition_index": int(metrics.competition_index),
                "low_top_of_page_bid_micros": low_micros,
                "high_top_of_page_bid_micros": high_micros,
                "low_top_of_page_bid_usd": low_micros / 1_000_000
                if low_micros
                else None,
                "high_top_of_page_bid_usd": high_micros / 1_000_000
                if high_micros
                else None,
                "monthly_search_volumes": monthly,
            }
        )
    return rows


def _run_keyword_historical_metrics(
    client: Any,
    customer_id: str,
    keywords: list[str],
    geo_target_constants: list[str],
    language_id: str,
    keyword_plan_network: str,
    include_adult_keywords: bool,
) -> list[dict]:
    """Execute one KeywordPlanIdeaService historical metrics request."""
    gas = client.get_service("GoogleAdsService")
    kpis = client.get_service("KeywordPlanIdeaService")
    req = client.get_type("GenerateKeywordHistoricalMetricsRequest")
    req.customer_id = customer_id
    req.keywords.extend(keywords)
    req.geo_target_constants.extend(geo_target_constants)
    req.language = gas.language_constant_path((language_id or "1000").strip())
    req.keyword_plan_network = _as_keyword_plan_network(client, keyword_plan_network)
    req.include_adult_keywords = include_adult_keywords
    resp = kpis.generate_keyword_historical_metrics(request=req)
    return _keyword_historical_metrics_rows(resp)


# =========================================================================
# Read tools
# =========================================================================


@mcp.tool()
def google_ads_health_check() -> dict:
    """Validate credentials, customer accessibility, and mutate-mode flags."""
    return auth.health_check(CFG)


@mcp.tool()
def google_ads_gaql_query(query: str, customer_id: Optional[str] = None) -> list[dict]:
    """Run a read-only GAQL SELECT. Rejects DML / multi-statement."""
    safe = gaql.assert_read_only(query)
    cid = (customer_id or CFG.customer_id).replace("-", "")
    return gaql.stream_to_dicts(_client(), cid, safe)


@mcp.tool()
def google_ads_account_summary() -> list[dict]:
    """Account name, currency, tz, conversion-tracking settings."""
    return gaql.stream_to_dicts(_client(), CFG.customer_id, diagnostics.Q_CUSTOMER)


@mcp.tool()
def google_ads_campaigns() -> list[dict]:
    """All campaigns: status, channel, budget, bid strategy, optimization score."""
    return gaql.stream_to_dicts(_client(), CFG.customer_id, diagnostics.Q_CAMPAIGNS)


@mcp.tool()
def google_ads_campaign_diagnostics(
    campaign_name: str = "Kids Party Face Painting",
) -> dict:
    """Targeted diagnosis of a single campaign — defaults to Kids Party Face Painting."""
    client = _client()
    cid = CFG.customer_id
    name_lc = campaign_name.lower()
    camps = gaql.stream_to_dicts(client, cid, diagnostics.Q_CAMPAIGNS)
    match = [
        c for c in camps if name_lc in (c.get("campaign", {}).get("name") or "").lower()
    ]
    if not match:
        return {
            "error": f"No campaign matched '{campaign_name}'.",
            "candidates": [c.get("campaign", {}).get("name") for c in camps],
        }
    camp = match[0]
    camp_id = camp["campaign"]["id"]
    asset_groups = gaql.stream_to_dicts(
        client,
        cid,
        f"""
        SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls
        FROM asset_group WHERE campaign.id = {int(camp_id)}
    """,
    )
    signals = gaql.stream_to_dicts(
        client,
        cid,
        f"""
        SELECT asset_group.id, asset_group_signal.search_theme.text, asset_group_signal.audience.audience
        FROM asset_group_signal WHERE campaign.id = {int(camp_id)}
    """,
    )
    locs = gaql.stream_to_dicts(
        client,
        cid,
        f"""
        SELECT campaign_criterion.location.geo_target_constant, campaign_criterion.negative
        FROM campaign_criterion WHERE campaign.id = {int(camp_id)} AND campaign_criterion.type = 'LOCATION'
    """,
    )
    actions = gaql.stream_to_dicts(client, cid, diagnostics.Q_CONVERSION_ACTIONS)
    customer_goals = gaql.stream_to_dicts(
        client, cid, diagnostics.Q_CUSTOMER_CONV_GOALS
    )
    campaign_goals = gaql.stream_to_dicts(
        client, cid, diagnostics.Q_CAMPAIGN_CONV_GOALS
    )
    notes = diagnostics.diagnose_conversion_tracking(actions, customer_goals)
    return {
        "campaign": camp,
        "asset_group_count": len(asset_groups),
        "asset_groups": asset_groups,
        "signals_count": len(signals),
        "signals": signals,
        "locations_count": len(locs),
        "locations": locs,
        "customer_conversion_goals": customer_goals,
        "campaign_conversion_goals": [
            g for g in campaign_goals if g.get("campaign", {}).get("id") == camp_id
        ],
        "conversion_tracking_diagnosis": notes,
        "ui_only_items": [
            "Google Ads UI Goals > Summary 'tracking incomplete' banner",
            "Enhanced Conversions opt-in",
            "Auto-apply recommendation toggles",
            "Tag firing verification (use Tag Assistant)",
        ],
    }


@mcp.tool()
def google_ads_conversion_actions() -> list[dict]:
    return gaql.stream_to_dicts(
        _client(), CFG.customer_id, diagnostics.Q_CONVERSION_ACTIONS
    )


@mcp.tool()
def google_ads_conversion_goals() -> dict:
    client = _client()
    return {
        "customer": gaql.stream_to_dicts(
            client, CFG.customer_id, diagnostics.Q_CUSTOMER_CONV_GOALS
        ),
        "campaign": gaql.stream_to_dicts(
            client, CFG.customer_id, diagnostics.Q_CAMPAIGN_CONV_GOALS
        ),
    }


@mcp.tool()
def google_ads_pmax_asset_groups() -> list[dict]:
    return gaql.stream_to_dicts(
        _client(), CFG.customer_id, diagnostics.Q_ASSET_GROUP_ASSETS
    )


@mcp.tool()
def google_ads_assets() -> list[dict]:
    q = """
        SELECT asset.id, asset.resource_name, asset.type, asset.name,
               asset.text_asset.text,
               asset.image_asset.full_size.url, asset.image_asset.file_size,
               asset.youtube_video_asset.youtube_video_id,
               asset.youtube_video_asset.youtube_video_title
        FROM asset
    """
    return gaql.stream_to_dicts(_client(), CFG.customer_id, q)


@mcp.tool()
def google_ads_locations() -> list[dict]:
    return gaql.stream_to_dicts(_client(), CFG.customer_id, diagnostics.Q_LOCATIONS)


@mcp.tool()
def google_ads_geo_target_suggest(
    location_names: list[str],
    country_code: str = "US",
    locale: str = "en",
) -> list[dict]:
    """Resolve geo target constants by location names (read-only helper)."""
    cleaned = [n.strip() for n in location_names if n and n.strip()]
    if not cleaned:
        raise ValueError("location_names must include at least one non-empty name")

    client = _client()
    svc = client.get_service("GeoTargetConstantService")
    req = client.get_type("SuggestGeoTargetConstantsRequest")
    req.locale = locale
    req.country_code = country_code
    req.location_names.names.extend(cleaned)

    resp = svc.suggest_geo_target_constants(request=req)
    results: list[dict] = []
    for suggestion in resp.geo_target_constant_suggestions:
        geo = suggestion.geo_target_constant
        status_name = geo.status.name if geo.status else None
        reach = (
            int(suggestion.reach)
            if getattr(suggestion, "reach", None) is not None
            else None
        )
        results.append(
            {
                "resource_name": geo.resource_name,
                "id": str(getattr(geo, "id", "")),
                "name": geo.name,
                "target_type": geo.target_type,
                "country_code": geo.country_code,
                "status": status_name,
                "reach": reach,
            }
        )
    return results


@mcp.tool()
def google_ads_keyword_historical_metrics(
    keywords: list[str],
    geo_target_constants: Optional[list[str]] = None,
    language_id: str = "1000",
    keyword_plan_network: str = "GOOGLE_SEARCH_AND_PARTNERS",
    include_adult_keywords: bool = False,
    split_by_geo: bool = True,
    customer_id: Optional[str] = None,
) -> dict:
    """Keyword-demand metrics from KeywordPlanIdeaService (read-only)."""
    cleaned_keywords = [k.strip() for k in keywords if k and k.strip()]
    if not cleaned_keywords:
        raise ValueError("keywords must include at least one non-empty value")

    client = _client()
    cid = (customer_id or CFG.customer_id).replace("-", "")
    geo_rns = [
        _as_geo_target_constant_rn(client, geo) for geo in (geo_target_constants or [])
    ]

    rows = _run_keyword_historical_metrics(
        client=client,
        customer_id=cid,
        keywords=cleaned_keywords,
        geo_target_constants=geo_rns,
        language_id=language_id,
        keyword_plan_network=keyword_plan_network,
        include_adult_keywords=include_adult_keywords,
    )

    by_geo: list[dict] = []
    if split_by_geo and geo_rns:
        for geo_rn in geo_rns:
            geo_rows = _run_keyword_historical_metrics(
                client=client,
                customer_id=cid,
                keywords=cleaned_keywords,
                geo_target_constants=[geo_rn],
                language_id=language_id,
                keyword_plan_network=keyword_plan_network,
                include_adult_keywords=include_adult_keywords,
            )
            by_geo.append(
                {
                    "geo_target_constant": geo_rn,
                    "result_count": len(geo_rows),
                    "results": geo_rows,
                }
            )

    return {
        "customer_id_masked": cfg_mod.mask_cid(cid),
        "geo_target_constants": geo_rns,
        "language": f"languageConstants/{(language_id or '1000').strip()}",
        "keyword_plan_network": keyword_plan_network,
        "include_adult_keywords": include_adult_keywords,
        "split_by_geo": split_by_geo,
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "result_count": len(rows),
        "results": rows,
        "by_geo": by_geo,
    }


@mcp.tool()
def google_ads_keywords_and_negatives() -> dict:
    client = _client()
    cid = CFG.customer_id
    kw = gaql.stream_to_dicts(
        client,
        cid,
        """
        SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id,
               ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.status, ad_group_criterion.negative
        FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD'
    """,
    )
    neg = gaql.stream_to_dicts(
        client,
        cid,
        """
        SELECT campaign.id, campaign.name,
               campaign_criterion.keyword.text, campaign_criterion.keyword.match_type,
               campaign_criterion.status, campaign_criterion.negative
        FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD'
    """,
    )
    return {"ad_group_keywords": kw, "campaign_negative_keywords": neg}


@mcp.tool()
def google_ads_change_history() -> list[dict]:
    try:
        return gaql.stream_to_dicts(
            _client(), CFG.customer_id, diagnostics.Q_CHANGE_EVENTS
        )
    except Exception as exc:
        return [{"error": str(exc)}]


@mcp.tool()
def google_ads_generate_diagnostics_report() -> dict:
    """Pull everything and write docs/google-ads/diagnostics.md."""
    client = _client()
    data = diagnostics.fetch_all(client, CFG)
    body = diagnostics.build_report(CFG, data)
    out = CFG.docs_dir / "diagnostics.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding="utf-8")
    return {"written": str(out), "bytes": len(body)}


# =========================================================================
# Write tools — all gated by mutations.with_safety
# =========================================================================


@mcp.tool()
def google_ads_update_campaign_status(payload: dict) -> dict:
    """Enable / pause / remove a campaign."""
    inp = schemas.CampaignStatusInput.model_validate(payload)
    if inp.status == "REMOVED" and "REMOVE" not in inp.reason.upper():
        raise ValueError("REMOVE requires the word 'REMOVE' in `reason`.")
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    campaign_id = camp["campaign"]["id"]
    resource_name = f"customers/{CFG.customer_id}/campaigns/{campaign_id}"
    before = camp
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_campaign_status",
        reason=inp.reason,
        risk_level="high" if inp.status == "REMOVED" else "medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[resource_name],
        before_data=before,
    ) as plan:
        cs = client.get_service("CampaignService").campaign_path  # type: ignore[attr-defined]
        op = client.get_type("CampaignOperation")
        op.update.resource_name = resource_name
        op.update.status = client.enums.CampaignStatusEnum[inp.status]
        client.copy_from(op.update_mask, {"paths": ["status"]})
        plan["operations"] = [
            {
                "service": "CampaignService",
                "operation": "update",
                "resource_name": resource_name,
                "fields_changed": {"status": inp.status},
                "old_values": {"status": before["campaign"].get("status")},
                "new_values": {"status": inp.status},
            }
        ]
        resp = mutations.run_mutate(
            client, "CampaignService", CFG.customer_id, [op], inp.validate_only
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_campaign_budget(payload: dict) -> dict:
    """Update a campaign's daily budget (USD). Blocks > threshold without force flag."""
    inp = schemas.CampaignBudgetInput.model_validate(payload)
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    budget_rn = camp["campaign_budget"]["resource_name"]
    old_micros = int(camp["campaign_budget"].get("amount_micros") or 0)
    new_micros = mutations.budget_usd_to_micros(inp.new_daily_budget_usd)
    mutations.check_budget_delta(
        CFG, old_micros, new_micros, inp.force_large_budget_change
    )
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_campaign_budget",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[budget_rn],
        before_data=camp,
    ) as plan:
        op = client.get_type("CampaignBudgetOperation")
        op.update.resource_name = budget_rn
        op.update.amount_micros = new_micros
        client.copy_from(op.update_mask, {"paths": ["amount_micros"]})
        plan["operations"] = [
            {
                "service": "CampaignBudgetService",
                "operation": "update",
                "resource_name": budget_rn,
                "fields_changed": {"amount_micros": new_micros},
                "old_values": {
                    "amount_micros": old_micros,
                    "amount_usd": mutations.micros_to_usd(old_micros),
                },
                "new_values": {
                    "amount_micros": new_micros,
                    "amount_usd": inp.new_daily_budget_usd,
                },
            }
        ]
        resp = mutations.run_mutate(
            client, "CampaignBudgetService", CFG.customer_id, [op], inp.validate_only
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_bid_strategy(payload: dict) -> dict:
    """Switch a campaign's bid strategy. Validate-only by default."""
    inp = schemas.BidStrategyInput.model_validate(payload)
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    resource_name = f"customers/{CFG.customer_id}/campaigns/{camp['campaign']['id']}"
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_bid_strategy",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[resource_name],
        before_data=camp,
    ) as plan:
        op = client.get_type("CampaignOperation")
        op.update.resource_name = resource_name
        paths: list[str] = []
        if inp.strategy == "MAXIMIZE_CONVERSIONS":
            op.update.maximize_conversions._pb.SetInParent()  # type: ignore[attr-defined]
            if inp.target_cpa_usd:
                op.update.maximize_conversions.target_cpa_micros = (
                    mutations.budget_usd_to_micros(inp.target_cpa_usd)
                )
                paths.append("maximize_conversions.target_cpa_micros")
            paths.append("maximize_conversions")
        elif inp.strategy == "MAXIMIZE_CONVERSION_VALUE":
            op.update.maximize_conversion_value._pb.SetInParent()  # type: ignore[attr-defined]
            if inp.target_roas:
                op.update.maximize_conversion_value.target_roas = inp.target_roas
                paths.append("maximize_conversion_value.target_roas")
            paths.append("maximize_conversion_value")
        elif inp.strategy == "TARGET_CPA":
            op.update.target_cpa.target_cpa_micros = mutations.budget_usd_to_micros(
                inp.target_cpa_usd or 0
            )
            paths.append("target_cpa.target_cpa_micros")
        elif inp.strategy == "TARGET_ROAS":
            op.update.target_roas.target_roas = inp.target_roas or 0
            paths.append("target_roas.target_roas")
        client.copy_from(op.update_mask, {"paths": paths})
        plan["operations"] = [
            {
                "service": "CampaignService",
                "operation": "update",
                "resource_name": resource_name,
                "fields_changed": {"strategy": inp.strategy},
                "old_values": {
                    "strategy": camp["campaign"].get("bidding_strategy_type")
                },
                "new_values": {
                    "strategy": inp.strategy,
                    "target_cpa_usd": inp.target_cpa_usd,
                    "target_roas": inp.target_roas,
                },
            }
        ]
        resp = mutations.run_mutate(
            client, "CampaignService", CFG.customer_id, [op], inp.validate_only
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_import_ga4_conversion(payload: dict) -> dict:
    """Import a GA4 custom event as a new conversion action (secondary by default).

    Use this to import GA4 events such as phone_click or sms_click.
    Set include_in_conversions_metric=False (the default) to keep it secondary
    so it does not affect Smart Bidding or primary conversion counts.
    """
    inp = schemas.ImportGA4ConversionInput.model_validate(payload)
    client = _client()
    with mutations.with_safety(
        CFG,
        tool="google_ads_import_ga4_conversion",
        reason=inp.reason,
        risk_level="medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=["<new conversion action>"],
        before_data={"ga4_event_name": inp.ga4_event_name},
    ) as plan:
        op = client.get_type("ConversionActionOperation")
        ca = op.create
        ca.name = inp.conversion_name
        ca.type_ = client.enums.ConversionActionTypeEnum.GOOGLE_ANALYTICS_4_CUSTOM
        ca.category = client.enums.ConversionActionCategoryEnum[inp.category]
        ca.status = client.enums.ConversionActionStatusEnum.ENABLED
        ca.include_in_conversions_metric = inp.include_in_conversions_metric
        ca.counting_type = client.enums.ConversionActionCountingTypeEnum[
            inp.counting_type
        ]
        ca.click_through_lookback_window_days = inp.click_through_lookback_window_days
        ca.view_through_lookback_window_days = inp.view_through_lookback_window_days
        ca.value_settings.default_value = inp.default_value
        ca.value_settings.always_use_default_value = True
        plan["operations"] = [
            {
                "service": "ConversionActionService",
                "operation": "create",
                "resource_name": "<new conversion action>",
                "fields_changed": {
                    "name": inp.conversion_name,
                    "ga4_event_name": inp.ga4_event_name,
                    "category": inp.category,
                    "include_in_conversions_metric": inp.include_in_conversions_metric,
                    "counting_type": inp.counting_type,
                },
                "old_values": {},
                "new_values": inp.model_dump(exclude_none=True),
            }
        ]
        resp = mutations.run_mutate(
            client, "ConversionActionService", CFG.customer_id, [op], inp.validate_only
        )
        new_rn = (
            resp.results[0].resource_name if not inp.validate_only else "<validate-only>"
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "resource_name": new_rn,
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
            "resource_name": new_rn,
            "note": (
                "Conversion action created as secondary (include_in_conversions_metric=False). "
                "It will not affect Smart Bidding or primary conversion counts."
                if not inp.include_in_conversions_metric
                else "Conversion action created as PRIMARY — verify this was intended."
            ),
        }


@mcp.tool()
def google_ads_update_conversion_action(payload: dict) -> dict:
    """Update a conversion action's editable fields."""
    inp = schemas.ConversionActionInput.model_validate(payload)
    client = _client()
    rn = f"customers/{CFG.customer_id}/conversionActions/{inp.conversion_action_id}"
    before_rows = gaql.stream_to_dicts(
        client,
        CFG.customer_id,
        f"""
        SELECT conversion_action.id, conversion_action.name, conversion_action.status,
               conversion_action.category, conversion_action.type, conversion_action.origin,
               conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric,
               conversion_action.counting_type, conversion_action.value_settings.default_value
        FROM conversion_action WHERE conversion_action.id = {int(inp.conversion_action_id)}
    """,
    )
    if not before_rows:
        raise ValueError(f"Conversion action {inp.conversion_action_id} not found.")
    before = before_rows[0]
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_conversion_action",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[rn],
        before_data=before,
    ) as plan:
        op = client.get_type("ConversionActionOperation")
        op.update.resource_name = rn
        paths: list[str] = []
        if inp.name is not None:
            op.update.name = inp.name
            paths.append("name")
        if inp.category is not None:
            op.update.category = client.enums.ConversionActionCategoryEnum[inp.category]
            paths.append("category")
        if inp.status is not None:
            op.update.status = client.enums.ConversionActionStatusEnum[inp.status]
            paths.append("status")
        if inp.include_in_conversions_metric is not None:
            op.update.include_in_conversions_metric = inp.include_in_conversions_metric
            paths.append("include_in_conversions_metric")
        if inp.primary_for_goal is not None:
            op.update.primary_for_goal = inp.primary_for_goal
            paths.append("primary_for_goal")
        if inp.counting_type is not None:
            op.update.counting_type = client.enums.ConversionActionCountingTypeEnum[
                inp.counting_type
            ]
            paths.append("counting_type")
        if inp.default_value is not None:
            op.update.value_settings.default_value = inp.default_value
            paths.append("value_settings.default_value")
        client.copy_from(op.update_mask, {"paths": paths})
        plan["operations"] = [
            {
                "service": "ConversionActionService",
                "operation": "update",
                "resource_name": rn,
                "fields_changed": {
                    p: getattr(inp, p.split(".")[0], None) for p in paths
                },
                "old_values": before["conversion_action"],
                "new_values": inp.model_dump(exclude_none=True),
            }
        ]
        resp = mutations.run_mutate(
            client, "ConversionActionService", CFG.customer_id, [op], inp.validate_only
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_customer_conversion_goal(payload: dict) -> dict:
    """Toggle customer-level conversion goal biddability."""
    inp = schemas.CustomerConversionGoalInput.model_validate(payload)
    client = _client()
    rn = f"customers/{CFG.customer_id}/customerConversionGoals/{inp.category}~{inp.origin}"
    before = gaql.stream_to_dicts(
        client, CFG.customer_id, diagnostics.Q_CUSTOMER_CONV_GOALS
    )
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_customer_conversion_goal",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[rn],
        before_data=before,
    ) as plan:
        op = client.get_type("CustomerConversionGoalOperation")
        op.update.resource_name = rn
        op.update.biddable = inp.biddable
        client.copy_from(op.update_mask, {"paths": ["biddable"]})
        plan["operations"] = [
            {
                "service": "CustomerConversionGoalService",
                "operation": "update",
                "resource_name": rn,
                "fields_changed": {"biddable": inp.biddable},
                "old_values": {"category": inp.category, "origin": inp.origin},
                "new_values": {"biddable": inp.biddable},
            }
        ]
        resp = mutations.run_mutate(
            client,
            "CustomerConversionGoalService",
            CFG.customer_id,
            [op],
            inp.validate_only,
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_campaign_conversion_goals(payload: dict) -> dict:
    """Replace per-campaign conversion goals."""
    inp = schemas.CampaignConversionGoalInput.model_validate(payload)
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    camp_id = camp["campaign"]["id"]
    before = gaql.stream_to_dicts(
        client, CFG.customer_id, diagnostics.Q_CAMPAIGN_CONV_GOALS
    )
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_campaign_conversion_goals",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[f"customers/{CFG.customer_id}/campaigns/{camp_id}"],
        before_data=before,
    ) as plan:
        ops = []
        for g in inp.goals:
            op = client.get_type("CampaignConversionGoalOperation")
            op.update.resource_name = (
                f"customers/{CFG.customer_id}/campaignConversionGoals/"
                f"{camp_id}~{g['category']}~{g['origin']}"
            )
            op.update.biddable = bool(g.get("biddable", True))
            client.copy_from(op.update_mask, {"paths": ["biddable"]})
            ops.append(op)
        plan["operations"] = [
            {
                "service": "CampaignConversionGoalService",
                "operation": "update",
                "resource_name": op.update.resource_name,
                "fields_changed": {"biddable": op.update.biddable},
                "old_values": {},
                "new_values": g,
            }
            for op, g in zip(ops, inp.goals)
        ]
        resp = mutations.run_mutate(
            client,
            "CampaignConversionGoalService",
            CFG.customer_id,
            ops,
            inp.validate_only,
        )
        plan["after"] = {"validate_only": inp.validate_only, "count": len(resp.results)}
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_add_campaign_negative_keywords(payload: dict) -> dict:
    """Add negative keywords at the campaign level."""
    inp = schemas.NegativeKeywordsInput.model_validate(payload)
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    camp_id = camp["campaign"]["id"]
    camp_rn = f"customers/{CFG.customer_id}/campaigns/{camp_id}"
    if (
        camp["campaign"].get("advertising_channel_type") or ""
    ).upper() == "PERFORMANCE_MAX":
        raise ValueError(
            "Campaign-level negative keywords on PMax require account-level brand negative "
            "lists via CustomerNegativeCriterion; this tool targets Search/Display only."
        )
    with mutations.with_safety(
        CFG,
        tool="google_ads_add_campaign_negative_keywords",
        reason=inp.reason,
        risk_level="low",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[camp_rn],
        before_data=camp,
    ) as plan:
        ops = []
        for kw in inp.keywords:
            op = client.get_type("CampaignCriterionOperation")
            op.create.campaign = camp_rn
            op.create.negative = True
            op.create.keyword.text = kw
            op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum[
                inp.match_type
            ]
            ops.append(op)
        plan["operations"] = [
            {
                "service": "CampaignCriterionService",
                "operation": "create",
                "resource_name": f"{camp_rn}/criteria/<new>",
                "fields_changed": {
                    "keyword.text": kw,
                    "keyword.match_type": inp.match_type,
                    "negative": True,
                },
                "old_values": {},
                "new_values": {"keyword": kw, "match_type": inp.match_type},
            }
            for kw in inp.keywords
        ]
        resp = mutations.run_mutate(
            client, "CampaignCriterionService", CFG.customer_id, ops, inp.validate_only
        )
        plan["after"] = {"validate_only": inp.validate_only, "count": len(resp.results)}
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_create_search_campaign(payload: dict) -> dict:
    """Create a PAUSED Search campaign with budget and locations. Does NOT enable it."""
    inp = schemas.CreateSearchCampaignInput.model_validate(payload)
    client = _client()
    with mutations.with_safety(
        CFG,
        tool="google_ads_create_search_campaign",
        reason=inp.reason,
        risk_level="high",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=["<new campaign>"],
        before_data={"name": inp.name},
    ) as plan:
        # 1) budget
        b_op = client.get_type("CampaignBudgetOperation")
        b_op.create.name = f"Budget for {inp.name}"
        b_op.create.amount_micros = mutations.budget_usd_to_micros(inp.daily_budget_usd)
        b_op.create.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
        b_resp = mutations.run_mutate(
            client, "CampaignBudgetService", CFG.customer_id, [b_op], inp.validate_only
        )
        # Always use the resource name from the budget response (validate_only returns a
        # temporary resource name; live returns the real one). Fall back to a temp name
        # only if the API returns no results (shouldn't happen but defensive).
        budget_rn = (
            b_resp.results[0].resource_name
            if b_resp.results
            else f"customers/{CFG.customer_id}/campaignBudgets/-1"
        )

        # 2) campaign — always PAUSED
        c_op = client.get_type("CampaignOperation")
        c_op.create.name = inp.name
        c_op.create.status = client.enums.CampaignStatusEnum.PAUSED
        c_op.create.advertising_channel_type = (
            client.enums.AdvertisingChannelTypeEnum.SEARCH
        )
        c_op.create.campaign_budget = budget_rn  # required even in validate_only
        c_op.create.contains_eu_political_advertising = False  # required v24 field
        if inp.bidding == "MANUAL_CPC":
            c_op.create.manual_cpc._pb.SetInParent()  # type: ignore[attr-defined]
        else:
            c_op.create.maximize_conversions._pb.SetInParent()  # type: ignore[attr-defined]
        c_op.create.network_settings.target_google_search = True
        c_op.create.network_settings.target_search_network = False
        c_op.create.network_settings.target_content_network = False
        c_op.create.network_settings.target_partner_search_network = False
        c_resp = mutations.run_mutate(
            client, "CampaignService", CFG.customer_id, [c_op], inp.validate_only
        )

        plan["operations"] = [
            {
                "service": "CampaignBudgetService",
                "operation": "create",
                "resource_name": budget_rn,
                "fields_changed": {"amount_usd": inp.daily_budget_usd},
                "old_values": {},
                "new_values": {
                    "name": b_op.create.name,
                    "amount_usd": inp.daily_budget_usd,
                },
            },
            {
                "service": "CampaignService",
                "operation": "create",
                "resource_name": "<new campaign>",
                "fields_changed": {"name": inp.name, "status": "PAUSED"},
                "old_values": {},
                "new_values": {
                    "name": inp.name,
                    "channel": "SEARCH",
                    "bidding": inp.bidding,
                    "final_url": inp.final_url,
                },
            },
        ]
        plan["after"] = {
            "validate_only": inp.validate_only,
            "budget_results": [str(r) for r in b_resp.results],
            "campaign_results": [str(r) for r in c_resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
            "note": "Campaign created PAUSED. Use google_ads_update_campaign_status with reason containing 'ENABLE' to activate.",
        }


@mcp.tool()
def google_ads_create_or_update_search_keywords(payload: dict) -> dict:
    """Add keywords to an ad group."""
    inp = schemas.SearchKeywordsInput.model_validate(payload)
    if (
        any((k.get("match_type") or "").upper() == "BROAD" for k in inp.keywords)
        and "BROAD_OK" not in inp.reason.upper()
    ):
        raise ValueError("BROAD match requires the token 'BROAD_OK' in reason.")
    client = _client()
    ag_rn = f"customers/{CFG.customer_id}/adGroups/{inp.ad_group_id}"
    with mutations.with_safety(
        CFG,
        tool="google_ads_create_or_update_search_keywords",
        reason=inp.reason,
        risk_level="medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[ag_rn],
        before_data={"ad_group": ag_rn, "keywords": inp.keywords},
    ) as plan:
        ops = []
        for k in inp.keywords:
            op = client.get_type("AdGroupCriterionOperation")
            op.create.ad_group = ag_rn
            op.create.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
            op.create.keyword.text = k["text"]
            op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum[
                k.get("match_type", "PHRASE")
            ]
            ops.append(op)
        plan["operations"] = [
            {
                "service": "AdGroupCriterionService",
                "operation": "create",
                "resource_name": f"{ag_rn}/criteria/<new>",
                "fields_changed": k,
                "old_values": {},
                "new_values": k,
            }
            for k in inp.keywords
        ]
        resp = mutations.run_mutate(
            client, "AdGroupCriterionService", CFG.customer_id, ops, inp.validate_only
        )
        plan["after"] = {"validate_only": inp.validate_only, "count": len(resp.results)}
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_pmax_assets(payload: dict) -> dict:
    """Append text/image/video assets to a PMax asset group. Non-destructive."""
    inp = schemas.UpdatePmaxAssetsInput.model_validate(payload)
    client = _client()
    ag_rn = f"customers/{CFG.customer_id}/assetGroups/{inp.asset_group_id}"
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_pmax_assets",
        reason=inp.reason,
        risk_level="medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[ag_rn],
        before_data={"asset_group": ag_rn},
    ) as plan:
        # Create text assets first via AssetService
        text_specs: list[tuple[str, str]] = (
            [(t, "HEADLINE") for t in inp.headlines]
            + [(t, "LONG_HEADLINE") for t in inp.long_headlines]
            + [(t, "DESCRIPTION") for t in inp.descriptions]
        )
        new_asset_rns: list[tuple[str, str]] = []  # (resource_name, field_type)
        if text_specs:
            a_ops = []
            for text, _ in text_specs:
                aop = client.get_type("AssetOperation")
                aop.create.text_asset.text = text
                a_ops.append(aop)
            a_resp = mutations.run_mutate(
                client, "AssetService", CFG.customer_id, a_ops, inp.validate_only
            )
            for (text, ftype), r in zip(text_specs, a_resp.results):
                new_asset_rns.append(
                    (
                        r.resource_name if not inp.validate_only else "<validate-only>",
                        ftype,
                    )
                )

        # Link existing image/logo/video assets directly
        for rn in inp.image_asset_resource_names:
            new_asset_rns.append((rn, "MARKETING_IMAGE"))
        for rn in inp.logo_asset_resource_names:
            new_asset_rns.append((rn, "LOGO"))
        for ytid in inp.youtube_video_ids:
            vop = client.get_type("AssetOperation")
            vop.create.youtube_video_asset.youtube_video_id = ytid
            vresp = mutations.run_mutate(
                client, "AssetService", CFG.customer_id, [vop], inp.validate_only
            )
            new_asset_rns.append(
                (
                    vresp.results[0].resource_name
                    if not inp.validate_only
                    else "<validate-only>",
                    "YOUTUBE_VIDEO",
                )
            )

        # Link to asset group
        link_ops = []
        for rn, ftype in new_asset_rns:
            lop = client.get_type("AssetGroupAssetOperation")
            lop.create.asset_group = ag_rn
            lop.create.asset = rn
            lop.create.field_type = client.enums.AssetFieldTypeEnum[ftype]
            link_ops.append(lop)
        if link_ops:
            l_resp = mutations.run_mutate(
                client,
                "AssetGroupAssetService",
                CFG.customer_id,
                link_ops,
                inp.validate_only,
            )
        else:
            l_resp = None
        plan["operations"] = [
            {
                "service": "AssetGroupAssetService",
                "operation": "create",
                "resource_name": ag_rn,
                "fields_changed": {"field_type": ftype, "asset": rn},
                "old_values": {},
                "new_values": {"asset": rn, "field_type": ftype},
            }
            for rn, ftype in new_asset_rns
        ]
        plan["after"] = {
            "validate_only": inp.validate_only,
            "linked": len(link_ops),
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_update_locations(payload: dict) -> dict:
    """Add/remove geo target constants on a campaign."""
    inp = schemas.UpdateLocationsInput.model_validate(payload)
    client = _client()
    camp = _resolve_campaign(client, inp.campaign_name_or_id)
    camp_id = camp["campaign"]["id"]
    camp_rn = f"customers/{CFG.customer_id}/campaigns/{camp_id}"
    before = gaql.stream_to_dicts(
        client,
        CFG.customer_id,
        f"""
        SELECT campaign_criterion.resource_name, campaign_criterion.location.geo_target_constant
        FROM campaign_criterion WHERE campaign.id = {int(camp_id)} AND campaign_criterion.type = 'LOCATION'
    """,
    )
    with mutations.with_safety(
        CFG,
        tool="google_ads_update_locations",
        reason=inp.reason,
        risk_level="medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=[camp_rn],
        before_data=before,
    ) as plan:
        ops = []
        for gtc in inp.add_geo_target_constants:
            op = client.get_type("CampaignCriterionOperation")
            op.create.campaign = camp_rn
            op.create.location.geo_target_constant = gtc
            ops.append(op)
        # Remove: need to look up criterion resource_name for each gtc
        rn_by_gtc = {
            b["campaign_criterion"]["location"]["geo_target_constant"]: b[
                "campaign_criterion"
            ]["resource_name"]
            for b in before
        }
        for gtc in inp.remove_geo_target_constants:
            rn = rn_by_gtc.get(gtc)
            if not rn:
                continue
            op = client.get_type("CampaignCriterionOperation")
            op.remove = rn
            ops.append(op)
        plan["operations"] = [
            {
                "service": "CampaignCriterionService",
                "operation": "create",
                "resource_name": f"{camp_rn}/criteria/<new>",
                "fields_changed": {"location.geo_target_constant": gtc},
                "old_values": {},
                "new_values": {"geo_target_constant": gtc},
            }
            for gtc in inp.add_geo_target_constants
        ] + [
            {
                "service": "CampaignCriterionService",
                "operation": "remove",
                "resource_name": rn_by_gtc.get(gtc, "<missing>"),
                "fields_changed": {},
                "old_values": {"geo_target_constant": gtc},
                "new_values": {},
            }
            for gtc in inp.remove_geo_target_constants
        ]
        resp = mutations.run_mutate(
            client, "CampaignCriterionService", CFG.customer_id, ops, inp.validate_only
        )
        plan["after"] = {"validate_only": inp.validate_only, "count": len(resp.results)}
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_upload_image_assets(payload: dict) -> dict:
    """Upload a local image (must be under public/images/) as an Asset."""
    inp = schemas.UploadImageAssetInput.model_validate(payload)
    p = Path(inp.file_path).resolve()
    allowed_root = (cfg_mod.REPO_ROOT / "public" / "images").resolve()
    if allowed_root not in p.parents:
        raise ValueError(f"File must live under {allowed_root}.")
    if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Unsupported image format.")
    data = p.read_bytes()
    if len(data) > 5 * 1024 * 1024:
        raise ValueError("Image > 5 MB; optimize before upload.")
    client = _client()
    with mutations.with_safety(
        CFG,
        tool="google_ads_upload_image_assets",
        reason=inp.reason,
        risk_level="medium",
        validate_only=inp.validate_only,
        approval_token=inp.approval_token,
        resources_touched=["<new asset>"],
        before_data={"source": str(p)},
    ) as plan:
        op = client.get_type("AssetOperation")
        op.create.name = inp.asset_name
        op.create.type_ = client.enums.AssetTypeEnum.IMAGE
        op.create.image_asset.data = data
        plan["operations"] = [
            {
                "service": "AssetService",
                "operation": "create",
                "resource_name": "<new asset>",
                "fields_changed": {"name": inp.asset_name, "size_bytes": len(data)},
                "old_values": {},
                "new_values": {"source": str(p), "name": inp.asset_name},
            }
        ]
        resp = mutations.run_mutate(
            client, "AssetService", CFG.customer_id, [op], inp.validate_only
        )
        plan["after"] = {
            "validate_only": inp.validate_only,
            "results": [str(r) for r in resp.results],
        }
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": inp.validate_only,
        }


@mcp.tool()
def google_ads_apply_recommendation(payload: dict) -> dict:
    """Apply a recommendation by resource name. Disabled by default — requires approval token AND validate_only=false."""
    inp = schemas.ApplyRecommendationInput.model_validate(payload)
    if inp.validate_only:
        return {
            "validate_only": True,
            "note": "RecommendationService.apply_recommendation has no validate_only mode; "
            "this tool refuses to call apply unless validate_only=false and approval is supplied. "
            "Inspect the recommendation via google_ads_gaql_query first.",
        }
    client = _client()
    with mutations.with_safety(
        CFG,
        tool="google_ads_apply_recommendation",
        reason=inp.reason,
        risk_level="critical",
        validate_only=False,
        approval_token=inp.approval_token,
        resources_touched=[inp.recommendation_resource_name],
        before_data={"recommendation": inp.recommendation_resource_name},
    ) as plan:
        op = client.get_type("ApplyRecommendationOperation")
        op.resource_name = inp.recommendation_resource_name
        plan["operations"] = [
            {
                "service": "RecommendationService",
                "operation": "apply",
                "resource_name": inp.recommendation_resource_name,
                "fields_changed": {},
                "old_values": {},
                "new_values": {},
            }
        ]
        svc = client.get_service("RecommendationService")
        resp = svc.apply_recommendation(customer_id=CFG.customer_id, operations=[op])
        plan["after"] = {"results": [str(r) for r in resp.results]}
        return {
            "plan": plan["plan"],
            "plan_path": plan["plan_path"],
            "validate_only": False,
        }


# =========================================================================
# Entry point
# =========================================================================

if __name__ == "__main__":
    try:
        mcp.run()
    except Exception as exc:  # noqa: BLE001
        print(f"[google-ads-mcp] fatal: {exc}", file=sys.stderr)
        raise
