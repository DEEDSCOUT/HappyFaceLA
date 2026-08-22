/* global SpreadsheetApp, Utilities, LockService, Drive, JSON, Date, Object */

var HFLA_PAYOUT_STATES = Object.freeze([
  "NOT_ELIGIBLE",
  "CLOSEOUT_PENDING",
  "ISSUE_REVIEW",
  "READY_FOR_OWNER_APPROVAL",
  "OWNER_APPROVED",
  "TRANSFER_QUEUED",
  "TRANSFER_CREATED",
  "TRANSFER_PENDING",
  "TRANSFER_COMPLETED",
  "PAYOUT_PENDING",
  "PAID",
  "TRANSFER_FAILED",
  "PAYOUT_FAILED",
  "REVERSED",
  "MANUAL_REVIEW",
  "MANUAL_PAYMENT_EXCEPTION",
]);

var HFLA_PROJECTION_KEYS = Object.freeze([
  "environment",
  "ledgerId",
  "bookingId",
  "assignmentId",
  "artistId",
  "sourceRevision",
  "state",
  "batchId",
  "batchDate",
  "currency",
  "amountCents",
  "connectedAccountId",
  "transferId",
  "payoutId",
  "payoutStatus",
  "reconciled",
  "reconciledAt",
  "manualPayment",
  "lastVerifiedAt",
]);

var HFLA_MANUAL_PAYMENT_KEYS = Object.freeze([
  "method",
  "reason",
  "evidenceReference",
  "memo",
  "recordedBy",
  "recordedAt",
]);

var HFLA_ROSTER_PROJECTION_KEYS = Object.freeze([
  "environment",
  "artistId",
  "connectedAccountId",
  "onboardingStatus",
  "requirementsStatus",
  "transfersEnabled",
  "payoutReady",
  "dashboardType",
  "preferredPayoutType",
  "lastRequirementsCheckAt",
  "onboardedDate",
  "disabledReason",
  "exceptionFlag",
]);

var HFLA_ONBOARDING_STATES = Object.freeze([
  "NOT_INVITED",
  "INVITE_READY",
  "LINK_CREATED",
  "INVITATION_DRAFTED",
  "ONBOARDING_STARTED",
  "REQUIREMENTS_PENDING",
  "RESTRICTED",
  "ONBOARDING_COMPLETE",
  "TRANSFERS_ENABLED",
  "PAYOUT_READY",
  "DISABLED",
]);

var HFLA_REQUIREMENTS_STATES = Object.freeze([
  "complete",
  "pending",
  "currently_due",
  "past_due",
  "closed",
  "inactive",
]);

var HFLA_PROJECTION_COLUMN_MAP = Object.freeze({
  environment: "Payout Environment",
  ledgerId: "Payout Ledger ID",
  sourceRevision: "Payout Source Revision",
  state: "Payout State",
  batchId: "Payout Batch ID",
  batchDate: "Payout Batch Date",
  currency: "Payout Currency",
  amountCents: "Total Approved Pay Cents",
  connectedAccountId: "Stripe Connected Account ID",
  transferId: "Stripe Transfer ID",
  payoutId: "Stripe Payout ID",
  payoutStatus: "Stripe Payout Status",
  reconciled: "Payout Reconciled?",
  reconciledAt: "Payout Reconciled At",
  lastVerifiedAt: "Payout Last Verified At",
  revision: "Payout Projection Revision",
});

function openPayoutSpreadsheet_(config) {
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  if (!spreadsheet || spreadsheet.getId() !== config.spreadsheetId) {
    throw new Error(
      "Configured Booking Control Center identity does not match",
    );
  }
  if (spreadsheet.getSpreadsheetTimeZone() !== "America/Los_Angeles") {
    throw new Error(
      "Booking Control Center timezone is not America/Los_Angeles",
    );
  }
  return spreadsheet;
}

function sheetHeaders_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (!Number.isSafeInteger(lastColumn) || lastColumn < 1 || lastColumn > 400) {
    throw new Error("Booking Control Center header width is invalid");
  }
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  headerIndex_(headers);
  return headers;
}

function assertSheetHeaders_(spreadsheet, sheetName, migrated) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet)
    throw new Error("Missing Booking Control Center tab: " + sheetName);
  if (sheet.getSheetId() !== HFLA_PAYOUT_SCHEMA.sheetIds[sheetName]) {
    throw new Error("Booking Control Center tab identity drift: " + sheetName);
  }
  var actual = sheetHeaders_(sheet);
  var expected = expectedHeaders_(sheetName, migrated);
  if (!exactStringArray_(actual, expected)) {
    throw new Error("Booking Control Center header drift: " + sheetName);
  }
  return { sheet: sheet, headers: actual, index: headerIndex_(actual) };
}

function assertBaseWorkbookSchema_(spreadsheet) {
  Object.keys(HFLA_PAYOUT_SCHEMA.base).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet)
      throw new Error("Missing Booking Control Center tab: " + sheetName);
    var actual = sheetHeaders_(sheet);
    var base = expectedHeaders_(sheetName, false);
    var migrated = expectedHeaders_(sheetName, true);
    if (
      !exactStringArray_(actual, base) &&
      !exactStringArray_(actual, migrated)
    ) {
      throw new Error("Booking Control Center header drift: " + sheetName);
    }
  });
}

function assertMigratedWorkbookSchema_(spreadsheet) {
  Object.keys(HFLA_PAYOUT_SCHEMA.base).forEach(function (sheetName) {
    assertSheetHeaders_(
      spreadsheet,
      sheetName,
      Boolean(HFLA_PAYOUT_SCHEMA.extensions[sheetName]),
    );
  });
}

function boundedText_(value, maxLength, label, nullable) {
  if ((value === "" || value === null) && nullable) return null;
  if (typeof value !== "string") value = String(value);
  if (
    !value ||
    value.length > maxLength ||
    value !== value.trim() ||
    /[\u0000-\u001F\u007F]/.test(value) ||
    /^[=+\-@]/.test(value.trim())
  ) {
    throw new Error(label + " is missing or unsafe");
  }
  return value;
}

function booleanCell_(value, label) {
  if (value === true || value === false) return value;
  if (value === "" || value === null) return false;
  if (typeof value === "string") {
    var normalized = value.trim().toUpperCase();
    if (normalized === "TRUE" || normalized === "YES") return true;
    if (normalized === "FALSE" || normalized === "NO") return false;
  }
  throw new Error(label + " is not an approved boolean value");
}

function dateOnlyCell_(value, timezone, label) {
  var result;
  if (value instanceof Date && !isNaN(value.valueOf())) {
    result = Utilities.formatDate(value, timezone, "yyyy-MM-dd");
  } else {
    result = value;
  }
  if (
    typeof result !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    isNaN(new Date(result + "T00:00:00.000Z").valueOf()) ||
    new Date(result + "T00:00:00.000Z").toISOString().slice(0, 10) !== result
  ) {
    throw new Error(label + " is not an ISO date");
  }
  return result;
}

function instantCell_(value, label, nullable) {
  if ((value === "" || value === null) && nullable) return null;
  var result = value instanceof Date ? value.toISOString() : value;
  return isoInstant_(result, label);
}

function timeOfDay_(value, displayValue, timezone, label) {
  var text;
  if (value instanceof Date && !isNaN(value.valueOf())) {
    text = Utilities.formatDate(value, timezone, "HH:mm:ss");
  } else if (typeof value === "string" && value === value.trim()) {
    text = value;
  } else if (
    typeof displayValue === "string" &&
    displayValue === displayValue.trim()
  ) {
    text = displayValue;
  } else {
    throw new Error(label + " is not an exact time-of-day value");
  }
  var twelveHour =
    /^([1-9]|1[0-2]):([0-5][0-9])(?::([0-5][0-9]))? ([AP]M)$/.exec(text);
  var twentyFourHour =
    /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/.exec(text);
  var hour;
  var minute;
  var second;
  if (twelveHour) {
    hour = Number(twelveHour[1]) % 12;
    if (twelveHour[4] === "PM") hour += 12;
    minute = Number(twelveHour[2]);
    second = Number(twelveHour[3] || "0");
  } else if (twentyFourHour) {
    hour = Number(twentyFourHour[1]);
    minute = Number(twentyFourHour[2]);
    second = Number(twentyFourHour[3] || "0");
  } else {
    throw new Error(label + " is not an approved time-of-day format");
  }
  return {
    hour: hour,
    minute: minute,
    second: second,
    totalSeconds: hour * 3600 + minute * 60 + second,
  };
}

