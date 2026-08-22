/* global Utilities, PropertiesService, LockService, JSON, Date, Object */

var HFLA_REQUEST_ALGORITHM = "HFLA-HMAC-SHA256";
var HFLA_REQUEST_VERSION = "v1";
var HFLA_TRANSPORT_DOMAIN = "HFLA-APPS-SCRIPT-TRANSPORT";
var HFLA_ALLOWED_ENVIRONMENTS = Object.freeze(["sandbox", "live"]);
var HFLA_OPERATIONS = Object.freeze({
  artist_roster_read_v1: Object.freeze({
    method: "GET",
    pathProperty: "HFLA_PAYOUT_ROSTER_PATH",
    businessKeys: Object.freeze(["artistId"]),
  }),
  artist_roster_list_v1: Object.freeze({
    method: "GET",
    pathProperty: "HFLA_PAYOUT_ROSTER_LIST_PATH",
    businessKeys: Object.freeze(["afterArtistId"]),
  }),
  artist_roster_projection_read_v1: Object.freeze({
    method: "GET",
    pathProperty: "HFLA_PAYOUT_ROSTER_PROJECTION_READ_PATH",
    businessKeys: Object.freeze(["environment", "artistId"]),
  }),
  artist_roster_projection_v1: Object.freeze({
    method: "POST",
    pathProperty: "HFLA_PAYOUT_ROSTER_PROJECTION_WRITE_PATH",
    businessKeys: null,
  }),
  crm_payout_source_read_v1: Object.freeze({
    method: "GET",
    pathProperty: "HFLA_PAYOUT_SOURCE_PATH",
    businessKeys: Object.freeze(["crmRecordId"]),
  }),
  artist_payout_read_v1: Object.freeze({
    method: "GET",
    pathProperty: "HFLA_PAYOUT_PROJECTION_READ_PATH",
    businessKeys: Object.freeze([
      "environment",
      "ledgerId",
      "bookingId",
      "assignmentId",
      "recordId",
    ]),
  }),
  artist_payout_projection_v1: Object.freeze({
    method: "POST",
    pathProperty: "HFLA_PAYOUT_PROJECTION_WRITE_PATH",
    businessKeys: null,
  }),
});

var HFLA_AUTH_KEYS = Object.freeze([
  "algorithm",
  "version",
  "environment",
  "operation",
  "requestId",
  "timestamp",
  "signature",
]);

var HFLA_GET_AUTH_MAP = Object.freeze({
  hflaAlgorithm: "algorithm",
  hflaVersion: "version",
  hflaEnvironment: "environment",
  hflaOperation: "operation",
  hflaRequestId: "requestId",
  hflaTimestamp: "timestamp",
  hflaSignature: "signature",
});

function exactObjectKeys_(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  var actual = Object.keys(value).sort();
  var sortedExpected = expected.slice().sort();
  if (!exactStringArray_(actual, sortedExpected)) {
    throw new Error(label + " contains missing or unapproved fields");
  }
}

function requiredProperty_(properties, name) {
  var value = properties.getProperty(name);
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error("Missing or unsafe Apps Script property: " + name);
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(
      "Unsafe control character in Apps Script property: " + name,
    );
  }
  return value;
}

function parseHttpsOrigin_(value) {
  if (value !== "https://script.google.com") {
    throw new Error(
      "HFLA payout public origin must be the canonical Apps Script origin",
    );
  }
  return value;
}

function parseRoutePath_(value) {
  if (
    !/^\/macros\/s\/[A-Za-z0-9_-]{8,256}\/exec\/[A-Za-z0-9._~-]{3,120}$/.test(
      value,
    )
  ) {
    throw new Error("HFLA payout route is not a canonical Apps Script path");
  }
  return value;
}

function loadConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var environment = requiredProperty_(properties, "HFLA_PAYOUT_ENVIRONMENT");
  if (HFLA_ALLOWED_ENVIRONMENTS.indexOf(environment) === -1) {
    throw new Error("HFLA payout environment is invalid");
  }
  var spreadsheetId = requiredProperty_(
    properties,
    "HFLA_PAYOUT_SPREADSHEET_ID",
  );
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(spreadsheetId)) {
    throw new Error("HFLA payout spreadsheet ID is malformed");
  }
  var secret = requiredProperty_(properties, "HFLA_PAYOUT_HMAC_SECRET");
  if (secret.length < 32 || secret.length > 4096) {
    throw new Error("HFLA payout HMAC secret is not configured securely");
  }
  var skewRaw = requiredProperty_(
    properties,
    "HFLA_PAYOUT_MAX_CLOCK_SKEW_SECONDS",
  );
  if (!/^\d+$/.test(skewRaw)) {
    throw new Error("HFLA payout clock skew is invalid");
  }
  var maxClockSkewSeconds = Number(skewRaw);
  if (
    !Number.isSafeInteger(maxClockSkewSeconds) ||
    maxClockSkewSeconds < 30 ||
    maxClockSkewSeconds > 600
  ) {
    throw new Error("HFLA payout clock skew is outside its safe bound");
  }
  var origin = parseHttpsOrigin_(
    requiredProperty_(properties, "HFLA_PAYOUT_PUBLIC_ORIGIN"),
  );
  var paths = Object.create(null);
  Object.keys(HFLA_OPERATIONS).forEach(function (operation) {
    var property = HFLA_OPERATIONS[operation].pathProperty;
    paths[operation] = parseRoutePath_(requiredProperty_(properties, property));
  });
  var pathValues = Object.keys(paths).map(function (key) {
    return paths[key];
  });
  if (new Set(pathValues).size !== pathValues.length) {
    throw new Error("HFLA payout operation routes must be distinct");
  }
  var activeArtistStatus = requiredProperty_(
    properties,
    "HFLA_PAYOUT_ACTIVE_ARTIST_STATUS",
  );
  if (activeArtistStatus.length > 80) {
    throw new Error("HFLA payout active artist status is too long");
  }
  return {
    properties: properties,
    environment: environment,
    spreadsheetId: spreadsheetId,
    secret: secret,
    origin: origin,
    paths: paths,
    maxClockSkewSeconds: maxClockSkewSeconds,
    activeArtistStatus: activeArtistStatus,
  };
}

function bytesToHex_(bytes) {
  return bytes
    .map(function (value) {
      return (value & 255).toString(16).padStart(2, "0");
    })
    .join("");
}

function sha256Hex_(value) {
  return bytesToHex_(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      value,
      Utilities.Charset.UTF_8,
    ),
  );
}

function hmacSha256Hex_(secret, value) {
  return bytesToHex_(
    Utilities.computeHmacSha256Signature(
      value,
      secret,
      Utilities.Charset.UTF_8,
    ),
  );
}

function constantTimeEqual_(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i += 1) {
    var leftCode = i < left.length ? left.charCodeAt(i) : 0;
    var rightCode = i < right.length ? right.charCodeAt(i) : 0;
    mismatch |= leftCode ^ rightCode;
  }
  return mismatch === 0;
}

function safeBusinessId_(value) {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isoInstant_(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    isNaN(new Date(value).valueOf()) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(label + " must be a canonical ISO UTC instant");
  }
  return value;
}

function sourceReadBusinessDescriptor_(operation, business, auth, config) {
  var definition = HFLA_OPERATIONS[operation];
  var queryKey = definition.businessKeys[0];
  var queryValue = business[queryKey];
  if (!safeBusinessId_(queryValue)) {
    throw new Error("Authoritative source query identity is malformed");
  }
  return [
    "HFLA-HMAC-SHA256",
    "v1",
    operation,
    auth.environment,
    "GET",
    config.origin,
    config.paths[operation],
    encodeURIComponent(queryKey) + "=" + encodeURIComponent(queryValue),
    auth.timestamp,
    auth.requestId,
  ].join("\n");
}

