#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('scripts/booking-control-center-crm-webhook.gs', 'utf8');
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function formatDateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function columnToNumber(column) {
  return column.split('').reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

function parseA1(a1) {
  const match = String(a1).match(/^([A-Z]+)(\d+)$/i);
  if (!match) throw new Error(`Unsupported A1 reference in test: ${a1}`);
  return { row: Number(match[2]), column: columnToNumber(match[1].toUpperCase()) };
}

class MockCell {
  constructor(sheet, row, column) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
  }

  setValue(value) {
    this.sheet.setValue(this.row, this.column, value);
    return this;
  }

  getDisplayValue() {
    return this.sheet.getDisplayValue(this.row, this.column);
  }

  getValue() {
    return this.sheet.getValue(this.row, this.column);
  }
}

class MockTextFinder {
  constructor(sheet, startRow, column, numRows, text) {
    this.sheet = sheet;
    this.startRow = startRow;
    this.column = column;
    this.numRows = numRows;
    this.text = String(text);
    this.entire = false;
  }

  matchEntireCell(value) {
    this.entire = Boolean(value);
    return this;
  }

  findNext() {
    for (let offset = 0; offset < this.numRows; offset += 1) {
      const row = this.startRow + offset;
      const value = this.sheet.getDisplayValue(row, this.column);
      const matched = this.entire ? value === this.text : value.includes(this.text);
      if (matched) return { getRow: () => row };
    }
    return null;
  }
}

class MockRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  setValue(value) {
    assert.equal(this.numRows, 1);
    assert.equal(this.numColumns, 1);
    this.sheet.setValue(this.row, this.column, value);
    return this;
  }

  getDisplayValue() {
    assert.equal(this.numRows, 1);
    assert.equal(this.numColumns, 1);
    return this.sheet.getDisplayValue(this.row, this.column);
  }

  getDisplayValues() {
    return Array.from({ length: this.numRows }, (_, rowOffset) =>
      Array.from({ length: this.numColumns }, (_, columnOffset) =>
        this.sheet.getDisplayValue(this.row + rowOffset, this.column + columnOffset),
      ),
    );
  }

  createTextFinder(text) {
    assert.equal(this.numColumns, 1);
    return new MockTextFinder(this.sheet, this.row, this.column, this.numRows, text);
  }
}

class MockLeadSheet {
  constructor(headers) {
    this.headers = headers;
    this.rows = new Map([[1, [...headers]]]);
  }

  getLastColumn() {
    return this.headers.length;
  }

  getLastRow() {
    let last = 1;
    for (const [row, values] of this.rows) {
      if (row > last && values.some((value) => value !== '' && value !== null && value !== undefined)) last = row;
    }
    return last;
  }

  getRange(rowOrA1, column, numRows = 1, numColumns = 1) {
    if (typeof rowOrA1 === 'string') {
      const parsed = parseA1(rowOrA1);
      return new MockRange(this, parsed.row, parsed.column);
    }
    return new MockRange(this, rowOrA1, column, numRows, numColumns);
  }

  getValue(row, column) {
    return this.rows.get(row)?.[column - 1] ?? '';
  }

  getDisplayValue(row, column) {
    const value = this.getValue(row, column);
    if (value instanceof Date) return value.toISOString();
    return value === null || value === undefined ? '' : String(value);
  }

  setValue(row, column, value) {
    if (!this.rows.has(row)) this.rows.set(row, Array(this.headers.length).fill(''));
    const values = this.rows.get(row);
    while (values.length < this.headers.length) values.push('');
    values[column - 1] = value;
  }

  column(header) {
    const index = this.headers.indexOf(header);
    assert.notEqual(index, -1, `Missing test header ${header}`);
    return index + 1;
  }

  seed(row, valuesByHeader) {
    for (const [header, value] of Object.entries(valuesByHeader)) {
      this.setValue(row, this.column(header), value);
    }
  }

  leadIds() {
    const column = this.column('Lead ID');
    const ids = [];
    for (let row = 2; row <= this.getLastRow(); row += 1) {
      const value = this.getDisplayValue(row, column);
      if (value) ids.push(value);
    }
    return ids;
  }
}

class MockIdControlSheet {
  constructor(leadSheet, nextSequence = 307) {
    this.leadSheet = leadSheet;
    this.values = new Map([
      ['5:2', nextSequence],
      ['6:2', '2026-08-20'],
    ]);
  }

  getRange(a1) {
    const { row, column } = parseA1(a1);
    return new MockCell(this, row, column);
  }

  getValue(row, column) {
    return this.values.get(`${row}:${column}`) ?? '';
  }