function nextIsoDate_(date) {
  var value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function localDateTime_(instant, timezone) {
  return Utilities.formatDate(instant, timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

function zonedLocalToUtc_(date, time, timezone, label) {
  var local =
    date +
    "T" +
    String(time.hour).padStart(2, "0") +
    ":" +
    String(time.minute).padStart(2, "0") +
    ":" +
    String(time.second).padStart(2, "0");
  var desiredAsUtc = Date.parse(local + "Z");
  var guess = desiredAsUtc;
  for (var iteration = 0; iteration < 6; iteration += 1) {
    var rendered = localDateTime_(new Date(guess), timezone);
    var renderedAsUtc = Date.parse(rendered + "Z");
    var correction = desiredAsUtc - renderedAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  var candidates = [];
  [-7200000, -3600000, 0, 3600000, 7200000].forEach(function (offset) {
    var candidate = guess + offset;
    if (localDateTime_(new Date(candidate), timezone) === local) {
      if (candidates.indexOf(candidate) === -1) candidates.push(candidate);
    }
  });
  if (candidates.length !== 1) {
    throw new Error(label + " is nonexistent or ambiguous in " + timezone);
  }
  return new Date(candidates[0]).toISOString();
}

function actualEndInstant_(assignment, assignmentDisplay, eventDate, timezone) {
  var start = timeOfDay_(
    assignment["Start Time"],
    assignmentDisplay["Start Time"],
    timezone,
    "Assignment start time",
  );
  var scheduledEnd = timeOfDay_(
    assignment["End Time"],
    assignmentDisplay["End Time"],
    timezone,
    "Assignment end time",
  );
  if (scheduledEnd.totalSeconds === start.totalSeconds) {
    throw new Error("Assignment start and end time are ambiguous");
  }
  var rawActual = assignment["Actual End Time"];
  var actual;
  var suppliedInstant = null;
  if (typeof rawActual === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rawActual)) {
    suppliedInstant = instantCell_(rawActual, "Actual end time", false);
    actual = timeOfDay_(
      Utilities.formatDate(new Date(suppliedInstant), timezone, "HH:mm:ss"),
      "",
      timezone,
      "Actual end time",
    );
  } else {
    actual = timeOfDay_(
      rawActual,
      assignmentDisplay["Actual End Time"],
      timezone,
      "Actual end time",
    );
  }
  var scheduledOvernight = scheduledEnd.totalSeconds < start.totalSeconds;
  if (actual.totalSeconds === start.totalSeconds) {
    throw new Error("Actual end time equals the assignment start time");
  }
  var actualDate = eventDate;
  if (actual.totalSeconds < start.totalSeconds) {
    if (!scheduledOvernight) {
      throw new Error("Actual end time implies an unapproved overnight event");
    }
    actualDate = nextIsoDate_(eventDate);
  }
  var derived = zonedLocalToUtc_(
    actualDate,
    actual,
    timezone,
    "Actual end time",
  );
  if (suppliedInstant !== null && suppliedInstant !== derived) {
    throw new Error(
      "Supplied actual end instant disagrees with assignment time",
    );
  }
  return derived;
}

function moneyToCents_(value, label, allowNegative) {
  if (value === "" || value === null) value = 0;
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string" || value !== value.trim()) {
    throw new Error(label + " is not an exact displayed money value");
  }
  var match =
    /^(-?)(?:\$)?((?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:,\d{3})+))(?:\.(\d{1,2}))?$/.exec(
      value,
    );
  if (!match) {
    throw new Error(label + " is not a supported US decimal money value");
  }
  var negative = match[1] === "-";
  if (negative && !allowNegative) {
    throw new Error(label + " has an invalid sign");
  }
  var dollarDigits = match[2].replace(/,/g, "");
  if (
    dollarDigits.length > 10 ||
    (dollarDigits.length === 10 && dollarDigits > "1000000000")
  ) {
    throw new Error(label + " is outside its safe bound");
  }
  var fraction = match[3] || "";
  var cents =
    Number(dollarDigits) * 100 + Number((fraction + "00").slice(0, 2));
  if (negative) cents *= -1;
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 100000000000) {
    throw new Error(label + " is outside its safe bound");
  }
  return cents;
}

function rowObject_(table, rowNumber) {
  var values = table.sheet
    .getRange(rowNumber, 1, 1, table.headers.length)
    .getValues()[0];
  var record = Object.create(null);
  table.headers.forEach(function (header, index) {
    record[header] = values[index];
  });
  return record;
}

function rowDisplayObject_(table, rowNumber) {
  var values = table.sheet
    .getRange(rowNumber, 1, 1, table.headers.length)
    .getDisplayValues()[0];
  var record = Object.create(null);
  table.headers.forEach(function (header, index) {
    record[header] = values[index];
  });
  return record;
}

function exactRowById_(table, header, expectedId) {
  if (!safeBusinessId_(expectedId)) throw new Error("Lookup ID is malformed");
  var column = table.index[header];
  if (!Number.isSafeInteger(column))
    throw new Error("Lookup column is missing");
  var lastRow = table.sheet.getLastRow();
  if (lastRow < 2) throw new Error("Authoritative record does not exist");
  var values = table.sheet
    .getRange(2, column + 1, lastRow - 1, 1)
    .getDisplayValues();
  var matches = [];
  for (var i = 0; i < values.length; i += 1) {
    if (values[i][0] === expectedId) matches.push(i + 2);
  }
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Authoritative record does not exist"
        : "Duplicate authoritative record identity requires owner review",
    );
  }
  return {
    rowNumber: matches[0],
    record: rowObject_(table, matches[0]),
    display: rowDisplayObject_(table, matches[0]),
  };
}

function sourceRevisionToken_(sourceWithoutRevision) {
  return "crm-source:v1:" + sha256Hex_(JSON.stringify(sourceWithoutRevision));
}

function orderedPayoutProjection_(projection) {
  var ordered = Object.create(null);
  HFLA_PROJECTION_KEYS.forEach(function (key) {
    if (key !== "manualPayment" || projection[key] === null) {
      ordered[key] = projection[key];
      return;
    }
    var manual = Object.create(null);
    HFLA_MANUAL_PAYMENT_KEYS.forEach(function (manualKey) {
      manual[manualKey] = projection[key][manualKey];
    });
    ordered[key] = manual;
  });
  return ordered;
}

function canonicalProjectionJson_(projection) {
  var ordered = orderedPayoutProjection_(projection);
  return JSON.stringify(ordered);
}

function projectionRevisionToken_(projection, sourceRevisionToken) {
  return (
    "payout-projection:v1:" +
    sha256Hex_(
      canonicalProjectionJson_(projection) + "\n" + sourceRevisionToken,
    )
  );
}

function artistIdentityFromRow_(row, artistId, config) {
  if (!safeBusinessId_(artistId)) {
    throw new Error("Artist roster identity is malformed");
  }
  var status = boundedText_(row["Artist Status"], 80, "Artist status", false);
  if (status !== config.activeArtistStatus) {
    throw new Error("Artist roster identity is inactive");
  }
  var displayName = boundedText_(
    row["Preferred Name"],
    160,
    "Artist preferred name",
    false,
  );
  var contactEmail = boundedText_(row.Email, 254, "Artist email", false);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    throw new Error("Artist roster contact email is malformed");
  }
  var country = boundedText_(row["Stripe Country"], 2, "Stripe country", false);
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error("Artist roster Stripe country is malformed");
  }
  var legalEntityType = boundedText_(
    row["Stripe Legal Entity Type"],
    40,
    "Stripe legal entity type",
    false,
  );
  if (
    ["individual", "company", "non_profit", "government_entity"].indexOf(
      legalEntityType,
    ) === -1
  ) {
    throw new Error("Artist roster Stripe legal entity type is unsupported");
  }
  var safeIdentity = {
    artistId: artistId,
    displayName: displayName,
    contactEmail: contactEmail,
    country: country,
    legalEntityType: legalEntityType,
    active: true,
  };
  return {
    artistId: artistId,
    displayName: displayName,
    contactEmail: contactEmail,
    country: country,
    legalEntityType: legalEntityType,
    active: true,
    revision: "roster-revision:v1:" + sha256Hex_(JSON.stringify(safeIdentity)),
  };
}

function readArtistIdentity_(spreadsheet, artistId, config) {
  assertMigratedWorkbookSchema_(spreadsheet);
  var roster = assertSheetHeaders_(spreadsheet, "12_ARTIST_ROSTER", true);
  var result = exactRowById_(roster, "Artist ID", artistId);
  return artistIdentityFromRow_(result.record, artistId, config);
}

