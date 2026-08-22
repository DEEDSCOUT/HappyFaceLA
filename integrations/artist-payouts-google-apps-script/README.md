# Artist payout Booking Control Center adapter

Status: deployable source and synthetic tests only. It has not been deployed and has not read or changed either Booking Control Center workbook. The owner-only nonproduction workbook was migrated and verified separately through the Google Drive connector; that connector action is not evidence that this Apps Script service has run.

This standalone Google Apps Script project exposes seven operations against one explicitly configured workbook:

- active artist roster identity read;
- active artist roster summary list for the onboarding queue;
- safe artist roster Stripe-status projection read;
- revision-CAS artist roster Stripe-status projection write plus independent readback;
- immutable assignment and closeout source read;
- safe artist-payout projection read;
- revision-CAS artist-payout projection write plus independent readback.

The project is intentionally fail-closed. It binds the exact audited base headers and the exact additive payout schema. A production workbook with only the current base schema can still be audited, but projection writes and authoritative payout-source reads remain unavailable until the owner-approved schema migration is applied.

## Apps Script transport constraint

Google Apps Script Web Apps do not expose inbound custom request headers to `doGet`/`doPost`, and `ContentService` cannot set arbitrary response headers. Therefore this service does not pretend that the existing header-only HMAC transport works directly.

- GET operations carry an exact authentication envelope in query fields.
- POST carries an exact `{auth, payload}` JSON envelope.
- Every signature binds method, operation, environment, configured public route, request timestamp, request ID, and the SHA-256 of the pre-existing business canonical descriptor.
- Every response is an exact `{payload, auth}` JSON envelope with its own HMAC. The caller must verify it before consuming `payload`.
- Request IDs are stored only as SHA-256 digests for a bounded replay window. An exact replay is idempotent; reuse with a different signed request digest is rejected.

The Cloudflare client implements these envelopes, signed-response verification, and the fail-closed Google redirect policy in `src/lib/artist-payouts/apps-script-transport.ts`. The default and every non-list adapter response remain bounded to 64 KiB; only the summary-only `artist_roster_list_v1` adapter opts into its named 192 KiB response cap so a full 100-row page of maximum-length UTF-8 fields remains representable. Local client/server contract tests pass independently. Do not treat those tests as deployment or real-Sheet integration evidence: deploy the sandbox Apps Script project, configure its exact routes and secret, and run signed read/write/readback against synthetic records in the approved nonproduction workbook before launch certification.

## Required Script Properties

No property has a generic or cross-environment fallback.

```text
HFLA_PAYOUT_ENVIRONMENT=sandbox|live
HFLA_PAYOUT_SPREADSHEET_ID=<environment-specific native Sheet ID>
HFLA_PAYOUT_HMAC_SECRET=<unique environment-specific secret, 32-4096 characters>
HFLA_PAYOUT_PUBLIC_ORIGIN=https://script.google.com
HFLA_PAYOUT_ROSTER_PATH=/macros/s/<deployment-id>/exec/artist-roster
HFLA_PAYOUT_ROSTER_LIST_PATH=/macros/s/<deployment-id>/exec/artist-roster-list
HFLA_PAYOUT_ROSTER_PROJECTION_READ_PATH=/macros/s/<deployment-id>/exec/artist-roster-projection-read
HFLA_PAYOUT_ROSTER_PROJECTION_WRITE_PATH=/macros/s/<deployment-id>/exec/artist-roster-projection-write
HFLA_PAYOUT_SOURCE_PATH=/macros/s/<deployment-id>/exec/payout-ledger-source
HFLA_PAYOUT_PROJECTION_READ_PATH=/macros/s/<deployment-id>/exec/projection-read
HFLA_PAYOUT_PROJECTION_WRITE_PATH=/macros/s/<deployment-id>/exec/projection-write
HFLA_PAYOUT_MAX_CLOCK_SKEW_SECONDS=300
HFLA_PAYOUT_ACTIVE_ARTIST_STATUS=Active
```

Use separate Apps Script deployments, secrets, and workbook IDs for `sandbox` and `live`. Never copy a sandbox property set into the live deployment.

Every Cloudflare Apps Script adapter binding must use the exact initial origin `https://script.google.com` in both environments: `PAYOUT_*_CRM_ALLOWED_ORIGIN`, `PAYOUT_*_ROSTER_ALLOWED_ORIGIN`, `PAYOUT_*_ROSTER_PROJECTION_ALLOWED_ORIGIN`, and `PAYOUT_*_CRM_SOURCE_ALLOWED_ORIGIN`. `PAYOUT_SANDBOX_ROSTER_LIST_URL` and `PAYOUT_LIVE_ROSTER_LIST_URL` must identify the environment's distinct configured `artist_roster_list_v1` route on that origin. The bounded redirect verifier separately permits Google's one-time `https://script.googleusercontent.com` content response; that redirect host is not an allowed initial request origin.

