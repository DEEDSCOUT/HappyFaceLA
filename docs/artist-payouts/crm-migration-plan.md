# Booking Control Center migration plan

Status: the production payout schema was audited read only with no schema drift at final revision 1595 and no project mutation; the exact additive schema is applied and verified only on an owner-only nonproduction copy; the signed adapter is implemented but not deployed or exercised against that copy.

## Verified current structure

The live Booking Control Center has distinct ID-control, booking, customer-payment, artist-payment, artist-roster, assignment, and audit tabs. Customer money must remain separate from artist compensation. Existing formula columns contain row-level manual overrides, several status/method validations do not match historical values, one Assignment ID is duplicated, and some IDs/links are missing or disagree. Those records must be corrected through an owner-reviewed map; never silently renumber them.

## Current-schema audit disposition

The connector audit read the production header rows for `02_BOOKINGS`, `03_PAYMENT_TRACKER`, `10_AUDIT_LOG`, `11_ARTIST_PAYMENTS`, `12_ARTIST_ROSTER`, and `13_ARTIST_ASSIGNMENTS`, plus the control surface and formulas in `00_ID_CONTROL` (`14014`). Exact headers are preserved in evidence file `05-crm-migration-plan.md` without business-row values.

| Audit dimension         | Verified production fact                                                                                                                                                                                                                                                                                            | Boundary                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Columns                 | Exact relevant headers and native sheet IDs were read.                                                                                                                                                                                                                                                              | The migration appends fields only to 11/12/13; no existing column is moved.                                                                                                                                     |
| Cell data types         | Existing columns contain text/IDs, booleans, dates/times, currency/numbers, and formulas. Added-copy fields have exact text, boolean, date/time, integer, and money validators defined by `Schema.gs`.                                                                                                              | A cell-by-cell semantic type declaration does not exist in the workbook and was not invented from display strings. Production migration remains blocked until the owner approves the exact type/correction map. |
| Formula columns         | Production formula scan observed: ID control `B` (6); bookings `C`, `G`, `Q`, `R`, `AJ`, `AO` (12 total); customer payments `D`, `H`, `I`, `K` (986); artist payments `D`, `P`, `T`, `V`, `AA`, `AB` (1,001); assignments `L`, `M`, `N`, `Z` (3,906). Audit log and roster had no formulas in the bounded grids.    | Formula presence is irregular in several columns, so migration and correction must preserve each formula cell rather than fill a whole column.                                                                  |
| Validation              | Production scan observed 15,015 validation-bearing booking cells, 7,960 customer-payment cells, 5,994 artist-payment cells, 9,990 roster cells, and 7,014 assignment cells. Audit log and ID control had none in their bounded grids.                                                                               | Existing validation lists already disagree with some historical free-text values; they may not be silently normalized.                                                                                          |
| Protected ranges        | The current connector metadata response does not expose a protected-range inventory.                                                                                                                                                                                                                                | **Unverified launch blocker:** export/review the native protected-range list before any production migration and prove it is unchanged afterward.                                                               |
| Downstream dependencies | `00_ID_CONTROL` contains six formulas that generate/check immutable Lead IDs against `01_LEADS`. Booking, payment, artist-payment, and assignment records are linked through Lead/Booking/Assignment/Payment IDs. The deployable adapter additionally binds exact tab IDs, header names, and safe field allowlists. | Unknown external Apps Script triggers, formulas outside the audited relevant grids, dashboards, and third-party automations remain unverified and require owner inventory before production.                    |
| Current payment states  | Customer-payment status has seven normal workflow values plus one misplaced free-text narrative; artist-payment status has eight observed values ranging from pending confirmation through ready-to-pay and receipt-complete.                                                                                       | These are historical observations, not a clean enum. The misplaced narrative and validation conflicts require an approved correction map.                                                                       |
| Current artist states   | Seven artist-roster status values were observed: `Active`, `Assigned / Needs Review`, `Inactive / Do Not Schedule`, `Needs Review`, `New / Needs Review`, `New / Trial`, and one contact-update/confirmation-pending workflow value. Assignment status contains 21 distinct free-form workflow/note combinations.   | Do not collapse, rename, or infer eligibility from these historical strings. The adapter admits only the separately configured exact active-artist value and fails closed on ambiguity.                         |