function listActiveArtistIdentities_(spreadsheet, afterArtistId, config) {
  if (afterArtistId !== "START" && !safeBusinessId_(afterArtistId)) {
    throw new Error("Artist roster continuation is malformed");
  }
  assertMigratedWorkbookSchema_(spreadsheet);
  var roster = assertSheetHeaders_(spreadsheet, "12_ARTIST_ROSTER", true);
  var lastRow = roster.sheet.getLastRow();
  if (!Number.isSafeInteger(lastRow) || lastRow < 1 || lastRow > 10001) {
    throw new Error("Artist roster exceeds the bounded 10,000-row inventory");
  }
  var values =
    lastRow === 1
      ? []
      : roster.sheet
          .getRange(2, 1, lastRow - 1, roster.headers.length)
          .getValues();
  var identities = [];
  var seen = Object.create(null);
  values.forEach(function (rowValues) {
    var row = Object.create(null);
    roster.headers.forEach(function (header, index) {
      row[header] = rowValues[index];
    });
    if (String(row["Artist Status"]) !== config.activeArtistStatus) return;
    var artistId = boundedText_(row["Artist ID"], 120, "Artist ID", false);
    if (artistId === "START") {
      throw new Error("Active artist ID conflicts with the reserved roster cursor");
    }
    if (seen[artistId]) {
      throw new Error("Duplicate active artist identity requires owner review");
    }
    seen[artistId] = true;
    identities.push(artistIdentityFromRow_(row, artistId, config));
  });
  identities.sort(function (left, right) {
    return left.artistId < right.artistId
      ? -1
      : left.artistId > right.artistId
        ? 1
        : 0;
  });
  var summaries = identities.map(function (identity) {
    return {
      artistId: identity.artistId,
      displayName: identity.displayName,
      revision: identity.revision,
    };
  });
  var rosterRevision =
    "roster-list:v1:" + sha256Hex_(JSON.stringify(summaries));
  var remaining = summaries.filter(function (identity) {
    return afterArtistId === "START" || identity.artistId > afterArtistId;
  });
  var page = remaining.slice(0, 100);
  var complete = remaining.length <= 100;
  return {
    rosterRevision: rosterRevision,
    totalActiveCount: summaries.length,
    artists: page,
    nextAfterArtistId: complete ? null : page[page.length - 1].artistId,
    complete: complete,
  };
}

function canonicalRosterProjectionJson_(projection) {
  var ordered = Object.create(null);
  HFLA_ROSTER_PROJECTION_KEYS.forEach(function (key) {
    ordered[key] = projection[key];
  });
  return JSON.stringify(ordered);
}

function rosterProjectionRevision_(projection, sourceRevision) {
  return (
    "roster-projection:v1:" +
    sha256Hex_(
      canonicalRosterProjectionJson_(projection) + "\n" + sourceRevision,
    )
  );
}

function assertRosterProjectionPayload_(payload, config) {
  exactObjectKeys_(
    payload,
    ["operation", "expectedArtistId", "expectedRevision", "projection"],
    "Artist roster projection payload",
  );
  if (payload.operation !== "artist_roster_projection_v1") {
    throw new Error("Artist roster projection operation is unsupported");
  }
  if (!safeBusinessId_(payload.expectedArtistId)) {
    throw new Error("Artist roster projection identity is malformed");
  }
  boundedText_(
    payload.expectedRevision,
    200,
    "Artist roster expected revision",
    false,
  );
  var projection = payload.projection;
  exactObjectKeys_(
    projection,
    HFLA_ROSTER_PROJECTION_KEYS,
    "Artist roster safe projection",
  );
  if (
    projection.environment !== config.environment ||
    projection.artistId !== payload.expectedArtistId
  ) {
    throw new Error(
      "Artist roster projection environment or identity conflicts",
    );
  }
  if (!/^acct_[A-Za-z0-9]{8,100}$/.test(projection.connectedAccountId)) {
    throw new Error("Artist roster Stripe account ID is invalid");
  }
  if (HFLA_ONBOARDING_STATES.indexOf(projection.onboardingStatus) === -1) {
    throw new Error("Artist roster onboarding state is invalid");
  }
  if (HFLA_REQUIREMENTS_STATES.indexOf(projection.requirementsStatus) === -1) {
    throw new Error("Artist roster requirements state is invalid");
  }
  if (
    typeof projection.transfersEnabled !== "boolean" ||
    typeof projection.payoutReady !== "boolean" ||
    typeof projection.exceptionFlag !== "boolean"
  ) {
    throw new Error("Artist roster capability/exception flags are invalid");
  }
  if (projection.payoutReady && !projection.transfersEnabled) {
    throw new Error(
      "Artist roster payout readiness requires transfers enabled",
    );
  }
  if (
    (projection.onboardingStatus === "PAYOUT_READY") !==
    projection.payoutReady
  ) {
    throw new Error("Artist roster payout readiness state is contradictory");
  }
  if (
    projection.transfersEnabled &&
    ["RESTRICTED", "TRANSFERS_ENABLED", "PAYOUT_READY"].indexOf(
      projection.onboardingStatus,
    ) === -1
  ) {
    throw new Error("Artist roster transfer capability state is contradictory");
  }
  if (
    projection.onboardingStatus === "TRANSFERS_ENABLED" &&
    !projection.transfersEnabled
  ) {
    throw new Error("Artist roster transfer capability state is contradictory");
  }
  if (
    projection.dashboardType !== "express" ||
    ["automatic_standard", "unverified"].indexOf(
      projection.preferredPayoutType,
    ) === -1
  ) {
    throw new Error("Artist roster dashboard or payout type is unsupported");
  }
  if (
    projection.payoutReady &&
    projection.preferredPayoutType !== "automatic_standard"
  ) {
    throw new Error(
      "Artist roster payout readiness requires verified automatic standard payouts",
    );
  }
  isoInstant_(
    projection.lastRequirementsCheckAt,
    "Artist roster requirements check time",
  );
  if (projection.onboardedDate !== null) {
    dateOnlyCell_(
      projection.onboardedDate,
      "America/Los_Angeles",
      "Artist roster onboarded date",
    );
  }
  if (
    ["ONBOARDING_COMPLETE", "TRANSFERS_ENABLED", "PAYOUT_READY"].indexOf(
      projection.onboardingStatus,
    ) !== -1 &&
    projection.onboardedDate === null
  ) {
    throw new Error("Artist roster advanced onboarding state requires a date");
  }
  if (projection.payoutReady && projection.requirementsStatus !== "complete") {
    throw new Error(
      "Artist roster payout readiness requires complete requirements",
    );
  }
  var expectedExceptionFlag =
    ["RESTRICTED", "DISABLED"].indexOf(projection.onboardingStatus) !== -1;
  if (projection.exceptionFlag !== expectedExceptionFlag) {
    throw new Error("Artist roster exception state is contradictory");
  }
  if (projection.disabledReason !== null) {
    var disabledReason = boundedText_(
      projection.disabledReason,
      120,
      "Artist roster disabled reason",
      false,
    );
    if (!/^[a-z0-9][a-z0-9_.:-]{0,119}$/.test(disabledReason)) {
      throw new Error("Artist roster disabled reason is not a safe code");
    }
  }
  return projection;
}

function storedRosterProjection_(row, environment) {
  var accountId = row["Stripe Connected Account ID"];
  if (accountId === "" || accountId === null) {
    [
      "Stripe Onboarding Status",
      "Stripe Requirements Status",
      "Stripe Dashboard Type",
      "Preferred Payout Type",
      "Last Stripe Requirements Check",
      "Stripe Onboarded Date",
      "Stripe Disabled Reason",
    ].forEach(function (header) {
      if (row[header] !== "" && row[header] !== null) {
        throw new Error(
          "Partial artist roster projection requires owner review",
        );
      }
    });
    [
      "Stripe Transfers Enabled",
      "Stripe Payout Ready",
      "Payout Exception Flag",
    ].forEach(function (header) {
      if (row[header] !== "" && row[header] !== null && row[header] !== false) {
        throw new Error(
          "Partial artist roster projection requires owner review",
        );
      }
    });
    return null;
  }
  return {
    environment: environment,
    artistId: boundedText_(row["Artist ID"], 120, "Roster Artist ID", false),
    connectedAccountId: boundedText_(
      accountId,
      120,
      "Roster Stripe account ID",
      false,
    ),
    onboardingStatus: boundedText_(
      row["Stripe Onboarding Status"],
      80,
      "Roster onboarding status",
      false,
    ),
    requirementsStatus: boundedText_(
      row["Stripe Requirements Status"],
      80,
      "Roster requirements status",
      false,
    ),
    transfersEnabled: booleanCell_(
      row["Stripe Transfers Enabled"],
      "Roster transfers enabled",
    ),
    payoutReady: booleanCell_(
      row["Stripe Payout Ready"],
      "Roster payout ready",
    ),
    dashboardType: boundedText_(
      row["Stripe Dashboard Type"],
      40,
      "Roster dashboard type",
      false,
    ),
    preferredPayoutType: boundedText_(
      row["Preferred Payout Type"],
      80,
      "Roster preferred payout type",
      false,
    ),
    lastRequirementsCheckAt: instantCell_(
      row["Last Stripe Requirements Check"],
      "Roster requirements check time",
      false,
    ),
    onboardedDate:
      row["Stripe Onboarded Date"] === "" ||
      row["Stripe Onboarded Date"] === null
        ? null
        : dateOnlyCell_(
            row["Stripe Onboarded Date"],
            "America/Los_Angeles",
            "Roster onboarded date",
          ),
    disabledReason:
      row["Stripe Disabled Reason"] === "" ||
      row["Stripe Disabled Reason"] === null
        ? null
        : boundedText_(
            row["Stripe Disabled Reason"],
            120,
            "Roster disabled reason",
            false,
          ),
    exceptionFlag: booleanCell_(
      row["Payout Exception Flag"],
      "Roster payout exception",
    ),
  };
}

