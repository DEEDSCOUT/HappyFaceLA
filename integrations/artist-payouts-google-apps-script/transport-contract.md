# HFLA Apps Script signed transport contract v1

This is the byte-level compatibility contract for the Apps Script server. JSON is UTF-8 with no byte-order mark. Hash and HMAC output is lowercase hexadecimal. Every line separator below is one LF byte (`0x0a`), including on Windows. No canonical string has a trailing LF.

## Deployment identity

Each deployment has exactly one `sandbox` or `live` environment, one workbook ID, one HMAC secret, one public origin, and seven distinct route paths. Sandbox and live must use different deployments, workbook IDs, and secrets. There is no fallback between them. The public origin and every initial Apps Script adapter allowlist value are exactly `https://script.google.com`.

The request URL is the configured origin plus the configured operation path. The server accepts only the configured route's final `pathInfo` segment and also binds the complete configured origin and path into the signature.

## Operations

| Operation                          | Method | Exact business input                                               |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `artist_roster_read_v1`            | GET    | `artistId`                                                         |
| `artist_roster_list_v1`            | GET    | `afterArtistId` (`START` initially, then exact last Artist ID)     |
| `artist_roster_projection_read_v1` | GET    | `environment`, `artistId`                                          |
| `artist_roster_projection_v1`      | POST   | roster CAS payload below                                           |
| `crm_payout_source_read_v1`        | GET    | `crmRecordId`                                                      |
| `artist_payout_read_v1`            | GET    | `environment`, `ledgerId`, `bookingId`, `assignmentId`, `recordId` |
| `artist_payout_projection_v1`      | POST   | payout CAS payload below                                           |

GET contains exactly the seven authentication query fields plus that operation's business fields. Every query field must occur once. POST has no query fields and its JSON body has exactly `auth` and `payload`.

Authentication query names map to the JSON authentication names as follows:

| GET query         | Authentication field |
| ----------------- | -------------------- |
| `hflaAlgorithm`   | `algorithm`          |
| `hflaVersion`     | `version`            |
| `hflaEnvironment` | `environment`        |
| `hflaOperation`   | `operation`          |
| `hflaRequestId`   | `requestId`          |
| `hflaTimestamp`   | `timestamp`          |
| `hflaSignature`   | `signature`          |

The exact POST `auth` keys are `algorithm`, `version`, `environment`, `operation`, `requestId`, `timestamp`, and `signature`. Their required values are `HFLA-HMAC-SHA256`, `v1`, the deployment environment, the exact operation, a safe unique request ID, an exact `YYYY-MM-DDTHH:mm:ss.sssZ` instant inside the configured replay window, and `v1=<64 lowercase hex>`.

## Business descriptors

For `artist_roster_read_v1`, `artist_roster_list_v1`, and `crm_payout_source_read_v1`, the business descriptor is:

```text
HFLA-HMAC-SHA256
v1
<operation>
<environment>
GET
<configured-origin>
<configured-path>
<percent-encoded-key>=<percent-encoded-value>
<timestamp>
<request-id>
```

Percent encoding is JavaScript `encodeURIComponent` encoding.

### Active-roster list continuation and response

`artist_roster_list_v1` is read-only and summary-only. Business IDs, request IDs, and active-roster Artist IDs contain 3–120 characters from the safe ID alphabet. The first signed request contains exactly `afterArtistId=START`. An incomplete page is continued only with `afterArtistId=<nextAfterArtistId>`, where `nextAfterArtistId` must equal the last Artist ID in the prior signed page. Each page contains at most 100 artists, strictly ordered and unique by Artist ID. Retrieval is bounded to 100 pages and 10,000 active artists.

The verified business payload has exactly these keys in server output order:

```text
ok
requestId
environment
rosterRevision
totalActiveCount
artists
nextAfterArtistId
complete
```

Each `artists` entry has exactly `artistId`, `displayName`, and `revision`. Every page must retain the same environment, roster revision, and total active count. A complete page has `nextAfterArtistId=null`; an incomplete page must be nonempty and use its last Artist ID as `nextAfterArtistId`. The caller rejects repeated/reordered IDs, revision or total drift, contradictory continuation, more than 100 rows in a page, more than 100 pages, more than 10,000 total artists, or a final collected count different from `totalActiveCount`. It then marks the onboarding queue unavailable rather than treating a partial/error response as an empty roster.

The roster projection read descriptor is `JSON.stringify` of an object inserted in exactly this order:

```json
{
  "operation": "artist_roster_projection_read_v1",
  "environment": "sandbox",
  "artistId": "artist_A01"
}
```

The payout projection read descriptor is inserted in this order:

```json
{
  "operation": "artist_payout_read_v1",
  "environment": "sandbox",
  "ledgerId": "ledger_A01",
  "bookingId": "booking_A01",
  "assignmentId": "assignment_A01",
  "expectedRecordId": "payment_A01"
}
```