## Authority model

The application database is authoritative for payout workflow, approval, Stripe object state, idempotency, webhooks, and reconciliation. Drive receives only a safe operational projection. The production workbook moved from audit revision `1592` to final read-only revision `1595` because of unrelated operational row activity. The relevant sheet IDs/dimensions and the exact original 30 headers on `11_ARTIST_PAYMENTS`, `12_ARTIST_ROSTER`, and `13_ARTIST_ASSIGNMENTS` remained unchanged, so there was no production schema drift and this project made no production workbook mutation. Any production migration must still re-read and compare the live revision because it can change again.

## Exact approved-copy schema

No new tab was created. The existing tab IDs remain unchanged, including `00_ID_CONTROL` (`14014`).

- `11_ARTIST_PAYMENTS` (`11011`) grew from 30 to 54 columns. The 24 appended fields are: `Payout Environment`, `Payout Ledger ID`, `Payout Source Revision`, `Payout State`, `Payout Batch ID`, `Payout Batch Date`, `Payout Currency`, `Total Approved Pay Cents`, `Stripe Connected Account ID`, `Stripe Transfer ID`, `Stripe Payout ID`, `Stripe Payout Status`, `Payout Reconciled?`, `Payout Reconciled At`, `Manual Payment Method`, `Manual Payment Reason`, `Manual Payment Evidence Reference`, `Manual Payment Memo`, `Manual Payment Recorded By`, `Manual Payment Recorded At`, `Payout Last Verified At`, `Payout Projection Revision`, `Pay Adjustment`, and `Pay Deduction`.
- `12_ARTIST_ROSTER` (`12012`) grew from 30 to 43 columns. The 13 appended fields are: `Stripe Country`, `Stripe Legal Entity Type`, `Stripe Connected Account ID`, `Stripe Onboarding Status`, `Stripe Requirements Status`, `Stripe Transfers Enabled`, `Stripe Payout Ready`, `Stripe Dashboard Type`, `Preferred Payout Type`, `Last Stripe Requirements Check`, `Stripe Onboarded Date`, `Stripe Disabled Reason`, and `Payout Exception Flag`.
- `13_ARTIST_ASSIGNMENTS` (`13013`) grew from 30 to 44 columns. The 14 appended fields are: `Assignment Source Revision`, `Closeout Verified At`, `Artist Completion Confirmed?`, `Extra Time Reconciled?`, `Service Change Reconciled?`, `Travel Pay Reconciled?`, `Adjustments Reconciled?`, `No Customer Complaint Affecting Pay?`, `No Refund Issue Affecting Pay?`, `No Damage Or Supply Issue Affecting Pay?`, `Compensation Approved?`, `Contractor Control Satisfied?`, `Closeout Status`, and `Assignment Policy Version`.

The Apps Script request handlers write only the first 22 new payment-projection fields and the 11 roster-status fields beginning with `Stripe Connected Account ID`. `Pay Adjustment`, `Pay Deduction`, `Stripe Country`, `Stripe Legal Entity Type`, and all assignment closeout fields remain source-controlled.

## Nonproduction verification

- Copy ID: `1FfqtINg0a5nBp1esTOnE8dW1CwawIoaX36LQ6QN9pPc`
- Title: `Happy Faces LA — Booking Control Center — Stripe Artist Payout NONPRODUCTION 2026-08-22`
- Current Drive revision: `4` (previous `1`)
- Sharing: `shared=false`; the only returned permission is `owner`
- Current grids: payments `1000 x 54`, roster `1000 x 43`, assignments `1003 x 44`
- Added ranges contain exactly 24, 13, and 14 header strings respectively, strict validation rules, boolean checkbox values where specified, and zero formulas.
- A preservation sample across six pre-existing ranges compared source to copy exactly: 80 formulas and 457 validation-bearing cells were unchanged.
- Full identifier/link comparisons were equal for payments `A`, payments `AC:AD`, roster `A`, assignments `A:C`, assignments `K`, and assignments `AA`.

