#!/usr/bin/env bash
#
# post-internal-jobs.sh — the ONE health-check implementation for the /internal/jobs/* runners.
#
# Every cadence bucket in .github/workflows/jobs-cron.yml calls this script; five inline copies of
# the same curl loop drifted apart the moment one was edited, so the logic lives here once.
#
# HEALTH CONTRACT (lane: internal-jobs-hardening, L2) — a route passes only when ALL THREE hold:
#   1. HTTP 200,
#   2. the response is JSON (content-type), and
#   3. `jq -e '.ok == true'` succeeds on the body.
#
# The status code ALONE is not a health signal: an unmatched /internal path used to fall through to
# the SPA fallback and answer 200 text/html, so a renamed or deleted MONEY route reported green
# forever while the job never ran (§9 — a dead endpoint returns 200-HTML, NOT 404). Checks 2 and 3
# make that impossible to miss even if the server-side /internal 404 (L3) is ever regressed.
#
# `skipped:true` is a PASS: an overlap skip means the in-process timer was mid-flight, which is the
# designed dedup behaviour, not a failure.
#
# Inputs (env): BASE_URL, ROUTES (space-separated route names), INTERNAL_JOB_SECRET.
# Exit: 0 if every route passed, 1 otherwise.
set -uo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${ROUTES:?ROUTES is required}"

if [[ -z "${INTERNAL_JOB_SECRET:-}" ]]; then
  echo "::error title=Missing GitHub secret::INTERNAL_JOB_SECRET is not configured for this repository."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::error title=jq missing::jq is required to evaluate the job health contract."
  exit 1
fi

# Reports one route's outcome. Phase 4 (L5) narrows this to an allowlist of fields; keeping the
# reporting in one function is what makes that a contained change.
log_result() {
  local route="$1" code="$2" ctype="$3" body_file="$4"
  echo "[$route] HTTP $code ($ctype)"
  cat "$body_file"; echo
}

failed=0
for route in $ROUTES; do
  url="$BASE_URL/internal/jobs/$route"
  body="$(mktemp)"
  meta="$(curl -sS -X POST \
    --header "x-internal-secret: $INTERNAL_JOB_SECRET" \
    --header "content-type: application/json" \
    --data '{}' \
    --output "$body" \
    --write-out '%{http_code} %{content_type}' \
    "$url" || echo "000 none")"
  code="${meta%% *}"
  ctype="${meta#* }"

  log_result "$route" "$code" "$ctype" "$body"

  if [[ "$code" != "200" ]]; then
    echo "::error title=$route failed::Expected HTTP 200 from $url, got $code"
    failed=1
  elif [[ "$ctype" != application/json* ]]; then
    # The tell-tale of a dead route served by the SPA fallback.
    echo "::error title=$route not JSON::$url answered $code with content-type '$ctype' — the route is not being served by the internal router (dead or renamed route?)."
    failed=1
  elif ! jq -e '.ok == true' "$body" >/dev/null 2>&1; then
    echo "::error title=$route reported failure::$url returned 200 JSON without ok:true."
    failed=1
  elif jq -e '.skipped == true' "$body" >/dev/null 2>&1; then
    echo "[$route] skipped (a pass was already in flight) — treated as success"
  fi

  rm -f "$body"
done

exit $failed