## OAuth scope boundary

`appsscript.json` explicitly requests only:

- `https://www.googleapis.com/auth/spreadsheets` for the configured workbook; and
- `https://www.googleapis.com/auth/drive.metadata.readonly` for the read-only Drive file-version lock used by schema audit/migration controls.

Do not grant full Drive content access or add broader scopes. The enabled Drive v2 advanced service is used only for metadata/version retrieval; runtime record reads and the narrowly authorized projections use the Spreadsheet service.

## Exact workbook topology

The server binds both title and immutable grid ID for every audited tab and fails closed on drift:

| Tab                     | Grid ID | Expected columns after migration |
| ----------------------- | ------: | -------------------------------: |
| `02_BOOKINGS`           |       2 |                               42 |
| `03_PAYMENT_TRACKER`    |       3 |                               25 |
| `10_AUDIT_LOG`          |      10 |                                9 |
| `11_ARTIST_PAYMENTS`    |   11011 |                               54 |
| `12_ARTIST_ROSTER`      |   12012 |                               43 |
| `13_ARTIST_ASSIGNMENTS` |   13013 |                               44 |

The exact ordered headers are in `Schema.gs`. No workbook ID is compiled into deployable source; the environment-specific Script Property is authoritative.

## Schema audit and migration

Run `auditArtistPayoutSchema()` from the Apps Script editor. It is read-only and returns the environment, workbook ID digest, Drive version, base-schema state, and migrated-schema state without logging cell values.

`applyApprovedArtistPayoutSchemaMigration()` is deliberately unreachable over HTTP. Before it can append the exact fields in `Schema.gs`, all of the following Script Properties must be set:

```text
HFLA_PAYOUT_SCHEMA_MIGRATION_ENABLED=true
HFLA_PAYOUT_EXPECTED_DRIVE_VERSION=<freshly verified exact version>
HFLA_PAYOUT_SCHEMA_MIGRATION_APPROVAL=I APPROVE ARTIST PAYOUT SCHEMA V1 <environment> <spreadsheet-id> <drive-version>
```

The function acquires a document lock, rechecks the Drive version and every audited header, snapshots existing formulas and validation rules, appends only the approved columns, flushes, and verifies that the snapshots are unchanged. Any mismatch throws. Production execution still requires explicit owner approval outside the code.

## Route contract

GET query authentication fields are:

```text
hflaAlgorithm=HFLA-HMAC-SHA256
hflaVersion=v1
hflaEnvironment=sandbox|live
hflaOperation=<exact operation>
hflaTimestamp=<ISO-8601 UTC instant>
hflaRequestId=<safe unique ID>
hflaSignature=v1=<64 lowercase hex characters>
```

The business query is exactly one of `artistId`, `afterArtistId`, `crmRecordId`, or the exact projection-read identity fields. Business IDs, request IDs, and active-roster Artist IDs are 3–120 safe characters. `artist_roster_list_v1` starts with `afterArtistId=START`; each incomplete signed response supplies the last returned Artist ID as the only admitted continuation. Extra fields are rejected. POST accepts only the exact `auth` and `payload` keys described above. The byte-level canonical descriptors, signed-response rules, and bounded Google redirect policy are specified in `transport-contract.md`.

## Privacy and mutation boundary

- The adapter never returns or projects phone numbers, payment handles, W-9/tax data, vehicle data, secure-document links, banking data, or onboarding links.
- The roster endpoint returns only the contact email required by the current recipient-binding contract.
- The roster-list endpoint is summary-only: each active artist contains exactly `artistId`, `displayName`, and source `revision`. It never returns email, country, legal-entity, phone, bank, tax, W-9, secure-document, payment-handle, or onboarding-link data.
- Payout projection writes touch only the first 22 new payout projection columns on `11_ARTIST_PAYMENTS`; the separately governed adjustment/deduction source fields remain immutable.
- Roster projection writes touch only the 11 Stripe status fields from `Stripe Connected Account ID` through `Payout Exception Flag` on `12_ARTIST_ROSTER`. `Stripe Country`, `Stripe Legal Entity Type`, and all 30 existing roster columns remain immutable source fields.
- Both write operations append a safe digest-only operational entry to `10_AUDIT_LOG`.
- Existing IDs, values, formulas, validations, formatting, and protected ranges are never written by the request handlers.
- `03_PAYMENT_TRACKER` and customer-money fields are read only for schema drift detection and are never used as artist-pay authority.

## Local verification

```text
node --test tests/artist-payouts/google-apps-script-server.test.mjs
```

The tests are synthetic-only and run with an in-memory Spreadsheet service. Passing them is not Apps Script deployment, Drive-copy integration, or production evidence.
