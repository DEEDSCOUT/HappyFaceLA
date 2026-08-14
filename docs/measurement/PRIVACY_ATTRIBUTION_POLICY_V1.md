# Happy Faces LA Privacy / Attribution Policy v1

Owner decision: approved for AP-02/AP-03 internal design on 2026-08-10.

This policy does not activate production consent storage, Google Data Manager,
Enhanced Conversions, customer-data upload, or any GA4/GTM setting.

## Browser attribution

- Before the applicable consent condition, marketing attribution is
  memory-only.
- Quote/contact permission is not advertising consent.
- After applicable consent and a separately approved runtime implementation,
  one coherent `first_touch` / `latest_qualifying_touch` / `submit_touch`
  journey may persist for exactly 30 days. Runtime configuration cannot extend
  this ceiling.
- Latest qualifying touch is operational acquisition credit. First touch is
  informational. Submit touch is route/form context.
- A whole touch envelope is replaced atomically; fields from unrelated visits
  are never merged.

## Retention

| Data class | Maximum retention / action |
| --- | --- |
| Genuine-lead operational PII | 24 months after the later of the last meaningful customer interaction or completed event, then delete or irreversibly de-identify unless a separately governed accounting/contract/legal record controls |
| Raw ad click identifiers | 180 days from accepted lead creation, then delete |
| Spam, bot, invalid diagnostic data | 30 days, then remove PII and click IDs; retain only non-PII abuse/security aggregates if needed |
| Internal tests | 30 days; always labeled and excluded from genuine, qualified, booking, revenue, and advertising outcomes |
| Notification attempt/audit metadata | 180 days |
| Notification payload containing PII | 30 days after terminal success, abandonment, or resolved manual recovery unless it is separately required as the legitimate customer record; the AP-02 outbox deliberately does not duplicate the canonical payload |
| Opaque shadow outcomes | 13 months, then retain non-identifying aggregates only where useful |

## Access and consent

- Shawn is the sole raw customer-data administrator until another person is
  explicitly named. Runtime services receive least privilege. Developers and
  marketing receive synthetic, redacted, opaque-ID, or aggregated evidence.
- When a separately approved Consent Mode implementation exists,
  `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization`
  default to denied until the applicable consent condition is satisfied.
- Data Manager, Enhanced Conversions for Leads, hashing/uploading contact data,
  and an offline customer-data pipeline remain unapproved.

## Deletion and withdrawal

Verified deletion/redaction must cover applicable attribution envelopes,
canonical records, notification payloads, raw click IDs, linkable shadow rows,
and Happy Faces LA-controlled exports/caches. A non-PII tombstone may remain.
Withdrawal clears browser attribution, blocks future advertising delivery, and
does not silently delete separately governed booking, contract, tax, or
accounting records.

The branch implements an idempotent, bounded, dry-run-capable D1 purge
candidate. Apply mode is disabled by default and remains undeployed. External
downstream deletion propagation is an operational runbook gate; no Make,
Gmail, Google Sheet, cache, or export was modified by this engineering work.
