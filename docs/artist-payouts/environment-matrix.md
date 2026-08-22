# Artist payout environment and feature-flag matrix

No secret value belongs in Git, logs, screenshots, evidence, Drive, Gmail, or browser storage.

| Variable / binding | Purpose | Sandbox source | Production source | Required | Sensitive | Missing or invalid behavior |
|---|---|---|---|---|---|---|
| `PAYOUTS_D1` | Dedicated payout database | approved preview D1 | separately provisioned production D1 | yes | no | all storage operations fail |
| `STRIPE_ARTIST_PAYOUTS_ENABLED` | master read/application gate | `true` only for approved sandbox test | initially `false` | yes | no | protected application actions fail |
| `STRIPE_ARTIST_INTAKE_ENABLED` | authoritative assignment intake gate | `true` only for approved adapter tests | initially `false` | for intake | no | new/updated assignments cannot enter D1 |
| `STRIPE_ARTIST_ONBOARDING_ENABLED` | Account/Link mutation gate | `true` only during sandbox onboarding tests | initially `false` | for onboarding | no | onboarding fails |
| `STRIPE_ARTIST_TRANSFERS_ENABLED` | Transfer mutation gate | `true` only during approved sandbox transfer tests | initially `false` | for transfers | no | transfers fail |
| `STRIPE_ARTIST_PAYOUTS_ENV` | exact object/data mode | `sandbox` | `live` only at authorized activation | yes | no | all operations fail |
| `STRIPE_PAYOUTS_SANDBOX_SECRET_KEY` | isolated payout Stripe client | dedicated Sandbox restricted/secret key | none | sandbox | yes | Stripe operation fails |
| `STRIPE_PAYOUTS_LIVE_SECRET_KEY` | isolated live payout client | none | secret manager after authorization | live | yes | live Stripe operation fails |
| `STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID` | binds every Sandbox Stripe-backed action to the one expected platform Account | exact `acct_...` returned by the approved Sandbox platform | none | Sandbox preview/onboarding/transfer/reconciliation | no | action fails before business use if absent, malformed, or different from Stripe `/v1/account` readback |
| `STRIPE_PAYOUTS_LIVE_PLATFORM_ACCOUNT_ID` | binds every live Stripe-backed action to the one expected platform Account | none | owner-approved exact live platform `acct_...` | live preview/onboarding/transfer/reconciliation | no | action fails before business use if absent, malformed, or different from Stripe `/v1/account` readback |
| `STRIPE_PAYOUTS_SANDBOX_ACCOUNT_WEBHOOK_SECRET` | v2 account event destination | Sandbox event destination | none | sandbox account events | yes | signature verification fails |
| `STRIPE_PAYOUTS_LIVE_ACCOUNT_WEBHOOK_SECRET` | v2 account event destination | none | authorized live event destination | live account events | yes | signature verification fails |
| `STRIPE_PAYOUTS_SANDBOX_PAYOUT_WEBHOOK_SECRET` | connected-account payout events | Sandbox event destination | none | sandbox payout events | yes | signature verification fails |
| `STRIPE_PAYOUTS_LIVE_PAYOUT_WEBHOOK_SECRET` | connected-account payout events | none | authorized live event destination | live payout events | yes | signature verification fails |
| `PAYOUT_MIN_RESERVE_CENTS` | HFL operating reserve in USD minor units | owner-approved synthetic value | owner/finance-approved value | funding preview and transfers | no | funding preview and batch execution fail closed |
| `PAYOUT_PUBLIC_BASE_URL` | protected return/refresh origin | approved preview HTTPS origin | approved production origin | onboarding | no | Account Link creation fails |
| `CF_ACCESS_TEAM_DOMAIN` | Access issuer/JWKS host | preview Access team | production Access team | yes | no | authentication fails |
| `CF_ACCESS_AUD` | Access application audience | preview Access app | production Access app | yes | yes | authentication fails |
| `PAYOUT_OWNER_EMAILS` | owner allowlist | synthetic/approved operator | Shawn-approved list | yes | yes | no owner action can run |
| `PAYOUT_ADMIN_EMAILS` | non-owner admin allowlist | synthetic/approved operators | Shawn-approved list | optional | yes | no admin access |
| `PAYOUT_SANDBOX_CRM_WRITE_URL` / `PAYOUT_LIVE_CRM_WRITE_URL` | safe projection write endpoint | nonproduction adapter | approved production adapter | reconciliation | yes | selected environment CRM sync fails |
| `PAYOUT_SANDBOX_CRM_READ_URL` / `PAYOUT_LIVE_CRM_READ_URL` | independent projection readback | nonproduction adapter | approved production adapter | reconciliation and manual-intent cancellation | yes | selected environment reconciliation fails |
| `PAYOUT_SANDBOX_CRM_ALLOWED_ORIGIN` / `PAYOUT_LIVE_CRM_ALLOWED_ORIGIN` | exact Apps Script payout-projection origin | `https://script.google.com` | `https://script.google.com` | reconciliation | no | adapter fails before network |
| `PAYOUT_SANDBOX_CRM_WEBHOOK_SECRET` / `PAYOUT_LIVE_CRM_WEBHOOK_SECRET` | projection request HMAC | isolated sandbox secret | isolated live secret manager value | reconciliation | yes | adapter fails before network |
| `PAYOUT_SANDBOX_ROSTER_READ_URL` / `PAYOUT_LIVE_ROSTER_READ_URL` | authoritative active-artist identity | nonproduction roster adapter | approved production roster adapter | onboarding and account activation | yes | selected environment identity resolution fails |
| `PAYOUT_SANDBOX_ROSTER_LIST_URL` / `PAYOUT_LIVE_ROSTER_LIST_URL` | signed, paginated active-roster summary used by the onboarding queue | nonproduction Apps Script `artist_roster_list_v1` route | separately approved production Apps Script `artist_roster_list_v1` route | dashboard onboarding queue | yes | queue is explicitly unavailable and is never represented as zero |
| `PAYOUT_SANDBOX_ROSTER_ALLOWED_ORIGIN` / `PAYOUT_LIVE_ROSTER_ALLOWED_ORIGIN` | exact Apps Script roster origin | `https://script.google.com` | `https://script.google.com` | onboarding, account activation, and dashboard onboarding queue | no | adapter fails before network |
| `PAYOUT_SANDBOX_ROSTER_READ_SECRET` / `PAYOUT_LIVE_ROSTER_READ_SECRET` | roster request/response HMAC | isolated sandbox secret | isolated live secret | onboarding, account activation, and dashboard onboarding queue | yes | adapter fails before network |
| `PAYOUT_SANDBOX_ROSTER_PROJECTION_WRITE_URL` / `PAYOUT_LIVE_ROSTER_PROJECTION_WRITE_URL` | safe connected-account/readiness projection endpoint | nonproduction Apps Script deployment | separately approved production deployment | account refresh, mapping, activation, and account webhooks | yes | selected environment roster projection fails and the Stripe event remains retryable |
| `PAYOUT_SANDBOX_ROSTER_PROJECTION_READ_URL` / `PAYOUT_LIVE_ROSTER_PROJECTION_READ_URL` | independent roster projection readback | nonproduction Apps Script deployment | separately approved production deployment | roster reconciliation | yes | projection cannot be certified persisted |
| `PAYOUT_SANDBOX_ROSTER_PROJECTION_ALLOWED_ORIGIN` / `PAYOUT_LIVE_ROSTER_PROJECTION_ALLOWED_ORIGIN` | exact Apps Script roster-projection origin | `https://script.google.com` | `https://script.google.com` | roster projection | no | adapter fails before network |
| `PAYOUT_SANDBOX_ROSTER_PROJECTION_SECRET` / `PAYOUT_LIVE_ROSTER_PROJECTION_SECRET` | roster projection mutual HMAC | isolated sandbox secret | isolated live secret | roster projection | yes | adapter fails before network |
| `PAYOUT_SANDBOX_CRM_SOURCE_READ_URL` / `PAYOUT_LIVE_CRM_SOURCE_READ_URL` | immutable assignment/closeout source read | nonproduction Booking Control Center adapter | approved production adapter | intake, execution recheck, manual actions | yes | source-dependent actions fail closed |
| `PAYOUT_SANDBOX_CRM_SOURCE_ALLOWED_ORIGIN` / `PAYOUT_LIVE_CRM_SOURCE_ALLOWED_ORIGIN` | exact Apps Script assignment-source origin | `https://script.google.com` | `https://script.google.com` | source reads | no | adapter fails before network |
| `PAYOUT_SANDBOX_CRM_SOURCE_READ_SECRET` / `PAYOUT_LIVE_CRM_SOURCE_READ_SECRET` | source request/response HMAC | isolated sandbox secret | isolated live secret | source reads | yes | adapter fails before network |
| `PAYOUT_SANDBOX_ONBOARDING_CLAIM_SECRET` / `PAYOUT_LIVE_ONBOARDING_CLAIM_SECRET` | one-time HFL claim and challenge-code HMAC, recipient-email binding, and Stripe metadata provenance | isolated sandbox secret | isolated live secret | onboarding/map/activation | yes | onboarding fails before mutation |

