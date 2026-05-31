"""Google Business Profile MCP Server — full read + safety-gated write access.

Covers:
  - Accounts & Locations (mybusinessaccountmanagement v1, mybusinessbusinessinformation v1)
  - Reviews: list, read, reply, delete reply
  - Local Posts: list, create, update, delete
  - Media / Photos: list, delete
  - Q&A: list, answer
  - Performance / Insights: daily metrics, search keywords
  - Location Updates: hours, description, website, phone, attributes

Run via VS Code MCP host (see .vscode/mcp.json) or directly:
    python tools/gbp_mcp/server.py
"""

from __future__ import annotations

import logging
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from tools.gbp_mcp import client as client_mod  # type: ignore
    from tools.gbp_mcp import config as cfg_mod  # type: ignore
else:
    from . import client as client_mod
    from . import config as cfg_mod

from mcp.server.fastmcp import FastMCP

CFG = cfg_mod.load_config()
logging.basicConfig(
    level=getattr(logging, CFG.log_level.upper(), logging.INFO),
    stream=sys.stderr,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("gbp_mcp")

mcp = FastMCP("happyfacesla-gbp")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _creds():
    return client_mod.load_credentials(CFG.token_file)


def _assert_mutate(approval_token: str) -> None:
    if not CFG.allow_mutate:
        raise PermissionError(
            "Mutations disabled. Set GBP_ALLOW_MUTATE=true in .env.local to enable."
        )
    if CFG.require_approval and approval_token != CFG.approval_token:
        raise PermissionError(
            "Invalid approval_token. Provide the value of GBP_APPROVAL_TOKEN from .env.local."
        )


def _resolve_account(account_name: Optional[str]) -> str:
    result = account_name or CFG.account_name
    if not result:
        raise ValueError(
            "account_name is required. Pass it explicitly or set GBP_ACCOUNT_NAME in .env.local."
        )
    return result


def _resolve_location(location_name: Optional[str]) -> str:
    result = location_name or CFG.location_name
    if not result:
        raise ValueError(
            "location_name is required. Pass it explicitly or set GBP_LOCATION_NAME in .env.local."
        )
    return result


def _to_locations_resource(loc: str) -> str:
    """Normalize 'accounts/.../locations/{id}' → 'locations/{id}' for biz-info API."""
    if loc.startswith("accounts/") and "/locations/" in loc:
        return "locations/" + loc.split("/locations/", 1)[1]
    return loc


def _date_to_struct(date_str: Optional[str]) -> Optional[dict]:
    if not date_str:
        return None
    d = date.fromisoformat(date_str)
    return {"year": d.year, "month": d.month, "day": d.day}


# ===========================================================================
# READ TOOLS — Account & Location
# ===========================================================================


@mcp.tool()
def gbp_health_check() -> dict:
    """Validate GBP OAuth credentials and return accessible accounts.

    Use this first to confirm connectivity before calling other tools.
    """
    try:
        creds = _creds()
        acct_client = client_mod.build_account_management_client(creds)
        response = acct_client.accounts().list().execute()
        accounts = response.get("accounts", [])
        return {
            "authenticated": True,
            "account_count": len(accounts),
            "accounts": [
                {
                    "name": a.get("name"),
                    "accountName": a.get("accountName"),
                    "type": a.get("type"),
                    "verificationState": a.get("verificationState"),
                }
                for a in accounts
            ],
            "token_file": str(CFG.token_file),
            "allow_mutate": CFG.allow_mutate,
            "default_account": CFG.account_name,
            "default_location": CFG.location_name,
        }
    except Exception as exc:
        return {"authenticated": False, "error": str(exc)}


@mcp.tool()
def gbp_list_accounts() -> list[dict]:
    """List all Google Business Profile accounts accessible to the authenticated user."""
    creds = _creds()
    client = client_mod.build_account_management_client(creds)
    results: list[dict] = []
    request = client.accounts().list()
    while request:
        response = request.execute()
        results.extend(response.get("accounts", []))
        request = client.accounts().list_next(request, response)
    return results


@mcp.tool()
def gbp_list_locations(
    account_name: Optional[str] = None,
    page_size: int = 100,
    read_mask: str = (
        "name,title,websiteUri,regularHours,specialHours,"
        "phoneNumbers,categories,storefrontAddress,profile,"
        "openInfo,metadata,serviceArea"
    ),
) -> list[dict]:
    """List all locations under a GBP account.

    Args:
        account_name: Account resource name e.g. 'accounts/123456789'.
            Falls back to GBP_ACCOUNT_NAME env var.
        page_size: Max locations per page (default 100).
        read_mask: Comma-separated location fields to return.
    """
    account = _resolve_account(account_name)
    creds = _creds()
    biz_client = client_mod.build_business_info_client(creds)
    results: list[dict] = []
    request = (
        biz_client.accounts()
        .locations()
        .list(parent=account, pageSize=page_size, readMask=read_mask)
    )
    while request:
        response = request.execute()
        results.extend(response.get("locations", []))
        request = biz_client.accounts().locations().list_next(request, response)
    return results


@mcp.tool()
def gbp_get_location(
    location_name: Optional[str] = None,
    read_mask: str = (
        "name,title,websiteUri,regularHours,specialHours,"
        "phoneNumbers,categories,storefrontAddress,profile,"
        "openInfo,metadata,serviceArea,serviceItems,moreHours"
    ),
) -> dict:
    """Get full details for a specific location.

    Args:
        location_name: Location resource name e.g. 'locations/12345678901234567'
            or 'accounts/123/locations/456'. Falls back to GBP_LOCATION_NAME.
        read_mask: Comma-separated fields to return.
    """
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)
    creds = _creds()
    biz_client = client_mod.build_business_info_client(creds)
    return biz_client.locations().get(name=loc, readMask=read_mask).execute()