function readRosterProjection_(spreadsheet, identity, config) {
  assertMigratedWorkbookSchema_(spreadsheet);
  exactObjectKeys_(
    identity,
    HFLA_OPERATIONS.artist_roster_projection_read_v1.businessKeys,
    "Artist roster projection read identity",
  );
  if (
    identity.environment !== config.environment ||
    !safeBusinessId_(identity.artistId)
  ) {
    throw new Error("Artist roster projection read identity conflicts");
  }
  var roster = assertSheetHeaders_(spreadsheet, "12_ARTIST_ROSTER", true);
  var rowResult = exactRowById_(roster, "Artist ID", identity.artistId);
  var artist = readArtistIdentity_(spreadsheet, identity.artistId, config);
  var projection = storedRosterProjection_(
    rowResult.record,
    config.environment,
  );
  if (projection === null) {
    return {
      artistId: identity.artistId,
      revision: artist.revision,
      projection: {},
    };
  }
  assertRosterProjectionPayload_(
    {
      operation: "artist_roster_projection_v1",
      expectedArtistId: identity.artistId,
      expectedRevision: artist.revision,
      projection: projection,
    },
    config,
  );
  return {
    artistId: identity.artistId,
    revision: rosterProjectionRevision_(projection, artist.revision),
    projection: projection,
  };
}

function rosterPreservationSnapshot_(table, rowNumber) {
  var sourceWidth = HFLA_PAYOUT_SCHEMA.base["12_ARTIST_ROSTER"].length + 2;
  var source = table.sheet.getRange(rowNumber, 1, 1, sourceWidth);
  var full = table.sheet.getRange(rowNumber, 1, 1, table.headers.length);
  return {
    sourceValues: JSON.stringify(source.getValues()[0]),
    formulas: JSON.stringify(full.getFormulas()[0]),
    validations: JSON.stringify(
      full.getDataValidations()[0].map(validationSignature_),
    ),
  };
}

function rosterProjectionValues_(projection) {
  return [
    projection.connectedAccountId,
    projection.onboardingStatus,
    projection.requirementsStatus,
    projection.transfersEnabled,
    projection.payoutReady,
    projection.dashboardType,
    projection.preferredPayoutType,
    projection.lastRequirementsCheckAt,
    projection.onboardedDate === null ? "" : projection.onboardedDate,
    projection.disabledReason === null ? "" : projection.disabledReason,
    projection.exceptionFlag,
  ];
}

function writeRosterProjection_(spreadsheet, payload, config, requestId) {
  var projection = assertRosterProjectionPayload_(payload, config);
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    assertMigratedWorkbookSchema_(spreadsheet);
    var roster = assertSheetHeaders_(spreadsheet, "12_ARTIST_ROSTER", true);
    var rowResult = exactRowById_(
      roster,
      "Artist ID",
      payload.expectedArtistId,
    );
    var artist = readArtistIdentity_(
      spreadsheet,
      payload.expectedArtistId,
      config,
    );
    var current = storedRosterProjection_(rowResult.record, config.environment);
    var currentRevision = artist.revision;
    if (current !== null) {
      currentRevision = rosterProjectionRevision_(current, artist.revision);
      if (current.connectedAccountId !== projection.connectedAccountId) {
        throw new Error(
          "Artist roster connected account identity is immutable",
        );
      }
      if (
        canonicalRosterProjectionJson_(current) ===
        canonicalRosterProjectionJson_(projection)
      ) {
        if (
          payload.expectedRevision !== currentRevision &&
          payload.expectedRevision !== artist.revision
        ) {
          throw new Error(
            "Artist roster revision conflict requires owner review",
          );
        }
        appendAuditOnce_(
          spreadsheet,
          config,
          requestId,
          projection.artistId,
          projection.connectedAccountId,
          currentRevision,
          currentRevision,
          "EXACT_REPLAY_RECOVERED",
          "artist_roster_projection_v1",
        );
        return {
          artistId: projection.artistId,
          revision: currentRevision,
          recovered: true,
        };
      }
    }
    if (payload.expectedRevision !== currentRevision) {
      throw new Error("Artist roster revision conflict requires owner review");
    }
    var startColumn = roster.index["Stripe Connected Account ID"] + 1;
    var values = rosterProjectionValues_(projection);
    var target = roster.sheet.getRange(
      rowResult.rowNumber,
      startColumn,
      1,
      values.length,
    );
    assertProjectionTargetSafe_(roster, target);
    var preserved = rosterPreservationSnapshot_(roster, rowResult.rowNumber);
    target.setValues([values]);
    SpreadsheetApp.flush();
    var after = rosterPreservationSnapshot_(roster, rowResult.rowNumber);
    Object.keys(preserved).forEach(function (key) {
      if (after[key] !== preserved[key]) {
        throw new Error("Artist roster source/formula/validation changed");
      }
    });
    var verified = readRosterProjection_(
      spreadsheet,
      { environment: config.environment, artistId: projection.artistId },
      config,
    );
    var nextRevision = rosterProjectionRevision_(projection, artist.revision);
    if (
      verified.revision !== nextRevision ||
      canonicalRosterProjectionJson_(verified.projection) !==
        canonicalRosterProjectionJson_(projection)
    ) {
      throw new Error("Artist roster projection readback does not match");
    }
    appendAuditOnce_(
      spreadsheet,
      config,
      requestId,
      projection.artistId,
      projection.connectedAccountId,
      currentRevision,
      nextRevision,
      "APPLIED_AND_READ_BACK",
      "artist_roster_projection_v1",
    );
    return {
      artistId: projection.artistId,
      revision: nextRevision,
      recovered: false,
    };
  } finally {
    lock.releaseLock();
  }
}