  getDisplayValue(row, column) {
    if (column !== 2) return String(this.getValue(row, column) ?? '');
    if (row === 7) {
      const sequence = Number(this.getValue(5, 2));
      const date = String(this.getValue(6, 2) || '').replace(/-/g, '');
      if (!sequence || !date) return '';
      return `LEAD-REAL-${date}-${String(sequence).padStart(3, '0')}`;
    }
    if (row === 8) {
      const candidate = this.getDisplayValue(7, 2);
      return candidate && !this.leadSheet.leadIds().includes(candidate) ? 'YES' : 'NO';
    }
    const value = this.getValue(row, column);
    return value === null || value === undefined ? '' : String(value);
  }

  setValue(row, column, value) {
    this.values.set(`${row}:${column}`, value);
  }
}

class MockSpreadsheet {
  constructor(nextSequence = 307) {
    this.headers = [
      'Lead ID', 'Created Date', 'Lead Source', 'Client Name', 'Client Phone', 'Client Email',
      'Event City', 'Event Address', 'Event Date', 'Requested Time Frame', 'Service Requested',
      'Estimated Kids / Guests', 'Party Theme', 'Parking Details', 'Table + Chairs Available?',
      'Notes', 'Pipeline Status', 'Quote Sent?', 'Quote Amount', 'Travel Fee', 'Retainer Requested?',
      'Retainer Paid?', 'Next Follow-Up Date', 'Last Contact Date', 'Assigned Owner',
      'Convert to Booking?', 'Linked Booking ID', 'Converted At', 'Lead Intent / Acquisition Type',
      'Platform Status', 'External Lead ID', 'Last Outbound Message ID', 'Last Outbound Sent At UTC',
    ];
    this.leads = new MockLeadSheet(this.headers);
    this.idControl = new MockIdControlSheet(this.leads, nextSequence);
  }

  getSheetByName(name) {
    if (name === '01_LEADS') return this.leads;
    if (name === '00_ID_CONTROL') return this.idControl;
    return null;
  }

  getName() {
    return 'Happy Faces LA Booking Control Center STAGING TEST';
  }

  getSpreadsheetTimeZone() {
    return 'America/Los_Angeles';
  }
}

function baseLead(overrides = {}) {
  return {
    lead_id: 'lead_test',
    created_at: '2026-08-20T19:07:48.428Z',
    first_name: 'Anna',
    last_name: 'Walker',
    phone: '3235550100',
    email: 'anna@example.com',
    event_city: 'Covina',
    event_venue_or_address: '',
    event_date: '2026-08-29',
    preferred_start_time: '14:00',
    estimated_service_end_time: '16:00',
    services_requested: ['face-painting'],
    exact_child_count: 10,
    child_range: '11-18',
    notes: 'Birthday party',
    source_page: '/plan-my-party/',
    preferred_contact_method_label: 'Email',
    source_confidence: 'gclid',
    gclid_present: 'yes',
    ...overrides,
  };
}

function loadScript() {
  const props = new Map();
  let openSpreadsheet = null;
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Error,
    Boolean,
    Utilities: {
      formatDate(date, timeZone) {
        return formatDateInZone(date, timeZone);
      },
      computeHmacSha256Signature() {
        return Array(32).fill(0);
      },
    },
    SpreadsheetApp: {
      flush() {},
      openById() {
        if (!openSpreadsheet) throw new Error('test_spreadsheet_not_registered');
        return openSpreadsheet;
      },
    },
    LockService: {
      getScriptLock() {
        return { waitLock() {}, releaseLock() {} };
      },
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return props.get(key) ?? null;
          },
        };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(value) {
        return { setMimeType() { return value; } };
      },
    },
  });
  vm.runInContext(source, context, { filename: 'booking-control-center-crm-webhook.gs' });
  return {
    context,
    props,
    setOpenSpreadsheet(value) {
      openSpreadsheet = value;
    },
  };
}

function rowValue(ss, row, header) {
  return ss.leads.getDisplayValue(row, ss.leads.column(header));
}

test('two sequential lead writes allocate unique IDs and advance literal Next Sequence', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(307);

  const first = context.writeLeadIntake_(ss, 'lead_first123', baseLead());
  assert.equal(first.internalLeadId, 'LEAD-REAL-20260820-307');
  assert.equal(first.duplicate, false);
  assert.equal(ss.idControl.getDisplayValue(5, 2), '308');

  const second = context.writeLeadIntake_(ss, 'lead_second456', baseLead({ first_name: 'Kayla' }));
  assert.equal(second.internalLeadId, 'LEAD-REAL-20260820-308');
  assert.equal(second.duplicate, false);
  assert.equal(ss.idControl.getDisplayValue(5, 2), '309');
  assert.deepEqual(ss.leads.leadIds(), ['LEAD-REAL-20260820-307', 'LEAD-REAL-20260820-308']);
});

