"""Pydantic input schemas for write tools."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class MutationCommon(BaseModel):
    validate_only: bool = True
    approval_token: Optional[str] = None
    reason: str = Field(..., min_length=4)
    change_ticket: Optional[str] = None


class CampaignStatusInput(MutationCommon):
    campaign_name_or_id: str
    status: Literal["ENABLED", "PAUSED", "REMOVED"]


class CampaignBudgetInput(MutationCommon):
    campaign_name_or_id: str
    new_daily_budget_usd: float = Field(..., gt=0)
    force_large_budget_change: bool = False


class BidStrategyInput(MutationCommon):
    campaign_name_or_id: str
    strategy: Literal[
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CONVERSION_VALUE",
        "TARGET_CPA",
        "TARGET_ROAS",
    ]
    target_cpa_usd: Optional[float] = None
    target_roas: Optional[float] = None


class ImportGA4ConversionInput(MutationCommon):
    ga4_event_name: str
    conversion_name: str
    category: Literal[
        "PHONE_CALL_LEAD",
        "CONTACT",
        "SUBMIT_LEAD_FORM",
        "PURCHASE",
        "PAGE_VIEW",
        "OTHER",
    ] = "CONTACT"
    include_in_conversions_metric: bool = False  # False = secondary
    counting_type: Literal["ONE_PER_CLICK", "MANY_PER_CLICK"] = "ONE_PER_CLICK"
    click_through_lookback_window_days: int = 30
    view_through_lookback_window_days: int = 1
    default_value: float = 1.0


class ConversionActionInput(MutationCommon):
    conversion_action_id: str
    name: Optional[str] = None
    category: Optional[str] = None
    status: Optional[Literal["ENABLED", "REMOVED", "HIDDEN"]] = None
    include_in_conversions_metric: Optional[bool] = None
    primary_for_goal: Optional[bool] = None
    counting_type: Optional[Literal["ONE_PER_CLICK", "MANY_PER_CLICK"]] = None
    default_value: Optional[float] = None


class CustomerConversionGoalInput(MutationCommon):
    category: str
    origin: str
    biddable: bool


class CampaignConversionGoalInput(MutationCommon):
    campaign_name_or_id: str
    goals: list[dict]  # [{category, origin, biddable}]


class NegativeKeywordsInput(MutationCommon):
    campaign_name_or_id: str
    keywords: list[str]
    match_type: Literal["EXACT", "PHRASE", "BROAD"] = "PHRASE"


class CreateSearchCampaignInput(MutationCommon):
    name: str
    daily_budget_usd: float = Field(..., gt=0)
    final_url: str
    locations_geo_target_constants: list[str]
    bidding: Literal["MANUAL_CPC", "MAXIMIZE_CONVERSIONS"] = "MANUAL_CPC"


class SearchKeywordsInput(MutationCommon):
    ad_group_id: str
    keywords: list[dict]  # [{text, match_type}]


class UpdatePmaxAssetsInput(MutationCommon):
    asset_group_id: str
    headlines: list[str] = []
    long_headlines: list[str] = []
    descriptions: list[str] = []
    image_asset_resource_names: list[str] = []
    logo_asset_resource_names: list[str] = []
    youtube_video_ids: list[str] = []


class UpdateLocationsInput(MutationCommon):
    campaign_name_or_id: str
    add_geo_target_constants: list[str] = []
    remove_geo_target_constants: list[str] = []


class UploadImageAssetInput(MutationCommon):
    file_path: str  # must be under public/images/
    asset_name: str


class ApplyRecommendationInput(MutationCommon):
    recommendation_resource_name: str