function hasLegacyPaymentEvidence_(value) {
  if (value === null || value === "" || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function legacyReconciledEvidence_(value) {
  if (!hasLegacyPaymentEvidence_(value)) return false;
  if (typeof value !== "string") return value !== false;
  return ["NO", "FALSE", "NOT RECONCILED", "PENDING"].indexOf(
    value.trim().toUpperCase(),
  ) === -1;
}

function priorPaymentDisposition_(payment) {
  var explicitlyUnpaidStatuses = [
    "Pending Artist Confirmation / Event Completion",
    "Pending Pay Amount / Payment Method",
    "Pending Pay Confirmation / Event Completion",
    "Ready to Pay",
  ];
  var status = boundedText_(
    payment["Payment Status"],
    500,
    "Artist payment status",
    true,
  );
  var reasonCodes = [];
  if (explicitlyUnpaidStatuses.indexOf(status) === -1) {
    reasonCodes.push("LEGACY_STATUS_NOT_EXPLICITLY_UNPAID");
  }
  if (hasLegacyPaymentEvidence_(payment["Paid Date"])) {
    reasonCodes.push("LEGACY_PAID_DATE_PRESENT");
  }
  if (hasLegacyPaymentEvidence_(payment["Payment Memo Used"])) {
    reasonCodes.push("LEGACY_PAYMENT_MEMO_PRESENT");
  }
  if (hasLegacyPaymentEvidence_(payment["Receipt Screenshot Link"])) {
    reasonCodes.push("LEGACY_RECEIPT_REFERENCE_PRESENT");
  }
  if (legacyReconciledEvidence_(payment["Reconciled?"])) {
    reasonCodes.push("LEGACY_RECONCILED");
  }
  var payoutProjectionFields = HFLA_PAYOUT_SCHEMA.extensions[
    "11_ARTIST_PAYMENTS"
  ].slice(0, 22);
  if (
    payoutProjectionFields.some(function (header) {
      return hasLegacyPaymentEvidence_(payment[header]);
    })
  ) {
    reasonCodes.push("EXISTING_PAYOUT_PROJECTION_PRESENT");
  }
  return {
    disposition:
      reasonCodes.length === 0 ? "CLEAR" : "OWNER_REVIEW_REQUIRED",
    reasonCodes: reasonCodes,
    legacyPaymentMethodPresent: hasLegacyPaymentEvidence_(
      payment["Payment Method"],
    ),
    legacyPaymentHandlePresent: hasLegacyPaymentEvidence_(
      payment["Payment Handle"],
    ),
  };
}

function authoritativePayoutSource_(spreadsheet, recordId, config) {
  assertMigratedWorkbookSchema_(spreadsheet);
  var timezone = spreadsheet.getSpreadsheetTimeZone();
  var payments = assertSheetHeaders_(spreadsheet, "11_ARTIST_PAYMENTS", true);
  var assignments = assertSheetHeaders_(
    spreadsheet,
    "13_ARTIST_ASSIGNMENTS",
    true,
  );
  var bookings = assertSheetHeaders_(spreadsheet, "02_BOOKINGS", false);
  var paymentResult = exactRowById_(payments, "Artist Payment ID", recordId);
  var payment = paymentResult.record;
  var paymentDisplay = paymentResult.display;
  var bookingId = boundedText_(
    payment["Booking ID"],
    160,
    "Payment Booking ID",
    false,
  );
  var assignmentId = boundedText_(
    payment["Assignment ID"],
    160,
    "Payment Assignment ID",
    false,
  );
  var artistId = boundedText_(
    payment["Artist ID"],
    160,
    "Payment Artist ID",
    false,
  );
  if (![bookingId, assignmentId, artistId].every(safeBusinessId_)) {
    throw new Error("Payment source contains a malformed business identity");
  }
  var assignmentResult = exactRowById_(
    assignments,
    "Assignment ID",
    assignmentId,
  );
  var assignment = assignmentResult.record;
  var assignmentDisplay = assignmentResult.display;
  var bookingResult = exactRowById_(bookings, "Booking ID", bookingId);
  var booking = bookingResult.record;
  if (
    String(assignment["Booking ID"]) !== bookingId ||
    String(assignment["Artist ID"]) !== artistId ||
    String(assignment["Payment Record ID"]) !== recordId
  ) {
    throw new Error(
      "Booking, assignment, artist, or payment link is inconsistent",
    );
  }
  var paymentEventDate = dateOnlyCell_(
    payment["Event Date"],
    timezone,
    "Payment event date",
  );
  var assignmentEventDate = dateOnlyCell_(
    assignment["Event Date"],
    timezone,
    "Assignment event date",
  );
  var bookingEventDate = dateOnlyCell_(
    booking["Event Date"],
    timezone,
    "Booking event date",
  );
  if (
    paymentEventDate !== assignmentEventDate ||
    paymentEventDate !== bookingEventDate
  ) {
    throw new Error("Booking, assignment, and payment event dates disagree");
  }

  var artistName = boundedText_(
    payment["Artist Name"],
    160,
    "Payment artist name",
    false,
  );
  var assignmentArtistName = boundedText_(
    assignment["Artist Name"],
    160,
    "Assignment artist name",
    false,
  );
  if (artistName !== assignmentArtistName) {
    throw new Error("Assignment and payment artist names disagree");
  }
  var eventName = boundedText_(
    assignment["Client / Event Name"],
    240,
    "Assignment event name",
    false,
  );
  var service = boundedText_(
    assignment["Service Role"],
    240,
    "Assignment service",
    false,
  );

  var servicePayCents = moneyToCents_(
    paymentDisplay["Service Pay"],
    "Payment service pay",
    false,
  );
  var travelPayCents = moneyToCents_(
    paymentDisplay["Travel Pay"],
    "Payment travel pay",
    false,
  );
  var bonusCents = moneyToCents_(
    paymentDisplay["Tip / Bonus"],
    "Payment bonus",
    false,
  );
  var adjustmentCents = moneyToCents_(
    paymentDisplay["Pay Adjustment"],
    "Payment adjustment",
    true,
  );
  var deductionCents = moneyToCents_(
    paymentDisplay["Pay Deduction"],
    "Payment deduction",
    false,
  );
  var totalApprovedPayCents =
    servicePayCents +
    travelPayCents +
    bonusCents +
    adjustmentCents -
    deductionCents;
  if (
    !Number.isSafeInteger(totalApprovedPayCents) ||
    totalApprovedPayCents <= 0
  ) {
    throw new Error("Total approved artist pay is invalid");
  }
  var legacyPaymentTotal = moneyToCents_(
    paymentDisplay["Total Artist Pay"],
    "Existing payment total",
    false,
  );
  if (legacyPaymentTotal !== servicePayCents + travelPayCents + bonusCents) {
    throw new Error("Existing artist payment formula/value is inconsistent");
  }
  var assignmentServiceCents = moneyToCents_(
    assignmentDisplay["Agreed Service Pay"],
    "Assignment agreed service pay",
    false,
  );
  var assignmentTravelCents = moneyToCents_(
    assignmentDisplay["Agreed Travel Pay"],
    "Assignment agreed travel pay",
    false,
  );
  var assignmentTotalCents = moneyToCents_(
    assignmentDisplay["Total Agreed Pay"],
    "Assignment agreed total pay",
    false,
  );
  if (
    assignmentServiceCents !== servicePayCents ||
    assignmentTravelCents !== travelPayCents ||
    assignmentTotalCents !== servicePayCents + travelPayCents
  ) {
    throw new Error("Assignment and payment compensation components disagree");
  }

  var sourceRevision = Number(assignment["Assignment Source Revision"]);
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
    throw new Error("Assignment source revision must be a positive integer");
  }
  var closeoutVerifiedAt = instantCell_(
    assignment["Closeout Verified At"],
    "Closeout verification time",
    false,
  );
  var actualEndTime = actualEndInstant_(
    assignment,
    assignmentDisplay,
    paymentEventDate,
    timezone,
  );
  var legacyIssue = assignment["Extra Time / Issue Flag"];
  var normalizedLegacyIssue =
    legacyIssue === "" || legacyIssue === null || legacyIssue === false
      ? ""
      : boundedText_(legacyIssue, 500, "Legacy closeout issue", false);
  var noLegacyIssue =
    normalizedLegacyIssue === "" ||
    [
      "NO",
      "NONE",
      "FALSE",
      "N/A",
      "NA",
      "NO ISSUE",
      "NO ISSUES",
      "NO ISSUE REPORTED",
      "NO ISSUES REPORTED",
    ].indexOf(normalizedLegacyIssue.toUpperCase()) !== -1;

  var eventCompleted = booleanCell_(
    booking["Event Completed?"],
    "Booking event completed",
  );
  var paymentCompletion = booleanCell_(
    payment["Completion Confirmed?"],
    "Payment completion confirmed",
  );
  var assignmentCompletion = booleanCell_(
    assignment["Completed Confirmed?"],
    "Assignment completion confirmed",
  );
  var artistCompletion = booleanCell_(
    assignment["Artist Completion Confirmed?"],
    "Artist completion confirmed",
  );
  var extraTimeReconciled = booleanCell_(
    assignment["Extra Time Reconciled?"],
    "Extra time reconciled",
  );
  var serviceChangeReconciled = booleanCell_(
    assignment["Service Change Reconciled?"],
    "Service change reconciled",
  );
  var approvedBy = boundedText_(
    payment["Approved By"],
    240,
    "Artist pay approver",
    true,
  );
  var closeout = {
    assignmentExists: true,
    bookingIdValid: true,
    assignmentIdValid: true,
    eventCompleted: eventCompleted,
    actualEndTime: actualEndTime,
    artistCompletionConfirmed: artistCompletion && paymentCompletion,
    serviceCompleted:
      eventCompleted && assignmentCompletion && paymentCompletion,
    extraTimeReconciled: extraTimeReconciled,
    serviceChangeReconciled: serviceChangeReconciled,
    travelPayReconciled: booleanCell_(
      assignment["Travel Pay Reconciled?"],
      "Travel pay reconciled",
    ),
    adjustmentsReconciled: booleanCell_(
      assignment["Adjustments Reconciled?"],
      "Adjustments reconciled",
    ),
    noCustomerComplaintAffectingPay: booleanCell_(
      assignment["No Customer Complaint Affecting Pay?"],
      "Customer complaint control",
    ),
    noRefundIssueAffectingPay: booleanCell_(
      assignment["No Refund Issue Affecting Pay?"],
      "Refund issue control",
    ),
    noDamageOrSupplyIssueAffectingPay: booleanCell_(
      assignment["No Damage Or Supply Issue Affecting Pay?"],
      "Damage or supply issue control",
    ),
    compensationApproved:
      Boolean(approvedBy) &&
      booleanCell_(
        assignment["Compensation Approved?"],
        "Compensation approved",
      ),
    contractorControlSatisfied: booleanCell_(
      assignment["Contractor Control Satisfied?"],
      "Contractor control satisfied",
    ),
    // The Cloudflare application overwrites these four values with current
    // Stripe reads before eligibility is assessed.
    stripeOnboardingComplete: false,
    stripeTransfersActive: false,
    stripePayoutsActive: false,
    connectedAccountMatchesArtist: false,
  };
  var policyVersion = boundedText_(
    assignment["Assignment Policy Version"],
    160,
    "Assignment policy version",
    false,
  );
  var statedCloseoutStatus = boundedText_(
    assignment["Closeout Status"],
    40,
    "Assignment closeout status",
    false,
  );
  if (
    ["PENDING", "ISSUE_REVIEW", "COMPLETE"].indexOf(statedCloseoutStatus) === -1
  ) {
    throw new Error("Assignment closeout status is unsupported");
  }
  var nonStripeControls = [
    "assignmentExists",
    "bookingIdValid",
    "assignmentIdValid",
    "eventCompleted",
    "artistCompletionConfirmed",
    "serviceCompleted",
    "extraTimeReconciled",
    "serviceChangeReconciled",
    "travelPayReconciled",
    "adjustmentsReconciled",
    "noCustomerComplaintAffectingPay",
    "noRefundIssueAffectingPay",
    "noDamageOrSupplyIssueAffectingPay",
    "compensationApproved",
    "contractorControlSatisfied",
  ];
  var issueControls = [
    "noCustomerComplaintAffectingPay",
    "noRefundIssueAffectingPay",
    "noDamageOrSupplyIssueAffectingPay",
    "contractorControlSatisfied",
  ];
  var derivedCloseoutStatus = nonStripeControls.every(function (key) {
    return closeout[key] === true;
  })
    ? "COMPLETE"
    : issueControls.some(function (key) {
          return closeout[key] !== true;
        })
      ? "ISSUE_REVIEW"
      : "PENDING";
  if (statedCloseoutStatus !== derivedCloseoutStatus) {
    throw new Error("Assignment closeout status contradicts its controls");
  }
  var sourceWithoutRevision = {
    sourceRevision: sourceRevision,
    bookingId: bookingId,
    assignmentId: assignmentId,
    artistId: artistId,
    artistName: artistName,
    eventName: eventName,
    eventDate: paymentEventDate,
    closeoutVerifiedAt: closeoutVerifiedAt,
    service: service,
    servicePayCents: servicePayCents,
    travelPayCents: travelPayCents,
    bonusCents: bonusCents,
    adjustmentCents: adjustmentCents,
    deductionCents: deductionCents,
    totalApprovedPayCents: totalApprovedPayCents,
    priorPayment: priorPaymentDisposition_(payment),
    closeout: closeout,
  };
  var revisionMaterial = Object.assign({}, sourceWithoutRevision, {
    assignmentPolicyVersion: policyVersion,
    closeoutStatus: statedCloseoutStatus,
    legacyIssueState: noLegacyIssue ? "NONE" : "PRESENT",
    legacyIssueDigest:
      normalizedLegacyIssue === "" ? null : sha256Hex_(normalizedLegacyIssue),
  });
  revisionMaterial.priorPayment = {
    disposition: sourceWithoutRevision.priorPayment.reasonCodes.some(
      function (code) {
        return code !== "EXISTING_PAYOUT_PROJECTION_PRESENT";
      },
    )
      ? "OWNER_REVIEW_REQUIRED"
      : "CLEAR",
    reasonCodes: sourceWithoutRevision.priorPayment.reasonCodes.filter(
      function (code) {
        return code !== "EXISTING_PAYOUT_PROJECTION_PRESENT";
      },
    ),
    legacyPaymentMethodPresent:
      sourceWithoutRevision.priorPayment.legacyPaymentMethodPresent,
    legacyPaymentHandlePresent:
      sourceWithoutRevision.priorPayment.legacyPaymentHandlePresent,
  };
  return {
    rowNumber: paymentResult.rowNumber,
    source: Object.assign(
      {
        recordId: recordId,
        revision: sourceRevisionToken_(revisionMaterial),
      },
      sourceWithoutRevision,
    ),
  };
}

function assertProjectionPayload_(payload, config) {
  exactObjectKeys_(
    payload,
    ["operation", "expectedRecordId", "expectedRevision", "projection"],
    "CRM projection write payload",
  );
  if (payload.operation !== "artist_payout_projection_v1") {
    throw new Error("CRM projection write operation is unsupported");
  }
  if (!safeBusinessId_(payload.expectedRecordId)) {
    throw new Error("CRM projection record identity is malformed");
  }
  boundedText_(payload.expectedRevision, 200, "CRM expected revision", false);
  var projection = payload.projection;
  exactObjectKeys_(projection, HFLA_PROJECTION_KEYS, "CRM safe projection");
  if (projection.environment !== config.environment) {
    throw new Error("CRM projection environment does not match deployment");
  }
  [
    projection.ledgerId,
    projection.bookingId,
    projection.assignmentId,
    projection.artistId,
  ].forEach(function (value) {
    if (!safeBusinessId_(value)) {
      throw new Error("CRM projection contains a malformed business identity");
    }
  });
  if (
    !Number.isSafeInteger(projection.sourceRevision) ||
    projection.sourceRevision < 1
  ) {
    throw new Error("CRM projection source revision is invalid");
  }
  if (HFLA_PAYOUT_STATES.indexOf(projection.state) === -1) {
    throw new Error("CRM projection state is invalid");
  }
  if (projection.batchId !== null && !safeBusinessId_(projection.batchId)) {
    throw new Error("CRM projection batch ID is invalid");
  }
  if (
    projection.batchDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(projection.batchDate)
  ) {
    throw new Error("CRM projection batch date is invalid");
  }
  if (projection.currency !== "usd") {
    throw new Error("CRM projection currency is invalid");
  }
  if (
    !Number.isSafeInteger(projection.amountCents) ||
    projection.amountCents <= 0 ||
    projection.amountCents > 100000000000
  ) {
    throw new Error("CRM projection amount is invalid");
  }
  if (!/^acct_[A-Za-z0-9]{8,100}$/.test(projection.connectedAccountId)) {
    throw new Error("CRM projection Stripe account ID is invalid");
  }
  if (
    projection.transferId !== null &&
    !/^tr_[A-Za-z0-9]{8,100}$/.test(projection.transferId)
  ) {
    throw new Error("CRM projection Stripe transfer ID is invalid");
  }
  if (
    projection.payoutId !== null &&
    !/^po_[A-Za-z0-9]{8,100}$/.test(projection.payoutId)
  ) {
    throw new Error("CRM projection Stripe payout ID is invalid");
  }
  if (projection.payoutStatus !== null) {
    var payoutStatus = boundedText_(
      projection.payoutStatus,
      80,
      "CRM projection payout status",
      false,
    );
    if (
      ["pending", "in_transit", "paid", "failed", "canceled"].indexOf(
        payoutStatus,
      ) === -1
    ) {
      throw new Error("CRM projection payout status is unsupported");
    }
  }
  if (typeof projection.reconciled !== "boolean") {
    throw new Error("CRM projection reconciled flag is invalid");
  }
  if (projection.reconciledAt !== null) {
    isoInstant_(projection.reconciledAt, "CRM reconciliation time");
  }
  if (
    (projection.reconciled && projection.reconciledAt === null) ||
    (!projection.reconciled && projection.reconciledAt !== null)
  ) {
    throw new Error(
      "CRM reconciliation flag and timestamp must advance together",
    );
  }
  isoInstant_(projection.lastVerifiedAt, "CRM projection verification time");
  if (projection.manualPayment !== null) {
    exactObjectKeys_(
      projection.manualPayment,
      HFLA_MANUAL_PAYMENT_KEYS,
      "CRM manual payment evidence",
    );
    HFLA_MANUAL_PAYMENT_KEYS.forEach(function (key) {
      if (key === "recordedAt") {
        isoInstant_(
          projection.manualPayment[key],
          "CRM manual payment recording time",
        );
      } else {
        boundedText_(
          projection.manualPayment[key],
          240,
          "CRM manual payment " + key,
          false,
        );
      }
    });
  }
  return projection;
}

function projectionWriteValues_(projection, revision) {
  var manual = projection.manualPayment;
  return [
    projection.environment,
    projection.ledgerId,
    projection.sourceRevision,
    projection.state,
    projection.batchId === null ? "" : projection.batchId,
    projection.batchDate === null ? "" : projection.batchDate,
    projection.currency,
    projection.amountCents,
    projection.connectedAccountId,
    projection.transferId === null ? "" : projection.transferId,
    projection.payoutId === null ? "" : projection.payoutId,
    projection.payoutStatus === null ? "" : projection.payoutStatus,
    projection.reconciled,
    projection.reconciledAt === null ? "" : projection.reconciledAt,
    manual === null ? "" : manual.method,
    manual === null ? "" : manual.reason,
    manual === null ? "" : manual.evidenceReference,
    manual === null ? "" : manual.memo,
    manual === null ? "" : manual.recordedBy,
    manual === null ? "" : manual.recordedAt,
    projection.lastVerifiedAt,
    revision,
  ];
}

function storedProjectionFromRow_(row, timezone) {
  var ledgerId = row[HFLA_PROJECTION_COLUMN_MAP.ledgerId];
  if (ledgerId === "" || ledgerId === null) {
    Object.keys(HFLA_PROJECTION_COLUMN_MAP).forEach(function (key) {
      if (key === "ledgerId" || key === "reconciled") return;
      var value = row[HFLA_PROJECTION_COLUMN_MAP[key]];
      if (value !== "" && value !== null) {
        throw new Error("Partial CRM payout projection requires owner review");
      }
    });
    var reconciledValue = row[HFLA_PROJECTION_COLUMN_MAP.reconciled];
    if (
      reconciledValue !== "" &&
      reconciledValue !== null &&
      reconciledValue !== false
    ) {
      throw new Error("Partial CRM payout projection requires owner review");
    }
    return null;
  }
  var manualMethod = row["Manual Payment Method"];
  var manual = null;
  if (manualMethod !== "" && manualMethod !== null) {
    manual = {
      method: boundedText_(manualMethod, 240, "Manual payment method", false),
      reason: boundedText_(
        row["Manual Payment Reason"],
        240,
        "Manual payment reason",
        false,
      ),
      evidenceReference: boundedText_(
        row["Manual Payment Evidence Reference"],
        240,
        "Manual payment evidence reference",
        false,
      ),
      memo: boundedText_(
        row["Manual Payment Memo"],
        240,
        "Manual payment memo",
        false,
      ),
      recordedBy: boundedText_(
        row["Manual Payment Recorded By"],
        240,
        "Manual payment recorder",
        false,
      ),
      recordedAt: instantCell_(
        row["Manual Payment Recorded At"],
        "Manual payment recorded time",
        false,
      ),
    };
  } else {
    [
      "Manual Payment Reason",
      "Manual Payment Evidence Reference",
      "Manual Payment Memo",
      "Manual Payment Recorded By",
      "Manual Payment Recorded At",
    ].forEach(function (header) {
      if (row[header] !== "" && row[header] !== null) {
        throw new Error(
          "Partial manual payment evidence requires owner review",
        );
      }
    });
  }
  var batchDate = row[HFLA_PROJECTION_COLUMN_MAP.batchDate];
  var projection = {
    environment: boundedText_(
      row[HFLA_PROJECTION_COLUMN_MAP.environment],
      16,
      "Stored payout environment",
      false,
    ),
    ledgerId: boundedText_(ledgerId, 160, "Stored ledger ID", false),
    bookingId: boundedText_(row["Booking ID"], 160, "Stored Booking ID", false),
    assignmentId: boundedText_(
      row["Assignment ID"],
      160,
      "Stored Assignment ID",
      false,
    ),
    artistId: boundedText_(row["Artist ID"], 160, "Stored Artist ID", false),
    sourceRevision: Number(row[HFLA_PROJECTION_COLUMN_MAP.sourceRevision]),
    state: boundedText_(
      row[HFLA_PROJECTION_COLUMN_MAP.state],
      80,
      "Stored payout state",
      false,
    ),
    batchId:
      row[HFLA_PROJECTION_COLUMN_MAP.batchId] === "" ||
      row[HFLA_PROJECTION_COLUMN_MAP.batchId] === null
        ? null
        : boundedText_(
            row[HFLA_PROJECTION_COLUMN_MAP.batchId],
            160,
            "Stored payout batch ID",
            false,
          ),
    batchDate:
      batchDate === "" || batchDate === null
        ? null
        : dateOnlyCell_(batchDate, timezone, "Stored payout batch date"),
    currency: boundedText_(
      row[HFLA_PROJECTION_COLUMN_MAP.currency],
      8,
      "Stored payout currency",
      false,
    ),
    amountCents: Number(row[HFLA_PROJECTION_COLUMN_MAP.amountCents]),
    connectedAccountId: boundedText_(
      row[HFLA_PROJECTION_COLUMN_MAP.connectedAccountId],
      120,
      "Stored Stripe account ID",
      false,
    ),
    transferId:
      row[HFLA_PROJECTION_COLUMN_MAP.transferId] === "" ||
      row[HFLA_PROJECTION_COLUMN_MAP.transferId] === null
        ? null
        : boundedText_(
            row[HFLA_PROJECTION_COLUMN_MAP.transferId],
            120,
            "Stored Stripe transfer ID",
            false,
          ),
    payoutId:
      row[HFLA_PROJECTION_COLUMN_MAP.payoutId] === "" ||
      row[HFLA_PROJECTION_COLUMN_MAP.payoutId] === null
        ? null
        : boundedText_(
            row[HFLA_PROJECTION_COLUMN_MAP.payoutId],
            120,
            "Stored Stripe payout ID",
            false,
          ),
    payoutStatus:
      row[HFLA_PROJECTION_COLUMN_MAP.payoutStatus] === "" ||
      row[HFLA_PROJECTION_COLUMN_MAP.payoutStatus] === null
        ? null
        : boundedText_(
            row[HFLA_PROJECTION_COLUMN_MAP.payoutStatus],
            80,
            "Stored Stripe payout status",
            false,
          ),
    reconciled: booleanCell_(
      row[HFLA_PROJECTION_COLUMN_MAP.reconciled],
      "Stored payout reconciliation",
    ),
    reconciledAt: instantCell_(
      row[HFLA_PROJECTION_COLUMN_MAP.reconciledAt],
      "Stored payout reconciliation time",
      true,
    ),
    manualPayment: manual,
    lastVerifiedAt: instantCell_(
      row[HFLA_PROJECTION_COLUMN_MAP.lastVerifiedAt],
      "Stored payout verification time",
      false,
    ),
  };
  return projection;
}

function normalizedValidationValue_(value) {
  if (value instanceof Date) return { date: value.toISOString() };
  if (Array.isArray(value)) return value.map(normalizedValidationValue_);
  if (value && typeof value === "object") return String(value);
  return value;
}

function validationSignature_(validation) {
  if (validation === null) return null;
  return JSON.stringify({
    criteriaType: String(validation.getCriteriaType()),
    criteriaValues: validation
      .getCriteriaValues()
      .map(normalizedValidationValue_),
    allowInvalid: validation.getAllowInvalid(),
    helpText: validation.getHelpText() || null,
  });
}

function rowPreservationSnapshot_(table, rowNumber) {
  var baseWidth = HFLA_PAYOUT_SCHEMA.base["11_ARTIST_PAYMENTS"].length;
  var baseRange = table.sheet.getRange(rowNumber, 1, 1, baseWidth);
  var fullRange = table.sheet.getRange(rowNumber, 1, 1, table.headers.length);
  return {
    values: JSON.stringify(baseRange.getValues()[0]),
    formulas: JSON.stringify(fullRange.getFormulas()[0]),
    validations: JSON.stringify(
      fullRange.getDataValidations()[0].map(validationSignature_),
    ),
    ids: JSON.stringify({
      recordId:
        baseRange.getDisplayValues()[0][table.index["Artist Payment ID"]],
      bookingId: baseRange.getDisplayValues()[0][table.index["Booking ID"]],
      artistId: baseRange.getDisplayValues()[0][table.index["Artist ID"]],
      assignmentId:
        baseRange.getDisplayValues()[0][table.index["Assignment ID"]],
    }),
  };
}

function assertPreservationSnapshot_(table, rowNumber, expected) {
  var actual = rowPreservationSnapshot_(table, rowNumber);
  Object.keys(expected).forEach(function (key) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        "Existing Artist Payments " + key + " changed during projection write",
      );
    }
  });
}

