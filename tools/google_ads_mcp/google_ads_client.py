"""Google Ads client builder. Imports the SDK lazily so unit tests can run
without the package installed."""
from __future__ import annotations

from typing import Any

from .config import Config


def build_client(cfg: Config) -> Any:
    from google.ads.googleads.client import GoogleAdsClient  # type: ignore

    missing = [n for n, v in (
        ("GOOGLE_ADS_DEVELOPER_TOKEN", cfg.developer_token),
        ("GOOGLE_ADS_CLIENT_ID", cfg.client_id),
        ("GOOGLE_ADS_CLIENT_SECRET", cfg.client_secret),
        ("GOOGLE_ADS_REFRESH_TOKEN", cfg.refresh_token),
        ("GOOGLE_ADS_CUSTOMER_ID", cfg.customer_id),
    ) if not v]
    if missing:
        raise RuntimeError(
            "Missing credentials: " + ", ".join(missing)
            + ". Copy tools/google_ads_mcp/.env.example to .env.local and fill it in."
        )
    config_dict = {
        "developer_token": cfg.developer_token,
        "client_id": cfg.client_id,
        "client_secret": cfg.client_secret,
        "refresh_token": cfg.refresh_token,
        "use_proto_plus": True,
    }
    if cfg.login_customer_id:
        config_dict["login_customer_id"] = cfg.login_customer_id
    return GoogleAdsClient.load_from_dict(config_dict, version=cfg.api_version)


def row_to_dict(row: Any) -> dict[str, Any]:
    from google.protobuf.json_format import MessageToDict  # type: ignore
    return MessageToDict(row._pb, preserving_proto_field_name=True)  # type: ignore[attr-defined]