@mcp.tool()
def gbp_get_google_updated_location(
    location_name: Optional[str] = None,
) -> dict:
    """Get the Google-proposed version of a location.

    Returns any fields that Google has auto-updated or suggested to change.
    Useful for catching unauthorized edits or Google's corrections.

    Args:
        location_name: Location resource name. Falls back to GBP_LOCATION_NAME.
    """
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)
    creds = _creds()
    biz_client = client_mod.build_business_info_client(creds)
    return biz_client.locations().getGoogleUpdated(name=loc).execute()


@mcp.tool()
def gbp_list_categories(
    region_code: str = "US",
    language_code: str = "en",
    view: str = "FULL",
    page_size: int = 100,
    filter: Optional[str] = None,
) -> list[dict]:
    """List available GBP business categories.

    Args:
        region_code: ISO 3166-1 alpha-2 code (default 'US').
        language_code: BCP 47 language code (default 'en').
        view: 'BASIC' (name only) or 'FULL' (includes display name).
        page_size: Results per page (default 100).
        filter: Optional text to filter categories (e.g. 'childcare').
    """
    creds = _creds()
    biz_client = client_mod.build_business_info_client(creds)
    results: list[dict] = []
    kwargs: dict[str, Any] = dict(
        regionCode=region_code,
        languageCode=language_code,
        view=view,
        pageSize=page_size,
    )
    if filter:
        kwargs["filter"] = filter
    request = biz_client.categories().list(**kwargs)
    while request:
        response = request.execute()
        results.extend(response.get("categories", []))
        request = biz_client.categories().list_next(request, response)
    return results


# ===========================================================================
# READ TOOLS — Reviews
# ===========================================================================


@mcp.tool()
def gbp_list_reviews(
    location_name: Optional[str] = None,
    page_size: int = 50,
    order_by: str = "updateTime desc",
) -> dict:
    """List Google reviews for a location.

    Args:
        location_name: Full account+location name e.g. 'accounts/123/locations/456'.
            Falls back to GBP_LOCATION_NAME.
        page_size: Number of reviews per page (max 50).
        order_by: Sort order. Options: 'updateTime desc', 'updateTime asc',
            'rating desc', 'rating asc'.
    """
    loc = _resolve_location(location_name)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{loc}/reviews"
    resp = session.get(url, params={"pageSize": page_size, "orderBy": order_by})
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def gbp_get_review(review_name: str) -> dict:
    """Get a specific review by resource name.

    Args:
        review_name: Full review resource name e.g.
            'accounts/123/locations/456/reviews/AbcDef123'.
    """
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{review_name}"
    resp = session.get(url)
    resp.raise_for_status()
    return resp.json()


# ===========================================================================
# READ TOOLS — Local Posts
# ===========================================================================


