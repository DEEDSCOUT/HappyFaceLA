/**
 * Happy Faces LA — Booking Control Center sheet writer.
 *
 * Deploy this as a Google Apps Script Web App bound to the "Booking Control
 * Center" spreadsheet, then put its /exec URL in SHEETS_WEBHOOK_URL and the
 * shared secret in SHEETS_WEBHOOK_SECRET. The Cloudflare Worker
 * (functions/api/thumbtack-webhook.ts) POSTs each lead card here; this script
 * appends/updates one row per lead and keeps the metrics columns (spec #11).
 *
 * Deploy:
 *   1. Extensions → Apps Script, paste this file.
 *   2. Set SHARED_SECRET below (must equal SHEETS_WEBHOOK_SECRET).
 *   3. Deploy → New deployment → Web app → Execute as "Me",
 *      Who has access "Anyone" (the HMAC check is the real gate).
 *   4. Copy the /exec URL into SHEETS_WEBHOOK_URL.
 *
 * Security: every request is HMAC-SHA256 verified against the raw POST body
 * using the header x-hfla-signature. Unsigned/mismatched requests are rejected.
 */

var SHARED_SECRET = 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET';
var TAB_NAME = 'Leads';

var HEADERS = [
  'received_at', 'event', 'lead_id', 'score', 'priority', 'customer_name',
  'lead_type', 'event_type', 'event_city', 'event_zip', 'event_date',
  'event_time', 'event_length', 'requested_services', 'guest_count',
  'age_range', 'paid_status', 'lead_fee', 'pros_contacted', 'reply_deadline',
  'recommended_quote', 'retainer', 'cautions', 'reply_draft',
  // metrics (spec #11) — filled in by hand as the deal progresses
  'response_time_min', 'estimate_sent', 'customer_replied',
  'retainer_requested', 'booked', 'booked_revenue', 'lost_reason'
];

function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '';
    var sig = (e.parameter && e.parameter.sig) || getHeaderSig(e);
    if (SHARED_SECRET && SHARED_SECRET !== 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET') {
      var expected = toHex(Utilities.computeHmacSha256Signature(raw, SHARED_SECRET));
      if (!sig || sig.toLowerCase() !== expected) {
        return json({ ok: false, error: 'bad signature' }, 401);
      }
    }
    var body = JSON.parse(raw);
    var row = toRow(body);
    appendRow(row);
    return json({ ok: true, lead_id: body.lead && body.lead.lead_id });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

/** Apps Script web apps cannot read arbitrary headers; pass sig as ?sig= too. */
function getHeaderSig(e) {
  return '';
}

function toRow(body) {
  var l = body.lead || {};
  var s = body.score || {};
  var p = body.pricing || {};
  return [
    l.received_at, l.event, l.lead_id, s.score, s.priority, l.customer_name,
    l.lead_type, l.event_type, l.event_city, l.event_zip, l.event_date,
    l.event_time, l.event_length, (l.requested_services || []).join(', '),
    l.guest_count, l.age_range, l.paid_status, l.lead_fee, l.pros_contacted,
    l.reply_deadline,
    p.custom_quote ? 'Custom quote' : p.recommended_display, p.retainer,
    (s.cautions || []).join(' | '), body.reply_draft,
    '', '', '', '', '', '', ''
  ];
}

function appendRow(row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}

function toHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    out += b.length === 1 ? '0' + b : b;
  }
  return out;
}

function json(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
