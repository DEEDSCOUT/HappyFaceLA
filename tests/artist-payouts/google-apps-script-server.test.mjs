import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { readCrmPayoutProjection } from "../../src/lib/artist-payouts/crm-adapter.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(
  ROOT,
  "integrations",
  "artist-payouts-google-apps-script",
);
const SECRET = "synthetic-apps-script-hmac-secret-at-least-32-characters";
const SPREADSHEET_ID = "syntheticBookingControlCenter1234567890";
const SHEET_IDS = Object.freeze({
  "02_BOOKINGS": 2,
  "03_PAYMENT_TRACKER": 3,
  "10_AUDIT_LOG": 10,
  "11_ARTIST_PAYMENTS": 11011,
  "12_ARTIST_ROSTER": 12012,
  "13_ARTIST_ASSIGNMENTS": 13013,
});

class FakeValidation {
  constructor(type, values = [], options = {}) {
    this.type = type;
    this.values = values;
    this.allowInvalid = options.allowInvalid ?? false;
    this.helpText = options.helpText ?? null;
  }
  getCriteriaType() {
    return this.type;
  }
  getCriteriaValues() {
    return this.values;
  }
  getAllowInvalid() {
    return this.allowInvalid;
  }
  getHelpText() {
    return this.helpText;
  }
}

class FakeValidationBuilder {
  constructor() {
    this.type = "NONE";
    this.values = [];
    this.allowInvalid = true;
    this.helpText = null;
  }
  requireValueInList(values) {
    this.type = "VALUE_IN_LIST";
    this.values = [values];
    return this;
  }
  requireFormulaSatisfied(value) {
    this.type = "CUSTOM_FORMULA";
    this.values = [value];
    return this;
  }
  requireCheckbox() {
    this.type = "CHECKBOX";
    this.values = [];
    return this;
  }
  setAllowInvalid(value) {
    this.allowInvalid = value;
    return this;
  }
  setHelpText(value) {
    this.helpText = value;
    return this;
  }
  build() {
    return new FakeValidation(this.type, this.values, {
      allowInvalid: this.allowInvalid,
      helpText: this.helpText,
    });
  }
}

function cellDisplay(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  return String(value);
}

function formatInTimezone(value, timezone, pattern) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (pattern === "yyyy-MM-dd") {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  if (pattern === "HH:mm:ss") {
    return `${parts.hour}:${parts.minute}:${parts.second}`;
  }
  if (pattern === "yyyy-MM-dd'T'HH:mm:ss") {
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }
  throw new Error(`Unexpected date pattern: ${pattern}`);
}

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }
  matrix(source) {
    return Array.from({ length: this.numRows }, (_, rowOffset) =>
      Array.from({ length: this.numColumns }, (_, columnOffset) =>
        this.sheet.cell(
          source,
          this.row - 1 + rowOffset,
          this.column - 1 + columnOffset,
        ),
      ),
    );
  }
  getValues() {
    return this.matrix("values");
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map(cellDisplay));
  }
  getFormulas() {
    return this.matrix("formulas");
  }
  getDataValidations() {
    return this.matrix("validations");
  }
  setValues(values) {
    assert.equal(values.length, this.numRows);
    values.forEach((row, rowOffset) => {
      assert.equal(row.length, this.numColumns);
      row.forEach((value, columnOffset) => {
        this.sheet.setCell(
          "values",
          this.row - 1 + rowOffset,
          this.column - 1 + columnOffset,
          value,
        );
      });
    });
    this.sheet.writeCount += 1;
    return this;
  }
  setValue(value) {
    return this.setValues(
      Array.from({ length: this.numRows }, () =>
        Array.from({ length: this.numColumns }, () => value),
      ),
    );
  }
  setDataValidation(validation) {
    for (let row = 0; row < this.numRows; row += 1) {
      for (let column = 0; column < this.numColumns; column += 1) {
        this.sheet.setCell(
          "validations",
          this.row - 1 + row,
          this.column - 1 + column,
          validation,
        );
      }
    }
    return this;
  }
  insertCheckboxes() {
    this.setDataValidation(
      new FakeValidation("CHECKBOX", [], {
        allowInvalid: false,
        helpText: null,
      }),
    );
    return this.setValue(false);
  }
  setNumberFormat() {
    return this;
  }
  copyTo() {
    return this;
  }
  setWrap() {
    return this;
  }
  setVerticalAlignment() {
    return this;
  }
  constantMatrix(value) {
    return Array.from({ length: this.numRows }, () =>
      Array.from({ length: this.numColumns }, () => value),
    );
  }
  getNumberFormats() {
    return this.constantMatrix("General");
  }
  getBackgrounds() {
    return this.constantMatrix("#ffffff");
  }
  getFontColors() {
    return this.constantMatrix("#000000");
  }
  getFontFamilies() {
    return this.constantMatrix("Arial");
  }
  getFontSizes() {
    return this.constantMatrix(10);
  }
  getFontStyles() {
    return this.constantMatrix("normal");
  }
  getFontWeights() {
    return this.constantMatrix("normal");
  }
  getHorizontalAlignments() {
    return this.constantMatrix("left");
  }
  getVerticalAlignments() {
    return this.constantMatrix("bottom");
  }
  getWrapStrategies() {
    return this.constantMatrix("OVERFLOW");
  }
  getRow() {
    return this.row;
  }
  getColumn() {
    return this.column;
  }
  getNumRows() {
    return this.numRows;
  }
  getNumColumns() {
    return this.numColumns;
  }
}

class FakeProtection {
  constructor(range) {
    this.range = range;
  }
  getRange() {
    return this.range;
  }
  isWarningOnly() {
    return false;
  }
  getDescription() {
    return "Synthetic base protection";
  }
}

class FakeSheet {
  constructor(name, rows) {
    this.name = name;
    this.sheetId = SHEET_IDS[name];
    this.values = rows.map((row) => [...row]);
    this.formulas = rows.map((row) => row.map(() => ""));
    this.validations = rows.map((row) => row.map(() => null));
    this.protections = [];
    this.sheetProtections = [];
    this.maxRows = Math.max(20, rows.length);
    this.maxColumns = rows[0].length;
    this.columnWidths = new Map();
    this.writeCount = 0;
  }
  ensure(source, row, column) {
    while (this[source].length <= row) this[source].push([]);
    while (this[source][row].length <= column) {
      this[source][row].push(
        source === "formulas" ? "" : source === "validations" ? null : "",
      );
    }
  }
  cell(source, row, column) {
    this.ensure(source, row, column);
    return this[source][row][column];
  }
  setCell(source, row, column, value) {
    this.ensure(source, row, column);
    this[source][row][column] = value;
  }
  getLastColumn() {
    return this.values[0].length;
  }
  getSheetId() {
    return this.sheetId;
  }
  getLastRow() {
    let last = 0;
    this.values.forEach((row, index) => {
      if (row.some((value) => value !== "" && value !== null)) last = index + 1;
    });
    return last;
  }
  getMaxRows() {
    return this.maxRows;
  }
  getRange(row, column, numRows = 1, numColumns = 1) {
    if (row < 1 || row + numRows - 1 > this.maxRows) {
      throw new Error("Synthetic range exceeds sheet row bounds");
    }
    if (column < 1 || column + numColumns - 1 > this.maxColumns) {
      throw new Error("Synthetic range exceeds sheet grid bounds");
    }
    return new FakeRange(this, row, column, numRows, numColumns);
  }
  getProtections(type) {
    return type === "SHEET" ? this.sheetProtections : this.protections;
  }
  getMaxColumns() {
    return this.maxColumns;
  }
  insertColumnsAfter(afterColumn, count) {
    assert.ok(afterColumn >= 1 && afterColumn <= this.maxColumns);
    for (const source of ["values", "formulas", "validations"]) {
      for (const row of this[source]) {
        const fill =
          source === "formulas" ? "" : source === "validations" ? null : "";
        row.splice(
          afterColumn,
          0,
          ...Array.from({ length: count }, () => fill),
        );
      }
    }
    this.maxColumns += count;
  }
  insertRowsAfter(afterRow, count) {
    assert.ok(afterRow >= 1 && afterRow <= this.maxRows);
    for (const source of ["values", "formulas", "validations"]) {
      const fill =
        source === "formulas" ? "" : source === "validations" ? null : "";
      const rows = Array.from({ length: count }, () =>
        Array.from({ length: this.maxColumns }, () => fill),
      );
      this[source].splice(afterRow, 0, ...rows);
    }
    this.maxRows += count;
  }
  getColumnWidth(column) {
    return this.columnWidths.get(column) ?? 100;
  }
  setColumnWidths(start, count, width) {
    for (let offset = 0; offset < count; offset += 1) {
      this.columnWidths.set(start + offset, width);
    }
  }
}

class FakeSpreadsheet {
  constructor(id, sheets) {
    this.id = id;
    this.sheets = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  }
  getId() {
    return this.id;
  }
  getSpreadsheetTimeZone() {
    return "America/Los_Angeles";
  }
  getSheetByName(name) {
    return this.sheets.get(name) ?? null;
  }
}

class FakeProperties {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }
  getProperty(key) {
    return this.entries.get(key) ?? null;
  }
  setProperty(key, value) {
    this.entries.set(key, String(value));
  }
  deleteProperty(key) {
    this.entries.delete(key);
  }
  getProperties() {
    return Object.fromEntries(this.entries);
  }
}

