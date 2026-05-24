# Phase 1C-A.1 — Research Log

**Candidate:** `candidates/phase1c/hfla_commercial_draft_v2/`
**Research date:** 2026-05-24
**Researcher:** Phase 1C-A.1 controller agent (read-only, no OAuth, no
authenticated session, no mutation of any external system).

---

## 1. HFLA primary-source fetches (live website, 2026-05-24)

| Surface           | URL                                       | Result                                                                                                               | Recorded as    |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| Homepage          | https://happyfacesla.com/                 | "Bookings start at $150" anchor; service area (LA + OC + Ventura); contact intake form.                              | HFLA-EVD-001   |
| Booking policy    | https://happyfacesla.com/booking-policy   | $50 non-refundable deposit; balance due day-of-event; deposit transferable once for reschedules; no-refund stance.   | HFLA-EVD-002   |
| Pricing           | https://happyfacesla.com/pricing          | $150 starting-price language; multi-service / add-on language; quote-form requirement above starting price.          | HFLA-EVD-003   |

---

## 2. LA / national market-reference fetches

| Source                       | URL                                                                  | Result                                                                                                                       | Recorded as    |
| ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- |
| BubbleMania                  | https://bubblemaniaca.com/                                           | LA face-paint + balloon-twist competitor; published service list and contact-for-quote pricing model.                        | HFLA-EVD-006   |
| Paint On Your Face           | https://paintonyourface.com/                                         | LA per-hour pricing: $120/hr face, $130/hr balloon, $135/hr caricature; 2-hour minimum.                                      | HFLA-EVD-007   |
| Thumbtack national cost guide| https://www.thumbtack.com/p/face-painting-cost                       | National examples: hourly $70-$125, fixed-event typical ~$269.                                                               | HFLA-EVD-008   |
| Thumbtack LA directory       | https://www.thumbtack.com/ca/los-angeles/face-painting/              | LA-segment artist listings, rate signals, review distribution.                                                               | HFLA-EVD-009   |
| Face Painting LA             | https://facepaintingla.com/                                          | Premium LA operator serving corporate clients (Paramount, Casamigos, NFL Network, Sephora); retainer-fee model; quote-only.  | HFLA-EVD-012   |
| Wikipedia body painting      | https://en.wikipedia.org/wiki/Body_painting                          | Category context: pigment families, cosmetic-grade vs theatrical-grade distinction.                                          | HFLA-EVD-013   |

Six distinct LA / national market references → minimum-six requirement
satisfied.

---

## 3. Official-policy fetches

| Source                              | URL                                                                                              | Result                                                                                                                                  | Recorded as    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Google Ads Misrepresentation policy | https://support.google.com/adspolicy/answer/6020955                                              | Prohibits ads making unreliable claims; requires substantiation; basis for claim-accuracy rule.                                         | HFLA-EVD-004   |
| Google Ads policy overview          | https://support.google.com/adspolicy/answer/1316548                                              | Policy categories overview; editorial / personalised-ads gates; basis for general ads governance.                                       | HFLA-EVD-005   |
| FDA hypoallergenic cosmetics page   | https://www.fda.gov/cosmetics/cosmetics-labeling-claims/hypoallergenic-cosmetics                 | "There are no Federal standards … The term means whatever a particular company wants it to mean." Page last updated 2022-02-25.        | HFLA-EVD-010   |
| Google Ads RSA character spec       | https://support.google.com/google-ads/answer/7684791                                             | Headlines 30 chars, descriptions 90 chars, path fields 15 chars each, up to 15 headlines + 4 descriptions per RSA.                      | HFLA-EVD-011   |

---

## 4. Failed / inaccessible sources (NOT recorded as evidence)

The following competitor and aggregator sites either returned HTTP
errors, redirected to an interstitial / login wall, or otherwise could
not be fetched read-only on 2026-05-24.  None of these were used to
support any candidate rule; they are noted here only as transparent
research limitations:

- GigSalad
- TheBash
- Taylor Entertainment
- Peerspace
- Eventective
- Evite
- kid321
- LA Party Rentals
- Magical Door
- Party People
- Bounce Houses Los Angeles
- Party Imagination
- LA Party Works
- MT Face Painting
- Party Works Interactive
- The Dream Team OC
- The Dream Team LA
- Los Angeles Face Painter
- Hooray Parties
- LA Painting Faces
- Amusement Party Pros
- Artistic Bubble Works
- Face Painting by Carol
- Los Angeles Face Painting
- Cherry Entertainment LA
- Party Poopers
- Balloon Delivery LA

Six successfully fetched market references (HFLA-EVD-006..009, 012,
013) provide the required source-traceable coverage.

---

## 5. Research integrity declarations

- No OAuth flow was initiated against any Google service.
- No authenticated session was opened against any platform.
- No mutation was performed against any external site (no form
  submitted, no comment posted, no quote requested).
- No customer PII was collected at any point.
- All fetches were anonymous public-web reads.
- All `access_or_extraction_date` values in `candidate.yaml` are
  `2026-05-24` and match the actual fetch date recorded above.
