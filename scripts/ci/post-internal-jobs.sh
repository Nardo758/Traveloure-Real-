#!/usr/bin/env bash
#
# post-internal-jobs.sh — the ONE health-check implementation for the /internal/jobs/* runners.
#
# Every cadence bucket/step in .github/workflows/jobs-cron.yml calls this script; five inline
# copies of the same curl loop drifted apart the moment one was edited, so the logic lives here
# once.
#
# HEALTH CONTRACT (lane: internal-jobs-hardening, L2) — a route passes only when ALL THREE hold:
#   1. HTTP 200,
#   2. the response is JSON (content-type), and
#   3. `jq -e '.ok == true'` succeeds on the body.
#
# The status code ALONE is not a health signal: an unmatched /internal path used to fall through to
# the SPA fallback and answer 200 text/html, so a renamed or deleted MONEY route reported green
# forever while the job never ran (§9 — a dead endpoint returns 200-HTML, NOT 404). Checks 2 and 3
# make that impossible to miss even if the server-side /internal 404 (L3) is ever regressed. THIS
# THREE-CHECK CONTRACT IS UNCHANGED BY THE COLD-START LOGIC BELOW — it decides whether a *given*
# attempt passed; the lane below decides whether a *failing* attempt is worth a retry at all.
#
# `skipped:true` is a PASS: an overlap skip means the in-process timer was mid-flight, which is the
# designed dedup behaviour, not a failure.
#
# COLD-START WARM-UP + BOUNDED RETRY (ledger 2026-09-20-jobs-cron-cold-start-retry) — Replit
# Autoscale scales an idle instance to zero, so the four-hourly (and rarer) cadence buckets are
# routinely the first request after a cold start. Run 35486145870 (2026-09-20T03:16:42Z) got a
# plain HTTP 404 from POST /internal/jobs/booking-expiry although the deployed sha (32b0d6e)
# contained the route (born 868909a38, 2026-09-15): the deployment log shows the instance cold-
# starting at 03:16:39–41 and the request landing at 03:16:42, ONE TO THREE SECONDS after
# `node dist/index.cjs` started — before `registerRoutes()` had mounted `/internal` at all. During
# that window a request to any /internal/* path falls through server/static.ts's pre-bind catch-all
# (which exempts /api and /internal from the SPA fallback but has nothing else mounted yet) into
# Express's own default 404 — plain, not the JSON shape `server/infrastructure/error-handler.ts`'s
# `notFoundHandler` produces once real routes are registered. That is DELIBERATE (L3): a dead route
# must never report green. It also means a COLD but otherwise healthy instance is briefly
# indistinguishable, from this script's point of view, from a dead route — which is exactly why the
# fix below is a bounded retry, not a status-code change.
#
# Two independent guards close that gap without weakening L3 or the three-check contract above:
#
#   (a) WARM-UP — before the first POST, poll `GET $BASE_URL$READY_PATH` (default `/api/ready`,
#       the SAME endpoint .github/workflows/app-routes-gate.yml's "Wait for server and seeding"
#       step polls, so this script and that gate agree on what "ready" means) until it answers
#       HTTP 200 with `.ready == true`, for up to WARMUP_MAX_SECONDS (default 120). If it never
#       comes up, this is treated as a REAL outage — not a boot race — and the script fails
#       immediately, naming the readiness path and the last status seen, before attempting any
#       route.
#
#   (b) BOUNDED RETRY, RETRYABLE STATUSES ONLY — a route POST answering 404 or 503 (the two shapes
#       a cold instance produces: 404 before /internal is mounted at all, 503 while
#       INTERNAL_JOB_SECRET reads as unset because env injection hasn't settled) is retried up to
#       POST_RETRIES times (default 3) with backoff 5s/10s/20s, each attempt logged. NOTHING ELSE
#       is retried:
#         - 401 is NEVER retried — a wrong secret is not transient, and retrying it would just
#           spend the lockout budget internal-jobs-limiter.ts enforces (L1/L7).
#         - 500 is NEVER retried — the job RAN and failed; retrying would risk double-running a
#           failing job. (The server's own overlap-skip dedup protects the idempotent money paths
#           regardless, but a 500 must stay visible on the first attempt, not be silently re-tried
#           into a possibly-different outcome.)
#         - a 200 that fails check 2 or 3 (non-JSON content-type, or `ok` not `true`) is NEVER
#           retried — the server answered; the answer was wrong.
#       If a route still answers 404 or 503 after POST_RETRIES retries, that is reported as a
#       genuine failure exactly as before: L3 is preserved — a truly dead or misconfigured route
#       cannot out-wait this script's retry budget and still reports red.
#
# NEGATIVE SPACE, stated because it is the load-bearing half of this fix: this script cannot tell a
# boot-window 404 apart from a genuinely dead route on any SINGLE attempt — the retry budget is
# what tells them apart, by construction, not a smarter check. A route that is actually dead for
# longer than WARMUP_MAX_SECONDS + the retry backoff window still reads red, which is correct; a
# route that is merely cold reads green once the instance finishes booting, which is the whole
# point. This script does not and cannot make Replit Autoscale keep an instance warm — that stays
# the operator's to manage (CLAUDE.md, docs/MARKET_LAUNCH_CHECKLIST.md item 8).
#
# Inputs (env): BASE_URL, ROUTES (space-separated route names), INTERNAL_JOB_SECRET,
#   READY_PATH (default /api/ready), WARMUP_MAX_SECONDS (default 120), POST_RETRIES (default 3).
# Exit: 0 if every route passed (after any allowed retries), 1 otherwise.
set -uo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${ROUTES:?ROUTES is required}"