class FakeLock {
  waitLock() {}
  releaseLock() {}
}

function headers(context, sheetName, migrated = true) {
  const base = Array.from(context.HFLA_PAYOUT_SCHEMA.base[sheetName]);
  const extension = Array.from(
    context.HFLA_PAYOUT_SCHEMA.extensions[sheetName] ?? [],
  );
  return migrated ? [...base, ...extension] : base;
}

function recordRow(header, values) {
  return header.map((name) => values[name] ?? "");
}

function makeFixture(context, { migrated = true } = {}) {
  const bookingHeaders = headers(context, "02_BOOKINGS", false);
  const paymentTrackerHeaders = headers(context, "03_PAYMENT_TRACKER", false);
  const auditHeaders = headers(context, "10_AUDIT_LOG", false);
  const artistPaymentHeaders = headers(context, "11_ARTIST_PAYMENTS", migrated);
  const rosterHeaders = headers(context, "12_ARTIST_ROSTER", migrated);
  const assignmentHeaders = headers(context, "13_ARTIST_ASSIGNMENTS", migrated);
  const sheets = [
    new FakeSheet("02_BOOKINGS", [
      bookingHeaders,
      recordRow(bookingHeaders, {
        "Booking ID": "booking_A01",
        "Event Date": "2026-08-21",
        "Event Completed?": true,
      }),
    ]),
    new FakeSheet("03_PAYMENT_TRACKER", [paymentTrackerHeaders]),
    new FakeSheet("10_AUDIT_LOG", [auditHeaders]),
    new FakeSheet("11_ARTIST_PAYMENTS", [
      artistPaymentHeaders,
      recordRow(artistPaymentHeaders, {
        "Artist Payment ID": "payment_A01",
        "Booking ID": "booking_A01",
        "Event Date": "2026-08-21",
        "Artist Name": "Synthetic Artist",
        "Payment Method": "Synthetic rail preference",
        "Payment Handle": "synthetic-handle",
        "Service Pay": 200,
        "Travel Pay": 25,
        "Tip / Bonus": 5,
        "Total Artist Pay": 230,
        "Completion Confirmed?": true,
        "Approved By": "owner@example.test",
        "Payment Status": "Ready to Pay",
        "Artist ID": "artist_A01",
        "Assignment ID": "assignment_A01",
        "Pay Adjustment": 0,
        "Pay Deduction": 0,
      }),
    ]),
    new FakeSheet("12_ARTIST_ROSTER", [
      rosterHeaders,
      recordRow(rosterHeaders, {
        "Artist ID": "artist_A01",
        "Artist Status": "Active",
        "Preferred Name": "Synthetic Artist",
        Email: "artist@example.test",
        "Stripe Country": "US",
        "Stripe Legal Entity Type": "individual",
      }),
    ]),
    new FakeSheet("13_ARTIST_ASSIGNMENTS", [
      assignmentHeaders,
      recordRow(assignmentHeaders, {
        "Assignment ID": "assignment_A01",
        "Booking ID": "booking_A01",
        "Event Date": "2026-08-21",
        "Start Time": "10:00 AM",
        "End Time": "4:00 PM",
        "Client / Event Name": "Synthetic Celebration",
        "Service Role": "Face painting",
        "Artist ID": "artist_A01",
        "Artist Name": "Synthetic Artist",
        "Completed Confirmed?": true,
        "Actual End Time": "2026-08-21T23:30:00.000Z",
        "Agreed Service Pay": 200,
        "Agreed Travel Pay": 25,
        "Total Agreed Pay": 225,
        "Payment Record ID": "payment_A01",
        "Assignment Source Revision": 7,
        "Closeout Verified At": "2026-08-22T00:00:00.000Z",
        "Artist Completion Confirmed?": true,
        "Extra Time Reconciled?": true,
        "Service Change Reconciled?": true,
        "Travel Pay Reconciled?": true,
        "Adjustments Reconciled?": true,
        "No Customer Complaint Affecting Pay?": true,
        "No Refund Issue Affecting Pay?": true,
        "No Damage Or Supply Issue Affecting Pay?": true,
        "Compensation Approved?": true,
        "Contractor Control Satisfied?": true,
        "Closeout Status": "COMPLETE",
        "Assignment Policy Version": "artist-pay-v1",
      }),
    ]),
  ];
  const spreadsheet = new FakeSpreadsheet(SPREADSHEET_ID, sheets);
  const artistPayments = spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
  const totalColumn = artistPaymentHeaders.indexOf("Total Artist Pay");
  artistPayments.formulas[1][totalColumn] = "=M2+N2+O2";
  const statusColumn = artistPaymentHeaders.indexOf("Payment Status");
  artistPayments.validations[1][statusColumn] = new FakeValidation(
    "VALUE_IN_LIST",
    [["Pending", "Paid"]],
    { allowInvalid: false, helpText: "Existing validation" },
  );
  const roster = spreadsheet.getSheetByName("12_ARTIST_ROSTER");
  roster.formulas[1][rosterHeaders.indexOf("Preferred Name")] = "=C2";
  roster.validations[1][rosterHeaders.indexOf("Artist Status")] =
    new FakeValidation("VALUE_IN_LIST", [["Active", "Inactive"]], {
      allowInvalid: false,
      helpText: "Existing roster validation",
    });
  return spreadsheet;
}

function makeContext() {
  const properties = new FakeProperties();
  const logs = [];
  const state = { spreadsheet: null, openCalls: 0, driveVersion: "1592" };
  const context = vm.createContext({
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    Set,
    String,
    console: {
      log: (value) => logs.push(String(value)),
      error: (value) => logs.push(String(value)),
    },
    isNaN,
    encodeURIComponent,
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_algorithm, value) => [
        ...crypto.createHash("sha256").update(value).digest(),
      ],
      computeHmacSha256Signature: (value, secret) => [
        ...crypto.createHmac("sha256", secret).update(value).digest(),
      ],
      formatDate: (value, timezone, pattern) =>
        formatInTimezone(value, timezone, pattern),
    },
    PropertiesService: {
      getScriptProperties: () => properties,
    },
    LockService: {
      getScriptLock: () => new FakeLock(),
      getDocumentLock: () => new FakeLock(),
    },
    SpreadsheetApp: {
      ProtectionType: { RANGE: "RANGE", SHEET: "SHEET" },
      CopyPasteType: { PASTE_FORMAT: "PASTE_FORMAT" },
      openById: (id) => {
        state.openCalls += 1;
        assert.equal(id, SPREADSHEET_ID);
        return state.spreadsheet;
      },
      flush: () => {},
      newDataValidation: () => new FakeValidationBuilder(),
    },
    Drive: {
      Files: {
        get: (id) => {
          assert.equal(id, SPREADSHEET_ID);
          return { version: state.driveVersion };
        },
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (value) => ({
        value,
        setMimeType() {
          return this;
        },
      }),
    },
  });
  for (const filename of [
    "Schema.gs",
    "Security.gs",
    "Repository.gs",
    "Migration.gs",
    "Code.gs",
  ]) {
    vm.runInContext(
      fs.readFileSync(path.join(SOURCE, filename), "utf8"),
      context,
      { filename },
    );
  }
  state.spreadsheet = makeFixture(context);
  return { context, properties, state, logs };
}

function config(properties, environment = "sandbox") {
  return {
    properties,
    environment,
    spreadsheetId: SPREADSHEET_ID,
    secret: SECRET,
    origin: "https://script.google.com",
    paths: {
      artist_roster_read_v1: "/macros/s/synthetic/exec/artist-roster",
      artist_roster_list_v1: "/macros/s/synthetic/exec/artist-roster-list",
      artist_roster_projection_read_v1:
        "/macros/s/synthetic/exec/artist-roster-projection-read",
      artist_roster_projection_v1:
        "/macros/s/synthetic/exec/artist-roster-projection-write",
      crm_payout_source_read_v1:
        "/macros/s/synthetic/exec/payout-ledger-source",
      artist_payout_read_v1: "/macros/s/synthetic/exec/projection-read",
      artist_payout_projection_v1: "/macros/s/synthetic/exec/projection-write",
    },
    maxClockSkewSeconds: 300,
    activeArtistStatus: "Active",
  };
}

function signedRequest(context, cfg, operation, method, business, requestId) {
  const request = {
    operation,
    method,
    path: cfg.paths[operation],
    auth: {
      algorithm: "HFLA-HMAC-SHA256",
      version: "v1",
      environment: cfg.environment,
      operation,
      requestId,
      timestamp: new Date().toISOString(),
      signature: `v1=${"0".repeat(64)}`,
    },
    business,
  };
  const canonical = context.HflaPayoutServerTest.requestCanonical(request, cfg);
  request.auth.signature = `v1=${crypto.createHmac("sha256", SECRET).update(canonical).digest("hex")}`;
  return request;
}

function getEventFromRequest(request) {
  const parameter = {
    hflaAlgorithm: request.auth.algorithm,
    hflaVersion: request.auth.version,
    hflaEnvironment: request.auth.environment,
    hflaOperation: request.auth.operation,
    hflaRequestId: request.auth.requestId,
    hflaTimestamp: request.auth.timestamp,
    hflaSignature: request.auth.signature,
    ...request.business,
  };
  return {
    pathInfo: request.path.slice(request.path.lastIndexOf("/") + 1),
    parameter,
    parameters: Object.fromEntries(
      Object.entries(parameter).map(([key, value]) => [key, [value]]),
    ),
  };
}