test('duplicate external lead returns the same internal ID without consuming another sequence', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(307);
  const first = context.writeLeadIntake_(ss, 'lead_same123', baseLead());
  const nextBefore = ss.idControl.getDisplayValue(5, 2);
  const duplicate = context.writeLeadIntake_(ss, 'lead_same123', baseLead({ first_name: 'Changed' }));

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.internalLeadId, first.internalLeadId);
  assert.equal(ss.idControl.getDisplayValue(5, 2), nextBefore);
  assert.equal(ss.leads.getLastRow(), 2);
});

test('stale sequence collision is skipped instead of stopping future lead ingestion', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(307);
  ss.leads.seed(2, {
    'Lead ID': 'LEAD-REAL-20260820-307',
    'External Lead ID': 'lead_existing307',
  });

  const result = context.writeLeadIntake_(ss, 'lead_new308', baseLead());
  assert.equal(result.internalLeadId, 'LEAD-REAL-20260820-308');
  assert.equal(ss.idControl.getDisplayValue(5, 2), '309');
});

test('interrupted row with external ID and blank Lead ID is recovered in place', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(410);
  ss.leads.seed(2, {
    'External Lead ID': 'lead_recover410',
    'Client Name': 'partial write',
  });

  const result = context.writeLeadIntake_(ss, 'lead_recover410', baseLead({ first_name: 'Recovered' }));
  assert.equal(result.internalLeadId, 'LEAD-REAL-20260820-410');
  assert.equal(result.duplicate, true);
  assert.equal(ss.leads.getLastRow(), 2);
  assert.equal(rowValue(ss, 2, 'Client Name'), 'Recovered Walker');
  assert.equal(ss.idControl.getDisplayValue(5, 2), '411');
});

test('Google Ads attribution and service window survive CRM mapping without writing Last Contact Date', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(500);
  context.writeLeadIntake_(ss, 'lead_ads500', baseLead());

  assert.equal(rowValue(ss, 2, 'Lead Source'), 'Website / Plan My Party / Google Ads');
  assert.equal(rowValue(ss, 2, 'Requested Time Frame'), '2:00 PM to 4:00 PM');
  assert.equal(rowValue(ss, 2, 'Last Contact Date'), '');
  assert.equal(rowValue(ss, 2, 'Platform Status'), 'Website lead received and CRM verified');
  assert.equal(rowValue(ss, 2, 'External Lead ID'), 'lead_ads500');
});

test('non-paid Plan My Party lead remains a website lead without fake Google Ads attribution', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(520);
  context.writeLeadIntake_(ss, 'lead_organic520', baseLead({
    source_confidence: 'direct',
    gclid_present: 'no',
  }));
  assert.equal(rowValue(ss, 2, 'Lead Source'), 'Website / Plan My Party');
});

test('verified outbound writeback, not intake, sets Last Contact Date and quote status', () => {
  const { context } = loadScript();
  const ss = new MockSpreadsheet(600);
  context.writeLeadIntake_(ss, 'lead_outreach600', baseLead());
  assert.equal(rowValue(ss, 2, 'Last Contact Date'), '');

  context.writeOutreachResult_(ss, 'lead_outreach600', {
    message_id: 'gmail-message-600',
    sent_at_utc: '2026-08-20T20:15:00.000Z',
    quote_sent: true,
    next_follow_up_date: '2026-08-21',
  });
  assert.match(rowValue(ss, 2, 'Last Contact Date'), /^2026-08-20T20:15:00\.000Z$/);
  assert.equal(rowValue(ss, 2, 'Quote Sent?'), 'Yes');
  assert.equal(rowValue(ss, 2, 'Pipeline Status'), 'Quote Sent');
  assert.equal(rowValue(ss, 2, 'Last Outbound Message ID'), 'gmail-message-600');
  assert.equal(rowValue(ss, 2, 'Next Follow-Up Date'), '2026-08-21');
});

test('production schema preparation remains hard-blocked', () => {
  const runtime = loadScript();
  runtime.props.set('CRM_WRITE_MODE', 'production');
  assert.throws(() => runtime.context.prepareStagingSchema(), /prepareStagingSchema_requires_staging_mode/);
});

for (const { name, fn } of tests) {
  await fn();
  console.log(`PASS ${name}`);
}
console.log(`\n${tests.length} Booking Control Center webhook tests passed`);
