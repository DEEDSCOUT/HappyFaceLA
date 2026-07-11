-- Phase R.1 milestone timestamps for closed-loop Google Ads outcomes.
-- Draft migration only. Do not apply without separate production approval.

ALTER TABLE quote_requests ADD COLUMN qualified_at_utc TEXT;
ALTER TABLE quote_requests ADD COLUMN booked_at_utc TEXT;