The roster write descriptor is inserted as `operation`, `expectedArtistId`, `expectedRevision`, `projection`. Its projection keys are inserted in this exact order:

```text
environment
artistId
connectedAccountId
onboardingStatus
requirementsStatus
transfersEnabled
payoutReady
dashboardType
preferredPayoutType
lastRequirementsCheckAt
onboardedDate
disabledReason
exceptionFlag
```

The payout write descriptor is inserted as `operation`, `expectedRecordId`, `expectedRevision`, `projection`. Its projection keys are inserted in this exact order:

```text
environment
ledgerId
bookingId
assignmentId
artistId
sourceRevision
state
batchId
batchDate
currency
amountCents
connectedAccountId
transferId
payoutId
payoutStatus
reconciled
reconciledAt
manualPayment
lastVerifiedAt
```

When `manualPayment` is not null, its keys are inserted as `method`, `reason`, `evidenceReference`, `memo`, `recordedBy`, and `recordedAt`. Null is the literal JSON `null`; it is never omitted. The roster and payout POST payloads have the same exact CAS identity and projection shape used by their descriptors, with an additional exact top-level `operation` key inside the business payload.

## Request signature

First calculate lowercase SHA-256 of the UTF-8 business descriptor. Then create this exact request canonical value:

```text
HFLA-APPS-SCRIPT-TRANSPORT
v1
request
<operation>
<environment>
<GET-or-POST>
<configured-origin>
<configured-path>
<timestamp>
<request-id>
<business-descriptor-sha256>
```

The request signature is `v1=` plus HMAC-SHA256 of that canonical value using the environment-specific secret. The server compares signatures in constant time. A request ID is stored only as an environment-bound SHA-256 digest. Exact canonical replay inside the window is permitted; reuse for different canonical content is rejected.

## Signed response

The only accepted response object has exactly `payload` and `auth`. Successful and verified business-failure payloads are both signed. A request rejected before signature verification returns `auth: null`; the caller must reject it without consuming its payload.

For `artist_payout_read_v1`, a source row with no persisted payout projection returns the exact signed field `projection: null`. It never substitutes `{}` or omits the field, so a manual-payment cancellation can distinguish proven absence from partial or malformed state.

The signed response authentication object has exactly these keys in server output: `algorithm`, `version`, `environment`, `operation`, `requestId`, `timestamp`, `payloadSha256`, `signature`. Calculate `payloadSha256` from the exact UTF-8 bytes of `JSON.stringify(payload)`, then calculate the response canonical value:

```text
HFLA-APPS-SCRIPT-TRANSPORT
v1
response
<operation>
<environment>
<request-id>
<response-timestamp>
<payload-sha256>
```

The response signature is `v1=` plus HMAC-SHA256 of that value. Before any payload field is read, the caller must verify exact envelope/auth keys, algorithm, version, environment, operation, request ID, canonical timestamp and replay bound, payload hash, and signature in constant time.

## Required Apps Script redirect policy

Apps Script `ContentService` responses redirect from the configured `https://script.google.com` execution URL to a one-time `https://script.googleusercontent.com` content URL. The client must implement redirects manually:

1. Send the signed request only to the exact configured HTTPS origin and route. Do not send cookies or an `Authorization` header.
2. Permit at most two redirects and only status 301, 302, or 303. Reject 307 and 308 so a POST body cannot be automatically replayed to another origin.
3. Resolve each `Location` against the current URL and reject credentials in the URL, non-HTTPS URLs, fragments, non-default ports, or an origin outside the exact allowlist `https://script.google.com` and `https://script.googleusercontent.com`.
4. Follow a permitted redirect as GET with no body and no forwarded headers. Use only the query string supplied by Google's signed `Location`; never append the original request query or POST body.
5. Once `script.googleusercontent.com` is reached, reject any redirect away from it. Require the final response origin to be exactly `https://script.googleusercontent.com`.
6. Bound the response body before parsing: 64 KiB by default and for every non-list adapter, with a named 192 KiB cap used only by `artist_roster_list_v1`. Parse it once as JSON and perform the complete signed-response verification above before reading `payload.ok`, `payload.error`, or any business value.

Any Google redirect-host change must fail closed until its exact origin and behavior are reviewed and deliberately added. Automatic redirect following is not compatible with this policy.

## Privacy and mutation boundary

The roster status projection contains no email, phone, bank, tax, W-9, payment-handle, secure-document, or onboarding-link field. The active-roster list is narrower still: each summary contains only Artist ID, display name, and source revision; it excludes contact email, country, legal-entity type, and every payment, identity, tax, bank, document, and onboarding-link field. A connected account ID is immutable after its first successful projection. Projection writes use revision compare-and-swap, preserve the source identity columns plus all formulas and validations, reject protected or formula-bearing targets, read back exactly, and append a digest-only audit record. Conflicts never use last-write-wins behavior.