function getEventFromUrl(value) {
  const endpoint = new URL(String(value));
  const parameters = {};
  for (const [key, entry] of endpoint.searchParams) {
    parameters[key] ??= [];
    parameters[key].push(entry);
  }
  return {
    pathInfo: endpoint.pathname.slice(endpoint.pathname.lastIndexOf("/") + 1),
    parameter: Object.fromEntries(
      Object.entries(parameters).map(([key, entries]) => [key, entries[0]]),
    ),
    parameters,
  };
}

function postEventFromRequest(request) {
  return {
    pathInfo: request.path.slice(request.path.lastIndexOf("/") + 1),
    parameter: {},
    parameters: {},
    postData: {
      type: "application/json; charset=utf-8",
      contents: JSON.stringify({
        auth: request.auth,
        payload: request.business,
      }),
    },
  };
}

function verifyResponse(envelope, request) {
  assert.deepEqual(Object.keys(envelope).sort(), ["auth", "payload"]);
  assert.ok(envelope.auth);
  assert.equal(envelope.auth.operation, request.operation);
  assert.equal(envelope.auth.requestId, request.auth.requestId);
  const payloadSha256 = crypto
    .createHash("sha256")
    .update(JSON.stringify(envelope.payload))
    .digest("hex");
  assert.equal(envelope.auth.payloadSha256, payloadSha256);
  const canonical = [
    "HFLA-APPS-SCRIPT-TRANSPORT",
    "v1",
    "response",
    request.operation,
    request.auth.environment,
    request.auth.requestId,
    envelope.auth.timestamp,
    payloadSha256,
  ].join("\n");
  const expected = `v1=${crypto.createHmac("sha256", SECRET).update(canonical).digest("hex")}`;
  assert.equal(envelope.auth.signature, expected);
}

function projection(sourceRevision, overrides = {}) {
  return {
    environment: "sandbox",
    ledgerId: "ledger_A01",
    bookingId: "booking_A01",
    assignmentId: "assignment_A01",
    artistId: "artist_A01",
    sourceRevision: 7,
    state: "PAYOUT_PENDING",
    batchId: "batch_20260822",
    batchDate: "2026-08-22",
    currency: "usd",
    amountCents: 23000,
    connectedAccountId: "acct_123456789012",
    transferId: "tr_123456789012",
    payoutId: "po_123456789012",
    payoutStatus: "pending",
    reconciled: false,
    reconciledAt: null,
    manualPayment: null,
    lastVerifiedAt: "2026-08-22T01:00:00.000Z",
    ...overrides,
    _sourceRevisionForTest: sourceRevision,
  };
}

function writePayload(expectedRevision, desired) {
  const { _sourceRevisionForTest: _ignored, ...safeProjection } = desired;
  return {
    operation: "artist_payout_projection_v1",
    expectedRecordId: "payment_A01",
    expectedRevision,
    projection: safeProjection,
  };
}

function rosterProjection(overrides = {}) {
  return {
    environment: "sandbox",
    artistId: "artist_A01",
    connectedAccountId: "acct_123456789012",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersEnabled: true,
    payoutReady: true,
    dashboardType: "express",
    preferredPayoutType: "automatic_standard",
    lastRequirementsCheckAt: "2026-08-22T01:00:00.000Z",
    onboardedDate: "2026-08-22",
    disabledReason: null,
    exceptionFlag: false,
    ...overrides,
  };
}

function rosterWritePayload(expectedRevision, desired) {
  return {
    operation: "artist_roster_projection_v1",
    expectedArtistId: "artist_A01",
    expectedRevision,
    projection: desired,
  };
}

test("signed roster and immutable closeout reads expose only approved fields", () => {
  const { context, properties } = makeContext();
  const cfg = config(properties);
  const rosterRequest = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_A01" },
    "request_roster_001",
  );
  const rosterResponse = context.HflaPayoutServerTest.executeRequest(
    rosterRequest,
    cfg,
    new Date(),
  );
  verifyResponse(rosterResponse, rosterRequest);
  assert.deepEqual(JSON.parse(JSON.stringify(rosterResponse.payload.artist)), {
    artistId: "artist_A01",
    displayName: "Synthetic Artist",
    contactEmail: "artist@example.test",
    country: "US",
    legalEntityType: "individual",
    active: true,
    revision: rosterResponse.payload.artist.revision,
  });
  assert.match(
    rosterResponse.payload.artist.revision,
    /^roster-revision:v1:[a-f0-9]{64}$/,
  );

  const rosterListRequest = signedRequest(
    context,
    cfg,
    "artist_roster_list_v1",
    "GET",
    { afterArtistId: "START" },
    "request_roster_list_001",
  );
  const rosterListResponse = context.HflaPayoutServerTest.executeRequest(
    rosterListRequest,
    cfg,
    new Date(),
  );
  verifyResponse(rosterListResponse, rosterListRequest);
  assert.equal(rosterListResponse.payload.totalActiveCount, 1);
  assert.equal(rosterListResponse.payload.complete, true);
  assert.equal(rosterListResponse.payload.nextAfterArtistId, null);
  assert.match(
    rosterListResponse.payload.rosterRevision,
    /^roster-list:v1:[a-f0-9]{64}$/,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(rosterListResponse.payload.artists)),
    [
      {
        artistId: "artist_A01",
        displayName: "Synthetic Artist",
        revision: rosterResponse.payload.artist.revision,
      },
    ],
  );

  const sourceRequest = signedRequest(
    context,
    cfg,
    "crm_payout_source_read_v1",
    "GET",
    { crmRecordId: "payment_A01" },
    "request_source_001",
  );
  const sourceResponse = context.HflaPayoutServerTest.executeRequest(
    sourceRequest,
    cfg,
    new Date(),
  );
  verifyResponse(sourceResponse, sourceRequest);
  assert.equal(sourceResponse.payload.source.totalApprovedPayCents, 23000);
  assert.equal(
    sourceResponse.payload.source.eventName,
    "Synthetic Celebration",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceResponse.payload.source.priorPayment)),
    {
      disposition: "CLEAR",
      reasonCodes: [],
      legacyPaymentMethodPresent: true,
      legacyPaymentHandlePresent: true,
    },
  );
  assert.equal(Object.keys(sourceResponse.payload.source.closeout).length, 20);
  assert.equal(
    sourceResponse.payload.source.closeout.compensationApproved,
    true,
  );
  const serialized = JSON.stringify(sourceResponse.payload);
  for (const forbidden of [
    "Payment Handle",
    "W-9",
    "bank",
    "tax",
    "onboarding link",
    "onboardingUrl",
    "Artist Phone",
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
    );
  }
});

test("Apps Script business and active-roster row IDs admit 120 characters and reject 121 or reserved START", () => {
  const maxArtistId = `A${"a".repeat(119)}`;
  const overlongArtistId = `A${"a".repeat(120)}`;
  {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const roster = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
    const artistIdColumn = roster.values[0].indexOf("Artist ID");
    roster.values[1][artistIdColumn] = maxArtistId;
    assert.equal(context.safeBusinessId_(maxArtistId), true);
    assert.equal(context.safeBusinessId_(overlongArtistId), false);

    const exactRead = signedRequest(
      context,
      cfg,
      "artist_roster_read_v1",
      "GET",
      { artistId: maxArtistId },
      "request_roster_id_bound_read",
    );
    const exactResponse = context.HflaPayoutServerTest.executeRequest(
      exactRead,
      cfg,
      new Date(),
    );
    verifyResponse(exactResponse, exactRead);
    assert.equal(exactResponse.payload.artist.artistId, maxArtistId);

    const listRead = signedRequest(
      context,
      cfg,
      "artist_roster_list_v1",
      "GET",
      { afterArtistId: "START" },
      "request_roster_id_bound_list",
    );
    const listResponse = context.HflaPayoutServerTest.executeRequest(
      listRead,
      cfg,
      new Date(),
    );
    verifyResponse(listResponse, listRead);
    assert.equal(listResponse.payload.artists[0].artistId, maxArtistId);
    assert.throws(
      () =>
        signedRequest(
          context,
          cfg,
          "artist_roster_read_v1",
          "GET",
          { artistId: overlongArtistId },
          "request_roster_id_bound_reject",
        ),
      /query identity is malformed/,
    );
  }

  for (const invalidRowId of [overlongArtistId, "START"]) {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const roster = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
    const artistIdColumn = roster.values[0].indexOf("Artist ID");
    roster.values[1][artistIdColumn] = invalidRowId;
    const listRead = signedRequest(
      context,
      cfg,
      "artist_roster_list_v1",
      "GET",
      { afterArtistId: "START" },
      invalidRowId === "START"
        ? "request_roster_reserved_id_reject"
        : "request_roster_row_bound_reject",
    );
    const listResponse = context.HflaPayoutServerTest.executeRequest(
      listRead,
      cfg,
      new Date(),
    );
    verifyResponse(listResponse, listRead);
    assert.deepEqual(JSON.parse(JSON.stringify(listResponse.payload)), {
      ok: false,
      error: "REQUEST_FAILED_CLOSED",
    });
  }
});

