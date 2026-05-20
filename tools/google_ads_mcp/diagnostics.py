"""Diagnostics report generator. Pure GAQL reads."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from .config import Config, mask_cid, redact
from .gaql import stream_to_dicts


# ---------- GAQL queries ----------

Q_CAMPAIGNS = """
SELECT
  campaign.id, campaign.name, campaign.status, campaign.serving_status,
  campaign.advertising_channel_type, campaign.advertising_channel_sub_type,
  campaign.bidding_strategy_type, campaign.optimization_score,
  campaign.start_date, campaign.end_date,
  campaign.url_expansion_opt_out,
  campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros,
  campaign_budget.delivery_method, campaign_budget.explicitly_shared
FROM campaign
ORDER BY campaign.status, campaign.name
"""

Q_CONVERSION_ACTIONS = """
SELECT
  conversion_action.id, conversion_action.name, conversion_action.resource_name,
  conversion_action.status, conversion_action.type, conversion_action.category,
  conversion_action.origin, conversion_action.primary_for_goal,
  conversion_action.include_in_conversions_metric,
  conversion_action.counting_type, conversion_action.click_through_lookback_window_days,
  conversion_action.view_through_lookback_window_days,
  conversion_action.attribution_model_settings.attribution_model,
  conversion_action.value_settings.default_value,
  conversion_action.value_settings.always_use_default_value
FROM conversion_action
ORDER BY conversion_action.status, conversion_action.name
"""

Q_CUSTOMER_CONV_GOALS = """
SELECT
  customer_conversion_goal.category,
  customer_conversion_goal.origin,
  customer_conversion_goal.biddable
FROM customer_conversion_goal
"""

Q_CAMPAIGN_CONV_GOALS = """
SELECT
  campaign.id, campaign.name,
  campaign_conversion_goal.category,
  campaign_conversion_goal.origin,
  campaign_conversion_goal.biddable
FROM campaign_conversion_goal
"""

Q_ASSET_GROUP_ASSETS = """
SELECT
  campaign.id, campaign.name,
  asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls,
  asset_group_asset.field_type, asset_group_asset.performance_label,
  asset_group_asset.status,
  asset.id, asset.type, asset.name,
  asset.text_asset.text,
  asset.image_asset.full_size.url,
  asset.youtube_video_asset.youtube_video_id
FROM asset_group_asset
"""

Q_ASSET_GROUP_SIGNALS = """
SELECT
  campaign.id, campaign.name,
  asset_group.id, asset_group.name,
  asset_group_signal.search_theme.text,
  asset_group_signal.audience.audience
FROM asset_group_signal
"""

Q_LOCATIONS = """
SELECT
  campaign.id, campaign.name,
  campaign_criterion.criterion_id,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.negative, campaign_criterion.status
FROM campaign_criterion
WHERE campaign_criterion.type = 'LOCATION'
"""

Q_CUSTOMER = """
SELECT
  customer.id, customer.descriptive_name, customer.currency_code,
  customer.time_zone, customer.auto_tagging_enabled, customer.status,
  customer.manager, customer.test_account,
  customer.conversion_tracking_setting.conversion_tracking_id,
  customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
  customer.conversion_tracking_setting.accepted_customer_data_terms,
  customer.conversion_tracking_setting.conversion_tracking_status
FROM customer
"""

Q_CHANGE_EVENTS = """
SELECT
  change_event.change_date_time, change_event.user_email,
  change_event.client_type, change_event.change_resource_type,
  change_event.resource_change_operation, change_event.changed_fields