function rangesIntersect_(first, second) {
  var firstLastRow = first.getRow() + first.getNumRows() - 1;
  var firstLastColumn = first.getColumn() + first.getNumColumns() - 1;
  var secondLastRow = second.getRow() + second.getNumRows() - 1;
  var secondLastColumn = second.getColumn() + second.getNumColumns() - 1;
  return !(
    firstLastRow < second.getRow() ||
    secondLastRow < first.getRow() ||
    firstLastColumn < second.getColumn() ||
    secondLastColumn < first.getColumn()
  );
}

function assertProjectionTargetSafe_(table, target) {
  var formulas = target.getFormulas()[0];
  if (
    formulas.some(function (value) {
      return value !== "";
    })
  ) {
    throw new Error(
      "Projection target contains a formula and cannot be written",
    );
  }
  var protections = table.sheet.getProtections(
    SpreadsheetApp.ProtectionType.RANGE,
  );
  protections.forEach(function (protection) {
    if (rangesIntersect_(target, protection.getRange())) {
      throw new Error("Projection target intersects a protected range");
    }
  });
  if (
    table.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length !== 0
  ) {
    throw new Error("Projection target is on a protected sheet");
  }
}

function readProjection_(spreadsheet, identity, config) {
  assertMigratedWorkbookSchema_(spreadsheet);
  if (identity.environment !== config.environment) {
    throw new Error(
      "CRM projection read environment does not match deployment",
    );
  }
  [
    identity.ledgerId,
    identity.bookingId,
    identity.assignmentId,
    identity.recordId,
  ].forEach(function (value) {
    if (!safeBusinessId_(value)) {
      throw new Error("CRM projection read identity is malformed");
    }
  });
  var payments = assertSheetHeaders_(spreadsheet, "11_ARTIST_PAYMENTS", true);
  var sourceResult = authoritativePayoutSource_(
    spreadsheet,
    identity.recordId,
    config,
  );
  var row = rowObject_(payments, sourceResult.rowNumber);
  if (
    String(row["Booking ID"]) !== identity.bookingId ||
    String(row["Assignment ID"]) !== identity.assignmentId
  ) {
    throw new Error("CRM projection read returned a substituted identity");
  }
  var projection = storedProjectionFromRow_(
    row,
    spreadsheet.getSpreadsheetTimeZone(),
  );
  if (projection === null) {
    return {
      recordId: identity.recordId,
      revision: sourceResult.source.revision,
      projection: null,
    };
  }
  assertProjectionPayload_(
    {
      operation: "artist_payout_projection_v1",
      expectedRecordId: identity.recordId,
      expectedRevision: sourceResult.source.revision,
      projection: projection,
    },
    config,
  );
  if (
    projection.ledgerId !== identity.ledgerId ||
    projection.bookingId !== identity.bookingId ||
    projection.assignmentId !== identity.assignmentId
  ) {
    throw new Error("CRM stored projection identity does not match the read");
  }
  var storedRevision = boundedText_(
    row[HFLA_PROJECTION_COLUMN_MAP.revision],
    200,
    "Stored projection revision",
    false,
  );
  var expectedRevision = projectionRevisionToken_(
    projection,
    sourceResult.source.revision,
  );
  if (storedRevision !== expectedRevision) {
    throw new Error("CRM payout projection/source integrity conflict");
  }
  return {
    recordId: identity.recordId,
    revision: storedRevision,
    projection: projection,
  };
}