test("prior-payment evidence is classified fail closed while a payment-method preference alone remains clear", () => {
  const scenarios = [
    {
      field: "Payment Status",
      value: "Paid",
      reason: "LEGACY_STATUS_NOT_EXPLICITLY_UNPAID",
    },
    {
      field: "Paid Date",
      value: "2026-08-22",
      reason: "LEGACY_PAID_DATE_PRESENT",
    },
    {
      field: "Payment Memo Used",
      value: "synthetic evidence memo",
      reason: "LEGACY_PAYMENT_MEMO_PRESENT",
    },
    {
      field: "Receipt Screenshot Link",
      value: "https://example.test/synthetic-receipt",
      reason: "LEGACY_RECEIPT_REFERENCE_PRESENT",
    },
    {
      field: "Reconciled?",
      value: true,
      reason: "LEGACY_RECONCILED",
    },
    {
      field: "Payout State",
      value: "PAYOUT_PENDING",
      reason: "EXISTING_PAYOUT_PROJECTION_PRESENT",
    },
  ];
  for (const scenario of scenarios) {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const sheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
    const header = sheet.values[0];
    sheet.values[1][header.indexOf(scenario.field)] = scenario.value;
    const request = signedRequest(
      context,
      cfg,
      "crm_payout_source_read_v1",
      "GET",
      { crmRecordId: "payment_A01" },
      `request_prior_payment_${scenario.field.replace(/[^A-Za-z]/g, "_")}`,
    );
    const response = context.HflaPayoutServerTest.executeRequest(
      request,
      cfg,
      new Date(),
    );
    assert.equal(
      response.payload.source.priorPayment.disposition,
      "OWNER_REVIEW_REQUIRED",
      scenario.field,
    );
    assert.ok(
      response.payload.source.priorPayment.reasonCodes.includes(
        scenario.reason,
      ),
      scenario.field,
    );
    assert.equal(
      response.payload.source.priorPayment.legacyPaymentMethodPresent,
      true,
      scenario.field,
    );
  }
});

test("legacy closeout issue text distinguishes clean, unresolved, and explicitly reconciled records", () => {
  const scenarios = [
    {
      label: "clean no-issue text",
      issue: "No issue reported",
      extraReconciled: true,
      serviceReconciled: true,
      expectedExtra: true,
      expectedService: true,
      closeoutStatus: "COMPLETE",
    },
    {
      label: "genuine issue remains unreconciled",
      issue: "Client requested thirty extra minutes",
      extraReconciled: false,
      serviceReconciled: false,
      expectedExtra: false,
      expectedService: false,
      closeoutStatus: "PENDING",
    },
    {
      label: "genuine issue is explicitly reconciled",
      issue: "Client requested thirty extra minutes",
      extraReconciled: true,
      serviceReconciled: true,
      expectedExtra: true,
      expectedService: true,
      closeoutStatus: "COMPLETE",
    },
  ];
  for (const scenario of scenarios) {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const sheet = state.spreadsheet.getSheetByName("13_ARTIST_ASSIGNMENTS");
    const header = sheet.values[0];
    sheet.values[1][header.indexOf("Extra Time / Issue Flag")] = scenario.issue;
    sheet.values[1][header.indexOf("Extra Time Reconciled?")] =
      scenario.extraReconciled;
    sheet.values[1][header.indexOf("Service Change Reconciled?")] =
      scenario.serviceReconciled;
    sheet.values[1][header.indexOf("Closeout Status")] =
      scenario.closeoutStatus;
    const result = context.authoritativePayoutSource_(
      state.spreadsheet,
      "payment_A01",
      cfg,
    ).source;
    assert.equal(
      result.closeout.extraTimeReconciled,
      scenario.expectedExtra,
      scenario.label,
    );
    assert.equal(
      result.closeout.serviceChangeReconciled,
      scenario.expectedService,
      scenario.label,
    );
    assert.equal(JSON.stringify(result).includes(scenario.issue), false);
  }
});

test("sheet money boundary parses exact displayed decimals into integer cents", () => {
  const { context } = makeContext();
  assert.equal(context.moneyToCents_("0.30", "amount", false), 30);
  assert.equal(
    context.moneyToCents_((0.1 + 0.2).toFixed(2), "amount", false),
    30,
  );
  assert.throws(
    () => context.moneyToCents_(0.1 + 0.2, "amount", false),
    /supported US decimal money value/,
  );
  assert.equal(context.moneyToCents_("$1,234.56", "amount", false), 123456);
  assert.equal(context.moneyToCents_("-12.34", "adjustment", true), -1234);
  assert.throws(
    () => context.moneyToCents_("1.001", "amount", false),
    /supported US decimal money value/,
  );
  assert.throws(
    () => context.moneyToCents_("1.234,56", "amount", false),
    /supported US decimal money value/,
  );
  assert.throws(
    () => context.moneyToCents_("$1,000,000,000.01", "amount", false),
    /safe bound/,
  );
  assert.throws(
    () => context.moneyToCents_("-0.01", "deduction", false),
    /invalid sign/,
  );
});

test("audited time-only Actual End Time derives an exact Los Angeles instant and fails closed on ambiguity", () => {
  const { context } = makeContext();
  const derive = (eventDate, start, end, actual) =>
    context.actualEndInstant_(
      {
        "Start Time": start,
        "End Time": end,
        "Actual End Time": actual,
      },
      { "Start Time": "", "End Time": "", "Actual End Time": "" },
      eventDate,
      "America/Los_Angeles",
    );
  assert.equal(
    derive(
      "2026-08-21",
      "10:00 AM",
      "4:00 PM",
      new Date("1899-12-30T21:30:00.000Z"),
    ),
    "2026-08-21T20:30:00.000Z",
  );
  assert.equal(
    derive("2026-08-21", "10:00 PM", "1:00 AM", "12:30 AM"),
    "2026-08-22T07:30:00.000Z",
  );
  assert.throws(
    () => derive("2026-11-01", "12:30 AM", "2:30 AM", "1:30 AM"),
    /nonexistent or ambiguous/,
  );
  assert.throws(
    () => derive("2026-03-08", "1:00 AM", "3:30 AM", "2:30 AM"),
    /nonexistent or ambiguous/,
  );
  assert.throws(
    () => derive("2026-08-21", "10:00 AM", "4:00 PM", "1:30 AM"),
    /unapproved overnight/,
  );
  assert.throws(
    () => derive("2026-08-21", "10:00 AM", "4:00 PM", "1:30-ish"),
    /approved time-of-day format/,
  );
});

test("assignment policy and independently derived closeout status are revision-bound", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const sheet = state.spreadsheet.getSheetByName("13_ARTIST_ASSIGNMENTS");
  const header = sheet.values[0];
  const policyColumn = header.indexOf("Assignment Policy Version");
  const statusColumn = header.indexOf("Closeout Status");
  const controlColumn = header.indexOf("Travel Pay Reconciled?");
  const first = context.authoritativePayoutSource_(
    state.spreadsheet,
    "payment_A01",
    cfg,
  ).source;
  sheet.values[1][policyColumn] = "artist-pay-v2";
  const revised = context.authoritativePayoutSource_(
    state.spreadsheet,
    "payment_A01",
    cfg,
  ).source;
  assert.notEqual(first.revision, revised.revision);
  assert.equal("assignmentPolicyVersion" in revised, false);

  sheet.values[1][policyColumn] = "";
  assert.throws(
    () =>
      context.authoritativePayoutSource_(state.spreadsheet, "payment_A01", cfg),
    /policy version/,
  );
  sheet.values[1][policyColumn] = "artist-pay-v1";
  sheet.values[1][controlColumn] = false;
  sheet.values[1][statusColumn] = "COMPLETE";
  assert.throws(
    () =>
      context.authoritativePayoutSource_(state.spreadsheet, "payment_A01", cfg),
    /status contradicts/,
  );
});

test("tampering, cross-environment substitution, and nonce content changes fail before workbook access", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const request = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_A01" },
    "request_security_001",
  );
  request.business.artistId = "artist_B02";
  assert.throws(
    () => context.HflaPayoutServerTest.executeRequest(request, cfg, new Date()),
    /signature verification failed/,
  );
  assert.equal(state.openCalls, 0);

  const crossEnvironment = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_A01" },
    "request_security_002",
  );
  crossEnvironment.auth.environment = "live";
  assert.throws(
    () =>
      context.HflaPayoutServerTest.executeRequest(
        crossEnvironment,
        cfg,
        new Date(),
      ),
    /environment does not match/,
  );
  assert.equal(state.openCalls, 0);

  const first = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_A01" },
    "request_security_003",
  );
  assert.equal(
    context.HflaPayoutServerTest.executeRequest(first, cfg, new Date()).payload
      .ok,
    true,
  );
  const reused = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_B02" },
    "request_security_003",
  );
  assert.throws(
    () => context.HflaPayoutServerTest.executeRequest(reused, cfg, new Date()),
    /request ID was reused for different content/,
  );
});

test("exact signed replay is idempotent and response substitution is detectable", () => {
  const { context, properties } = makeContext();
  const cfg = config(properties);
  const request = signedRequest(
    context,
    cfg,
    "artist_roster_read_v1",
    "GET",
    { artistId: "artist_A01" },
    "request_replay_001",
  );
  const first = context.HflaPayoutServerTest.executeRequest(
    request,
    cfg,
    new Date(),
  );
  const second = context.HflaPayoutServerTest.executeRequest(
    request,
    cfg,
    new Date(),
  );
  assert.equal(first.payload.ok, true);
  assert.deepEqual(first.payload, second.payload);
  verifyResponse(second, request);
  const substituted = structuredClone(second);
  substituted.payload.artist.artistId = "artist_B02";
  assert.throws(() => verifyResponse(substituted, request));
});

