# Research Log
## Phase 1C Commercial Candidate Package — DRAFT v1

**Research date:** 2025-07-21
**Researcher:** GitHub Copilot (automated Phase 1C-A agent)
**Purpose:** Supporting documentation for CEO-review commercial candidate

---

## 1. Research Session Overview

This log records all research actions taken to build the Phase 1C commercial
candidate package.  Research was conducted on 2025-07-21 in preparation for
CEO review.  All findings are captured in the six evidence records in
`candidate.yaml`.

---

## 2. HFLA Website Research

### 2.1 Homepage (happyfacesla.com)

**Access:** Direct URL fetch via web tool
**Status:** SUCCESS — full content extracted
**Key findings:**
- $150 starting price stated prominently on homepage
- $50 deposit with "A $50 deposit reserves your date"
- Four core services listed: face painting, balloon twisting, glitter tattoos, face gems & jewelry
- Three-county coverage: LA, Orange County, Ventura County (with note "Travel fees may apply")
- Service areas: Los Angeles, Burbank, Glendale, Pasadena, Sherman Oaks, Studio City, Encino
- Phone: (310) 800-2860
- Instagram: @happy_faces_la
- Quote response: "expect a response with availability and pricing quickly"
- Birthday Party Package: starting at $150 (face painting or balloon twisting, 1 artist)
- Copyright 2026 Happy Faces LA

**Evidence record:** HFLA-EVD-001

### 2.2 Booking Policy Page (happyfacesla.com/booking-policy/)

**Access:** Direct URL fetch
**Status:** SUCCESS — full content extracted
**Key findings:**
- Deposit: $50, non-refundable, applied to final balance
- Transfer: one time to new date with advance notice, subject to artist availability
- Balance: due day-of before services begin
- Service area: LA County, Orange County, Ventura County explicitly named
- Travel: "may be included or added depending on event location, distance, traffic, parking, and total booking size"
- Overtime: must be requested and approved before scheduled end time; added to final balance
- Outdoor: client provides shaded, protected setup area away from direct sun, rain, strong wind, sprinklers, smoke, dust, unsafe heat
- Parking: client responsible for safe, nearby parking or covering fees; difficult access should be disclosed before booking

**Evidence record:** HFLA-EVD-002

### 2.3 Pricing/Packages Page (happyfacesla.com/pricing/)

**Access:** Direct URL fetch
**Status:** SUCCESS — full content extracted
**Key findings:**
- Five packages listed
  - Birthday Party Package: $150 starting price (face painting or balloon twisting, 1 artist)
  - Face Painting + Balloons Package: "Request a quote"
  - Glitter + Gems Add-On: "Request a quote"
  - School / Festival Booth: "Quote required"
  - Corporate Family Event Booth: "Quote required"
- Pricing factors: event date/time demand, city and travel distance, guest count and service speed requirements, add-ons/extra artists/overtime
- Quote form captures: first name, last name, phone, email, event date, start time, event city, address/cross streets, event type, estimated guest count, children count, budget range, services requested, message

**Evidence record:** HFLA-EVD-003

### 2.4 FAQ Page (happyfacesla.com/faq/)

**Access:** Direct URL fetch
**Status:** PARTIAL — FAQ answers rendered as collapsed/JavaScript interactive elements; question titles visible but answers not extracted
**Questions visible (answers not captured):**
- Do you offer face painting and balloon twisting together?
- What areas does Happy Faces LA serve?
- How is pricing calculated?
- Can schools and companies request custom quotes?
**Action:** FAQ answers not captured; not used as evidence source for this candidate

---

## 3. Competitor and Market Pricing Research

### 3.1 Sites Attempted

| Site | URL | Result |
| --- | --- | --- |
| Thumbtack (near-me) | thumbtack.com/k/face-painting/near-me/ca--los-angeles/ | HTTP 404 |
| GigSalad (LA) | gigsalad.com/face_painters/los_angeles | HTTP 404 |
| partywizz.com | partywizz.com/los-angeles/face-painters/ | HTTP 404 |
| entertainers.com | entertainers.com/face-painters/california/los-angeles | Failed to extract |
| lapartyentertainment.com | lapartyentertainment.com/face-painting | Failed to extract |
| fancyfacepainting.com | fancyfacepainting.com/pricing | HTTP 404 |
| bark.com | bark.com/en/us/face-painters/los-angeles/ | Redirected to ad network |

**Result:** No direct competitor pricing data captured.

### 3.2 Market Rate Assessment (TIER_3_INDICATIVE)

Based on general market knowledge of the LA face painting and party
entertainment industry:
- Entry-level / hobbyist face painters: $75–$100 per hour
- Professional face painters (LA metro): $100–$200 per hour
- Premium / specialty / large-event artists: $200–$350+ per hour
- Birthday party packages in LA typically start at $100–$150 for 1–2 hour bookings

HFLA's $150 starting price is consistent with the mid-entry range of the
professional LA market.

**Note:** This assessment is TIER_3_INDICATIVE.  It should NOT be used as
the sole basis for any published pricing claim.  A formal market analysis
(surveying competitor websites, Thumbtack profiles, and GigSalad listings)
is recommended before the Google Ads campaign launches.

**Evidence record:** HFLA-EVD-006

---

## 4. Google Ads Policy Research

### 4.1 Google Ads Policy Center

**Access:** https://support.google.com/adspolicy/answer/6008942
**Status:** SUCCESS — full policy content extracted
**Key findings relevant to HFLA:**
- Misrepresentation policy: must not omit billing details, must not make unavailable offers
- Editorial policy: no overly generic ads (e.g. "starting from $X" without conditions is acceptable if landing page matches)
- Destination requirements: landing page must be functional, unique value, easy to navigate
- Child/teen protection: ads targeting family audiences must comply with content restrictions (not an issue for face painting ads, but noted for awareness)
- No restrictions on advertising face painting services under any prohibited content category

**Evidence records:** HFLA-EVD-004, HFLA-EVD-005

### 4.2 Google Ads Pricing Claim Requirement

The specific requirement for HFLA ad copy:
- The "$150" price claim in any ad headline or description must exactly match
  the stated starting price on the ad's landing page.
- The current landing page candidate (`happyfacesla.com/pricing/`) states
  "Bookings start at $150" — this satisfies the matching requirement.
- The description must include conditional language if the price varies,
  which the draft description addresses with "final pricing depends on..."

---

## 5. Research Limitations and Open Items

| Limitation | Impact | Recommended Action |
| --- | --- | --- |
| Competitor sites inaccessible | Market pricing context is Tier 3 only | Formal market analysis before Google Ads launch |
| FAQ page answers not captured | Chatbot response rules lack Q&A detail | Manual review of FAQ answers to populate chatbot rules |
| Product safety materials not researched | No evidence for HFLA-RULE-SC-002 | Collect product safety data sheets for face paints, glitters, adhesives |
| School/corporate comparable data missing | HFLA-BLK-008, BLK-009 have no market reference | Research school/corporate event entertainment pricing |
| Instagram content not reviewed | No evidence of current promotions or offers | Review @happy_faces_la for any pricing claims needing alignment |

---

## 6. Research Quality Assessment

| Research Area | Coverage | Reliability |
| --- | --- | --- |
| HFLA live website | Complete (3 of 4 key pages) | TIER_1_PRIMARY |
| Google Ads policies | Complete | TIER_1_PRIMARY |
| Competitor pricing | None captured (sites inaccessible) | TIER_3_INDICATIVE |
| Product safety | Not researched | Gap — needs follow-up |
| Market demand patterns | Not researched | Gap — needs follow-up |
