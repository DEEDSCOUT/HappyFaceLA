/* global Drive, SpreadsheetApp, LockService, JSON, Object */

function driveVersion_(spreadsheetId) {
  var file = Drive.Files.get(spreadsheetId);
  var version = file && file.version;
  if (
    (typeof version !== "string" && typeof version !== "number") ||
    !/^\d+$/.test(String(version))
  ) {
    throw new Error("Drive did not return a canonical workbook version");
  }
  return String(version);
}

function schemaState_(spreadsheet) {
  var state = Object.create(null);
  Object.keys(HFLA_PAYOUT_SCHEMA.base).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet)
      throw new Error("Missing Booking Control Center tab: " + sheetName);
    if (sheet.getSheetId() !== HFLA_PAYOUT_SCHEMA.sheetIds[sheetName]) {
      throw new Error(
        "Booking Control Center tab identity drift: " + sheetName,
      );
    }
    var actual = sheetHeaders_(sheet);
    var base = expectedHeaders_(sheetName, false);
    var migrated = expectedHeaders_(sheetName, true);
    if (exactStringArray_(actual, migrated))
      state[sheetName] = "MIGRATED_EXACT";
    else if (exactStringArray_(actual, base)) state[sheetName] = "BASE_EXACT";
    else throw new Error("Booking Control Center header drift: " + sheetName);
  });
  return state;
}

function auditArtistPayoutSchema() {
  var config = loadConfig_();
  var spreadsheet = openPayoutSpreadsheet_(config);
  var result = {
    ok: true,
    schemaVersion: HFLA_PAYOUT_SCHEMA.version,
    environment: config.environment,
    spreadsheetIdDigest: sha256Hex_(config.spreadsheetId).slice(0, 24),
    driveVersion: driveVersion_(config.spreadsheetId),
    tabs: schemaState_(spreadsheet),
  };
  console.log(JSON.stringify(result));
  return result;
}