test("HTTP seams accept only exact signed GET queries and POST envelopes", () => {
  const { context, properties } = makeContext();
  const cfg = config(properties);
  const getRequest = signedRequest(
    context,
    cfg,
    "artist_roster_projection_read_v1",
    "GET",
    { environment: "sandbox", artistId: "artist_A01" },
    "request_http_get_001",
  );
  const getEvent = getEventFromRequest(getRequest);
  const parsedGet = context.HflaPayoutServerTest.requestFromGet(getEvent, cfg);
  assert.equal(parsedGet.operation, "artist_roster_projection_read_v1");
  assert.deepEqual(
    JSON.parse(JSON.stringify(parsedGet.business)),
    getRequest.business,
  );
  const extraGet = structuredClone(getEvent);
  extraGet.parameter.unapproved = "value";
  extraGet.parameters.unapproved = ["value"];
  assert.throws(
    () => context.HflaPayoutServerTest.requestFromGet(extraGet, cfg),
    /missing or extra fields/,
  );
  const duplicateGet = structuredClone(getEvent);
  duplicateGet.parameters.artistId.push("artist_A01");
  assert.throws(
    () => context.HflaPayoutServerTest.requestFromGet(duplicateGet, cfg),
    /duplicate field/,
  );

  const postRequest = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    rosterWritePayload(
      "roster-revision:v1:" + "0".repeat(64),
      rosterProjection(),
    ),
    "request_http_post_001",
  );
  const postEvent = postEventFromRequest(postRequest);
  const parsedPost = context.HflaPayoutServerTest.requestFromPost(
    postEvent,
    cfg,
  );
  assert.equal(parsedPost.operation, "artist_roster_projection_v1");
  assert.deepEqual(
    JSON.parse(JSON.stringify(parsedPost.business)),
    postRequest.business,
  );
  const extraPost = structuredClone(postEvent);
  const extraEnvelope = JSON.parse(extraPost.postData.contents);
  extraEnvelope.unapproved = true;
  extraPost.postData.contents = JSON.stringify(extraEnvelope);
  assert.throws(
    () => context.HflaPayoutServerTest.requestFromPost(extraPost, cfg),
    /missing or unapproved fields/,
  );
  const queryPost = structuredClone(postEvent);
  queryPost.parameter.unapproved = "value";
  queryPost.parameters.unapproved = ["value"];
  assert.throws(
    () => context.HflaPayoutServerTest.requestFromPost(queryPost, cfg),
    /query fields are not allowed/,
  );
  const badMediaType = structuredClone(postEvent);
  badMediaType.postData.type = "application/jsonp";
  assert.throws(
    () => context.HflaPayoutServerTest.requestFromPost(badMediaType, cfg),
    /body is missing or unsafe/,
  );
  assert.throws(
    () => context.parseHttpsOrigin_("https://example.test"),
    /canonical Apps Script origin/,
  );
  assert.throws(
    () => context.parseRoutePath_("/unbound/path"),
    /canonical Apps Script path/,
  );
});

test("roster status projection uses signed CAS, preserves source cells, and reads back only safe fields", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const initialRead = signedRequest(
    context,
    cfg,
    "artist_roster_projection_read_v1",
    "GET",
    { environment: "sandbox", artistId: "artist_A01" },
    "request_roster_projection_initial",
  );
  const initialResponse = context.HflaPayoutServerTest.executeRequest(
    initialRead,
    cfg,
    new Date(),
  );
  verifyResponse(initialResponse, initialRead);
  assert.equal(initialResponse.payload.environment, "sandbox");
  assert.equal(initialResponse.payload.artistId, "artist_A01");
  assert.deepEqual(
    JSON.parse(JSON.stringify(initialResponse.payload.projection)),
    {},
  );
  assert.match(
    initialResponse.payload.revision,
    /^roster-revision:v1:[a-f0-9]{64}$/,
  );

  const sheet = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
  const sourceWidth =
    context.HFLA_PAYOUT_SCHEMA.base["12_ARTIST_ROSTER"].length + 2;
  const sourceBefore = structuredClone(sheet.values[1].slice(0, sourceWidth));
  const formulasBefore = [...sheet.formulas[1]];
  const validationsBefore = [...sheet.validations[1]];
  const desired = rosterProjection();
  const write = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    rosterWritePayload(initialResponse.payload.revision, desired),
    "request_roster_projection_write",
  );
  const writeResponse = context.HflaPayoutServerTest.executeRequest(
    write,
    cfg,
    new Date(),
  );
  verifyResponse(writeResponse, write);
  assert.equal(writeResponse.payload.ok, true);
  assert.equal(writeResponse.payload.environment, "sandbox");
  assert.match(
    writeResponse.payload.revision,
    /^roster-projection:v1:[a-f0-9]{64}$/,
  );
  assert.deepEqual(sheet.values[1].slice(0, sourceWidth), sourceBefore);
  assert.deepEqual(sheet.formulas[1], formulasBefore);
  assert.deepEqual(sheet.validations[1], validationsBefore);

  const readback = signedRequest(
    context,
    cfg,
    "artist_roster_projection_read_v1",
    "GET",
    { environment: "sandbox", artistId: "artist_A01" },
    "request_roster_projection_readback",
  );
  const readbackResponse = context.HflaPayoutServerTest.executeRequest(
    readback,
    cfg,
    new Date(),
  );
  verifyResponse(readbackResponse, readback);
  assert.equal(
    readbackResponse.payload.revision,
    writeResponse.payload.revision,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(readbackResponse.payload.projection)),
    desired,
  );
  const serialized = JSON.stringify(readbackResponse.payload);
  for (const forbidden of [
    "phone",
    "email",
    "paymentHandle",
    "w-9",
    "tax",
    "bank",
    "secureDocs",
    "onboardingLink",
    "onboardingUrl",
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
    );
  }
  const audit = state.spreadsheet.getSheetByName("10_AUDIT_LOG");
  assert.equal(audit.values[1][2], "Artist Roster Payout");
  assert.equal(audit.values[1][3], "artist_roster_projection_v1");
  assert.equal(JSON.stringify(audit.values).includes(SECRET), false);
  assert.equal(
    JSON.stringify(audit.values).includes(write.auth.signature),
    false,
  );
});

test("roster status exact replay is mutation-idempotent and conflicting or substituted accounts fail closed", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const artist = context.readArtistIdentity_(
    state.spreadsheet,
    "artist_A01",
    cfg,
  );
  const payload = rosterWritePayload(artist.revision, rosterProjection());
  const first = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    payload,
    "request_roster_idempotent_001",
  );
  const firstResponse = context.HflaPayoutServerTest.executeRequest(
    first,
    cfg,
    new Date(),
  );
  assert.equal(firstResponse.payload.ok, true);
  const sheet = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
  const writesAfterFirst = sheet.writeCount;

  const replay = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    payload,
    "request_roster_idempotent_002",
  );
  const replayResponse = context.HflaPayoutServerTest.executeRequest(
    replay,
    cfg,
    new Date(),
  );
  assert.equal(replayResponse.payload.ok, true);
  assert.equal(replayResponse.payload.revision, firstResponse.payload.revision);
  assert.equal(sheet.writeCount, writesAfterFirst);

  const changed = rosterProjection({
    onboardingStatus: "RESTRICTED",
    requirementsStatus: "past_due",
    transfersEnabled: false,
    payoutReady: false,
    exceptionFlag: true,
  });
  const conflict = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    rosterWritePayload("roster-projection:v1:" + "0".repeat(64), changed),
    "request_roster_conflict_001",
  );
  const conflictResponse = context.HflaPayoutServerTest.executeRequest(
    conflict,
    cfg,
    new Date(),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(conflictResponse.payload)), {
    ok: false,
    error: "REQUEST_FAILED_CLOSED",
  });

  const substituted = signedRequest(
    context,
    cfg,
    "artist_roster_projection_v1",
    "POST",
    rosterWritePayload(
      firstResponse.payload.revision,
      rosterProjection({ connectedAccountId: "acct_999999999999" }),
    ),
    "request_roster_account_substitution",
  );
  const substitutedResponse = context.HflaPayoutServerTest.executeRequest(
    substituted,
    cfg,
    new Date(),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(substitutedResponse.payload)), {
    ok: false,
    error: "REQUEST_FAILED_CLOSED",
  });
  assert.equal(sheet.writeCount, writesAfterFirst);
});

