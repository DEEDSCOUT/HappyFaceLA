# 05 — Booking Control Center migration evidence

Status: **PRODUCTION SCHEMA UNCHANGED BY THIS PROJECT; OWNER-ONLY COPY MIGRATED ADDITIVELY; ADAPTER NOT DEPLOYED**

## Exact source identity

- File: **Happy Faces LA — Booking Control Center**
- Google Drive ID: `1Wq_7w9Q-oygKHAxGawJ1LyfJzO44J6fYzDudfGhbgVk`
- Initial observed revision: `1592`
- Final read-only audit revision: `1595`

Relevant tabs and sheet IDs observed read-only:

- `00_ID_CONTROL` / `14014`
- `02_BOOKINGS` / `2`
- `03_PAYMENT_TRACKER` / `3`
- `10_AUDIT_LOG` / `10`
- `11_ARTIST_PAYMENTS` / `11011`
- `12_ARTIST_ROSTER` / `12012`
- `13_ARTIST_ASSIGNMENTS` / `13013`

`02_BOOKINGS` and `03_PAYMENT_TRACKER` remain customer-booking/customer-payment records. They must not be merged with artist compensation.

## Exact relevant headers

`00_ID_CONTROL` is a 40-row by 6-column control surface, not a conventional row table. Its first row is `Happy Faces LA Lead ID Control | IMMUTABLE ID V2`. A bounded formula audit found six formulas in column `B`; they generate/check immutable Lead IDs against `01_LEADS`. No ID-control value was changed.

`02_BOOKINGS`:

`Booking ID | Linked Lead ID | Booking Created Date | Client Name | Client Phone | Client Email | Event Date | Start Time | End Time | Event Address | Event City | Service / Package | Estimated Kids / Guests | Party Theme | Event Total | Booking Retainer Amount | Booking Retainer Paid Date | Remaining Balance | Travel Fee | Tax Review Status | Payment Status | Booking Status | Table + Chairs Confirmed? | Parking / Access Confirmed? | Indoor / Outdoor | Artist Assigned | Official Confirmation Sent? | Day-Before Reminder Sent? | Event Completed? | Review Requested? | Internal Notes | Nontaxable Service Subtotal | Taxable Balloon / Product Subtotal | Sales Tax Rate | Sales Tax Amount | Tax Rate Checked Date | Tax Rate Source / Notes | Seller Permit Required? | Seller Permit Confirmed? | All Details Confirmed? | Confirmation Readiness | Parking / Access Details`

`03_PAYMENT_TRACKER`:

`Payment ID | Booking ID | Client Name | Event Date | Event Total | Booking Retainer Due | Booking Retainer Paid | Retainer Payment Date | Remaining Balance | Balance Paid | Balance Payment Date | Nontaxable Service Subtotal | Taxable Balloon / Product Subtotal | Sales Tax Rate | Sales Tax Amount | Optional Tip | Refund Amount | Refund Date | Payment Method | Payment Link Sent? | Retainer Receipt Sent? | Final Receipt Sent? | Tax Review Status | Payment Status | Notes`

`11_ARTIST_PAYMENTS`:

`Artist Payment ID | Booking ID | Lead ID | Event Date | Event Time | Client Name | Event City | Artist Name | Artist Phone | Artist Email | Payment Method | Payment Handle | Service Pay | Travel Pay | Tip / Bonus | Total Artist Pay | Completion Confirmed? | Approved By | Payment Status | Paid Date | Payment Memo Used | Receipt Screenshot Link | W-9 on File? | 1099 Trackable? | Reconciled? | Notes | Created At | Last Updated | Artist ID | Assignment ID`

`12_ARTIST_ROSTER`:

`Artist ID | Artist Status | Legal Full Name | Preferred Name | Artist Type | Primary Service Role | Services Offered | Skill / Event Level | Home Base City | Service Regions | Max Travel / Notes | Phone | Email | Payment Method | Payment Handle | Standard Pay Notes | Travel Pay Rule | Own Supplies? | Own Table / Chair? | Insurance Status | W-9 Status | Agreement Status | Portfolio / Social Link | Secure Docs Folder Link | Reliability Notes | Dispatch Notes | Created At | Last Updated | Vehicle / Plate Info | Website / Portfolio URL`

`13_ARTIST_ASSIGNMENTS`:

`Assignment ID | Booking ID | Lead ID | Event Date | Start Time | End Time | Client / Event Name | Event City | Event Address | Service Role | Artist ID | Artist Name | Artist Phone | Artist Email | Assignment Status | Artist Confirmed? | Dispatch Sent? | On Way Confirmed? | Arrived Confirmed? | Setup Ready Confirmed? | Completed Confirmed? | Actual End Time | Extra Time / Issue Flag | Agreed Service Pay | Agreed Travel Pay | Total Agreed Pay | Payment Record ID | Closeout Notes | Created At | Last Updated`

`10_AUDIT_LOG`:

`Timestamp | Changed By | Area Changed | Change Type | Old Value | New Value | Reason | Approval Source | Notes`

No row values or personal data are reproduced in this package.

## Formula, validation, state, and dependency audit

| Tab                     | Formula cells and columns                | Validation-bearing cells and columns     |
| ----------------------- | ---------------------------------------- | ---------------------------------------- |
| `00_ID_CONTROL`         | 6 in `B`                                 | 0                                        |
| `02_BOOKINGS`           | 12 across `C`, `G`, `Q`, `R`, `AJ`, `AO` | 15,015 across `L`, `T:AD`, `AL:AN`       |
| `03_PAYMENT_TRACKER`    | 986 across `D`, `H`, `I`, `K`            | 7,960 across `P:Q`, `S:X`                |
| `10_AUDIT_LOG`          | 0                                        | 0                                        |
| `11_ARTIST_PAYMENTS`    | 1,001 across `D`, `P`, `T`, `V`, `AA:AB` | 5,994 across `K`, `Q`, `S`, `W:Y`        |
| `12_ARTIST_ROSTER`      | 0                                        | 9,990 across `B`, `E:F`, `H`, `N`, `R:V` |
| `13_ARTIST_ASSIGNMENTS` | 3,906 across `L:N`, `Z`                  | 7,014 across `O:U`                       |