FROM change_event
WHERE change_event.change_date_time DURING LAST_30_DAYS
ORDER BY change_event.change_date_time DESC
LIMIT 200
"""


# ---------- Report rendering ----------

def _md_table(rows: list[dict[str, Any]], cols: list[tuple[str, str]]) -> str:
    if not rows:
        return "_No rows._\n"
    out = ["| " + " | ".join(h for h, _ in cols) + " |",
           "| " + " | ".join("---" for _ in cols) + " |"]
    for r in rows:
        cells = []
        for _, path in cols:
            cur: Any = r
            for p in path.split("."):
                cur = cur.get(p) if isinstance(cur, dict) else None
                if cur is None:
                    break
            cells.append(str(cur) if cur is not None else "")
        out.append("| " + " | ".join(c.replace("|", "\\|").replace("\n", " ") for c in cells) + " |")
    return "\n".join(out) + "\n"


def _find_action(actions: list[dict], name_substr: str) -> dict | None:
    for a in actions:
        nm = (a.get("conversion_action", {}).get("name") or "").lower()
        if name_substr.lower() in nm:
            return a["conversion_action"]
    return None


def diagnose_conversion_tracking(actions: list[dict], customer_goals: list[dict]) -> list[str]:
    """Produce human-readable diagnosis of 'Conversion tracking setup is incomplete'."""
    notes: list[str] = []

    lead_action = _find_action(actions, "submit lead") or _find_action(actions, "generate_lead")
    if not lead_action:
        notes.append(
            "No conversion action whose name contains 'submit lead' or 'generate_lead' was found. "
            "This is the most common cause of 'Conversion tracking setup is incomplete'."
        )
    else:
        if lead_action.get("status") != "ENABLED":
            notes.append(f"Lead conversion action '{lead_action.get('name')}' status is {lead_action.get('status')} — must be ENABLED.")
        if not lead_action.get("include_in_conversions_metric"):
            notes.append(f"'{lead_action.get('name')}' has include_in_conversions_metric=False — bidding will ignore it.")
        if not lead_action.get("primary_for_goal"):
            notes.append(f"'{lead_action.get('name')}' is not primary_for_goal — Google Ads may not count it for optimization.")

    # Customer-level lead goal biddable?
    lead_goal_biddable = any(
        g.get("customer_conversion_goal", {}).get("category") == "SUBMIT_LEAD_FORM"
        and g.get("customer_conversion_goal", {}).get("biddable")
        for g in customer_goals
    )
    if not lead_goal_biddable:
        notes.append(
            "Customer conversion goal SUBMIT_LEAD_FORM is not biddable. "
            "Set it biddable so PMax/Search campaigns optimize toward lead submissions."
        )

    if not notes:
        notes.append("API-side conversion configuration looks structurally OK. "
                     "The 'incomplete' warning may be a UI-only gating signal "
                     "(e.g. no conversions recorded yet, tag not firing, "
                     "Enhanced Conversions opt-in pending). Verify in Google Ads UI > Goals > Summary.")
    return notes


def build_report(cfg: Config, data: dict[str, list[dict]]) -> str:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    parts: list[str] = []
    parts.append(f"# Google Ads Diagnostics — Happy Faces LA\n")
    parts.append(f"_Generated {now}Z. Account: {mask_cid(cfg.customer_id)}. Mode: read._\n")
    parts.append("> Produced by `tools/google_ads_mcp`. Secrets redacted. "
                 "Mutate tools exist but are gated by an approval token and validate-only default.\n")

    parts.append("## Account\n")
    parts.append(_md_table(data.get("customer", []), [
        ("ID", "customer.id"), ("Name", "customer.descriptive_name"),
        ("Currency", "customer.currency_code"), ("Time Zone", "customer.time_zone"),
        ("Auto-tagging", "customer.auto_tagging_enabled"),
        ("Status", "customer.status"),
        ("Manager", "customer.manager"),
        ("Conv. Tracking ID", "customer.conversion_tracking_setting.conversion_tracking_id"),
        ("Conv. Tracking Status", "customer.conversion_tracking_setting.conversion_tracking_status"),
        ("Accepted Data Terms", "customer.conversion_tracking_setting.accepted_customer_data_terms"),
    ]))

    parts.append("## Campaigns\n")
    parts.append(_md_table(data.get("campaigns", []), [
        ("ID", "campaign.id"), ("Name", "campaign.name"), ("Status", "campaign.status"),
        ("Serving", "campaign.serving_status"),
        ("Channel", "campaign.advertising_channel_type"),
        ("Sub-type", "campaign.advertising_channel_sub_type"),
        ("Bid Strategy", "campaign.bidding_strategy_type"),
        ("Budget µ", "campaign_budget.amount_micros"),
        ("Budget Name", "campaign_budget.name"),
        ("Opt Score", "campaign.optimization_score"),
    ]))

    parts.append("## Kids Party Face Painting Campaign\n")
    kids = [c for c in data.get("campaigns", [])
            if "kids party face painting" in (c.get("campaign", {}).get("name") or "").lower()]
    if kids:
        parts.append(_md_table(kids, [
            ("ID", "campaign.id"), ("Status", "campaign.status"),
            ("Serving", "campaign.serving_status"),
            ("Channel", "campaign.advertising_channel_type"),
            ("Sub-type", "campaign.advertising_channel_sub_type"),
            ("Bid Strategy", "campaign.bidding_strategy_type"),
            ("Budget µ", "campaign_budget.amount_micros"),
            ("Opt Score", "campaign.optimization_score"),
        ]))
    else:
        parts.append("_Campaign 'Kids Party Face Painting' not found._\n")

    parts.append("## Budget and Bidding\n")
    parts.append("_See Campaigns table above for budget amounts (micros = USD × 1,000,000) "
                 "and bid strategy. Threshold for unattended budget changes: "
                 f"{cfg.max_daily_budget_delta_percent}%._\n")

    parts.append("## Conversion Actions\n")
    parts.append(_md_table(data.get("conversion_actions", []), [
        ("ID", "conversion_action.id"), ("Name", "conversion_action.name"),
        ("Status", "conversion_action.status"),
        ("Category", "conversion_action.category"),
        ("Type", "conversion_action.type"),
        ("Origin", "conversion_action.origin"),
        ("Primary", "conversion_action.primary_for_goal"),
        ("In Conv.", "conversion_action.include_in_conversions_metric"),
        ("Counting", "conversion_action.counting_type"),
        ("Attribution", "conversion_action.attribution_model_settings.attribution_model"),
    ]))

    parts.append("## Conversion Goals\n")
    parts.append("### Customer-level\n")
    parts.append(_md_table(data.get("customer_goals", []), [
        ("Category", "customer_conversion_goal.category"),
        ("Origin", "customer_conversion_goal.origin"),
        ("Biddable", "customer_conversion_goal.biddable"),
    ]))
    parts.append("### Per-campaign overrides\n")
    parts.append(_md_table(data.get("campaign_goals", []), [
        ("Campaign", "campaign.name"),
        ("Category", "campaign_conversion_goal.category"),
        ("Origin", "campaign_conversion_goal.origin"),
        ("Biddable", "campaign_conversion_goal.biddable"),
    ]))

    parts.append("## Conversion Tracking Incomplete Diagnosis\n")
    notes = diagnose_conversion_tracking(data.get("conversion_actions", []), data.get("customer_goals", []))
    for n in notes:
        parts.append(f"- {n}\n")
    parts.append(
        "\n**Questions answered:**\n"
        "- Is `generate_lead` / `Submit lead form` primary? See Conversion Actions > Primary column.\n"
        "- Is Contact Us still secondary or misconfigured? See Conversion Actions for any `Contact`-named action.\n"
        "- Account-default vs campaign-specific goals? See both Conversion Goals tables above.\n"
        "- Why might Google Ads say tracking is incomplete? See diagnostic notes above.\n"
        "- Can the API fix it, or is UI action required? Conversion action edits and goal biddability are API-fixable. "
        "Tag firing, Enhanced Conversions opt-in, and the 'Goals > Summary' UI gate are UI-only.\n"
    )

    parts.append("## PMax Asset Groups\n")
    parts.append(_md_table(data.get("asset_group_assets", []), [
        ("Campaign", "campaign.name"),
        ("Asset Group", "asset_group.name"),
        ("Field", "asset_group_asset.field_type"),
        ("Perf", "asset_group_asset.performance_label"),
        ("Status", "asset_group_asset.status"),
        ("Asset Type", "asset.type"),
        ("Text", "asset.text_asset.text"),
        ("Image URL", "asset.image_asset.full_size.url"),
        ("YT ID", "asset.youtube_video_asset.youtube_video_id"),
    ]))

    parts.append("## Assets — Search Themes & Audience Signals\n")
    parts.append(_md_table(data.get("signals", []), [
        ("Campaign", "campaign.name"),
        ("Asset Group", "asset_group.name"),
        ("Search Theme", "asset_group_signal.search_theme.text"),
        ("Audience", "asset_group_signal.audience.audience"),
    ]))

    parts.append("## Locations\n")
    parts.append(_md_table(data.get("locations", []), [
        ("Campaign", "campaign.name"),
        ("Geo Target", "campaign_criterion.location.geo_target_constant"),
        ("Canonical", "geo_target_constant_resolved.canonical_name"),
        ("Type", "geo_target_constant_resolved.target_type"),
        ("Country", "geo_target_constant_resolved.country_code"),
        ("Negative", "campaign_criterion.negative"),
    ]))

    parts.append("## Recommendations\n")
    parts.append("_Not fetched in this run. Use `google_ads_gaql_query` with the "
                 "`recommendation` resource to inspect; auto-apply is intentionally **not** implemented._\n")

    parts.append("## Risks\n")
    parts.append("- Mutate tools require approval token (`GOOGLE_ADS_APPROVAL_TOKEN`) when `validate_only=false`.\n")
    parts.append(f"- Budget changes > {cfg.max_daily_budget_delta_percent}% require `force_large_budget_change=true`.\n")
    parts.append("- Broad-match keyword expansion and campaign enablement after creation are explicit-approval only.\n")

    parts.append("## UI-only Items\n")
    parts.append("- Google Ads UI 'Goals > Summary' tracking-incomplete banner state.\n")
    parts.append("- Auto-apply recommendation toggles.\n")
    parts.append("- Billing / payment instruments and invoices.\n")
    parts.append("- Enhanced Conversions consent acceptance UI.\n")
    parts.append("- Google Tag (gtag.js) firing diagnostics — verify in Tag Assistant / Clarity.\n")

    parts.append("## Recommended Next Actions\n")
    parts.append("1. Confirm `Submit lead form` / `generate_lead` action exists, is ENABLED, primary_for_goal=true, "
                 "and include_in_conversions_metric=true (use `google_ads_conversion_actions`).\n")
    parts.append("2. Confirm customer conversion goal `SUBMIT_LEAD_FORM` is biddable; fix via "
                 "`google_ads_update_customer_conversion_goal` if not.\n")
    parts.append("3. Test the website lead form end-to-end and verify a conversion fires in Google Ads "
                 "(may take up to 24h to appear).\n")
    parts.append("4. After at least one recorded conversion, re-check the UI banner.\n")
    parts.append("5. Add negative keywords (`google_ads_add_campaign_negative_keywords`) — list documented in README.\n")

    parts.append("## Change History (last 30 days)\n")
    parts.append(_md_table(data.get("changes", []), [
        ("When", "change_event.change_date_time"),
        ("User", "change_event.user_email"),
        ("Client", "change_event.client_type"),
        ("Resource", "change_event.change_resource_type"),
        ("Op", "change_event.resource_change_operation"),
    ]))

    body = "\n".join(parts)
    return redact(body, cfg.secret_values)


def fetch_all(client, cfg: Config) -> dict[str, list[dict]]:
    cid = cfg.customer_id
    data: dict[str, list[dict]] = {
        "customer": stream_to_dicts(client, cid, Q_CUSTOMER),
        "campaigns": stream_to_dicts(client, cid, Q_CAMPAIGNS),
        "conversion_actions": stream_to_dicts(client, cid, Q_CONVERSION_ACTIONS),
        "customer_goals": stream_to_dicts(client, cid, Q_CUSTOMER_CONV_GOALS),
        "campaign_goals": stream_to_dicts(client, cid, Q_CAMPAIGN_CONV_GOALS),
        "asset_group_assets": stream_to_dicts(client, cid, Q_ASSET_GROUP_ASSETS),
        "signals": stream_to_dicts(client, cid, Q_ASSET_GROUP_SIGNALS),
        "locations": stream_to_dicts(client, cid, Q_LOCATIONS),
        "changes": [],
    }
    try:
        data["changes"] = stream_to_dicts(client, cid, Q_CHANGE_EVENTS)
    except Exception:  # change_event requires special perms sometimes
        data["changes"] = []
    return data
