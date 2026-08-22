/* global ContentService, JSON, Date, Object */

function finalPathSegment_(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function assertPathInfo_(event, configuredPath) {
  var expected = finalPathSegment_(configuredPath);
  if (!event || event.pathInfo !== expected) {
    throw new Error(
      "HFLA Apps Script path info does not match configured route",
    );
  }
}

function exactQuery_(event, expectedKeys) {
  if (!event || !event.parameter || !event.parameters) {
    throw new Error("HFLA Apps Script query is missing");
  }
  var actual = Object.keys(event.parameters).sort();
  var expected = expectedKeys.slice().sort();
  if (!exactStringArray_(actual, expected)) {
    throw new Error("HFLA Apps Script query contains missing or extra fields");
  }
  expectedKeys.forEach(function (key) {
    if (
      !Array.isArray(event.parameters[key]) ||
      event.parameters[key].length !== 1 ||
      event.parameter[key] !== event.parameters[key][0]
    ) {
      throw new Error("HFLA Apps Script query contains a duplicate field");
    }
  });
  return event.parameter;
}

function requestFromGet_(event, config) {
  if (!event || !event.parameter) throw new Error("Missing GET request");
  var operation = event.parameter.hflaOperation;
  var definition = HFLA_OPERATIONS[operation];
  if (!definition || definition.method !== "GET") {
    throw new Error("Unapproved HFLA GET operation");
  }
  assertPathInfo_(event, config.paths[operation]);
  var authQueryKeys = Object.keys(HFLA_GET_AUTH_MAP);
  var query = exactQuery_(event, authQueryKeys.concat(definition.businessKeys));
  var auth = Object.create(null);
  authQueryKeys.forEach(function (queryKey) {
    auth[HFLA_GET_AUTH_MAP[queryKey]] = query[queryKey];
  });
  var business = Object.create(null);
  definition.businessKeys.forEach(function (key) {
    business[key] = query[key];
  });
  return {
    method: "GET",
    operation: operation,
    path: config.paths[operation],
    auth: auth,
    business: business,
  };
}

function requestFromPost_(event, config) {
  if (
    !event ||
    !event.postData ||
    typeof event.postData.contents !== "string" ||
    event.postData.contents.length < 2 ||
    event.postData.contents.length > 65536 ||
    typeof event.postData.type !== "string" ||
    !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
      event.postData.type,
    )
  ) {
    throw new Error("HFLA Apps Script POST body is missing or unsafe");
  }
  if (
    (event.parameters && Object.keys(event.parameters).length !== 0) ||
    (event.parameter && Object.keys(event.parameter).length !== 0)
  ) {
    throw new Error("HFLA Apps Script POST query fields are not allowed");
  }
  var envelope;
  try {
    envelope = JSON.parse(event.postData.contents);
  } catch (_ignored) {
    throw new Error("HFLA Apps Script POST body is malformed JSON");
  }
  exactObjectKeys_(envelope, ["auth", "payload"], "HFLA request envelope");
  exactObjectKeys_(
    envelope.auth,
    HFLA_AUTH_KEYS,
    "HFLA request authentication",
  );
  var operation = envelope.auth.operation;
  var definition = HFLA_OPERATIONS[operation];
  if (!definition || definition.method !== "POST") {
    throw new Error("Unapproved HFLA POST operation");
  }
  assertPathInfo_(event, config.paths[operation]);
  return {
    method: "POST",
    operation: operation,
    path: config.paths[operation],
    auth: envelope.auth,
    business: envelope.payload,
  };
}

