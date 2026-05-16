#!/usr/bin/env bash
# Manual API tests for /api/lead
# Run against local Cloudflare Pages dev server: npm run pages:dev (default port 8788)
# Or against a preview URL: set BASE_URL to your preview deployment.
#
# Usage:
#   chmod +x tests/api/lead.sh
#   ./tests/api/lead.sh
#
# Requires: curl, jq (optional but recommended for pretty-print)

BASE_URL="${BASE_URL:-http://localhost:8788}"
ENDPOINT="$BASE_URL/api/lead"

PASS=0
FAIL=0

check() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"

  if [ "$actual_status" = "$expected_status" ]; then
    echo "PASS  [$actual_status] $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL  [got $actual_status, want $expected_status] $label"
    echo "      body: $body"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. Valid lead ────────────────────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "phone": "818-555-0100",
    "email": "test@example.com",
    "event_date": "2026-08-15",
    "event_start_time": "2:00 PM",
    "event_city": "Los Angeles",
    "event_type": "Birthday Party",
    "services_requested": ["Face Painting"],
    "consent_to_contact": true
  }')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "valid lead POST returns 200 with ok+leadId" "200" "$STATUS" "$BODY"
if echo "$BODY" | grep -q '"ok":true'; then
  echo "      ok=true confirmed"
else
  echo "WARN  response body missing ok:true -> $BODY"
fi

# ── 2. Missing required fields ───────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"first_name":""}')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "missing required fields returns 400" "400" "$STATUS" "$BODY"

# ── 3. Honeypot filled ───────────────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Bot",
    "phone": "818-000-0000",
    "email": "bot@example.com",
    "event_date": "2026-08-15",
    "event_city": "Los Angeles",
    "event_type": "Birthday",
    "services_requested": ["Face Painting"],
    "consent_to_contact": true,
    "honeypot": "i-am-a-bot"
  }')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "honeypot filled silently returns 200 (bot trap)" "200" "$STATUS" "$BODY"

# ── 4. GET returns 405 ───────────────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$ENDPOINT")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "GET returns 405" "405" "$STATUS" "$BODY"

# ── 5. PUT returns 405 ───────────────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$ENDPOINT" \
  -H "Content-Type: application/json" -d '{}')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "PUT returns 405" "405" "$STATUS" "$BODY"

# ── 6. Malformed JSON returns 400 ────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d 'not-valid-json')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "malformed JSON returns 400" "400" "$STATUS" "$BODY"

# ── 7. Wrong content type returns 415 ────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'first_name=Test')
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
check "wrong content type returns 415" "415" "$STATUS" "$BODY"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