test("roster status projection rejects contradictory state, unsafe extras, and target protections", () => {
  {
    const { context, properties } = makeContext();
    const restrictedWithActiveTransfers = rosterProjection({
      onboardingStatus: "RESTRICTED",
      requirementsStatus: "past_due",
      transfersEnabled: true,
      payoutReady: false,
      disabledReason: "requirements_past_due",
      exceptionFlag: true,
    });
    assert.doesNotThrow(() =>
      context.assertRosterProjectionPayload_(
        rosterWritePayload(
          "roster-revision:v1:" + "0".repeat(64),
          restrictedWithActiveTransfers,
        ),
        config(properties),
      ),
    );
  }
  const cases = [
    [
      rosterProjection({ transfersEnabled: false }),
      /requires transfers enabled/,
    ],
    [
      rosterProjection({ requirementsStatus: "pending" }),
      /requires complete requirements/,
    ],
    [
      rosterProjection({
        onboardingStatus: "ONBOARDING_COMPLETE",
        transfersEnabled: false,
        payoutReady: false,
        onboardedDate: null,
      }),
      /requires a date/,
    ],
    [
      rosterProjection({
        onboardingStatus: "TRANSFERS_ENABLED",
        transfersEnabled: false,
        payoutReady: false,
      }),
      /transfer capability state is contradictory/,
    ],
    [
      rosterProjection({
        onboardingStatus: "RESTRICTED",
        transfersEnabled: false,
        payoutReady: false,
      }),
      /exception state is contradictory/,
    ],
    [
      rosterProjection({ lastRequirementsCheckAt: "2026-08-22T01:00:00Z" }),
      /canonical ISO UTC instant/,
    ],
    [
      rosterProjection({
        onboardingStatus: "RESTRICTED",
        requirementsStatus: "past_due",
        transfersEnabled: false,
        payoutReady: false,
        disabledReason: "https://onboarding.example.test/secret",
        exceptionFlag: true,
      }),
      /disabled reason is not a safe code/,
    ],
  ];
  for (const [desired, expected] of cases) {
    const { context, properties } = makeContext();
    assert.throws(
      () =>
        context.assertRosterProjectionPayload_(
          rosterWritePayload("roster-revision:v1:" + "0".repeat(64), desired),
          config(properties),
        ),
      expected,
    );
  }

  {
    const { context, properties } = makeContext();
    const desired = {
      ...rosterProjection(),
      onboardingLink: "https://example.test",
    };
    assert.throws(
      () =>
        context.assertRosterProjectionPayload_(
          rosterWritePayload("roster-revision:v1:" + "0".repeat(64), desired),
          config(properties),
        ),
      /missing or unapproved fields/,
    );
  }

  for (const protectionType of ["formula", "protected", "sheet-protected"]) {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const sheet = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
    const targetColumn =
      sheet.values[0].indexOf("Stripe Connected Account ID") + 1;
    if (protectionType === "formula") {
      sheet.formulas[1][targetColumn - 1] = "=1";
    } else if (protectionType === "protected") {
      sheet.protections.push(
        new FakeProtection(sheet.getRange(2, targetColumn, 1, 1)),
      );
    } else {
      sheet.sheetProtections.push(
        new FakeProtection(
          sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()),
        ),
      );
    }
    const artist = context.readArtistIdentity_(
      state.spreadsheet,
      "artist_A01",
      cfg,
    );
    const request = signedRequest(
      context,
      cfg,
      "artist_roster_projection_v1",
      "POST",
      rosterWritePayload(artist.revision, rosterProjection()),
      `request_roster_target_${protectionType}`,
    );
    const response = context.HflaPayoutServerTest.executeRequest(
      request,
      cfg,
      new Date(),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(response.payload)), {
      ok: false,
      error: "REQUEST_FAILED_CLOSED",
    });
  }
});

test("real Apps Script signed readback returns JSON null so pristine manual-payment cancellation can proceed", async () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const source = context.authoritativePayoutSource_(
    state.spreadsheet,
    "payment_A01",
    cfg,
  ).source;
  const { _sourceRevisionForTest: _ignored, ...stored } = projection(
    source.revision,
  );
  const expected = {
    ...stored,
    expectedCrmRecordId: "payment_A01",
    expectedCrmRevision: source.revision,
  };
  let calls = 0;
  let signedEnvelope;
  const receipt = await readCrmPayoutProjection(
    expected,
    {
      readUrl: `${cfg.origin}${cfg.paths.artist_payout_read_v1}`,
      writeUrl: `${cfg.origin}${cfg.paths.artist_payout_projection_v1}`,
      allowedOrigin: cfg.origin,
      secret: SECRET,
    },
    async (url, init) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(init.method, "GET");
        const request = context.HflaPayoutServerTest.requestFromGet(
          getEventFromUrl(url),
          cfg,
        );
        signedEnvelope = context.HflaPayoutServerTest.executeRequest(
          request,
          cfg,
          new Date(),
        );
        return new Response(null, {
          status: 302,
          headers: {
            location:
              "https://script.googleusercontent.com/macros/echo?user_content_key=crm-null",
          },
        });
      }
      assert.equal(
        String(url),
        "https://script.googleusercontent.com/macros/echo?user_content_key=crm-null",
      );
      return new Response(JSON.stringify(signedEnvelope), {
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(calls, 2);
  assert.equal(
    JSON.stringify(signedEnvelope).includes('"projection":null'),
    true,
  );
  assert.deepEqual(receipt, {
    recordId: "payment_A01",
    revision: source.revision,
    requestId: receipt.requestId,
    projection: null,
    recovered: false,
  });
});

test("projection CAS writes only additive fields, preserves formula validation and IDs, and reads back exactly", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const sourceRequest = signedRequest(
    context,
    cfg,
    "crm_payout_source_read_v1",
    "GET",
    { crmRecordId: "payment_A01" },
    "request_source_for_write",
  );
  const sourceResponse = context.HflaPayoutServerTest.executeRequest(
    sourceRequest,
    cfg,
    new Date(),
  );
  const sourceRevision = sourceResponse.payload.source.revision;
  const desired = projection(sourceRevision);
  const payload = writePayload(sourceRevision, desired);
  const sheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
  const headers = sheet.values[0];
  const baseBefore = structuredClone(
    sheet.values[1].slice(
      0,
      context.HFLA_PAYOUT_SCHEMA.base["11_ARTIST_PAYMENTS"].length,
    ),
  );
  const formulasBefore = [...sheet.formulas[1]];
  const validationsBefore = [...sheet.validations[1]];
  const request = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    payload,
    "request_write_001",
  );
  const response = context.HflaPayoutServerTest.executeRequest(
    request,
    cfg,
    new Date(),
  );
  verifyResponse(response, request);
  assert.equal(response.payload.ok, true);
  assert.match(
    response.payload.revision,
    /^payout-projection:v1:[a-f0-9]{64}$/,
  );
  assert.deepEqual(sheet.values[1].slice(0, baseBefore.length), baseBefore);
  assert.deepEqual(sheet.formulas[1], formulasBefore);
  assert.deepEqual(sheet.validations[1], validationsBefore);
  assert.equal(
    sheet.values[1][headers.indexOf("Artist Payment ID")],
    "payment_A01",
  );
  assert.equal(sheet.values[1][headers.indexOf("Booking ID")], "booking_A01");
  assert.equal(
    sheet.values[1][headers.indexOf("Assignment ID")],
    "assignment_A01",
  );
  assert.equal(sheet.values[1][headers.indexOf("Artist ID")], "artist_A01");

  const readRequest = signedRequest(
    context,
    cfg,
    "artist_payout_read_v1",
    "GET",
    {
      environment: "sandbox",
      ledgerId: "ledger_A01",
      bookingId: "booking_A01",
      assignmentId: "assignment_A01",
      recordId: "payment_A01",
    },
    "request_readback_001",
  );
  const readResponse = context.HflaPayoutServerTest.executeRequest(
    readRequest,
    cfg,
    new Date(),
  );
  verifyResponse(readResponse, readRequest);
  assert.deepEqual(
    JSON.parse(JSON.stringify(readResponse.payload.projection)),
    payload.projection,
  );
  assert.equal(readResponse.payload.revision, response.payload.revision);
  const auditText = JSON.stringify(
    state.spreadsheet.getSheetByName("10_AUDIT_LOG").values,
  );
  assert.equal(auditText.includes(SECRET), false);
  assert.equal(auditText.includes(request.auth.signature), false);
});

test("formula-prefixed projection free text is rejected before any value, formula, audit, or revision mutation", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const sourceResponse = context.HflaPayoutServerTest.executeRequest(
    signedRequest(
      context,
      cfg,
      "crm_payout_source_read_v1",
      "GET",
      { crmRecordId: "payment_A01" },
      "request_formula_source",
    ),
    cfg,
    new Date(),
  );
  const sourceRevision = sourceResponse.payload.source.revision;
  const payments = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
  const audit = state.spreadsheet.getSheetByName("10_AUDIT_LOG");
  const snapshot = () =>
    JSON.stringify({
      values: payments.values,
      formulas: payments.formulas,
      validations: payments.validations,
      auditValues: audit.values,
      auditFormulas: audit.formulas,
    });
  const before = snapshot();
  const fields = [
    "method",
    "reason",
    "evidenceReference",
    "memo",
    "recordedBy",
  ];
  const baseManual = {
    method: "cash",
    reason: "Approved offline exception",
    evidenceReference: "synthetic_evidence_001",
    memo: "Synthetic manual payment",
    recordedBy: "owner_example_test",
    recordedAt: "2026-08-22T01:00:00.000Z",
  };
  let requestIndex = 0;
  for (const field of fields) {
    for (const prefix of ["=", "+", "-", "@"]) {
      requestIndex += 1;
      const desired = projection(sourceRevision, {
        manualPayment: {
          ...baseManual,
          [field]: `${prefix}unsafe`,
        },
      });
      const request = signedRequest(
        context,
        cfg,
        "artist_payout_projection_v1",
        "POST",
        writePayload(sourceRevision, desired),
        `request_formula_projection_${requestIndex}`,
      );
      const response = context.HflaPayoutServerTest.executeRequest(
        request,
        cfg,
        new Date(),
      );
      assert.equal(response.payload.ok, false);
      assert.equal(response.payload.error, "REQUEST_FAILED_CLOSED");
      assert.equal(snapshot(), before);
    }
  }
});