function appendAuditOnce_(
  spreadsheet,
  config,
  requestId,
  recordId,
  ledgerId,
  oldRevision,
  newRevision,
  reason,
  operation,
) {
  var auditOperation = operation || "artist_payout_projection_v1";
  if (
    ["artist_payout_projection_v1", "artist_roster_projection_v1"].indexOf(
      auditOperation,
    ) === -1
  ) {
    throw new Error("Unapproved payout audit operation");
  }
  var rosterAudit = auditOperation === "artist_roster_projection_v1";
  var audit = assertSheetHeaders_(spreadsheet, "10_AUDIT_LOG", false);
  var approvalToken =
    "request-sha256:" +
    sha256Hex_(
      config.environment + "\n" + auditOperation + "\n" + requestId,
    ).slice(0, 24);
  var approvalColumn = audit.index["Approval Source"];
  var lastRow = audit.sheet.getLastRow();
  if (lastRow >= 2) {
    var existing = audit.sheet
      .getRange(2, approvalColumn + 1, lastRow - 1, 1)
      .getDisplayValues();
    if (
      existing.some(function (row) {
        return row[0] === approvalToken;
      })
    ) {
      return;
    }
  }
  var values = [
    new Date().toISOString(),
    "payout-service",
    rosterAudit ? "Artist Roster Payout" : "Artist Payout",
    auditOperation,
    oldRevision,
    newRevision,
    reason,
    approvalToken,
    "environment=" +
      config.environment +
      (rosterAudit ? ";artist=" : ";record=") +
      recordId +
      (rosterAudit ? ";account=" : ";ledger=") +
      ledgerId,
  ];
  var targetRow = Math.max(2, lastRow + 1);
  var maxRows = audit.sheet.getMaxRows();
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 200000) {
    throw new Error("Audit grid row bound is invalid");
  }
  if (targetRow > maxRows) {
    audit.sheet.insertRowsAfter(maxRows, targetRow - maxRows);
  }
  var target = audit.sheet.getRange(targetRow, 1, 1, values.length);
  if (
    target.getFormulas()[0].some(function (formula) {
      return formula !== "";
    })
  ) {
    throw new Error("Audit append target contains a formula");
  }
  audit.sheet
    .getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .forEach(function (protection) {
      if (rangesIntersect_(target, protection.getRange())) {
        throw new Error("Audit append target intersects a protected range");
      }
    });
  if (
    audit.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length !== 0
  ) {
    throw new Error("Audit append target is on a protected sheet");
  }
  target.setValues([values]);
  SpreadsheetApp.flush();
  if (JSON.stringify(target.getValues()[0]) !== JSON.stringify(values)) {
    throw new Error("Audit append did not read back exactly");
  }
}