function projectionReadBusinessDescriptor_(business) {
  return JSON.stringify({
    operation: "artist_payout_read_v1",
    environment: business.environment,
    ledgerId: business.ledgerId,
    bookingId: business.bookingId,
    assignmentId: business.assignmentId,
    expectedRecordId: business.recordId,
  });
}

function projectionWriteBusinessDescriptor_(payload) {
  return JSON.stringify({
    operation: "artist_payout_projection_v1",
    expectedRecordId: payload.expectedRecordId,
    expectedRevision: payload.expectedRevision,
    projection: orderedPayoutProjection_(payload.projection),
  });
}

function rosterProjectionReadBusinessDescriptor_(business) {
  return JSON.stringify({
    operation: "artist_roster_projection_read_v1",
    environment: business.environment,
    artistId: business.artistId,
  });
}

function rosterProjectionWriteBusinessDescriptor_(payload) {
  var orderedProjection = Object.create(null);
  HFLA_ROSTER_PROJECTION_KEYS.forEach(function (key) {
    orderedProjection[key] = payload.projection[key];
  });
  return JSON.stringify({
    operation: "artist_roster_projection_v1",
    expectedArtistId: payload.expectedArtistId,
    expectedRevision: payload.expectedRevision,
    projection: orderedProjection,
  });
}

function businessDescriptor_(request, config) {
  if (
    request.operation === "artist_roster_read_v1" ||
    request.operation === "artist_roster_list_v1" ||
    request.operation === "crm_payout_source_read_v1"
  ) {
    return sourceReadBusinessDescriptor_(
      request.operation,
      request.business,
      request.auth,
      config,
    );
  }
  if (request.operation === "artist_payout_read_v1") {
    return projectionReadBusinessDescriptor_(request.business);
  }
  if (request.operation === "artist_roster_projection_read_v1") {
    return rosterProjectionReadBusinessDescriptor_(request.business);
  }
  if (request.operation === "artist_roster_projection_v1") {
    return rosterProjectionWriteBusinessDescriptor_(request.business);
  }
  if (request.operation === "artist_payout_projection_v1") {
    return projectionWriteBusinessDescriptor_(request.business);
  }
  throw new Error("Unapproved HFLA payout operation");
}

function requestCanonical_(request, config) {
  var descriptor = businessDescriptor_(request, config);
  return [
    HFLA_TRANSPORT_DOMAIN,
    HFLA_REQUEST_VERSION,
    "request",
    request.operation,
    request.auth.environment,
    request.method,
    config.origin,
    config.paths[request.operation],
    request.auth.timestamp,
    request.auth.requestId,
    sha256Hex_(descriptor),
  ].join("\n");
}

function assertAuth_(auth, operation, config, now) {
  exactObjectKeys_(auth, HFLA_AUTH_KEYS, "HFLA request authentication");
  if (
    auth.algorithm !== HFLA_REQUEST_ALGORITHM ||
    auth.version !== HFLA_REQUEST_VERSION
  ) {
    throw new Error("HFLA request algorithm or version is unsupported");
  }
  if (
    auth.environment !== config.environment ||
    HFLA_ALLOWED_ENVIRONMENTS.indexOf(auth.environment) === -1
  ) {
    throw new Error("HFLA request environment does not match this deployment");
  }
  if (auth.operation !== operation) {
    throw new Error("HFLA request operation binding does not match");
  }
  if (!safeBusinessId_(auth.requestId)) {
    throw new Error("HFLA request ID is malformed");
  }
  isoInstant_(auth.timestamp, "HFLA request timestamp");
  var skew = Math.abs(now.valueOf() - new Date(auth.timestamp).valueOf());
  if (skew > config.maxClockSkewSeconds * 1000) {
    throw new Error("HFLA request is outside the replay window");
  }
  if (!/^v1=[a-f0-9]{64}$/.test(auth.signature)) {
    throw new Error("HFLA request signature is malformed");
  }
}