function columnLetter_(column) {
  var result = "";
  var value = column;
  while (value > 0) {
    var remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function listValidation_(values, helpText) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .setHelpText(helpText)
    .build();
}

function applyColumnValidation_(sheet, headers, header, validation) {
  var index = headerIndex_(headers)[header];
  if (!Number.isSafeInteger(index)) {
    throw new Error("Migration validation header is missing: " + header);
  }
  sheet
    .getRange(2, index + 1, Math.max(1, sheet.getMaxRows() - 1), 1)
    .setDataValidation(validation);
}

function applyCheckboxes_(sheet, headers, fields, initializeBlankColumns) {
  var index = headerIndex_(headers);
  var validation = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .setHelpText("Checked or unchecked only")
    .build();
  fields.forEach(function (header) {
    if (!Number.isSafeInteger(index[header])) {
      throw new Error("Migration checkbox header is missing: " + header);
    }
    var range = sheet.getRange(
      2,
      index[header] + 1,
      Math.max(1, sheet.getMaxRows() - 1),
      1,
    );
    range.setDataValidation(validation);
    if (initializeBlankColumns === true) {
      range.setValue(false);
    }
  });
}

function applyPlainText_(sheet, headers, fields) {
  var index = headerIndex_(headers);
  fields.forEach(function (header) {
    sheet
      .getRange(2, index[header] + 1, Math.max(1, sheet.getMaxRows() - 1), 1)
      .setNumberFormat("@");
  });
}

function applyCustomFormulaValidation_(
  sheet,
  headers,
  header,
  formula,
  helpText,
) {
  applyColumnValidation_(
    sheet,
    headers,
    header,
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(formula)
      .setAllowInvalid(false)
      .setHelpText(helpText)
      .build(),
  );
}

function fieldReference_(headers, header) {
  var column = headerIndex_(headers)[header] + 1;
  if (!Number.isSafeInteger(column) || column < 1) {
    throw new Error("Migration formula header is missing: " + header);
  }
  return columnLetter_(column) + "2";
}

function applyCanonicalDateValidation_(sheet, headers, header) {
  var cell = fieldReference_(headers, header);
  applyCustomFormulaValidation_(
    sheet,
    headers,
    header,
    "=OR(" +
      cell +
      '=\"\",REGEXMATCH(TO_TEXT(' +
      cell +
      '),\"^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$\"))',
    "Blank or canonical YYYY-MM-DD",
  );
}

function applyCanonicalInstantValidation_(sheet, headers, header) {
  var cell = fieldReference_(headers, header);
  applyCustomFormulaValidation_(
    sheet,
    headers,
    header,
    "=OR(" +
      cell +
      '=\"\",REGEXMATCH(TO_TEXT(' +
      cell +
      '),\"^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][.][0-9]{3}Z$\"))',
    "Blank or canonical ISO UTC instant",
  );
}

function applyPositiveIntegerValidation_(sheet, headers, header, allowBlank) {
  var cell = fieldReference_(headers, header);
  var predicate =
    "AND(ISNUMBER(" + cell + ")," + cell + ">=1,MOD(" + cell + ",1)=0)";
  applyCustomFormulaValidation_(
    sheet,
    headers,
    header,
    allowBlank ? "=OR(" + cell + '=\"\",' + predicate + ")" : "=" + predicate,
    "Positive whole number",
  );
}

function applyMoneyValidation_(sheet, headers, header, allowNegative) {
  var cell = fieldReference_(headers, header);
  var nonnegative = allowNegative ? "" : "," + cell + ">=0";
  applyCustomFormulaValidation_(
    sheet,
    headers,
    header,
    "=OR(" +
      cell +
      '=\"\",AND(ISNUMBER(' +
      cell +
      "),ROUND(" +
      cell +
      ",2)=" +
      cell +
      nonnegative +
      "))",
    allowNegative
      ? "Blank or signed numeric value with at most two decimals"
      : "Blank or nonnegative numeric value with at most two decimals",
  );
}

function formatNewColumns_(sheet, baseWidth, extensionWidth) {
  var headerSource = sheet.getRange(1, baseWidth, 1, 1);
  var headerTarget = sheet.getRange(1, baseWidth + 1, 1, extensionWidth);
  headerSource.copyTo(
    headerTarget,
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false,
  );
  headerTarget.setWrap(true).setVerticalAlignment("middle");
  var body = sheet.getRange(
    2,
    baseWidth + 1,
    Math.max(1, sheet.getMaxRows() - 1),
    extensionWidth,
  );
  body.setWrap(true).setVerticalAlignment("middle");
  sheet.setColumnWidths(baseWidth + 1, extensionWidth, 160);
}

function ensureExtensionGrid_(sheet, baseWidth, extensionWidth) {
  var current = sheet.getMaxColumns();
  var expected = baseWidth + extensionWidth;
  if (current < baseWidth || current > expected) {
    throw new Error("Booking Control Center grid width is not migration-safe");
  }
  if (current < expected) {
    sheet.insertColumnsAfter(current, expected - current);
  }
  if (sheet.getMaxColumns() !== expected) {
    throw new Error("Booking Control Center grid expansion did not verify");
  }
}

function applyApprovedExtensionValidations_(
  spreadsheet,
  initializeBlankCheckboxColumns,
) {
  var payments = assertSheetHeaders_(spreadsheet, "11_ARTIST_PAYMENTS", true);
  var roster = assertSheetHeaders_(spreadsheet, "12_ARTIST_ROSTER", true);
  var assignments = assertSheetHeaders_(
    spreadsheet,
    "13_ARTIST_ASSIGNMENTS",
    true,
  );
  applyColumnValidation_(
    payments.sheet,
    payments.headers,
    "Payout Environment",
    listValidation_(HFLA_ALLOWED_ENVIRONMENTS, "Exact payout environment"),
  );
  applyColumnValidation_(
    payments.sheet,
    payments.headers,
    "Payout State",
    listValidation_(HFLA_PAYOUT_STATES, "Exact payout state code"),
  );
  applyColumnValidation_(
    payments.sheet,
    payments.headers,
    "Payout Currency",
    listValidation_(["usd"], "Artist payouts are USD only"),
  );
  applyColumnValidation_(
    payments.sheet,
    payments.headers,
    "Stripe Payout Status",
    listValidation_(
      ["pending", "in_transit", "paid", "failed", "canceled"],
      "Exact supported Stripe payout status",
    ),
  );
  applyCheckboxes_(
    payments.sheet,
    payments.headers,
    ["Payout Reconciled?"],
    initializeBlankCheckboxColumns,
  );
  applyPositiveIntegerValidation_(
    payments.sheet,
    payments.headers,
    "Payout Source Revision",
    true,
  );
  applyPositiveIntegerValidation_(
    payments.sheet,
    payments.headers,
    "Total Approved Pay Cents",
    true,
  );
  applyCanonicalDateValidation_(
    payments.sheet,
    payments.headers,
    "Payout Batch Date",
  );
  [
    "Payout Reconciled At",
    "Manual Payment Recorded At",
    "Payout Last Verified At",
  ].forEach(function (header) {
    applyCanonicalInstantValidation_(payments.sheet, payments.headers, header);
  });
  applyMoneyValidation_(
    payments.sheet,
    payments.headers,
    "Pay Adjustment",
    true,
  );
  applyMoneyValidation_(
    payments.sheet,
    payments.headers,
    "Pay Deduction",
    false,
  );
  var projectionRevisionCell = fieldReference_(
    payments.headers,
    "Payout Projection Revision",
  );
  applyCustomFormulaValidation_(
    payments.sheet,
    payments.headers,
    "Payout Projection Revision",
    "=OR(" +
      projectionRevisionCell +
      '=\"\",REGEXMATCH(TO_TEXT(' +
      projectionRevisionCell +
      '),\"^payout-projection:v1:[a-f0-9]{64}$\"))',
    "Exact payout projection revision token",
  );
  applyPlainText_(payments.sheet, payments.headers, [
    "Payout Environment",
    "Payout Ledger ID",
    "Payout State",
    "Payout Batch ID",
    "Payout Batch Date",
    "Payout Currency",
    "Stripe Connected Account ID",
    "Stripe Transfer ID",
    "Stripe Payout ID",
    "Stripe Payout Status",
    "Payout Reconciled At",
    "Manual Payment Method",
    "Manual Payment Reason",
    "Manual Payment Evidence Reference",
    "Manual Payment Memo",
    "Manual Payment Recorded By",
    "Manual Payment Recorded At",
    "Payout Last Verified At",
    "Payout Projection Revision",
  ]);

  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Legal Entity Type",
    listValidation_(
      ["individual", "company", "non_profit", "government_entity"],
      "Exact Stripe legal entity type",
    ),
  );
  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Onboarding Status",
    listValidation_(
      [
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
      ],
      "Exact artist onboarding state",
    ),
  );
  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Requirements Status",
    listValidation_(
      [
        "complete",
        "pending",
        "currently_due",
        "past_due",
        "closed",
        "inactive",
      ],
      "Exact supported Stripe requirements state",
    ),
  );
  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Dashboard Type",
    listValidation_(["express"], "Express dashboard only"),
  );
  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Preferred Payout Type",
    listValidation_(
      ["automatic_standard", "unverified"],
      "Verified automatic standard payouts or unverified",
    ),
  );
  applyCheckboxes_(
    roster.sheet,
    roster.headers,
    [
      "Stripe Transfers Enabled",
      "Stripe Payout Ready",
      "Payout Exception Flag",
    ],
    initializeBlankCheckboxColumns,
  );
  var countryColumn = headerIndex_(roster.headers)["Stripe Country"] + 1;
  var countryLetter = columnLetter_(countryColumn);
  var countryValidation = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied(
      "=OR(" +
        countryLetter +
        '2="",REGEXMATCH(' +
        countryLetter +
        '2,"^[A-Z]{2}$"))',
    )
    .setAllowInvalid(false)
    .setHelpText("Two-letter uppercase country code")
    .build();
  applyColumnValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Country",
    countryValidation,
  );
  applyCanonicalInstantValidation_(
    roster.sheet,
    roster.headers,
    "Last Stripe Requirements Check",
  );
  applyCanonicalDateValidation_(
    roster.sheet,
    roster.headers,
    "Stripe Onboarded Date",
  );
  applyPlainText_(roster.sheet, roster.headers, [
    "Stripe Country",
    "Stripe Legal Entity Type",
    "Stripe Connected Account ID",
    "Stripe Onboarding Status",
    "Stripe Requirements Status",
    "Stripe Dashboard Type",
    "Preferred Payout Type",
    "Last Stripe Requirements Check",
    "Stripe Onboarded Date",
    "Stripe Disabled Reason",
  ]);

  applyCheckboxes_(
    assignments.sheet,
    assignments.headers,
    [
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
    ],
    initializeBlankCheckboxColumns,
  );
  applyColumnValidation_(
    assignments.sheet,
    assignments.headers,
    "Closeout Status",
    listValidation_(
      ["PENDING", "ISSUE_REVIEW", "COMPLETE"],
      "Exact closeout state",
    ),
  );
  applyPositiveIntegerValidation_(
    assignments.sheet,
    assignments.headers,
    "Assignment Source Revision",
    true,
  );
  applyCanonicalInstantValidation_(
    assignments.sheet,
    assignments.headers,
    "Closeout Verified At",
  );
  applyPlainText_(assignments.sheet, assignments.headers, [
    "Closeout Verified At",
    "Closeout Status",
    "Assignment Policy Version",
  ]);
}

