/**
 * Happy Faces LA Booking Control Center CRM webhook.
 *
 * PURPOSE
 * - Write website leads to the authoritative 01_LEADS tab.
 * - Allocate internal LEAD-REAL-* IDs through 00_ID_CONTROL.
 * - Preserve the website lead_xxx value as External Lead ID for deduplication.
 * - Return a read-after-write acknowledgement that the website can verify.
 * - Support signed outbound-message writeback after Gmail/Make sends a customer message.
 *
 * SAFETY
 * - No spreadsheet ID, webhook secret, or production credential is committed here.
 * - doPost fails closed unless Script Properties are configured.
 * - CRM_WRITE_MODE=staging requires a spreadsheet title containing STAGING.
 * - CRM_WRITE_MODE=production additionally requires CRM_PRODUCTION_WRITE_APPROVED=YES.
 * - prepareStagingSchema() refuses to run outside staging mode.
 * - The live production workbook must not be modified until a separate owner-approved rollout.
 *
 * REQUIRED SCRIPT PROPERTIES
 * BOOKING_CONTROL_CENTER_SPREADSHEET_ID
 * CRM_WEBHOOK_HMAC_SECRET
 * CRM_WRITE_MODE = staging | production
 * CRM_PRODUCTION_WRITE_APPROVED = YES   (production only; separate owner approval required)
 */

var CRM_CONTRACT_VERSION = 'hfla-booking-control-center-v1';
var LEADS_SHEET = '01_LEADS';
var ID_CONTROL_SHEET = '00_ID_CONTROL';
var EXTERNAL_ID_HEADER = 'External Lead ID';
var OUTBOUND_MESSAGE_ID_HEADER = 'Last Outbound Message ID';
var OUTBOUND_SENT_AT_HEADER = 'Last Outbound Sent At UTC';
var MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
var MAX_ID_ALLOCATION_SCAN = 1000;

function doPost(e) {
  try {
    var envelope = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    var verified = verifyEnvelope_(envelope);
    if (!verified.ok) return jsonResponse_({ ok: false, verified: false, error: verified.error });

    var payload = JSON.parse(envelope.payload_json);
    var externalLeadId = clean_(payload.external_lead_id || (payload.canonical && payload.canonical.lead_id), 120);
    if (!/^lead_[a-z0-9]+$/i.test(externalLeadId)) {
      return jsonResponse_({ ok: false, verified: false, error: 'invalid_external_lead_id' });
    }
    if (!payload.canonical || clean_(payload.canonical.lead_id, 120) !== externalLeadId) {
      return jsonResponse_({ ok: false, verified: false, error: 'canonical_lead_id_mismatch' });
    }

    var ss = openAuthorizedSpreadsheet_();
    var eventName = clean_(payload.event, 40);
    if (eventName === 'lead_intake') {
      return jsonResponse_(writeLeadIntake_(ss, externalLeadId, payload.canonical));
    }
    if (eventName === 'outreach_writeback') {
      return jsonResponse_(writeOutreachResult_(ss, externalLeadId, payload.outreach || {}));
    }
    return jsonResponse_({ ok: false, verified: false, error: 'unsupported_event' });
  } catch (err) {
    console.error('CRM webhook failure: ' + safeError_(err));
    return jsonResponse_({ ok: false, verified: false, error: 'crm_webhook_failure' });
  }
}

function verifyEnvelope_(envelope) {
  var props = PropertiesService.getScriptProperties();
  var secret = clean_(props.getProperty('CRM_WEBHOOK_HMAC_SECRET'), 4096);
  if (!secret) return { ok: false, error: 'crm_secret_not_configured' };
  if (clean_(envelope.contract_version, 80) !== CRM_CONTRACT_VERSION) {
    return { ok: false, error: 'unsupported_contract_version' };
  }

  var sentAt = Date.parse(clean_(envelope.sent_at_utc, 80));
  if (!sentAt || Math.abs(Date.now() - sentAt) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: 'stale_or_invalid_timestamp' };
  }

  var payloadJson = typeof envelope.payload_json === 'string' ? envelope.payload_json : '';
  var presentedSignature = clean_(envelope.signature_sha256, 128).toLowerCase();
  if (!payloadJson || !/^[a-f0-9]{64}$/.test(presentedSignature)) {
    return { ok: false, error: 'invalid_signature_format' };
  }
  var expectedSignature = hmacHex_(secret, payloadJson);
  if (!constantTimeEqual_(presentedSignature, expectedSignature)) {
    return { ok: false, error: 'signature_mismatch' };
  }
  return { ok: true };
}

function openAuthorizedSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = clean_(props.getProperty('BOOKING_CONTROL_CENTER_SPREADSHEET_ID'), 256);
  var mode = clean_(props.getProperty('CRM_WRITE_MODE'), 20).toLowerCase();
  if (!spreadsheetId) throw new Error('spreadsheet_id_not_configured');
  if (mode !== 'staging' && mode !== 'production') throw new Error('crm_write_mode_not_configured');

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var title = String(ss.getName() || '');
  if (mode === 'staging' && title.toUpperCase().indexOf('STAGING') < 0) {
    throw new Error('staging_mode_requires_staging_workbook');
  }
  if (mode === 'production') {
    if (title.toUpperCase().indexOf('STAGING') >= 0) throw new Error('production_mode_rejects_staging_workbook');
    if (clean_(props.getProperty('CRM_PRODUCTION_WRITE_APPROVED'), 20) !== 'YES') {
      throw new Error('production_write_not_owner_approved');
    }
  }
  return ss;
}

function writeLeadIntake_(ss, externalLeadId, lead) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = requireSheet_(ss, LEADS_SHEET);
    var headers = getHeaders_(sheet);
    requireHeaders_(headers, [
      'Lead ID', 'Created Date', 'Lead Source', 'Client Name', 'Client Phone', 'Client Email',
      'Event City', 'Event Address', 'Event Date', 'Requested Time Frame', 'Service Requested',
      'Estimated Kids / Guests', 'Notes', 'Pipeline Status', 'Quote Sent?', 'Retainer Requested?',
      'Retainer Paid?', 'Convert to Booking?', 'Lead Intent / Acquisition Type',
      'Platform Status', EXTERNAL_ID_HEADER
    ]);

    var existing = findByExternalId_(sheet, headers, externalLeadId);
    var targetRow = existing ? existing.row : Math.max(sheet.getLastRow() + 1, 2);
    if (existing) {
      var existingInternalId = clean_(sheet.getRange(existing.row, headers['Lead ID']).getDisplayValue(), 120);
      if (/^LEAD-REAL-\d{8}-\d{3,}$/.test(existingInternalId)) {
        return verifiedAck_(externalLeadId, existingInternalId, existing.row, true);
      }
      // An exact external-ID match with a blank Lead ID is a recoverable interrupted write.
      // A nonblank invalid Lead ID is never overwritten because internal IDs are immutable.
      if (existingInternalId) throw new Error('existing_row_has_invalid_internal_id');
    } else {
      // Write the immutable external dedupe key first. If a later Sheets write fails,
      // the retry can recover this same row instead of appending a second partial row.
      sheet.getRange(targetRow, headers[EXTERNAL_ID_HEADER]).setValue(externalLeadId);
      SpreadsheetApp.flush();
      var anchoredExternalId = clean_(sheet.getRange(targetRow, headers[EXTERNAL_ID_HEADER]).getDisplayValue(), 120);
      if (anchoredExternalId !== externalLeadId) throw new Error('external_id_anchor_failed');
    }

    var createdAt = parseDate_(lead.created_at) || new Date();
    var allocation = allocateInternalLeadId_(ss, createdAt);

    var values = {};
    values['Created Date'] = createdAt;
    values['Lead Source'] = deriveLeadSource_(lead);
    values['Client Name'] = [clean_(lead.first_name, 80), clean_(lead.last_name, 80)].filter(Boolean).join(' ');
    values['Client Phone'] = clean_(lead.phone, 80);
    values['Client Email'] = clean_(lead.email, 254);
    values['Event City'] = clean_(lead.event_city, 120);
    values['Event Address'] = clean_(lead.event_venue_or_address, 240);
    values['Event Date'] = clean_(lead.event_date, 40);
    values['Requested Time Frame'] = buildRequestedTimeFrame_(lead);
    values['Service Requested'] = Array.isArray(lead.services_requested)
      ? lead.services_requested.map(function (item) { return clean_(item, 80); }).filter(Boolean).join(' + ')
      : '';
    values['Estimated Kids / Guests'] = meaningfulChildCount_(lead);
    values['Notes'] = buildLeadNotes_(lead);
    values['Pipeline Status'] = 'New Inquiry';
    values['Quote Sent?'] = 'No';
    values['Retainer Requested?'] = 'No';
    values['Retainer Paid?'] = 'No';
    values['Convert to Booking?'] = 'No';
    values['Lead Intent / Acquisition Type'] = 'Website Lead';
    values['Platform Status'] = 'Website lead received / CRM intake pending verification';

    // Do not write Last Contact Date here. Receiving a website inquiry is not customer
    // outreach. That field is updated only by verified outbound-message writeback.
    writeNamedValues_(sheet, targetRow, headers, values);
    sheet.getRange(targetRow, headers[EXTERNAL_ID_HEADER]).setValue(externalLeadId);
    SpreadsheetApp.flush();

    // Lead ID is written last and exactly once, after all business cells and the external
    // dedupe key are in place. This preserves the Booking Control Center immutable-ID rule.
    var currentInternalId = clean_(sheet.getRange(targetRow, headers['Lead ID']).getDisplayValue(), 120);
    if (currentInternalId && currentInternalId !== allocation.internalLeadId) {
      throw new Error('lead_id_changed_during_recovery');
    }
    if (!currentInternalId) {
      sheet.getRange(targetRow, headers['Lead ID']).setValue(allocation.internalLeadId);
      SpreadsheetApp.flush();
    }

    var storedInternalId = clean_(sheet.getRange(targetRow, headers['Lead ID']).getDisplayValue(), 120);
    var storedExternalId = clean_(sheet.getRange(targetRow, headers[EXTERNAL_ID_HEADER]).getDisplayValue(), 120);
    if (storedInternalId !== allocation.internalLeadId || storedExternalId !== externalLeadId) {
      throw new Error('read_after_write_verification_failed');
    }
    if (!/^LEAD-REAL-\d{8}-\d{3,}$/.test(storedInternalId)) {
      throw new Error('invalid_allocated_internal_id');
    }

    // Advance the literal Next Sequence cell only after the row is proven durable. If the
    // advance itself fails, the next request safely skips the now-used candidate via B8.
    advanceInternalLeadSequence_(ss, allocation);
    sheet.getRange(targetRow, headers['Platform Status']).setValue('Website lead received and CRM verified');
    SpreadsheetApp.flush();

    return verifiedAck_(externalLeadId, storedInternalId, targetRow, Boolean(existing));
  } finally {
    lock.releaseLock();
  }
}

