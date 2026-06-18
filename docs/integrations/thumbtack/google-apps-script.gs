/**
 * Happy Faces LA - Booking Control Center sheet writer.
 *
 * Deploy this as a Google Apps Script Web App bound to the "Happy Faces LA -
 * Booking Control Center" spreadsheet. The Cloudflare Pages Function posts a
 * normalized Thumbtack lead card here; this script HMAC-verifies the raw body,
 * then creates or updates one row in the 01_LEADS tab.
 *
 * Preferred secret storage:
 *   Project Settings -> Script Properties:
 *   SHEETS_WEBHOOK_SECRET = same value as Cloudflare SHEETS_WEBHOOK_SECRET
 *   SHEETS_SPREADSHEET_ID = Booking Control Center spreadsheet ID
 *
 * Fallback:
 *   Replace SHARED_SECRET below with the same shared secret.
 *
 * Apps Script web apps cannot reliably read custom request headers, so the
 * Cloudflare function sends the HMAC as both x-hfla-signature and ?sig=...
 * This script verifies the query parameter before writing anything.
 */

var SHARED_SECRET = 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET';
var SCRIPT_SECRET_PROPERTY = 'SHEETS_WEBHOOK_SECRET';
var SPREADSHEET_ID_PROPERTY = 'SHEETS_SPREADSHEET_ID';
var DEFAULT_SPREADSHEET_ID = '';
var TAB_NAME = '01_LEADS';
var FIRST_WRITABLE_COLUMN = 2; // Column A is formula-controlled in 01_LEADS.
var EXTERNAL_ID_NOTE_PREFIX = 'Thumbtack external lead ID: ';

var REQUIRED_HEADERS = [
  'Created Date',
  'Lead Source',
  'Client Name',
  'Event City',
  'Event Date',
  'Requested Time Frame',
  'Service Requested',
  'Estimated Kids / Guests',
  'Pipeline Status',
  'Quote Sent?',
  'Quote Amount',
  'Travel Fee',
  'Retainer Requested?',
  'Next Follow-Up Date',
  'Last Contact Date',
  'Lead Intent / Acquisition Type',
  'Platform Status',
  'Notes'
];

var HEADER_ALIASES = {
  'Created Date': ['created date', 'created_date', 'received_at', 'received at'],
  'Lead Source': ['lead source', 'source'],
  'Client Name': ['client name', 'customer_name', 'customer name'],
  'Event City': ['event city', 'event_city', 'city'],
  'Event Date': ['event date', 'event_date'],
  'Requested Time Frame': ['requested time frame', 'event_time', 'event time', 'event_length'],
  'Service Requested': ['service requested', 'requested_services', 'requested services', 'lead_type'],
  'Estimated Kids / Guests': ['estimated kids / guests', 'estimated kids', 'guests', 'guest_count'],
  'Pipeline Status': ['pipeline status', 'status'],
  'Quote Sent?': ['quote sent?', 'quote sent', 'estimate_sent'],
  'Quote Amount': ['quote amount', 'recommended_quote', 'recommended quote'],
  'Travel Fee': ['travel fee', 'travel_adjustment'],
  'Retainer Requested?': ['retainer requested?', 'retainer requested', 'retainer_requested'],
  'Next Follow-Up Date': ['next follow-up date', 'next follow up date', 'next_follow_up_date'],
  'Last Contact Date': ['last contact date', 'last_contact_date'],
  'Lead Intent / Acquisition Type': ['lead intent / acquisition type', 'lead intent', 'acquisition type'],
  'Platform Status': ['platform status', 'event'],
  'Notes': ['notes', 'cautions', 'reply_draft']
};

