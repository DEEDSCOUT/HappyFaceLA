# INDEXABILITY DECISION MATRIX
## SEO Baseline — happyfacesla.com
## Audit Date: 2026-05-28
## Purpose: Preserve material indexability findings for the 5 highest-stakes URLs without implementing any change

**No source code change, GSC action, sitemap mutation, or GBP action is authorized by this matrix.**
This matrix is a record of evidence + future-action recommendation, not an instruction set.

---

## Decision Matrix

| URL | Current Robots Directive | Current GSC Inspection State | In Sitemap? | Commercial Intent | Approved Public Claims? | Intended Indexability Decision Required? | Recommended Future Technical Action (NOT EXECUTED) |
|---|---|---|---|---|---|---|---|
| `/services/` | `index,follow` (initial HTML 2026-05-28) | NEUTRAL — "URL is unknown to Google" (fresh inspection 2026-05-28; never crawled; no referring URLs) | YES (listed in `sitemap-0.xml`) | HIGH — commercial hub aggregating face painting, balloon twisting, glitter tattoos, face gems with LocalBusiness + 6× Service/Offer JSON-LD + BreadcrumbList | NO — no CEO-approved service descriptions on record; governance workbook DRAFT SHELL; geographic claim "Los Angeles, Orange County, and Ventura County" not formally approved | **YES** — Page is indexable per source intent but Google has not discovered it. Owner must decide: (a) keep indexable and assist discovery, (b) noindex until claims approved, (c) leave neutral and let natural crawl resolve. | Once governance approves the public claims for this page: add one internal contextual link from `/face-painting-los-angeles/` (or another indexed page) to `/services/`. Re-run URL Inspection after 14–30 days. Do not request indexing manually. |
| `/corporate-event-face-painting-los-angeles/` | `noindex,nofollow` (initial HTML 2026-05-28, confirmed by direct fetch) | `STALE_OR_CONFLICTING_INDEX_STATE` — Google URL Inspection reports PASS / INDEXING_ALLOWED / "Submitted and indexed"; last crawled 2026-05-19; referring URL `sitemap-0.xml` | NO (excluded by Astro sitemap filter on current build); WAS in earlier sitemap version (pre-noindex) | MEDIUM — corporate event service page with LocalBusiness + 6× Service/Offer JSON-LD + BreadcrumbList | NO — no CEO-approved corporate event service descriptions on record (governance workbook DRAFT SHELL) | **YES** — Source intent (suppress) and Google's served result (indexed) are in conflict. Owner must decide whether this page is intended for the public index once commercial claims are approved. | If suppression is the intended outcome: take no action — Google will deindex on next crawl when it processes the `noindex,nofollow` directive (timing not guaranteed). If indexation is the intended outcome: revise the page to remove `noindex={true}`, restore it to the sitemap, and let normal crawl pick it up. Both paths require separate approval. |
| `/kids-birthday-party-entertainment-los-angeles/` | `noindex,nofollow` (initial HTML 2026-05-28) | NEUTRAL — "URL is unknown to Google" (never crawled) | NO (excluded by Astro sitemap filter; noindex declared in source) | HIGH — high-intent commercial page targeting "kids birthday party entertainment los angeles" with full LocalBusiness + 6× Service/Offer JSON-LD + BreadcrumbList | NO — no CEO-approved descriptions for the kids-birthday vertical | **YES** — Page contains a developed commercial offer but is intentionally hidden from the index. Decision required: does the business intend to publish this commercial vertical or not? | If publishing is desired: (1) governance must approve the public claims, (2) remove `noindex={true}` from `kids-birthday-party-entertainment-los-angeles.astro`, (3) ensure the page enters the sitemap on next build. None of these steps are authorized at this time. |
| `/school-festival-face-painting-los-angeles/` | `noindex,nofollow` (initial HTML 2026-05-28) | NEUTRAL — "URL is unknown to Google" (never crawled) | NO (excluded; noindex in source) | MEDIUM — schools/festivals/camps vertical with LocalBusiness + 6× Service/Offer JSON-LD + BreadcrumbList; description mentions "carnivals, fundraisers, camps, and festivals" | NO — no CEO-approved school/festival vertical claims (workbook 08 DRAFT SHELL) | **YES** — Same pattern as kids-birthday. Vertical page exists but is suppressed. Owner must decide intended publish state. | Same as kids-birthday: governance approval first, then noindex removal + sitemap re-entry. NOT authorized at this time. |
| `/service-areas/los-angeles/` | `noindex,nofollow` (initial HTML 2026-05-28) | NEUTRAL — "URL is unknown to Google" (never crawled) | NO (excluded; noindex in source) | MEDIUM — location-specific service page for Los Angeles; LocalBusiness + 6× Service/Offer JSON-LD + 3× BreadcrumbList items | NO — no CEO-approved location-specific public claims | **YES** — Location-specific pages have local-SEO potential but are intentionally suppressed today. Owner must decide whether to publish location pages (with NAP/area claims that require governance) or remain suppressed. | If publishing location pages is desired: (1) governance must approve city-level claims, (2) hub `/service-areas/` may need to be indexable to support discovery, (3) noindex removal from each city page, (4) sitemap inclusion. NOT authorized at this time. |

---

## Cross-Cutting Observations

1. **All 5 URLs have material commercial content.** None is a placeholder.
2. **Three of 5 are intentionally suppressed by source** (`corporate-event`, `kids-birthday`, `school-festival`, `service-areas/los-angeles`) — the business explicitly chose to keep developed pages out of the index.
3. **One (`/services/`) is indexable but never discovered** — Google has not allocated crawl to it; no GSC referring URL exists.
4. **One (`/corporate-event-...`) is suppressed in source but indexed by Google** — stale-state condition pending Google's next crawl + processing of the noindex directive.
5. **No URL on this list has CEO-approved public claims** in the governance workbook. All commercial content is published or suppressed without a formal authorization trail. This is the root condition that blocks all 5 indexability decisions.

---

## Authorization Boundary

Per the directive:

- No indexing request is authorized.
- No URL removal request is authorized.
- No sitemap modification is authorized.
- No source code change (including noindex removal/addition) is authorized.
- No GBP modification is authorized.
- This matrix is a decision record only — it does not constitute authorization for any of the recommended technical actions.

Decisions on the "Intended Indexability Decision Required?" column belong to the business owner / CEO via the commercial control room governance process.