function writeOutreachResult_(ss, externalLeadId, outreach) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = requireSheet_(ss, LEADS_SHEET);
    var headers = getHeaders_(sheet);
    requireHeaders_(headers, [
      'Lead ID', 'Pipeline Status', 'Quote Sent?', 'Next Follow-Up Date', 'Last Contact Date',
      'Platform Status', EXTERNAL_ID_HEADER, OUTBOUND_MESSAGE_ID_HEADER, OUTBOUND_SENT_AT_HEADER
    ]);
    var existing = findByExternalId_(sheet, headers, externalLeadId);
    if (!existing) return { ok: false, verified: false, error: 'external_lead_not_found' };

    var internalLeadId = clean_(sheet.getRange(existing.row, headers['Lead ID']).getDisplayValue(), 120);
    if (!/^LEAD-REAL-\d{8}-\d{3,}$/.test(internalLeadId)) {
      throw new Error('outreach_row_has_invalid_internal_id');
    }

    var messageId = clean_(outreach.message_id, 240);
    var sentAt = parseDate_(outreach.sent_at_utc);
    if (!messageId || !sentAt) return { ok: false, verified: false, error: 'outreach_evidence_incomplete' };

    var priorMessageId = clean_(sheet.getRange(existing.row, headers[OUTBOUND_MESSAGE_ID_HEADER]).getDisplayValue(), 240);
    if (priorMessageId === messageId) {
      return verifiedAck_(externalLeadId, internalLeadId, existing.row, true);
    }

    var values = {};
    values['Last Contact Date'] = sentAt;
    values['Platform Status'] = 'Outbound email sent and CRM writeback verified';
    values[OUTBOUND_MESSAGE_ID_HEADER] = messageId;
    values[OUTBOUND_SENT_AT_HEADER] = sentAt.toISOString();

    if (outreach.quote_sent === true) {
      values['Quote Sent?'] = 'Yes';
      values['Pipeline Status'] = 'Quote Sent';
    }
    var nextFollowUp = clean_(outreach.next_follow_up_date, 40);
    if (nextFollowUp) values['Next Follow-Up Date'] = nextFollowUp;

    writeNamedValues_(sheet, existing.row, headers, values);
    SpreadsheetApp.flush();

    var storedMessageId = clean_(sheet.getRange(existing.row, headers[OUTBOUND_MESSAGE_ID_HEADER]).getDisplayValue(), 240);
    if (storedMessageId !== messageId) throw new Error('outreach_read_after_write_failed');
    return verifiedAck_(externalLeadId, internalLeadId, existing.row, false);
  } finally {
    lock.releaseLock();
  }
}