The existing customer `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are deliberately separate and are not accepted by this feature.

Every paired variable is selected strictly from `STRIPE_ARTIST_PAYOUTS_ENV`; sandbox never falls back to live and live never falls back to sandbox. The templates intentionally contain both names so an operator cannot accidentally rely on a generic cross-environment credential.

No environment variable proves that Instant Payouts are disabled at the platform level. The local gateway rejects a recipient when any external account advertises Instant Payouts, but the owner must separately verify and record the Stripe Dashboard setting in Sandbox and before live activation.

## Google Apps Script properties

These values are configured as Script Properties on each separately deployed adapter. A sandbox deployment must point only to the approved nonproduction workbook; production values require separate owner authorization. URLs, workbook IDs, paths, and active-status policy values are treated as sensitive operational configuration even where they are not credentials.

| Script Property | Purpose | Sandbox source | Production source | Required | Sensitive | Missing or invalid behavior |
|---|---|---|---|---|---|---|
| `HFLA_PAYOUT_ENVIRONMENT` | exact adapter data mode | `sandbox` | `live` only after authorization | yes | no | every operation fails |
| `HFLA_PAYOUT_SPREADSHEET_ID` | exact Booking Control Center file | approved owner-only nonproduction copy | separately approved production file | yes | yes | every operation fails |
| `HFLA_PAYOUT_HMAC_SECRET` | mutual request/response authentication | isolated sandbox secret | isolated production secret | yes | yes | every operation fails before data access |
| `HFLA_PAYOUT_PUBLIC_ORIGIN` | canonical Apps Script execution origin bound into every signed request | `https://script.google.com` | `https://script.google.com` | yes | no | adapter configuration and signature validation fail |
| `HFLA_PAYOUT_ROSTER_PATH` | active-artist read operation path | unique sandbox path | unique production path | yes | yes | roster reads fail |
| `HFLA_PAYOUT_ROSTER_LIST_PATH` | paginated active-roster summary operation path | unique sandbox path | unique production path | yes | yes | authoritative onboarding queue fails closed |
| `HFLA_PAYOUT_ROSTER_PROJECTION_READ_PATH` | roster projection readback path | unique sandbox path | unique production path | yes | yes | roster readback fails |
| `HFLA_PAYOUT_ROSTER_PROJECTION_WRITE_PATH` | roster projection write path | unique sandbox path | unique production path | yes | yes | roster projection fails |
| `HFLA_PAYOUT_SOURCE_PATH` | immutable assignment/closeout read path | unique sandbox path | unique production path | yes | yes | payout-source reads fail |
| `HFLA_PAYOUT_PROJECTION_READ_PATH` | payment projection readback path | unique sandbox path | unique production path | yes | yes | reconciliation readback fails |
| `HFLA_PAYOUT_PROJECTION_WRITE_PATH` | payment projection write path | unique sandbox path | unique production path | yes | yes | reconciliation writes fail |
| `HFLA_PAYOUT_MAX_CLOCK_SKEW_SECONDS` | signed-request clock window, bounded 30–600 seconds | approved synthetic value | owner/security-approved value | yes | no | adapter configuration fails |
| `HFLA_PAYOUT_ACTIVE_ARTIST_STATUS` | exact roster value admitted as active, maximum 80 characters | approved copy's exact active value | owner-approved production value | yes | yes | artist identity reads fail closed |
| `HFLA_PAYOUT_SCHEMA_MIGRATION_ENABLED` | one-time schema-migration master gate | `true` only during approved copy migration | absent/false until separate production approval | migration only | no | migration fails before any write |
| `HFLA_PAYOUT_EXPECTED_DRIVE_VERSION` | optimistic Drive-version lock | freshly observed nonproduction version | freshly observed approved production version | migration only | yes | migration fails on absence, malformed value, or drift |
| `HFLA_PAYOUT_SCHEMA_MIGRATION_APPROVAL` | exact typed migration approval | `I APPROVE ARTIST PAYOUT SCHEMA V1 sandbox <spreadsheet-id> <drive-version>` | separately typed exact live phrase | migration only | yes | migration fails before any write |

Migration-only properties must be removed or disabled after the approved migration window. No runtime property falls back across environments.