function basePreservationSnapshot_(spreadsheet) {
  var snapshot = Object.create(null);
  Object.keys(HFLA_PAYOUT_SCHEMA.base).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    var width = HFLA_PAYOUT_SCHEMA.base[sheetName].length;
    var height = sheet.getMaxRows();
    if (!Number.isSafeInteger(height) || height < 1 || height > 200000) {
      throw new Error(
        "Booking Control Center grid height is not migration-safe",
      );
    }
    var range = sheet.getRange(1, 1, height, width);
    snapshot[sheetName] = JSON.stringify({
      values: range.getValues(),
      formulas: range.getFormulas(),
      validations: range.getDataValidations().map(function (row) {
        return row.map(validationSignature_);
      }),
      numberFormats: range.getNumberFormats(),
      backgrounds: range.getBackgrounds(),
      fontColors: range.getFontColors(),
      fontFamilies: range.getFontFamilies(),
      fontSizes: range.getFontSizes(),
      fontStyles: range.getFontStyles(),
      fontWeights: range.getFontWeights(),
      horizontalAlignments: range.getHorizontalAlignments(),
      verticalAlignments: range.getVerticalAlignments(),
      wrapStrategies: range.getWrapStrategies().map(function (row) {
        return row.map(String);
      }),
      columnWidths: Array.from({ length: width }, function (_value, index) {
        return sheet.getColumnWidth(index + 1);
      }),
      protections: protectionSnapshot_(sheet),
    });
  });
  return snapshot;
}