function allocateInternalLeadId_(ss, createdAt) {
  var control = requireSheet_(ss, ID_CONTROL_SHEET);
  var sequenceCell = control.getRange('B5');
  var sequence = Number(clean_(sequenceCell.getDisplayValue(), 40));
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('id_allocator_next_sequence_invalid');

  var timeZone = typeof ss.getSpreadsheetTimeZone === 'function'
    ? clean_(ss.getSpreadsheetTimeZone(), 80) || 'America/Los_Angeles'
    : 'America/Los_Angeles';
  var createdDate = Utilities.formatDate(createdAt, timeZone, 'yyyy-MM-dd');
  control.getRange('B6').setValue(createdDate);
  SpreadsheetApp.flush();

  for (var attempt = 0; attempt < MAX_ID_ALLOCATION_SCAN; attempt += 1) {
    var candidate = clean_(control.getRange('B7').getDisplayValue(), 120);
    var available = clean_(control.getRange('B8').getDisplayValue(), 40).toUpperCase();
    if (!/^LEAD-REAL-\d{8}-\d{3,}$/.test(candidate)) {
      throw new Error('id_allocator_returned_invalid_candidate');
    }
    if (available === 'YES') {
      return { internalLeadId: candidate, sequence: sequence };
    }
    if (available !== 'NO') throw new Error('id_allocator_availability_invalid');

    sequence += 1;
    sequenceCell.setValue(sequence);
    SpreadsheetApp.flush();
  }
  throw new Error('id_allocator_scan_exhausted');
}

function advanceInternalLeadSequence_(ss, allocation) {
  var control = requireSheet_(ss, ID_CONTROL_SHEET);
  var sequenceCell = control.getRange('B5');
  var current = Number(clean_(sequenceCell.getDisplayValue(), 40));
  if (!Number.isInteger(current) || current < allocation.sequence) {
    throw new Error('id_allocator_sequence_regressed');
  }
  var next = Math.max(current, allocation.sequence + 1);
  sequenceCell.setValue(next);
  SpreadsheetApp.flush();
  var stored = Number(clean_(sequenceCell.getDisplayValue(), 40));
  if (!Number.isInteger(stored) || stored < allocation.sequence + 1) {
    throw new Error('id_allocator_sequence_advance_failed');
  }
}

function findByExternalId_(sheet, headers, externalLeadId) {
  var column = headers[EXTERNAL_ID_HEADER];
  if (!column || sheet.getLastRow() < 2) return null;
  var range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
  var match = range.createTextFinder(externalLeadId).matchEntireCell(true).findNext();
  return match ? { row: match.getRow() } : null;
}

function getHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var row = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var headers = {};
  row.forEach(function (value, index) {
    var name = clean_(value, 120);
    if (name) headers[name] = index + 1;
  });
  return headers;
}

function requireHeaders_(headers, names) {
  names.forEach(function (name) {
    if (!headers[name]) throw new Error('required_header_missing_' + name.replace(/\s+/g, '_'));
  });
}

function writeNamedValues_(sheet, row, headers, values) {
  Object.keys(values).forEach(function (header) {
    if (!headers[header]) throw new Error('target_header_missing_' + header.replace(/\s+/g, '_'));
    sheet.getRange(row, headers[header]).setValue(values[header]);
  });
}