function claimRequestNonce_(request, canonical, config, now) {
  var requestIdDigest = sha256Hex_(
    config.environment + "\n" + request.auth.requestId,
  );
  var key = "HFLA_PAYOUT_NONCE_" + requestIdDigest.slice(0, 48);
  var canonicalDigest = sha256Hex_(canonical);
  var expiresAt = now.valueOf() + config.maxClockSkewSeconds * 2000;
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var existingRaw = config.properties.getProperty(key);
    if (existingRaw) {
      var existing;
      try {
        existing = JSON.parse(existingRaw);
      } catch (_ignored) {
        throw new Error("HFLA replay registry is corrupt");
      }
      if (
        !existing ||
        typeof existing.digest !== "string" ||
        !Number.isSafeInteger(existing.expiresAt)
      ) {
        throw new Error("HFLA replay registry is corrupt");
      }
      if (existing.expiresAt >= now.valueOf()) {
        if (!constantTimeEqual_(existing.digest, canonicalDigest)) {
          throw new Error("HFLA request ID was reused for different content");
        }
        return true;
      }
    }
    config.properties.setProperty(
      key,
      JSON.stringify({ digest: canonicalDigest, expiresAt: expiresAt }),
    );
    cleanupExpiredNonces_(config.properties, now.valueOf(), key);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function cleanupExpiredNonces_(properties, nowMillis, preservedKey) {
  var all = properties.getProperties();
  var removed = 0;
  Object.keys(all).some(function (key) {
    if (
      removed >= 20 ||
      key === preservedKey ||
      key.indexOf("HFLA_PAYOUT_NONCE_") !== 0
    ) {
      return removed >= 20;
    }
    try {
      var value = JSON.parse(all[key]);
      if (value && Number(value.expiresAt) < nowMillis) {
        properties.deleteProperty(key);
        removed += 1;
      }
    } catch (_ignored) {
      // Corrupt entries are not silently deleted; the matching claim fails closed.
    }
    return false;
  });
}

function verifyRequest_(request, config, now) {
  var definition = HFLA_OPERATIONS[request.operation];
  if (!definition || definition.method !== request.method) {
    throw new Error("HFLA payout operation or method is not allowed");
  }
  if (request.path !== config.paths[request.operation]) {
    throw new Error("HFLA payout route binding does not match");
  }
  assertAuth_(request.auth, request.operation, config, now);
  var canonical = requestCanonical_(request, config);
  var expected = "v1=" + hmacSha256Hex_(config.secret, canonical);
  if (!constantTimeEqual_(request.auth.signature, expected)) {
    throw new Error("HFLA request signature verification failed");
  }
  return {
    replayed: claimRequestNonce_(request, canonical, config, now),
    requestDigest: sha256Hex_(canonical),
  };
}

function signedResponseEnvelope_(payload, request, config, now) {
  var timestamp = now.toISOString();
  var payloadJson = JSON.stringify(payload);
  var payloadSha256 = sha256Hex_(payloadJson);
  var canonical = [
    HFLA_TRANSPORT_DOMAIN,
    HFLA_REQUEST_VERSION,
    "response",
    request.operation,
    config.environment,
    request.auth.requestId,
    timestamp,
    payloadSha256,
  ].join("\n");
  var auth = {
    algorithm: HFLA_REQUEST_ALGORITHM,
    version: HFLA_REQUEST_VERSION,
    environment: config.environment,
    operation: request.operation,
    requestId: request.auth.requestId,
    timestamp: timestamp,
    payloadSha256: payloadSha256,
    signature: "v1=" + hmacSha256Hex_(config.secret, canonical),
  };
  return { payload: payload, auth: auth };
}