var DEFAULT_ONLY_FIELDS = {
  'Quote Sent?': true,
  'Retainer Requested?': true
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var raw = e && e.postData ? e.postData.contents : '';
    var secret = getSharedSecret_();
    if (!secret) {
      return json_({ ok: false, error: 'missing shared secret' }, 401);
    }

    var sig = e && e.parameter ? String(e.parameter.sig || '').trim().toLowerCase() : '';
    var expected = toHex_(
      Utilities.computeHmacSha256Signature(raw, secret, Utilities.Charset.UTF_8)
    );
    if (!sig || sig !== expected) {
      return json_({ ok: false, error: 'bad signature' }, 401);
    }

    var body = JSON.parse(raw);
    var result = upsertLead_(body);
    return json_({
      ok: true,
      tab: TAB_NAME,
      row: result.row,
      created: result.created,
      lead_id: body.lead && body.lead.lead_id
    }, 200);
  } catch (err) {
    return json_({ ok: false, error: String(err) }, 500);
  } finally {
    lock.releaseLock();
  }
}

function getSharedSecret_() {
  var prop = '';
  try {
    prop = PropertiesService.getScriptProperties().getProperty(SCRIPT_SECRET_PROPERTY) || '';
  } catch (err) {
    prop = '';
  }

  var secret = String(prop || SHARED_SECRET || '').trim();
  if (!secret || secret === 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET') return '';
  return secret;
}

function upsertLead_(body) {
  var ss = getTargetSpreadsheet_();
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) sheet = ss.insertSheet(TAB_NAME);

  var headerMap = ensureHeaders_(sheet);
  var leadId = String(((body.lead || {}).lead_id) || '').trim();
  if (!leadId) throw new Error('missing lead_id');

  var existingRow = findLeadRow_(sheet, headerMap['Notes'], leadId);
  var row = existingRow || appendPreparedRow_(sheet);
  var created = !existingRow;
  var values = toSheetValues_(body);

  writeMappedValues_(sheet, row, headerMap, values, created);
  return { row: row, created: created };
}

function getTargetSpreadsheet_() {
  var spreadsheetId = '';
  try {
    spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) || '';
  } catch (err) {
    spreadsheetId = '';
  }

  spreadsheetId = String(spreadsheetId || DEFAULT_SPREADSHEET_ID || '').trim();
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('missing active spreadsheet; set Script Property ' + SPREADSHEET_ID_PROPERTY);
  }
  return ss;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, FIRST_WRITABLE_COLUMN, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    sheet.setFrozenRows(1);
  }

  var lastCol = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length + FIRST_WRITABLE_COLUMN - 1);
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  var headerValues = headerRange.getDisplayValues()[0];
  var allBlank = headerValues.join('').trim() === '';
  if (allBlank) {
    sheet.getRange(1, FIRST_WRITABLE_COLUMN, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    sheet.setFrozenRows(1);
    headerValues = [''].concat(REQUIRED_HEADERS.slice());
  }

  var normalizedToColumn = {};
  for (var c = 0; c < headerValues.length; c++) {
    if (c + 1 < FIRST_WRITABLE_COLUMN) continue;
    var key = normalizeHeader_(headerValues[c]);
    if (key) normalizedToColumn[key] = c + 1;
  }

  var headerMap = {};
  for (var i = 0; i < REQUIRED_HEADERS.length; i++) {
    var header = REQUIRED_HEADERS[i];
    var aliases = HEADER_ALIASES[header] || [header];
    var column = 0;
    for (var a = 0; a < aliases.length; a++) {
      column = normalizedToColumn[normalizeHeader_(aliases[a])] || 0;
      if (column) break;
    }
    if (!column) {
      column = Math.max(sheet.getLastColumn() + 1, FIRST_WRITABLE_COLUMN);
      sheet.getRange(1, column).setValue(header);
      normalizedToColumn[normalizeHeader_(header)] = column;
    }
    headerMap[header] = column;
  }

  sheet.setFrozenRows(1);
  return headerMap;
}