function deriveLeadSource_(lead) {
  var sourcePage = clean_(lead.source_page, 240).toLowerCase();
  var sourceConfidence = clean_(lead.source_confidence, 40).toLowerCase();
  var gclidPresent = clean_(lead.gclid_present, 20).toLowerCase() === 'yes';
  var paidGoogle = gclidPresent || ['gclid', 'gbraid', 'wbraid', 'utm_paid'].indexOf(sourceConfidence) >= 0;
  var source = sourcePage.indexOf('/plan-my-party') >= 0 ? 'Website / Plan My Party' : 'Website';
  return paidGoogle ? source + ' / Google Ads' : source;
}

function buildRequestedTimeFrame_(lead) {
  var start = formatClockTime_(lead.preferred_start_time);
  var end = formatClockTime_(lead.estimated_service_end_time);
  if (start && end) return start + ' to ' + end;
  return start || end || '';
}

function formatClockTime_(value) {
  var raw = clean_(value, 20);
  var match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return raw;
  }
  var suffix = hour >= 12 ? 'PM' : 'AM';
  var displayHour = hour % 12 || 12;
  return displayHour + ':' + String(minute).padStart(2, '0') + ' ' + suffix;
}

function buildLeadNotes_(lead) {
  var notes = [];
  var customerNotes = clean_(lead.notes, 1000);
  var sourcePage = clean_(lead.source_page, 240);
  var preferredContact = clean_(lead.preferred_contact_method_label || lead.preferred_contact_method, 80);
  if (customerNotes) notes.push(customerNotes);
  if (sourcePage) notes.push('Website source page: ' + sourcePage);
  if (preferredContact) notes.push('Preferred contact: ' + preferredContact);
  return notes.join('\n');
}

function meaningfulChildCount_(lead) {
  if (typeof lead.exact_child_count === 'number') return lead.exact_child_count;
  var exact = clean_(lead.exact_child_count, 40);
  if (exact && exact !== 'Not provided') return exact;
  return clean_(lead.child_range, 80);
}

function requireSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('required_sheet_missing_' + name);
  return sheet;
}

function parseDate_(value) {
  var parsed = Date.parse(clean_(value, 80));
  return parsed ? new Date(parsed) : null;
}

function verifiedAck_(externalLeadId, internalLeadId, rowNumber, duplicate) {
  return {
    ok: true,
    verified: true,
    system: 'booking-control-center',
    sheet: LEADS_SHEET,
    externalLeadId: externalLeadId,
    internalLeadId: internalLeadId,
    rowNumber: rowNumber,
    duplicate: Boolean(duplicate)
  };
}

function hmacHex_(secret, payload) {
  var bytes = Utilities.computeHmacSha256Signature(payload, secret);
  return bytes.map(function (byte) {
    var unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 512);
}

function safeError_(err) {
  return clean_(err && err.message ? err.message : String(err), 180);
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * STAGING-ONLY schema preparation.
 * Adds only the three reserved integration headers to blank cells in a STAGING copy.
 * It refuses to run in production mode and never changes any existing nonblank header.
 */
function prepareStagingSchema() {
  var props = PropertiesService.getScriptProperties();
  if (clean_(props.getProperty('CRM_WRITE_MODE'), 20).toLowerCase() !== 'staging') {
    throw new Error('prepareStagingSchema_requires_staging_mode');
  }
  var ss = openAuthorizedSpreadsheet_();
  var sheet = requireSheet_(ss, LEADS_SHEET);
  var reserved = [
    { cell: 'AE1', header: EXTERNAL_ID_HEADER },
    { cell: 'AF1', header: OUTBOUND_MESSAGE_ID_HEADER },
    { cell: 'AG1', header: OUTBOUND_SENT_AT_HEADER }
  ];
  reserved.forEach(function (item) {
    var cell = sheet.getRange(item.cell);
    var current = clean_(cell.getDisplayValue(), 120);
    if (current && current !== item.header) throw new Error('reserved_header_cell_not_blank_' + item.cell);
    if (!current) cell.setValue(item.header);
  });
  SpreadsheetApp.flush();
  return { ok: true, spreadsheet: ss.getName(), headers: reserved.map(function (item) { return item.header; }) };
}