These checks prove the copy's additive shape and preservation properties. They do not prove an Apps Script deployment, signed transport, synthetic business-row flow, or production migration.

## Adapter contract

The implemented Apps Script server and Cloudflare clients use seven separately routed, environment-bound operations with mutual HMAC authentication:

1. `artist_roster_read_v1`
2. `artist_roster_list_v1`
3. `artist_roster_projection_read_v1`
4. `artist_roster_projection_v1`
5. `crm_payout_source_read_v1`
6. `artist_payout_read_v1`
7. `artist_payout_projection_v1`

Every initial request origin and configured adapter allowlist is exactly `https://script.google.com`. The transport accounts for Apps Script's redirect behavior, permits at most two 301/302/303 hops to the exact `https://script.googleusercontent.com` content origin, strips the POST body and headers on redirect, rejects 307/308, preserves the 64 KiB default and every non-list adapter bound, gives only `artist_roster_list_v1` a named 192 KiB response cap, and verifies the signed response before consuming any field. The Apps Script manifest requests only `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.metadata.readonly`.

The summary-only `artist_roster_list_v1` route is authoritative for the dashboard onboarding queue. Business IDs and active-roster Artist IDs are bounded to 120 safe characters. It begins with the reserved cursor `afterArtistId=START`; `START` is not an admitted Artist ID. Every incomplete signed page continues with the exact last returned Artist ID. Each artist contains only `artistId`, `displayName`, and `revision`; the client rejects duplicate/reordered IDs, roster revision or total-count drift, contradictory continuation, more than 100 rows per page, more than 100 pages, more than 10,000 artists, a response over the list-only 192 KiB cap, or a final count mismatch. Any failure leaves the onboarding queue explicitly unavailable rather than representing it as empty.

For source/projection records, the adapter:

1. Reads the current record and revision.
2. Requires the expected source revision.
3. Writes only an exact field allowlist; never banking, tax, email, phone, or onboarding-link data.
4. Preserves formulas and validations cell by cell.
5. Independently reads the record after write.
6. Requires a new revision and exact semantic field equality.
7. Recovers a committed-but-response-lost write by recognizing exact readback before retry.
8. Treats any true conflict or ambiguity as an exception and leaves `reconciled=false`.

For a missing payout projection, the Apps Script response signs and serializes the JSON value `null`. It never substitutes `{}` or an unsigned empty body; the Cloudflare client therefore has an exact pristine state for manual-intent cancellation and readback recovery.

## Production migration procedure

1. Shawn approves the exact field map and correction map.
2. Re-read Drive/Docs revision IDs and export/backup the native workbook.
3. Re-verify the existing owner-only native nonproduction copy and its exact revision.
4. Run `auditArtistPayoutSchema()` read only, deploy/configure all seven sandbox routes, then exercise the signed adapter against synthetic rows in the copy, including complete roster-list traversal, conflict, and response-loss recovery tests.
5. Repeat formula, validation, ID, reciprocal-link, and protected-range checks after the exercise.
6. Export and review the native protected-range and external-automation inventories; prove the approved migration does not alter either.
7. Have an independent reviewer compare the copy to the approved map and the deterministic `Schema.gs` migration contract.
8. Schedule a separately authorized production migration window and re-check the source revision.
9. Apply, read back, and reconcile every changed range.
10. Keep feature flags off until the production verification is approved.

No production schema edit, formula repair, adapter deployment, or live adapter write is authorized by this draft. Sandbox and live require distinct deployments, workbook IDs, route URLs, HMAC secrets, and expected environment bindings; neither may fall back to the other.