test("formula-prefixed roster free text is rejected before any value, formula, audit, or revision mutation", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const roster = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
  const audit = state.spreadsheet.getSheetByName("10_AUDIT_LOG");
  const snapshot = () =>
    JSON.stringify({
      values: roster.values,
      formulas: roster.formulas,
      validations: roster.validations,
      auditValues: audit.values,
      auditFormulas: audit.formulas,
    });
  const before = snapshot();
  for (const [index, prefix] of ["=", "+", "-", "@"].entries()) {
    const desired = rosterProjection({
      onboardingStatus: "RESTRICTED",
      requirementsStatus: "past_due",
      transfersEnabled: false,
      payoutReady: false,
      disabledReason: `${prefix}unsafe`,
      exceptionFlag: true,
    });
    const request = signedRequest(
      context,
      cfg,
      "artist_roster_projection_v1",
      "POST",
      rosterWritePayload("roster:v1:artist_A01:7", desired),
      `request_formula_roster_${index}`,
    );
    const response = context.HflaPayoutServerTest.executeRequest(
      request,
      cfg,
      new Date(),
    );
    assert.equal(response.payload.ok, false);
    assert.equal(response.payload.error, "REQUEST_FAILED_CLOSED");
    assert.equal(snapshot(), before);
  }
});

test("projection reconciliation flag and timestamp must advance together", () => {
  const { context, properties } = makeContext();
  const cfg = config(properties);
  const base = projection("unused");
  assert.throws(
    () =>
      context.assertProjectionPayload_(
        writePayload("crm-source:v1:synthetic", {
          ...base,
          reconciled: true,
          reconciledAt: null,
        }),
        cfg,
      ),
    /advance together/,
  );
  assert.throws(
    () =>
      context.assertProjectionPayload_(
        writePayload("crm-source:v1:synthetic", {
          ...base,
          reconciled: false,
          reconciledAt: "2026-08-22T01:00:00.000Z",
        }),
        cfg,
      ),
    /advance together/,
  );
});

test("payout canonicalization orders nested manual-payment evidence deterministically", () => {
  const { context, properties } = makeContext();
  const cfg = config(properties);
  const manual = {
    method: "check",
    reason: "Owner-approved documented exception",
    evidenceReference: "evidence_ref_001",
    memo: "HFL manual artist payment",
    recordedBy: "owner@example.test",
    recordedAt: "2026-08-22T01:00:00.000Z",
  };
  const reversed = Object.fromEntries(Object.entries(manual).reverse());
  const first = writePayload(
    "crm-source:v1:synthetic",
    projection("unused", {
      state: "MANUAL_PAYMENT_EXCEPTION",
      manualPayment: manual,
    }),
  );
  const second = writePayload(
    "crm-source:v1:synthetic",
    projection("unused", {
      state: "MANUAL_PAYMENT_EXCEPTION",
      manualPayment: reversed,
    }),
  );
  assert.equal(
    context.canonicalProjectionJson_(first.projection),
    context.canonicalProjectionJson_(second.projection),
  );
  const request = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    first,
    "request_manual_canonical_001",
  );
  const reorderedRequest = structuredClone(request);
  reorderedRequest.business = second;
  assert.equal(
    context.HflaPayoutServerTest.requestCanonical(request, cfg),
    context.HflaPayoutServerTest.requestCanonical(reorderedRequest, cfg),
  );
});

test("exact projection replay recovers without a second projection mutation while a true conflict fails closed", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const source = context.authoritativePayoutSource_(
    state.spreadsheet,
    "payment_A01",
    cfg,
  ).source;
  const desired = projection(source.revision);
  const payload = writePayload(source.revision, desired);
  const first = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    payload,
    "request_idempotent_001",
  );
  const firstResponse = context.HflaPayoutServerTest.executeRequest(
    first,
    cfg,
    new Date(),
  );
  const sheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
  const writesAfterFirst = sheet.writeCount;
  const replay = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    payload,
    "request_idempotent_002",
  );
  const replayResponse = context.HflaPayoutServerTest.executeRequest(
    replay,
    cfg,
    new Date(),
  );
  assert.equal(replayResponse.payload.ok, true);
  assert.equal(replayResponse.payload.revision, firstResponse.payload.revision);
  assert.equal(sheet.writeCount, writesAfterFirst);

  const conflictPayload = writePayload("crm-source:v1:wrong", {
    ...desired,
    state: "PAID",
  });
  const conflict = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    conflictPayload,
    "request_conflict_001",
  );
  const conflictResponse = context.HflaPayoutServerTest.executeRequest(
    conflict,
    cfg,
    new Date(),
  );
  verifyResponse(conflictResponse, conflict);
  assert.deepEqual(JSON.parse(JSON.stringify(conflictResponse.payload)), {
    ok: false,
    error: "REQUEST_FAILED_CLOSED",
  });
  assert.equal(sheet.writeCount, writesAfterFirst);
});

test("audit append expands a full bounded grid by exactly one row and reads back safely", () => {
  const { context, properties, state } = makeContext();
  const cfg = config(properties);
  const audit = state.spreadsheet.getSheetByName("10_AUDIT_LOG");
  audit.maxRows = 1;
  const source = context.authoritativePayoutSource_(
    state.spreadsheet,
    "payment_A01",
    cfg,
  ).source;
  const request = signedRequest(
    context,
    cfg,
    "artist_payout_projection_v1",
    "POST",
    writePayload(source.revision, projection(source.revision)),
    "request_audit_grid_001",
  );
  const response = context.HflaPayoutServerTest.executeRequest(
    request,
    cfg,
    new Date(),
  );
  assert.equal(response.payload.ok, true);
  assert.equal(audit.getMaxRows(), 2);
  assert.equal(audit.getLastRow(), 2);
  assert.equal(audit.values[1][2], "Artist Payout");
  assert.equal(JSON.stringify(audit.values).includes(SECRET), false);
});

test("formula targets, protected targets, duplicate IDs, and schema or tab identity drift fail closed", () => {
  for (const mode of [
    "formula",
    "protected",
    "sheet-protected",
    "duplicate",
    "drift",
    "sheet-id",
  ]) {
    const { context, properties, state } = makeContext();
    const cfg = config(properties);
    const sheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
    const extensionStart =
      context.HFLA_PAYOUT_SCHEMA.base["11_ARTIST_PAYMENTS"].length;
    if (mode === "formula") sheet.formulas[1][extensionStart] = "=1";
    if (mode === "protected") {
      sheet.protections.push(
        new FakeProtection(sheet.getRange(2, extensionStart + 1, 1, 1)),
      );
    }
    if (mode === "sheet-protected") {
      sheet.sheetProtections.push(
        new FakeProtection(
          sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()),
        ),
      );
    }
    if (mode === "duplicate") sheet.values.push([...sheet.values[1]]);
    if (mode === "drift") sheet.values[0][0] = "Drifted Artist Payment ID";
    if (mode === "sheet-id") sheet.sheetId = 999999;
    let sourceRevision = "crm-source:v1:unavailable";
    if (
      mode === "formula" ||
      mode === "protected" ||
      mode === "sheet-protected"
    ) {
      sourceRevision = context.authoritativePayoutSource_(
        state.spreadsheet,
        "payment_A01",
        cfg,
      ).source.revision;
    }
    const request = signedRequest(
      context,
      cfg,
      "artist_payout_projection_v1",
      "POST",
      writePayload(sourceRevision, projection(sourceRevision)),
      `request_fail_${mode}`,
    );
    const response = context.HflaPayoutServerTest.executeRequest(
      request,
      cfg,
      new Date(),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(response.payload)), {
      ok: false,
      error: "REQUEST_FAILED_CLOSED",
    });
  }
});