function appendPreparedRow_(sheet) {
  var row = findNextAppendRow_(sheet);
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);

  var lastCol = sheet.getLastColumn();
  var sourceRow = row > 2 ? row - 1 : 1;
  var width = Math.max(1, lastCol - FIRST_WRITABLE_COLUMN + 1);
  var source = sheet.getRange(sourceRow, FIRST_WRITABLE_COLUMN, 1, width);
  var target = sheet.getRange(row, FIRST_WRITABLE_COLUMN, 1, width);
  source.copyTo(target, { formatOnly: true });
  target.setDataValidations(source.getDataValidations());
  return row;
}

function findNextAppendRow_(sheet) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 2;

  var lastTableColumn = Math.min(sheet.getLastColumn(), 30);
  var firstDataColumn = FIRST_WRITABLE_COLUMN;
  var width = Math.max(1, lastTableColumn - firstDataColumn + 1);
  var values = sheet.getRange(2, firstDataColumn, maxRows - 1, width).getDisplayValues();

  var seenData = false;
  var lastDataRow = 1;
  for (var r = 0; r < values.length; r++) {
    var hasData = false;
    for (var c = 0; c < values[r].length; c++) {
      if (String(values[r][c] == null ? '' : values[r][c]).trim()) {
        hasData = true;
        break;
      }
    }
    if (hasData) {
      seenData = true;
      lastDataRow = r + 2;
    } else if (seenData) {
      return r + 2;
    }
  }

  return Math.max(lastDataRow + 1, 2);
}

function findLeadRow_(sheet, notesColumn, leadId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !notesColumn || notesColumn < FIRST_WRITABLE_COLUMN) return 0;

  var marker = EXTERNAL_ID_NOTE_PREFIX + leadId;
  var values = sheet.getRange(2, notesColumn, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    var text = String(values[i][0] == null ? '' : values[i][0]);
    if (text.indexOf(marker) !== -1) return i + 2;
  }
  return 0;
}

function writeMappedValues_(sheet, row, headerMap, values, created) {
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(row, 1, 1, lastCol);
  var existing = range.getValues()[0];
  var formulas = range.getFormulas()[0];

  for (var field in values) {
    if (!values.hasOwnProperty(field)) continue;
    var col = headerMap[field];
    if (!col) continue;
    if (col < FIRST_WRITABLE_COLUMN) continue;
    if (formulas[col - 1]) continue;

    var next = values[field];
    var current = existing[col - 1];
    var currentText = String(current == null ? '' : current).trim();
    var nextText = String(next == null ? '' : next).trim();

    if (!nextText) continue;
    if (!created && DEFAULT_ONLY_FIELDS[field] && currentText) continue;

    if (field === 'Notes' && currentText) {
      if (currentText.indexOf(nextText) === -1) next = currentText + '\n---\n' + nextText;
      else next = current;
    }

    sheet.getRange(row, col).setValue(next);
  }
}

function toSheetValues_(body) {
  var l = body.lead || {};
  var s = body.score || {};
  var p = body.pricing || {};
  var followUps = body.follow_ups || [];
  var services = l.requested_services || [];

  var timeFrame = joinNonBlank_([l.event_time, l.event_length], ' / ');
  var guests = joinNonBlank_([l.guest_count, l.age_range], ' ');
  var quote = p.custom_quote ? 'Custom quote' : p.recommended_display;
  var retainer = p.retainer ? '$' + p.retainer : '';
  var nextFollowUp = followUps.length ? followUps[0].due_at : '';
  var lastContact = l.received_at || new Date().toISOString();

  return {
    'Created Date': l.received_at,
    'Lead Source': 'Thumbtack',
    'Client Name': l.customer_name,
    'Event City': l.event_city,
    'Event Date': l.event_date,
    'Requested Time Frame': timeFrame,
    'Service Requested': formatServices_(services, l.lead_type),
    'Estimated Kids / Guests': guests,
    'Pipeline Status': pipelineStatus_(l.event),
    'Quote Sent?': 'No',
    'Quote Amount': quote,
    'Travel Fee': p.travel_adjustment ? '$' + p.travel_adjustment : '',
    'Retainer Requested?': 'No',
    'Next Follow-Up Date': nextFollowUp,
    'Last Contact Date': lastContact,
    'Lead Intent / Acquisition Type': leadIntent_(l),
    'Platform Status': platformStatus_(l.event),
    'Notes': buildNotes_(body, retainer)
  };
}