@mcp.tool()
def gbp_list_local_posts(
    location_name: Optional[str] = None,
    page_size: int = 20,
) -> dict:
    """List Google Posts (local posts) for a location.

    Args:
        location_name: Full account+location name. Falls back to GBP_LOCATION_NAME.
        page_size: Number of posts to return (default 20).
    """
    loc = _resolve_location(location_name)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{loc}/localPosts"
    resp = session.get(url, params={"pageSize": page_size})
    resp.raise_for_status()
    return resp.json()


# ===========================================================================
# READ TOOLS — Media / Photos
# ===========================================================================


@mcp.tool()
def gbp_list_media(
    location_name: Optional[str] = None,
    page_size: int = 100,
) -> dict:
    """List all media items (photos and videos) for a location.

    Args:
        location_name: Full account+location name. Falls back to GBP_LOCATION_NAME.
        page_size: Number of items to return (default 100).
    """
    loc = _resolve_location(location_name)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{loc}/media"
    resp = session.get(url, params={"pageSize": page_size})
    resp.raise_for_status()
    return resp.json()


# ===========================================================================
# READ TOOLS — Q&A
# ===========================================================================


@mcp.tool()
def gbp_list_questions(
    location_name: Optional[str] = None,
    page_size: int = 10,
    answers_per_question: int = 3,
) -> dict:
    """List Q&A (questions and answers) for a location.

    Args:
        location_name: Full account+location name. Falls back to GBP_LOCATION_NAME.
        page_size: Number of questions to return (default 10).
        answers_per_question: Top answers to include per question (default 3).
    """
    loc = _resolve_location(location_name)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{loc}/questions"
    resp = session.get(
        url,
        params={"pageSize": page_size, "answersPerQuestion": answers_per_question},
    )
    resp.raise_for_status()
    return resp.json()


# ===========================================================================
# READ TOOLS — Performance / Insights
# ===========================================================================


@mcp.tool()
def gbp_get_daily_metrics(
    daily_metric: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    location_name: Optional[str] = None,
) -> dict:
    """Get a daily performance metric time series for a location.

    Args:
        daily_metric: Metric name. One of:
            BUSINESS_IMPRESSIONS_DESKTOP_MAPS, BUSINESS_IMPRESSIONS_DESKTOP_SEARCH,
            BUSINESS_IMPRESSIONS_MOBILE_MAPS, BUSINESS_IMPRESSIONS_MOBILE_SEARCH,
            BUSINESS_CONVERSATIONS, BUSINESS_DIRECTION_REQUESTS,
            CALL_CLICKS, WEBSITE_CLICKS, BUSINESS_BOOKINGS,
            BUSINESS_FOOD_ORDERS, BUSINESS_FOOD_MENU_CLICKS.
        start_date: ISO date YYYY-MM-DD (default: 30 days ago).
        end_date: ISO date YYYY-MM-DD (default: today).
        location_name: Location resource name 'locations/{id}' or full path.
            Falls back to GBP_LOCATION_NAME.
    """
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)

    today = date.today()
    end = date.fromisoformat(end_date) if end_date else today
    start = (
        date.fromisoformat(start_date) if start_date else (today - timedelta(days=30))
    )

    creds = _creds()
    perf_client = client_mod.build_performance_client(creds)
    return (
        perf_client.locations()
        .getDailyMetricsTimeSeries(
            name=loc,
            dailyMetric=daily_metric,
            **{
                "dailyRange.startDate.year": start.year,
                "dailyRange.startDate.month": start.month,
                "dailyRange.startDate.day": start.day,
                "dailyRange.endDate.year": end.year,
                "dailyRange.endDate.month": end.month,
                "dailyRange.endDate.day": end.day,
            },
        )
        .execute()
    )


