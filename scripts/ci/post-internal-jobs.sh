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

# LOG HYGIENE (lane: internal-jobs-hardening, L5) — this script runs in GitHub Actions on a PUBLIC
# repository, so every line it prints is on the open internet. It used to `cat` the whole response
# body: earnings counts, reconciliation results, and on a 500 the server's verbatim err.message,
# which for a database failure can carry row detail.
#
# So: an ALLOWLIST, never the body. Booleans `ok`/`skipped`/`reason` plus every NUMERIC leaf (the
# counts that make a run legible — drained, expert, provider, voided…). Strings are excluded by
# construction, which is what keeps `error` and any free-text field out. On a non-2xx nothing from
# the body is printed at all — just the status and the run URL, because the diagnosis belongs in the
# server log (runJob logs both the thrown and the isFailure branch) and not in a public CI log.
run_url() {
  if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
    echo "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  else
    echo "(no run URL outside GitHub Actions)"
  fi
}

# Booleans + numeric leaves only. Never strings, never the raw body.
summarize() {
  jq -c '
    { ok: .ok, skipped: (.skipped // false) }
    + (if .reason then { reason: .reason } else {} end)
    + ( [ paths(type == "number") as $p | { ($p | map(tostring) | join(".")): getpath($p) } ] | add // {} )
  ' "$1" 2>/dev/null || echo '{"summary":"unparseable"}'
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

  if [[ "$code" != "200" ]]; then
    # No body, not even a summary: a non-2xx is where the server's error text lives.
    echo "[$route] HTTP $code — see the server log for the failure detail"
    echo "::error title=$route failed::Expected HTTP 200 from /internal/jobs/$route, got $code. Run: $(run_url)"
    failed=1
  elif [[ "$ctype" != application/json* ]]; then
    # The tell-tale of a dead route served by the SPA fallback. The content-type is a header, not
    # body content, and it is the whole diagnosis — so it is named.
    echo "[$route] HTTP $code, content-type '$ctype'"
    echo "::error title=$route not JSON::/internal/jobs/$route answered $code with a non-JSON content-type — the route is not being served by the internal router (dead or renamed route?). Run: $(run_url)"
    failed=1
  elif ! jq -e '.ok == true' "$body" >/dev/null 2>&1; then
    echo "[$route] HTTP 200 but ok is not true"
    echo "::error title=$route reported failure::/internal/jobs/$route returned 200 JSON without ok:true — see the server log. Run: $(run_url)"
    failed=1
  else
    echo "[$route] HTTP 200 $(summarize "$body")"
    if jq -e '.skipped == true' "$body" >/dev/null 2>&1; then
      echo "[$route] skipped (a pass was already in flight) — treated as success"
    fi
  fi

  rm -f "$body"
done

exit $failed