function pipelineStatus_(eventName) {
  return 'New Inquiry';
}

function platformStatus_(eventName) {
  if (eventName === 'message.created') return 'Customer replied';
  if (eventName === 'review.created') return 'Customer replied';
  return 'Not contacted';
}

function leadIntent_(lead) {
  var kind = normalizeHeader_(
    joinNonBlank_([lead.event_type, lead.lead_type, lead.paid_status], ' ')
  );
  if (kind.indexOf('direct') !== -1 || kind.indexOf('paid') !== -1) return 'Direct Lead';
  if (kind.indexOf('open') !== -1 || kind.indexOf('opportunity') !== -1) {
    return 'Thumbtack Open Lead Quoted';
  }
  return 'Direct Lead';
}

function buildNotes_(body, retainer) {
  var l = body.lead || {};
  var s = body.score || {};
  var p = body.pricing || {};
  var notes = [];
  if (l.lead_id) notes.push(EXTERNAL_ID_NOTE_PREFIX + l.lead_id);
  notes.push('Thumbtack webhook event: ' + (l.event || 'unknown'));
  notes.push('Source dispatch: authenticated Cloudflare webhook');
  if (s.score) notes.push('Lead score: ' + s.score + ' (' + s.priority + ')');
  if (l.lead_fee) notes.push('Lead fee: $' + l.lead_fee);
  if (l.pros_contacted) notes.push('Pros contacted: ' + l.pros_contacted);
  if (l.reply_deadline) notes.push('Reply deadline: ' + l.reply_deadline);
  if (p.recommended_display) notes.push('Recommended quote: ' + p.recommended_display);
  if (retainer) notes.push('Retainer recommendation: ' + retainer);
  if (p.notes && p.notes.length) notes.push('Pricing notes: ' + p.notes.join(' | '));
  if (s.cautions && s.cautions.length) notes.push('Cautions: ' + s.cautions.join(' | '));
  if (body.reply_draft) notes.push('Ready-to-copy Thumbtack reply draft generated; no customer auto-send.');
  return notes.join('\n');
}

function formatServices_(services, fallback) {
  var parts = [];
  var values = Array.isArray(services) ? services : String(services || '').split(/[,+]/);
  for (var i = 0; i < values.length; i++) parts.push(serviceText_(values[i]));
  parts.push(serviceText_(fallback));

  var combined = normalizeHeader_(parts.join(' '));
  var labels = [];
  if (combined.indexOf('facepainting') !== -1 || combined.indexOf('facepaint') !== -1) {
    labels.push('Face Painting');
  }
  if (combined.indexOf('balloon') !== -1) labels.push('Balloon Twisting');
  if (combined.indexOf('glittertattoo') !== -1) labels.push('Glitter Tattoos');
  if (combined.indexOf('facegem') !== -1) labels.push('Face Gems');

  if (labels.length) return labels.join(' + ');
  return 'Custom Quote';
}

function serviceText_(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    var fields = ['name', 'title', 'label', 'service', 'category', 'type'];
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      if (value[fields[i]]) out.push(String(value[fields[i]]));
    }
    if (out.length) return out.join(' ');
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '';
    }
  }
  return String(value || '');
}

function joinNonBlank_(parts, separator) {
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var value = String(parts[i] == null ? '' : parts[i]).trim();
    if (value) out.push(value);
  }
  return out.join(separator);
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    out += b.length === 1 ? '0' + b : b;
  }
  return out;
}

function json_(obj, status) {
  obj.status_code = status;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