@mcp.tool()
def gbp_get_all_daily_metrics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    location_name: Optional[str] = None,
) -> dict[str, Any]:
    """Get all key daily performance metrics for a location in one call.

    Fetches: impressions (desktop/mobile × maps/search), direction requests,
    call clicks, website clicks, and conversations.

    Args:
        start_date: ISO date YYYY-MM-DD (default: 30 days ago).
        end_date: ISO date YYYY-MM-DD (default: today).
        location_name: Location resource name. Falls back to GBP_LOCATION_NAME.
    """
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)

    today = date.today()
    end = date.fromisoformat(end_date) if end_date else today
    start = (
        date.fromisoformat(start_date) if start_date else (today - timedelta(days=30))
    )

    date_params = {
        "dailyRange.startDate.year": start.year,
        "dailyRange.startDate.month": start.month,
        "dailyRange.startDate.day": start.day,
        "dailyRange.endDate.year": end.year,
        "dailyRange.endDate.month": end.month,
        "dailyRange.endDate.day": end.day,
    }

    metrics = [
        "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
        "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
        "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
        "BUSINESS_CONVERSATIONS",
        "BUSINESS_DIRECTION_REQUESTS",
        "CALL_CLICKS",
        "WEBSITE_CLICKS",
    ]

    creds = _creds()
    perf_client = client_mod.build_performance_client(creds)
    results: dict[str, Any] = {}
    for metric in metrics:
        try:
            results[metric] = (
                perf_client.locations()
                .getDailyMetricsTimeSeries(name=loc, dailyMetric=metric, **date_params)
                .execute()
            )
        except Exception as exc:
            results[metric] = {"error": str(exc)}
    return results


@mcp.tool()
def gbp_get_search_keywords(
    location_name: Optional[str] = None,
    month_year: Optional[str] = None,
) -> dict:
    """Get top search keywords that drove impressions for this business profile.

    Args:
        location_name: Location resource name 'locations/{id}'. Falls back to GBP_LOCATION_NAME.
        month_year: Month in YYYY-MM format (default: last full month).
    """
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)

    today = date.today()
    if not month_year:
        first_of_month = today.replace(day=1)
        last_month = first_of_month - timedelta(days=1)
        month_year = last_month.strftime("%Y-%m")

    year, month = month_year.split("-")

    creds = _creds()
    perf_client = client_mod.build_performance_client(creds)
    return (
        perf_client.locations()
        .searchkeywords()
        .impressions()
        .monthly()
        .list(
            parent=loc,
            **{
                "monthlyRange.startMonth.year": int(year),
                "monthlyRange.startMonth.month": int(month),
                "monthlyRange.endMonth.year": int(year),
                "monthlyRange.endMonth.month": int(month),
            },
        )
        .execute()
    )


# ===========================================================================
# WRITE TOOLS — Reviews
# ===========================================================================


@mcp.tool()
def gbp_reply_to_review(
    review_name: str,
    reply_text: str,
    approval_token: str,
) -> dict:
    """Post an owner reply to a Google review. ⚠️ Requires approval_token.

    Args:
        review_name: Full review resource name e.g.
            'accounts/123/locations/456/reviews/AbcDef'.
        reply_text: The reply text (max 4096 chars). Keep professional and helpful.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{review_name}/reply"
    resp = session.put(url, json={"comment": reply_text})
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def gbp_delete_review_reply(
    review_name: str,
    approval_token: str,
) -> dict:
    """Delete the owner's reply to a review. ⚠️ Requires approval_token.

    Args:
        review_name: Full review resource name.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{review_name}/reply"
    resp = session.delete(url)
    resp.raise_for_status()
    return {"deleted": True, "review_name": review_name}


# ===========================================================================
# WRITE TOOLS — Local Posts
# ===========================================================================