function writeProjection_(spreadsheet, payload, config, requestId) {
  var projection = assertProjectionPayload_(payload, config);
  var documentLock = LockService.getDocumentLock();
  documentLock.waitLock(15000);
  try {
    assertMigratedWorkbookSchema_(spreadsheet);
    var payments = assertSheetHeaders_(spreadsheet, "11_ARTIST_PAYMENTS", true);
    var sourceResult = authoritativePayoutSource_(
      spreadsheet,
      payload.expectedRecordId,
      config,
    );
    var source = sourceResult.source;
    if (
      projection.bookingId !== source.bookingId ||
      projection.assignmentId !== source.assignmentId ||
      projection.artistId !== source.artistId ||
      projection.sourceRevision !== source.sourceRevision ||
      projection.amountCents !== source.totalApprovedPayCents
    ) {
      throw new Error("CRM projection disagrees with authoritative source");
    }
    var row = rowObject_(payments, sourceResult.rowNumber);
    var current = storedProjectionFromRow_(
      row,
      spreadsheet.getSpreadsheetTimeZone(),
    );
    var currentRevision = source.revision;
    if (current !== null) {
      var storedRevision = boundedText_(
        row[HFLA_PROJECTION_COLUMN_MAP.revision],
        200,
        "Stored projection revision",
        false,
      );
      var recomputedRevision = projectionRevisionToken_(
        current,
        source.revision,
      );
      if (storedRevision !== recomputedRevision) {
        throw new Error("CRM payout projection/source integrity conflict");
      }
      currentRevision = storedRevision;
      if (
        canonicalProjectionJson_(current) ===
        canonicalProjectionJson_(projection)
      ) {
        if (
          payload.expectedRevision !== currentRevision &&
          payload.expectedRevision !== source.revision
        ) {
          throw new Error("CRM revision conflict requires owner review");
        }
        appendAuditOnce_(
          spreadsheet,
          config,
          requestId,
          payload.expectedRecordId,
          projection.ledgerId,
          currentRevision,
          currentRevision,
          "EXACT_REPLAY_RECOVERED",
        );
        return {
          recordId: payload.expectedRecordId,
          revision: currentRevision,
          recovered: true,
        };
      }
    }
    if (payload.expectedRevision !== currentRevision) {
      throw new Error("CRM revision conflict requires owner review");
    }
    var nextRevision = projectionRevisionToken_(projection, source.revision);
    var extensionStart =
      HFLA_PAYOUT_SCHEMA.base["11_ARTIST_PAYMENTS"].length + 1;
    var writeValues = projectionWriteValues_(projection, nextRevision);
    var target = payments.sheet.getRange(
      sourceResult.rowNumber,
      extensionStart,
      1,
      writeValues.length,
    );
    assertProjectionTargetSafe_(payments, target);
    var preserved = rowPreservationSnapshot_(payments, sourceResult.rowNumber);
    target.setValues([writeValues]);
    SpreadsheetApp.flush();
    assertPreservationSnapshot_(payments, sourceResult.rowNumber, preserved);
    var verified = readProjection_(
      spreadsheet,
      {
        environment: config.environment,
        ledgerId: projection.ledgerId,
        bookingId: projection.bookingId,
        assignmentId: projection.assignmentId,
        recordId: payload.expectedRecordId,
      },
      config,
    );
    if (
      verified.revision !== nextRevision ||
      canonicalProjectionJson_(verified.projection) !==
        canonicalProjectionJson_(projection)
    ) {
      throw new Error("CRM independent readback does not match projection");
    }
    appendAuditOnce_(
      spreadsheet,
      config,
      requestId,
      payload.expectedRecordId,
      projection.ledgerId,
      currentRevision,
      nextRevision,
      "APPLIED_AND_READ_BACK",
    );
    return {
      recordId: payload.expectedRecordId,
      revision: nextRevision,
      recovered: false,
    };
  } finally {
    documentLock.releaseLock();
  }
}