test("schema migration is approval and Drive-version gated and preserves every base cell formula and validation", () => {
  const { context, properties, state } = makeContext();
  state.spreadsheet = makeFixture(context, { migrated: false });
  const cfgEntries = {
    HFLA_PAYOUT_ENVIRONMENT: "sandbox",
    HFLA_PAYOUT_SPREADSHEET_ID: SPREADSHEET_ID,
    HFLA_PAYOUT_HMAC_SECRET: SECRET,
    HFLA_PAYOUT_PUBLIC_ORIGIN: "https://script.google.com",
    HFLA_PAYOUT_ROSTER_PATH: "/macros/s/synthetic/exec/artist-roster",
    HFLA_PAYOUT_ROSTER_LIST_PATH: "/macros/s/synthetic/exec/artist-roster-list",
    HFLA_PAYOUT_ROSTER_PROJECTION_READ_PATH:
      "/macros/s/synthetic/exec/artist-roster-projection-read",
    HFLA_PAYOUT_ROSTER_PROJECTION_WRITE_PATH:
      "/macros/s/synthetic/exec/artist-roster-projection-write",
    HFLA_PAYOUT_SOURCE_PATH: "/macros/s/synthetic/exec/payout-ledger-source",
    HFLA_PAYOUT_PROJECTION_READ_PATH:
      "/macros/s/synthetic/exec/projection-read",
    HFLA_PAYOUT_PROJECTION_WRITE_PATH:
      "/macros/s/synthetic/exec/projection-write",
    HFLA_PAYOUT_MAX_CLOCK_SKEW_SECONDS: "300",
    HFLA_PAYOUT_ACTIVE_ARTIST_STATUS: "Active",
  };
  Object.entries(cfgEntries).forEach(([key, value]) =>
    properties.setProperty(key, value),
  );
  const protectedSheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
  protectedSheet.protections.push(
    new FakeProtection(protectedSheet.getRange(1, 1, 1, 1)),
  );
  protectedSheet.columnWidths.set(1, 222);
  const before = context.basePreservationSnapshot_(state.spreadsheet);
  assert.throws(
    () => context.applyApprovedArtistPayoutSchemaMigration(),
    /not enabled/,
  );
  properties.setProperty("HFLA_PAYOUT_SCHEMA_MIGRATION_ENABLED", "true");
  properties.setProperty("HFLA_PAYOUT_EXPECTED_DRIVE_VERSION", "1592");
  properties.setProperty(
    "HFLA_PAYOUT_SCHEMA_MIGRATION_APPROVAL",
    `I APPROVE ARTIST PAYOUT SCHEMA V1 sandbox ${SPREADSHEET_ID} 1592`,
  );
  const result = context.applyApprovedArtistPayoutSchemaMigration();
  assert.equal(result.ok, true);
  assert.equal(result.alreadyApplied, false);
  context.assertBasePreserved_(state.spreadsheet, before);
  for (const name of [
    "11_ARTIST_PAYMENTS",
    "12_ARTIST_ROSTER",
    "13_ARTIST_ASSIGNMENTS",
  ]) {
    assert.deepEqual(
      state.spreadsheet.getSheetByName(name).values[0],
      headers(context, name, true),
    );
    assert.equal(
      state.spreadsheet.getSheetByName(name).getMaxColumns(),
      headers(context, name, true).length,
    );
    const sheet = state.spreadsheet.getSheetByName(name);
    const baseWidth = context.HFLA_PAYOUT_SCHEMA.base[name].length;
    assert.equal(sheet.getColumnWidth(baseWidth + 1), 160);
    assert.ok(
      sheet.formulas[1].slice(baseWidth).every((formula) => formula === ""),
    );
  }
  assert.equal(protectedSheet.getColumnWidth(1), 222);
  assert.equal(protectedSheet.protections.length, 1);

  const validation = (sheetName, header) => {
    const sheet = state.spreadsheet.getSheetByName(sheetName);
    return sheet.validations[1][sheet.values[0].indexOf(header)];
  };
  const listValues = (sheetName, header) =>
    JSON.parse(JSON.stringify(validation(sheetName, header).values[0]));
  assert.deepEqual(listValues("11_ARTIST_PAYMENTS", "Payout Environment"), [
    "sandbox",
    "live",
  ]);
  assert.deepEqual(
    listValues("11_ARTIST_PAYMENTS", "Payout State"),
    Array.from(context.HFLA_PAYOUT_STATES),
  );
  assert.deepEqual(listValues("11_ARTIST_PAYMENTS", "Stripe Payout Status"), [
    "pending",
    "in_transit",
    "paid",
    "failed",
    "canceled",
  ]);
  assert.deepEqual(listValues("12_ARTIST_ROSTER", "Stripe Legal Entity Type"), [
    "individual",
    "company",
    "non_profit",
    "government_entity",
  ]);
  assert.deepEqual(
    listValues("12_ARTIST_ROSTER", "Stripe Onboarding Status"),
    Array.from(context.HFLA_ONBOARDING_STATES),
  );
  assert.deepEqual(
    listValues("12_ARTIST_ROSTER", "Stripe Requirements Status"),
    Array.from(context.HFLA_REQUIREMENTS_STATES),
  );
  assert.deepEqual(listValues("12_ARTIST_ROSTER", "Stripe Dashboard Type"), [
    "express",
  ]);
  assert.deepEqual(listValues("12_ARTIST_ROSTER", "Preferred Payout Type"), [
    "automatic_standard",
    "unverified",
  ]);
  assert.deepEqual(listValues("13_ARTIST_ASSIGNMENTS", "Closeout Status"), [
    "PENDING",
    "ISSUE_REVIEW",
    "COMPLETE",
  ]);
  for (const header of ["Payout Reconciled?"]) {
    assert.equal(validation("11_ARTIST_PAYMENTS", header).type, "CHECKBOX");
    const sheet = state.spreadsheet.getSheetByName("11_ARTIST_PAYMENTS");
    assert.equal(sheet.values[1][sheet.values[0].indexOf(header)], false);
  }
  for (const header of [
    "Stripe Transfers Enabled",
    "Stripe Payout Ready",
    "Payout Exception Flag",
  ]) {
    assert.equal(validation("12_ARTIST_ROSTER", header).type, "CHECKBOX");
    const sheet = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
    assert.equal(sheet.values[1][sheet.values[0].indexOf(header)], false);
  }
  for (const header of [
    "Artist Completion Confirmed?",
    "Extra Time Reconciled?",
    "Service Change Reconciled?",
    "Travel Pay Reconciled?",
    "Adjustments Reconciled?",
    "No Customer Complaint Affecting Pay?",
    "No Refund Issue Affecting Pay?",
    "No Damage Or Supply Issue Affecting Pay?",
    "Compensation Approved?",
    "Contractor Control Satisfied?",
  ]) {
    assert.equal(validation("13_ARTIST_ASSIGNMENTS", header).type, "CHECKBOX");
    const sheet = state.spreadsheet.getSheetByName("13_ARTIST_ASSIGNMENTS");
    assert.equal(sheet.values[1][sheet.values[0].indexOf(header)], false);
  }
  const sourceRevisionValidation = validation(
    "11_ARTIST_PAYMENTS",
    "Payout Source Revision",
  );
  assert.equal(sourceRevisionValidation.type, "CUSTOM_FORMULA");
  assert.match(sourceRevisionValidation.values[0], /MOD\(/);
  assert.match(sourceRevisionValidation.values[0], />=1/);
  assert.equal(sourceRevisionValidation.allowInvalid, false);
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Total Approved Pay Cents").values[0],
    /MOD\(/,
  );
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Total Approved Pay Cents").values[0],
    />=1/,
  );
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Payout Projection Revision").values[0],
    /\^payout-projection:v1:\[a-f0-9\]\{64\}\$/,
  );
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Payout Batch Date").values[0],
    /0\[1-9\]\|1\[0-2\]/,
  );
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Payout Last Verified At").values[0],
    /\[0-5\]\[0-9\]:\[0-5\]\[0-9\]\[\.\]\[0-9\]\{3\}Z/,
  );
  assert.doesNotMatch(
    validation("11_ARTIST_PAYMENTS", "Pay Adjustment").values[0],
    />=0/,
  );
  assert.match(
    validation("11_ARTIST_PAYMENTS", "Pay Deduction").values[0],
    />=0/,
  );
  assert.match(
    validation("13_ARTIST_ASSIGNMENTS", "Assignment Source Revision").values[0],
    /MOD\(/,
  );
  assert.match(
    validation("12_ARTIST_ROSTER", "Stripe Country").values[0],
    /\^\[A-Z\]\{2\}\$/,
  );

  const rosterSheet = state.spreadsheet.getSheetByName("12_ARTIST_ROSTER");
  const assignmentSheet = state.spreadsheet.getSheetByName(
    "13_ARTIST_ASSIGNMENTS",
  );
  protectedSheet.values[1][
    protectedSheet.values[0].indexOf("Payout Reconciled?")
  ] = true;
  rosterSheet.values[1][
    rosterSheet.values[0].indexOf("Stripe Transfers Enabled")
  ] = true;
  rosterSheet.values[1][rosterSheet.values[0].indexOf("Stripe Payout Ready")] =
    true;
  rosterSheet.values[1][
    rosterSheet.values[0].indexOf("Preferred Payout Type")
  ] = "unverified";
  for (const header of [
    "Artist Completion Confirmed?",
    "Extra Time Reconciled?",
    "Service Change Reconciled?",
    "Travel Pay Reconciled?",
    "Adjustments Reconciled?",
    "No Customer Complaint Affecting Pay?",
    "No Refund Issue Affecting Pay?",
    "No Damage Or Supply Issue Affecting Pay?",
    "Compensation Approved?",
    "Contractor Control Satisfied?",
  ]) {
    assignmentSheet.values[1][assignmentSheet.values[0].indexOf(header)] = true;
  }
  const extensionBefore = context.extensionDataSnapshot_(state.spreadsheet);
  const reapplied = context.applyApprovedArtistPayoutSchemaMigration();
  assert.equal(reapplied.ok, true);
  assert.equal(reapplied.alreadyApplied, true);
  assert.equal(reapplied.validationsReapplied, true);
  context.assertExtensionDataPreserved_(state.spreadsheet, extensionBefore);
  assert.equal(
    protectedSheet.values[1][
      protectedSheet.values[0].indexOf("Payout Reconciled?")
    ],
    true,
  );
  assert.equal(
    rosterSheet.values[1][
      rosterSheet.values[0].indexOf("Preferred Payout Type")
    ],
    "unverified",
  );
});