Observed production types include IDs/text, booleans, dates/times, currency/numbers, and formulas. The workbook has no authoritative per-column semantic type manifest; therefore a display string was not guessed into a type. The owner-only copy's appended fields have exact validators and formats in `Schema.gs`.

Current-state audit found seven normal customer-payment workflow values plus one misplaced free-text narrative, eight artist-payment values, seven artist-roster values, and 21 free-form assignment-status combinations. Personal/business narrative content is intentionally not reproduced. These historical values are not treated as a clean enum; current validation mismatches and the misplaced narrative require an owner-approved correction map.

Known downstream dependencies are the six `00_ID_CONTROL` formulas against `01_LEADS`, reciprocal Lead/Booking/Assignment/Payment identifiers, existing workbook formulas/validations, and the implemented adapter's exact sheet IDs, headers, and safe write allowlists. The current connector metadata did not expose protected ranges, external Apps Script triggers, or third-party automation dependencies. Those inventories remain explicitly **unverified** and block production migration; they must be exported, owner-reviewed, and proven unchanged after an authorized migration.

## Findings and source-preservation boundary

The live workbook currently has no payout-system projection fields. Read-only audit also found row-level manual formula overrides, status/method validation mismatches against historical values, one duplicate Assignment ID, and missing/disagreeing IDs or reciprocal links. These require an owner-approved correction map; no ID may be silently renumbered. No such correction was applied to production or the test copy, and `00_ID_CONTROL` was neither edited nor bound as a writable adapter target.

A stale older sandbox workbook is not acceptable as the current test target. A new native copy was created within scope:

- File: **Happy Faces LA — Booking Control Center — Stripe Artist Payout NONPRODUCTION 2026-08-22**
- Google Drive ID: `1FfqtINg0a5nBp1esTOnE8dW1CwawIoaX36LQ6QN9pPc`
- Created: `2026-08-22T11:20:52.035Z`
- Sharing: `shared=false`, owner-only permission
- Verified: distinct file ID and exact source tab topology
- Current copy revision: `4` (previous `1`)
- Current modified time: `2026-08-22T11:48:39.276Z`

## Exact additive migration verified on the copy

No new tab was created and no existing sheet ID changed.

| Tab                               | Existing columns | Appended columns | Final columns |  Rows |
| --------------------------------- | ---------------: | ---------------: | ------------: | ----: |
| `11_ARTIST_PAYMENTS` (`11011`)    |               30 |               24 |            54 | 1,000 |
| `12_ARTIST_ROSTER` (`12012`)      |               30 |               13 |            43 | 1,000 |
| `13_ARTIST_ASSIGNMENTS` (`13013`) |               30 |               14 |            44 | 1,003 |

The appended headers match `integrations/artist-payouts-google-apps-script/Schema.gs` exactly. Added ranges contain strict list, boolean, date/time, and revision-token validations; all checkbox cells hold boolean `false`; added ranges contain zero formulas. `Payout Projection Revision` accepts only an exact `payout-projection:v1:<64 lowercase hex>` token.

Preservation verification compared production to the copy without reproducing personal row data:

- six representative pre-existing ranges: 80 formulas and 457 validation-bearing cells exactly equal;
- full identifier/link columns equal for payments `A`, payments `AC:AD`, roster `A`, assignments `A:C`, assignments `K`, and assignments `AA`;
- the final read-only audit observed production revision `1595`, up from `1592`, due unrelated operational row activity. The relevant sheet IDs and dimensions remained the same, and `11_ARTIST_PAYMENTS`, `12_ARTIST_ROSTER`, and `13_ARTIST_ASSIGNMENTS` retained their exact original 30 headers. There was no production schema drift and this project made no production workbook mutation.

The migration was applied through the Google Drive connector, not through a deployed Apps Script service. The Apps Script server and Cloudflare clients implement seven separately routed operations: exact artist identity read, bounded active-roster list, roster projection read/write, authoritative assignment-payout source read, and payout projection read/write. The list operation starts with the reserved cursor `afterArtistId=START`, rejects `START` as an Artist ID, continues with the exact last returned Artist ID, exposes only `artistId`, `displayName`, and `revision`, and fails closed on partial results, revision/count drift, duplicates, reordering, or its 100-page/10,000-artist bound. It is the authoritative source for the dashboard onboarding queue.

All initial Apps Script origins are exactly `https://script.google.com`; the bounded transport separately permits Google's one-time `https://script.googleusercontent.com` content redirect. The manifest requests only Spreadsheet access and read-only Drive metadata access. The server/client are synthetically tested, but no real signed read/write/readback, roster-list traversal, or synthetic business row has been exercised against the copy. Before production: deploy the sandbox adapter, configure all seven exact environment/workbook routes and the environment-specific secret, run synthetic list/conflict/recovery tests, re-run all preservation checks, approve the correction map, and obtain independent review.

The server and client share the same 120-character business/active-roster ID bound. Only `artist_roster_list_v1` may use the named 192 KiB signed-response cap; every other operation retains the 64 KiB default/bound. A missing payout projection is returned as signed JSON `null`, not `{}` or an unsigned empty response. These are current local implementation/test facts, not proof of a deployed copy integration.