@mcp.tool()
def gbp_create_local_post(
    summary: str,
    approval_token: str,
    topic_type: str = "STANDARD",
    call_to_action_type: Optional[str] = None,
    call_to_action_url: Optional[str] = None,
    event_title: Optional[str] = None,
    event_start_date: Optional[str] = None,
    event_end_date: Optional[str] = None,
    location_name: Optional[str] = None,
) -> dict:
    """Create a Google Post for a location. ⚠️ Requires approval_token.

    Args:
        summary: Post text content (required).
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
        topic_type: 'STANDARD', 'EVENT', 'OFFER', or 'ALERT' (default 'STANDARD').
        call_to_action_type: Optional CTA button type: 'BOOK', 'ORDER', 'SHOP',
            'LEARN_MORE', 'SIGN_UP', or 'CALL'.
        call_to_action_url: URL for the CTA button.
        event_title: Event name — required when topic_type='EVENT'.
        event_start_date: ISO date YYYY-MM-DD — required when topic_type='EVENT'.
        event_end_date: ISO date YYYY-MM-DD — required when topic_type='EVENT'.
        location_name: Full account+location name. Falls back to GBP_LOCATION_NAME.
    """
    _assert_mutate(approval_token)
    loc = _resolve_location(location_name)

    body: dict[str, Any] = {"summary": summary, "topicType": topic_type}
    if call_to_action_type:
        body["callToAction"] = {"actionType": call_to_action_type}
        if call_to_action_url:
            body["callToAction"]["url"] = call_to_action_url
    if topic_type == "EVENT" and event_title:
        body["event"] = {
            "title": event_title,
            "schedule": {
                "startDate": _date_to_struct(event_start_date),
                "endDate": _date_to_struct(event_end_date),
            },
        }

    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{loc}/localPosts"
    resp = session.post(url, json=body)
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def gbp_update_local_post(
    post_name: str,
    summary: str,
    approval_token: str,
    update_mask: str = "summary",
) -> dict:
    """Update an existing Google Post. ⚠️ Requires approval_token.

    Args:
        post_name: Full post resource name e.g.
            'accounts/123/locations/456/localPosts/789'.
        summary: New post text.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
        update_mask: Comma-separated fields to update (default 'summary').
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{post_name}"
    resp = session.patch(
        url, params={"updateMask": update_mask}, json={"summary": summary}
    )
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def gbp_delete_local_post(
    post_name: str,
    approval_token: str,
) -> dict:
    """Delete a Google Post. ⚠️ Requires approval_token.

    Args:
        post_name: Full post resource name e.g.
            'accounts/123/locations/456/localPosts/789'.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{post_name}"
    resp = session.delete(url)
    resp.raise_for_status()
    return {"deleted": True, "post_name": post_name}


# ===========================================================================
# WRITE TOOLS — Location Info
# ===========================================================================


@mcp.tool()
def gbp_update_location(
    update_fields: dict,
    approval_token: str,
    location_name: Optional[str] = None,
) -> dict:
    """Update location business information. ⚠️ Requires approval_token.

    The updateMask is derived automatically from the top-level keys in update_fields.

    Args:
        update_fields: Dict of fields to update. Common examples:
            {"profile": {"description": "New business description (750 chars max)"}}
            {"websiteUri": "https://happyfacesla.com"}
            {"phoneNumbers": {"primaryPhone": "+13105550100"}}
            {"regularHours": {"periods": [
                {"openDay": "MONDAY", "openTime": {"hours": 9},
                 "closeDay": "MONDAY", "closeTime": {"hours": 17}}
            ]}}
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
        location_name: Location resource name 'locations/{id}'. Falls back to GBP_LOCATION_NAME.
    """
    _assert_mutate(approval_token)
    loc = _resolve_location(location_name)
    loc = _to_locations_resource(loc)
    update_mask = ",".join(update_fields.keys())
    creds = _creds()
    biz_client = client_mod.build_business_info_client(creds)
    return (
        biz_client.locations()
        .patch(
            name=loc,
            updateMask=update_mask,
            body=update_fields,
        )
        .execute()
    )


# ===========================================================================
# WRITE TOOLS — Media
# ===========================================================================


@mcp.tool()
def gbp_delete_media(
    media_name: str,
    approval_token: str,
) -> dict:
    """Delete a media item (photo or video) from a location. ⚠️ Requires approval_token.

    Args:
        media_name: Full media resource name e.g.
            'accounts/123/locations/456/media/789'.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{media_name}"
    resp = session.delete(url)
    resp.raise_for_status()
    return {"deleted": True, "media_name": media_name}


# ===========================================================================
# WRITE TOOLS — Q&A
# ===========================================================================


@mcp.tool()
def gbp_answer_question(
    question_name: str,
    answer_text: str,
    approval_token: str,
) -> dict:
    """Post or update the owner's answer to a Q&A question. ⚠️ Requires approval_token.

    Args:
        question_name: Full question resource name e.g.
            'accounts/123/locations/456/questions/789'.
        answer_text: The answer text to post.
        approval_token: Must match GBP_APPROVAL_TOKEN (safety gate).
    """
    _assert_mutate(approval_token)
    creds = _creds()
    session = client_mod.build_authed_session(creds)
    url = f"{client_mod.MYBUSINESS_BASE}/{question_name}/answers:upsert"
    resp = session.post(url, json={"answer": {"text": answer_text}})
    resp.raise_for_status()
    return resp.json()


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    mcp.run()