function dispatchVerifiedRequest_(request, config) {
  var spreadsheet = openPayoutSpreadsheet_(config);
  if (request.operation === "artist_roster_read_v1") {
    var artist = readArtistIdentity_(
      spreadsheet,
      request.business.artistId,
      config,
    );
    return {
      ok: true,
      requestId: request.auth.requestId,
      environment: config.environment,
      artist: artist,
    };
  }
  if (request.operation === "artist_roster_list_v1") {
    var rosterPage = listActiveArtistIdentities_(
      spreadsheet,
      request.business.afterArtistId,
      config,
    );
    return {
      ok: true,
      requestId: request.auth.requestId,
      environment: config.environment,
      rosterRevision: rosterPage.rosterRevision,
      totalActiveCount: rosterPage.totalActiveCount,
      artists: rosterPage.artists,
      nextAfterArtistId: rosterPage.nextAfterArtistId,
      complete: rosterPage.complete,
    };
  }
  if (request.operation === "artist_roster_projection_read_v1") {
    var rosterProjectionRead = readRosterProjection_(
      spreadsheet,
      request.business,
      config,
    );
    return {
      ok: true,
      environment: config.environment,
      artistId: rosterProjectionRead.artistId,
      revision: rosterProjectionRead.revision,
      requestId: request.auth.requestId,
      projection: rosterProjectionRead.projection,
    };
  }
  if (request.operation === "artist_roster_projection_v1") {
    var rosterWrite = writeRosterProjection_(
      spreadsheet,
      request.business,
      config,
      request.auth.requestId,
    );
    return {
      ok: true,
      environment: config.environment,
      artistId: rosterWrite.artistId,
      revision: rosterWrite.revision,
      requestId: request.auth.requestId,
    };
  }
  if (request.operation === "crm_payout_source_read_v1") {
    var source = authoritativePayoutSource_(
      spreadsheet,
      request.business.crmRecordId,
      config,
    ).source;
    return {
      ok: true,
      requestId: request.auth.requestId,
      environment: config.environment,
      source: source,
    };
  }
  if (request.operation === "artist_payout_read_v1") {
    exactObjectKeys_(
      request.business,
      HFLA_OPERATIONS.artist_payout_read_v1.businessKeys,
      "CRM projection read identity",
    );
    var projectionRead = readProjection_(spreadsheet, request.business, config);
    return {
      ok: true,
      recordId: projectionRead.recordId,
      revision: projectionRead.revision,
      requestId: request.auth.requestId,
      projection: projectionRead.projection,
    };
  }
  if (request.operation === "artist_payout_projection_v1") {
    var write = writeProjection_(
      spreadsheet,
      request.business,
      config,
      request.auth.requestId,
    );
    return {
      ok: true,
      recordId: write.recordId,
      revision: write.revision,
      requestId: request.auth.requestId,
    };
  }
  throw new Error("Unapproved HFLA payout operation");
}

function executeRequest_(request, config, now) {
  verifyRequest_(request, config, now);
  var payload;
  try {
    payload = dispatchVerifiedRequest_(request, config);
  } catch (error) {
    console.error(
      JSON.stringify({
        area: "artist-payout-adapter",
        environment: config.environment,
        operation: request.operation,
        requestIdDigest: sha256Hex_(request.auth.requestId).slice(0, 24),
        result: "FAILED_CLOSED",
        errorClass:
          error && error.constructor && error.constructor.name
            ? error.constructor.name
            : "Error",
      }),
    );
    payload = { ok: false, error: "REQUEST_FAILED_CLOSED" };
  }
  return signedResponseEnvelope_(payload, request, config, new Date());
}

function unsignedFailureEnvelope_() {
  return {
    payload: { ok: false, error: "REQUEST_REJECTED" },
    auth: null,
  };
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet(event) {
  try {
    var config = loadConfig_();
    var request = requestFromGet_(event, config);
    return jsonOutput_(executeRequest_(request, config, new Date()));
  } catch (error) {
    console.error(
      JSON.stringify({
        area: "artist-payout-adapter",
        result: "AUTHENTICATION_REJECTED",
        errorClass:
          error && error.constructor && error.constructor.name
            ? error.constructor.name
            : "Error",
      }),
    );
    return jsonOutput_(unsignedFailureEnvelope_());
  }
}

function doPost(event) {
  try {
    var config = loadConfig_();
    var request = requestFromPost_(event, config);
    return jsonOutput_(executeRequest_(request, config, new Date()));
  } catch (error) {
    console.error(
      JSON.stringify({
        area: "artist-payout-adapter",
        result: "AUTHENTICATION_REJECTED",
        errorClass:
          error && error.constructor && error.constructor.name
            ? error.constructor.name
            : "Error",
      }),
    );
    return jsonOutput_(unsignedFailureEnvelope_());
  }
}

// Exposes pure canonicalization and dispatch seams to the local VM test only.
// It is not an HTTP route and has no production authority of its own.
var HflaPayoutServerTest = Object.freeze({
  requestCanonical: requestCanonical_,
  signedResponseEnvelope: signedResponseEnvelope_,
  executeRequest: executeRequest_,
  requestFromGet: requestFromGet_,
  requestFromPost: requestFromPost_,
});