function extensionDataSnapshot_(spreadsheet) {
  var snapshot = Object.create(null);
  Object.keys(HFLA_PAYOUT_SCHEMA.extensions).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    var startColumn = HFLA_PAYOUT_SCHEMA.base[sheetName].length + 1;
    var width = HFLA_PAYOUT_SCHEMA.extensions[sheetName].length;
    var height = sheet.getMaxRows();
    if (!Number.isSafeInteger(height) || height < 1 || height > 200000) {
      throw new Error(
        "Booking Control Center extension grid height is not migration-safe",
      );
    }
    var range = sheet.getRange(1, startColumn, height, width);
    snapshot[sheetName] = JSON.stringify({
      values: range.getValues(),
      formulas: range.getFormulas(),
    });
  });
  return snapshot;
}

function assertExtensionDataPreserved_(spreadsheet, expected) {
  var actual = extensionDataSnapshot_(spreadsheet);
  Object.keys(expected).forEach(function (sheetName) {
    if (actual[sheetName] !== expected[sheetName]) {
      throw new Error(
        "Existing payout extension data changed during validation migration: " +
          sheetName,
      );
    }
  });
}

function protectionSnapshot_(sheet) {
  return [
    SpreadsheetApp.ProtectionType.RANGE,
    SpreadsheetApp.ProtectionType.SHEET,
  ].map(function (type) {
    return sheet.getProtections(type).map(function (protection) {
      var range = protection.getRange();
      return {
        type: String(type),
        row: range.getRow(),
        column: range.getColumn(),
        numRows: range.getNumRows(),
        numColumns: range.getNumColumns(),
        warningOnly: protection.isWarningOnly(),
        description: protection.getDescription() || null,
      };
    });
  });
}

