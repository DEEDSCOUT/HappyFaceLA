"""GAQL helpers and read-only guard."""
from __future__ import annotations

import re

_FORBIDDEN = {"INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "MUTATE", "ALTER"}


class GAQLGuardError(ValueError):
    pass


def assert_read_only(query: str) -> str:
    """Return cleaned query if it's a single SELECT; raise otherwise."""
    q = (query or "").strip().rstrip(";")
    if not q:
        raise GAQLGuardError("Empty query.")
    if ";" in q:
        raise GAQLGuardError("Multiple statements are not allowed.")
    tokens = set(re.findall(r"[A-Za-z_]+", q.upper()))
    if not q.upper().lstrip().startswith("SELECT"):
        raise GAQLGuardError("Only SELECT queries are allowed.")
    bad = tokens & _FORBIDDEN
    if bad:
        raise GAQLGuardError(f"Forbidden keyword(s): {sorted(bad)}")
    return q


def stream_to_dicts(client, customer_id: str, query: str) -> list[dict]:
    from .google_ads_client import row_to_dict
    service = client.get_service("GoogleAdsService")
    out: list[dict] = []
    for batch in service.search_stream(customer_id=customer_id, query=query):
        for row in batch.results:
            out.append(row_to_dict(row))
    return out
