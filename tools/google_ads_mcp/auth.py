"""Lightweight auth helper used by the server for health-check style checks."""
from __future__ import annotations

from .config import Config, mask_cid
from .google_ads_client import build_client


def health_check(cfg: Config) -> dict:
    try:
        client = build_client(cfg)
    except Exception as exc:  # noqa: BLE001
        return {
            "authenticated": False,
            "error": str(exc),
            "customer_id_masked": mask_cid(cfg.customer_id),
            "allow_mutate": cfg.allow_mutate,
            "require_approval": cfg.require_approval,
            "default_validate_only": cfg.default_validate_only,
        }
    # List accessible customers to prove credentials work.
    accessible = []
    customer_accessible = False
    try:
        svc = client.get_service("CustomerService")
        resp = svc.list_accessible_customers()
        accessible = [rn for rn in resp.resource_names]
        target_rn = f"customers/{cfg.customer_id}"
        customer_accessible = target_rn in accessible
    except Exception as exc:  # noqa: BLE001
        return {
            "authenticated": True,
            "customer_accessible": False,
            "error": f"list_accessible_customers failed: {exc}",
            "customer_id_masked": mask_cid(cfg.customer_id),
            "allow_mutate": cfg.allow_mutate,
            "require_approval": cfg.require_approval,
            "default_validate_only": cfg.default_validate_only,
        }
    return {
        "authenticated": True,
        "customer_accessible": customer_accessible,
        "accessible_customer_resource_names": accessible,
        "customer_id_masked": mask_cid(cfg.customer_id),
        "login_customer_id_masked": mask_cid(cfg.login_customer_id) if cfg.login_customer_id else None,
        "api_version": cfg.api_version,
        "allow_mutate": cfg.allow_mutate,
        "require_approval": cfg.require_approval,
        "default_validate_only": cfg.default_validate_only,
        "max_daily_budget_delta_percent": cfg.max_daily_budget_delta_percent,
    }