READY_PATH="${READY_PATH:-/api/ready}"
WARMUP_MAX_SECONDS="${WARMUP_MAX_SECONDS:-120}"
WARMUP_POLL_SECONDS="${WARMUP_POLL_SECONDS:-5}"
POST_RETRIES="${POST_RETRIES:-3}"
# Backoff between retry attempts, in seconds — index 0 is the delay before retry #1, etc. The last
# value repeats if POST_RETRIES is raised beyond the array's length. Overridable (space-separated)
# so the test suite can run the same retry logic without the real 5s/10s/20s wall-clock cost.
read -r -a POST_RETRY_BACKOFF <<< "${POST_RETRY_BACKOFF_SECONDS:-5 10 20}"

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
#
# ⚠ PAIRED WITH `summarizeJobResult()` IN server/services/job-heartbeats.service.ts. These two
# allowlists must move together: they are the same rule (never print or persist a job's free-text
# payload, because reconciliation and earnings results are money-shaped) expressed in the two
# languages their surfaces are written in. One shared implementation across bash and TypeScript is
# not possible, so this comment is the coupling — H6 in internal-jobs-heartbeat.db.test.ts pins the
# TypeScript half.
summarize() {
  jq -c '
    { ok: .ok, skipped: (.skipped // false) }
    + (if .reason then { reason: .reason } else {} end)
    + ( [ paths(type == "number") as $p | { ($p | map(tostring) | join(".")): getpath($p) } ] | add // {} )
  ' "$1" 2>/dev/null || echo '{"summary":"unparseable"}'
}

# Poll READY_PATH until it reports ready:true, or fail after WARMUP_MAX_SECONDS. This is the SAME
# signal .github/workflows/app-routes-gate.yml's "Wait for server and seeding" step waits on, so a
# cold Autoscale instance and a CI-booted dev server are judged the same way.
wait_for_warm_instance() {
  local start_ts elapsed attempt body meta code last_code
  start_ts=$SECONDS
  attempt=0
  last_code="none"
  while true; do
    attempt=$((attempt + 1))
    body="$(mktemp)"
    meta="$(curl -sS -o "$body" -w '%{http_code}' "$BASE_URL$READY_PATH" 2>/dev/null || echo "000")"
    code="$meta"
    last_code="$code"
    if [[ "$code" == "200" ]] && jq -e '.ready == true' "$body" >/dev/null 2>&1; then
      elapsed=$((SECONDS - start_ts))
      echo "[warmup] $READY_PATH ready after attempt $attempt (${elapsed}s)"
      rm -f "$body"
      return 0
    fi
    echo "[warmup] attempt $attempt: $READY_PATH -> HTTP $code (not ready yet)"
    rm -f "$body"
    elapsed=$((SECONDS - start_ts))
    if (( elapsed >= WARMUP_MAX_SECONDS )); then
      echo "::error title=Instance never became ready::$BASE_URL$READY_PATH did not report ready:true within ${WARMUP_MAX_SECONDS}s (last status: HTTP $last_code, $attempt attempt(s)). This is a real outage, not a boot race — see the server/deployment log."
      return 1
    fi
    sleep "$WARMUP_POLL_SECONDS"
  done
}

# One POST attempt at a route. Echoes its own log lines. Returns:
#   0 — passed the three-check health contract
#   1 — hard failure, never retried (401 / 500 / 200-but-bad-shape / anything not 200,404,503)
#   2 — retryable failure (404 or 503 — the boot-window and secret-not-yet-settled shapes)
post_route_once() {
  local route="$1"
  local url="$BASE_URL/internal/jobs/$route"
  local body meta code ctype
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

  if [[ "$code" == "404" || "$code" == "503" ]]; then
    # No body echoed here either — a boot-window 404 has no useful body, and a dead-route 404 (once
    # the instance IS warm) is diagnosed the same way once retries are exhausted, below.
    echo "[$route] HTTP $code (retryable — boot-window or secret-not-yet-settled shape)"
    rm -f "$body"
    return 2
  fi

  if [[ "$code" != "200" ]]; then
    # No body, not even a summary: a non-2xx is where the server's error text lives. Never retried:
    # 401 (wrong secret is not transient) and 500 (the job ran and failed) both land here.
    echo "[$route] HTTP $code — see the server log for the failure detail"
    echo "::error title=$route failed::Expected HTTP 200 from /internal/jobs/$route, got $code. Run: $(run_url)"
    rm -f "$body"
    return 1
  elif [[ "$ctype" != application/json* ]]; then
    # The tell-tale of a dead route served by the SPA fallback. The content-type is a header, not
    # body content, and it is the whole diagnosis — so it is named. Never retried: the server
    # answered 200, so the instance is warm; the route itself is wrong.
    echo "[$route] HTTP $code, content-type '$ctype'"
    echo "::error title=$route not JSON::/internal/jobs/$route answered $code with a non-JSON content-type — the route is not being served by the internal router (dead or renamed route?). Run: $(run_url)"
    rm -f "$body"
    return 1
  elif ! jq -e '.ok == true' "$body" >/dev/null 2>&1; then
    echo "[$route] HTTP 200 but ok is not true"
    echo "::error title=$route reported failure::/internal/jobs/$route returned 200 JSON without ok:true — see the server log. Run: $(run_url)"
    rm -f "$body"
    return 1
  else
    echo "[$route] HTTP 200 $(summarize "$body")"
    if jq -e '.skipped == true' "$body" >/dev/null 2>&1; then
      echo "[$route] skipped (a pass was already in flight) — treated as success"
    fi
    rm -f "$body"
    return 0
  fi
}

# Post a route, retrying ONLY on the retryable (404/503) shape, up to POST_RETRIES times with
# backoff. Returns 0 on eventual pass, 1 on a hard failure or exhausted retries.
post_route_with_retry() {
  local route="$1"
  local attempt=0
  local rc
  while true; do
    post_route_once "$route"
    rc=$?
    if [[ $rc -eq 0 ]]; then
      return 0
    fi
    if [[ $rc -eq 1 ]]; then
      return 1
    fi
    # rc == 2: retryable.
    if (( attempt >= POST_RETRIES )); then
      echo "[$route] still failing after $POST_RETRIES retries (HTTP 404/503) — treating as a genuine failure, not a boot race"
      echo "::error title=$route failed after retries::/internal/jobs/$route kept answering 404/503 after $POST_RETRIES retries — dead/renamed route or a real outage, not a cold start. Run: $(run_url)"
      return 1
    fi
    local delay="${POST_RETRY_BACKOFF[$attempt]:-${POST_RETRY_BACKOFF[-1]}}"
    attempt=$((attempt + 1))
    echo "[$route] retrying in ${delay}s (attempt $attempt/$POST_RETRIES)..."
    sleep "$delay"
  done
}

if ! wait_for_warm_instance; then
  exit 1
fi

failed=0
for route in $ROUTES; do
  if ! post_route_with_retry "$route"; then
    failed=1
  fi
done

exit $failed