function assertBasePreserved_(spreadsheet, expected) {
  var actual = basePreservationSnapshot_(spreadsheet);
  Object.keys(expected).forEach(function (sheetName) {
    if (actual[sheetName] !== expected[sheetName]) {
      throw new Error(
        "Existing values/formulas/validations changed during schema migration: " +
          sheetName,
      );
    }
  });
}

function applyApprovedArtistPayoutSchemaMigration() {
  var config = loadConfig_();
  var spreadsheet = openPayoutSpreadsheet_(config);
  var initialState = schemaState_(spreadsheet);
  var alreadyMigrated = Object.keys(initialState).every(function (sheetName) {
    return initialState[sheetName] === "MIGRATED_EXACT";
  });
  if (!alreadyMigrated) {
    Object.keys(initialState).forEach(function (sheetName) {
      var hasExtension = Boolean(HFLA_PAYOUT_SCHEMA.extensions[sheetName]);
      var expectedState = hasExtension ? "BASE_EXACT" : "MIGRATED_EXACT";
      if (initialState[sheetName] !== expectedState) {
        throw new Error("Partial schema migration requires owner review");
      }
    });
  }
  var properties = config.properties;
  if (
    properties.getProperty("HFLA_PAYOUT_SCHEMA_MIGRATION_ENABLED") !== "true"
  ) {
    throw new Error("Artist payout schema migration is not enabled");
  }
  var expectedVersion = requiredProperty_(
    properties,
    "HFLA_PAYOUT_EXPECTED_DRIVE_VERSION",
  );
  if (!/^\d+$/.test(expectedVersion)) {
    throw new Error("Expected Drive version is malformed");
  }
  var approval = requiredProperty_(
    properties,
    "HFLA_PAYOUT_SCHEMA_MIGRATION_APPROVAL",
  );
  var expectedApproval =
    "I APPROVE ARTIST PAYOUT SCHEMA V1 " +
    config.environment +
    " " +
    config.spreadsheetId +
    " " +
    expectedVersion;
  if (approval !== expectedApproval) {
    throw new Error("Artist payout schema migration approval does not match");
  }
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (driveVersion_(config.spreadsheetId) !== expectedVersion) {
      throw new Error("Booking Control Center Drive version changed");
    }
    var preserved = basePreservationSnapshot_(spreadsheet);
    if (alreadyMigrated) {
      var extensionData = extensionDataSnapshot_(spreadsheet);
      assertMigratedWorkbookSchema_(spreadsheet);
      applyApprovedExtensionValidations_(spreadsheet, false);
      SpreadsheetApp.flush();
      assertBasePreserved_(spreadsheet, preserved);
      assertExtensionDataPreserved_(spreadsheet, extensionData);
      return {
        ok: true,
        alreadyApplied: true,
        validationsReapplied: true,
        schemaVersion: HFLA_PAYOUT_SCHEMA.version,
        environment: config.environment,
        beforeDriveVersion: expectedVersion,
        afterDriveVersion: driveVersion_(config.spreadsheetId),
      };
    }
    Object.keys(HFLA_PAYOUT_SCHEMA.extensions).forEach(function (sheetName) {
      var table = assertSheetHeaders_(spreadsheet, sheetName, false);
      var extension = HFLA_PAYOUT_SCHEMA.extensions[sheetName];
      ensureExtensionGrid_(table.sheet, table.headers.length, extension.length);
      formatNewColumns_(table.sheet, table.headers.length, extension.length);
      table.sheet
        .getRange(1, table.headers.length + 1, 1, extension.length)
        .setValues([extension]);
    });
    SpreadsheetApp.flush();
    assertMigratedWorkbookSchema_(spreadsheet);
    applyApprovedExtensionValidations_(spreadsheet, true);
    SpreadsheetApp.flush();
    assertBasePreserved_(spreadsheet, preserved);
    return {
      ok: true,
      alreadyApplied: false,
      schemaVersion: HFLA_PAYOUT_SCHEMA.version,
      environment: config.environment,
      beforeDriveVersion: expectedVersion,
      afterDriveVersion: driveVersion_(config.spreadsheetId),
    };
  } finally {
    lock.releaseLock();
  }
}
