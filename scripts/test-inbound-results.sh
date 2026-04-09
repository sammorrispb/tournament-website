#!/usr/bin/env bash
# End-to-end smoke test for /api/inbound-results.
#
# Simulates a Resend Inbound webhook POST and verifies the handler's
# response. Run this twice:
#
#   1. Against your local dev server before deploying:
#        vercel dev  (in one terminal)
#        ./scripts/test-inbound-results.sh http://localhost:3000
#
#   2. Against the deployed endpoint after env vars are set:
#        ./scripts/test-inbound-results.sh https://tournaments.linkanddink.com
#
# Requires: curl, jq (optional, for pretty output).
# Environment: INBOUND_WEBHOOK_SECRET must match the server's env var.
#
# What it tests:
#   - Happy path: well-formed email from an allowlisted sender → 200 accepted
#   - Wrong sender → 200 rejected
#   - Bad subject format → 200 rejected
#   - Missing place line → 200 rejected
#
# NOTE: these tests will actually write rows to the live Notion DB when run
# against production. Delete them from Notion afterwards, or use a test DB
# via a separate NOTION_DB_MEDAL_LEADERBOARD value on a preview deployment.

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
SECRET="${INBOUND_WEBHOOK_SECRET:-test-secret}"
ENDPOINT="${BASE_URL}/api/inbound-results?secret=${SECRET}"

# A 1x1 transparent PNG, base64-encoded. Stand-in for a real podium photo.
TINY_PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII="

ALLOWED_SENDER="${TEST_ALLOWED_SENDER:-test-nb@dilldinkers.com}"
BAD_SENDER="random@example.com"

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

post() {
  local name="$1"
  local payload="$2"
  echo "── $name ──"
  local resp
  resp=$(curl -sS -X POST -H "Content-Type: application/json" -d "$payload" "$ENDPOINT")
  echo "  → $resp"
  echo "$resp"
}

check_status() {
  local resp="$1"
  local want="$2"
  local got
  got=$(echo "$resp" | grep -oE '"status":"[^"]*"' | head -1 | sed 's/.*"status":"\([^"]*\)".*/\1/')
  if [ "$got" = "$want" ]; then
    pass "status=$want"
  else
    fail "expected status=$want, got '$got'"
  fi
}

echo "Testing $ENDPOINT"
echo

# ── Test 1: happy path — allowlisted sender, valid subject + body ──
resp=$(post "Test 1: happy path (NB, 3.0-3.5)" "$(cat <<EOF
{
  "type": "inbound.received",
  "data": {
    "from": "$ALLOWED_SENDER",
    "subject": "Results | 2026-04-11 | 14:30 | North Bethesda | 3.0-3.5",
    "text": "1st: Jane Doe & John Smith\n2nd: Alice Chen & Bob Wu\n3rd: Carlos Ruiz & Dana Kim\n\nTeams registered: 5\nNotes: smoke test — please delete after review",
    "attachments": [
      {
        "filename": "podium.png",
        "content_type": "image/png",
        "content": "$TINY_PNG_B64"
      }
    ]
  }
}
EOF
)")
check_status "$resp" "accepted"
echo

# ── Test 2: wrong sender → rejected ──
resp=$(post "Test 2: wrong sender" "$(cat <<EOF
{
  "type": "inbound.received",
  "data": {
    "from": "$BAD_SENDER",
    "subject": "Results | 2026-04-11 | 14:30 | North Bethesda | 3.0-3.5",
    "text": "1st: A & B\n2nd: C & D\n3rd: E & F\n",
    "attachments": []
  }
}
EOF
)")
check_status "$resp" "rejected"
echo

# ── Test 3: malformed subject → rejected ──
resp=$(post "Test 3: malformed subject" "$(cat <<EOF
{
  "type": "inbound.received",
  "data": {
    "from": "$ALLOWED_SENDER",
    "subject": "winners from saturday",
    "text": "1st: A & B\n2nd: C & D\n3rd: E & F\n",
    "attachments": []
  }
}
EOF
)")
check_status "$resp" "rejected"
echo

# ── Test 4: missing 3rd place → rejected ──
resp=$(post "Test 4: missing 3rd" "$(cat <<EOF
{
  "type": "inbound.received",
  "data": {
    "from": "$ALLOWED_SENDER",
    "subject": "Results | 2026-04-11 | 14:30 | North Bethesda | 3.0-3.5",
    "text": "1st: A & B\n2nd: C & D\n",
    "attachments": []
  }
}
EOF
)")
check_status "$resp" "rejected"
echo

# ── Test 5: Rockville Women's Only (apostrophe normalization) ──
resp=$(post "Test 5: RV Women's Only (apostrophe)" "$(cat <<EOF
{
  "type": "inbound.received",
  "data": {
    "from": "$ALLOWED_SENDER",
    "subject": "Results | 2026-05-24 | 16:00 | Rockville | 3.5-4.0 Women's Only",
    "text": "1st: Emma Lee & Mia Tan\n2nd: Nora Patel & Zoe Kim\n3rd: Ruby Wong & Sara Ortiz\n\nTeams registered: 4\nNotes: smoke test — delete",
    "attachments": []
  }
}
EOF
)")
check_status "$resp" "accepted"
echo

echo "All tests passed. Remember to delete the smoke-test rows from the Notion"
echo "Medal Points Leaderboard DB — search for 'smoke test' in the Notes column."
