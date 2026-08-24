#!/usr/bin/env bash
# scripts/phase2-fee-gate.sh
# Phase 2 verification gate: ZERO optimize/coordination fee literals in LOGIC code.
#
# The rule is "no hardcoded fees in logic" — NOT "the numbers appear nowhere".
# Canonical fee values legitimately live in fee_bands seed / migrations / config rows.
# Those paths are excluded. Logic (routes/services/components) must resolve from config.
#
# Each hit is a CANDIDATE violation: fix it (route through fee_bands) OR, if genuinely
# justified, annotate the line with `// fee-literal-ok: <reason>` to exempt it.
#
# Exit 0 = pass, 1 = fail. Wire as a required CI check.

set -uo pipefail

ROOTS=(server client shared)          # <-- adjust to your source roots
FAIL=0

COMMON_EXCLUDES=(
  --include='*.ts' --include='*.tsx'
  --exclude='*.test.*' --exclude='*.spec.*'
  --exclude='*.seed.*' --exclude='*seed*' --exclude='*.config.*'
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build
  --exclude-dir=migrations --exclude-dir=seeds --exclude-dir=__tests__
  --exclude-dir=__fixtures__
)
# Second-stage path filter (catches files the glob excludes miss) + allow-comment opt-out.
# Also exclude lines that look like Tailwind CSS classes (bg-900, text-gray-900, w-900, etc.)
# or color-map lookups (G[900]) that are not fee configs.
#
# Ruling 32 names TWO dispositions for a hit, and this gate now understands both:
#   `fee-literal-ok`            — adjudicated safe (a documented fallback, a structural invariant,
#                                 a non-rate number). Exempt, silently.
#   `fee-literal-debt:#<task>`  — a REAL defect with a filed owner. Exempt from FAILING, but
#                                 REPORTED on every run (see the debt report below) so it can never
#                                 become a silent baseline. The `#<task>` part is REQUIRED: a bare
#                                 `fee-literal-debt` exempts nothing, because an unowned debt is
#                                 indistinguishable from an unfixed defect.
DEBT_RE='fee-literal-debt:#[A-Za-z0-9_-]+'
post_filter() { grep -viE '/(seed|seeds|fixtures|migrations|config)/' | grep -v 'fee-literal-ok' | grep -vE "$DEBT_RE" | grep -vE '(className|class)=.*[0-9]{2,}|\b(bg-|text-|w-|h-|from-|to-|border-|dark:)[a-z-]*[0-9]{2,}|G\[[0-9]+\]' || true; }
# Same filter WITHOUT the debt exemption — used only to enumerate the debt for the report.
debt_only() { grep -viE '/(seed|seeds|fixtures|migrations|config)/' | grep -v 'fee-literal-ok' | grep -E "$DEBT_RE" || true; }

# ── Pass A: known fee VALUES anywhere in logic ──────────────────────────────────
# Optimize prices ($5.99 / $19.99) + deprecated subscription / review-tier values.
VALUE_RE='(^|[^0-9.])(5\.99|9\.99|14\.99|29\.99|39\.99|49\.99|19\.99)([^0-9]|$)'
A_HITS=$(grep -rnE "$VALUE_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null | post_filter)

# ── Pass C: cents-form fee values (backend stores fees in cents) ─────────────────
# 599 = $5.99, 1999 = $19.99, 4999 = $49.99, 900 = $9, 4500 = $45, 19900 = $199,
# 49900 = $499, 499900 = $4999. Catches DEFAULT_FEE_CENTS = 599 and similar.
CENTS_RE='(^|[^0-9])(599|1999|4999|900|4500|19900|49900|499900)([^0-9]|$)'
C_HITS=$(grep -rnE "$CENTS_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null | post_filter)

# ── Pass B: fee-CONTEXT numeric assignments ─────────────────────────────────────
# Catches `serviceFee = 45`, `platformFee: 3`, `commission = 0.25`, `coordinationFee = 499`,
# and `PROCESSING_FEE_RATE = 0.03`.
# Anchored on fee-ish identifiers so bare integers (line 45, index 3) don't false-positive.
# `= 0` sentinels (e.g. creditTowardCoordination = 0 for trips) are allowed.
#
# PREDICATE FIX (provider money-hardening lane, ruling 42 — audit MI-3). This pass ran
# CASE-SENSITIVELY with a `[A-Za-z]*` identifier tail, and every alternative below is lowercase, so
# it could not match a single SCREAMING_SNAKE constant — which is this codebase's DOMINANT
# convention for fee constants. `AI_PLATFORM_FEE`, `AFFILIATE_PLATFORM_FEE`, `AFFILIATE_EXPERT_SHARE`
# and `PROCESSING_FEE_RATE` all sat in plain sight in server/services/commission.ts while the gate
# reported PASS. The gate was truthful and the hole was real — the defect was the predicate, not the
# wiring (ruling 27), the same lesson as the PR #435 legacy-drift near-miss (protocol advisory).
#
# TWO changes were required, and BOTH are load-bearing — `-i` alone is NOT sufficient, contrary to
# the audit's MI-3 snippet: with `[A-Za-z]*`, `PROCESSING_FEE_RATE` still fails to match, because
# after `FEE` the tail cannot cross the `_` to reach the `=`. Verified in isolation.
#   1. `-i` on the grep         → reaches SCREAMING_SNAKE at all.
#   2. `[A-Za-z_]*` tail        → lets the identifier cross an underscore (`FEE` + `_RATE` + `=`).
CTX_RE='(fee|serviceFee|platformFee|commission|optimizeFee|coordinationFee|charge|marginRate)[A-Za-z_]*[[:space:]]*[:=][[:space:]]*[0-9]'
B_HITS=$(grep -rniE "$CTX_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null \
  | grep -vE '[:=][[:space:]]*0[[:space:]]*[;,)]' | post_filter)

# ── Self-test (`--self-test`) — COMMITTED fixtures, ledger-lint precedent ───────────
# This gate reported PASS for its entire life while `PROCESSING_FEE_RATE = 0.03`,
# `AI_PLATFORM_FEE = 1.00` and `AFFILIATE_PLATFORM_FEE = 0.70` sat in server/services/commission.ts,
# because Pass B was case-sensitive with a `[A-Za-z]*` identifier tail. A predicate defect is
# invisible by construction — the check goes green either way — so the predicate now carries
# standing fixtures rather than a one-off manual verification.
if [ "${1:-}" = "--self-test" ]; then
  st_fail=0
  st_check() { # <label> <expect: HIT|MISS> <line>
    if printf '%s\n' "$3" | grep -qiE "$CTX_RE"; then got=HIT; else got=MISS; fi
    if [ "$got" != "$2" ]; then
      printf 'SELF-TEST FAIL: expected %s got %s — %s\n   line: %s\n' "$2" "$got" "$1" "$3" >&2
      st_fail=1
    fi
  }
  # The four SCREAMING_SNAKE constants the old predicate could not see. The first is the one that
  # `-i` ALONE still misses: after `FEE` the tail must cross `_` to reach the `=`, which needs
  # `[A-Za-z_]*`. If someone reverts either half of the fix, this fixture is what fails.
  st_check "SCREAMING_SNAKE with an underscore between the fee word and the assignment" HIT 'export const PROCESSING_FEE_RATE = 0.03;'
  st_check "SCREAMING_SNAKE ending in the fee word"                                      HIT 'export const AI_PLATFORM_FEE = 1.00;'
  st_check "SCREAMING_SNAKE affiliate constant"                                          HIT 'export const AFFILIATE_PLATFORM_FEE = 0.70;'
  st_check "SCREAMING_SNAKE commission constant"                                         HIT 'const TRANSPORT_COMMISSION_DEFAULT = 0.10;'
  # No regression on the original lowercase coverage.
  st_check "lowercase object property (original coverage)"                               HIT '  platformFee: 3,'
  st_check "lowercase assignment (original coverage)"                                    HIT '  const serviceFee = 45;'
  st_check "camelCase coordination fee (original coverage)"                              HIT '  coordinationFee = 499;'
  # Must NOT fire: no fee-ish identifier adjacent to the number.
  st_check "unrelated numeric assignment"                                               MISS '  const retryCount = 3;'
  st_check "fee word with no numeric assignment"                                        MISS '  const platformFee = computeFee(x);'
  if [ "$st_fail" -eq 0 ]; then
    echo "✅ fee-gate self-test OK (9 Pass-B predicate fixtures: SCREAMING_SNAKE + underscore-tail positives, lowercase no-regression, non-fee negatives)"
  fi
  exit "$st_fail"
fi

if [ -n "$A_HITS" ]; then
  printf '❌ Fee VALUE literals in logic:\n%s\n\n' "$A_HITS"; FAIL=1
fi
if [ -n "$C_HITS" ]; then
  printf '❌ Fee CENTS literals in logic:\n%s\n\n' "$C_HITS"; FAIL=1
fi
if [ -n "$B_HITS" ]; then
  printf '❌ Fee-context numeric assignments in logic:\n%s\n\n' "$B_HITS"; FAIL=1
fi
# ── Tracked-debt report (ruling 32; never silent) ───────────────────────────────
# Everything carrying `fee-literal-debt:#<task>`. These do NOT fail the gate — they are filed —
# but they are printed on EVERY run, pass or fail, so a green check is never read as "no fee
# literals" when what it actually means is "no UNOWNED fee literals".
DEBT_HITS=$( { grep -rnE "$VALUE_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null
               grep -rnE "$CENTS_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null
               grep -rniE "$CTX_RE"  "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null; } | debt_only | sort -u)
if [ -n "$DEBT_HITS" ]; then
  printf '📋 Tracked fee-literal DEBT (filed, not blocking — ruling 32):\n%s\n\n' "$DEBT_HITS"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✅ Phase 2 fee-literal gate PASSED — every fee literal is resolved from config, adjudicated fee-literal-ok, or filed as fee-literal-debt."
  echo "   NEGATIVE SPACE (ruling 43 — what this gate does NOT cover): it is a GREP over source text, so it"
  echo "   cannot see a rate that arrives at runtime (a client-supplied rate column, a DB row, an env var);"
  echo "   Pass A/C match a FIXED value list, so a fee literal of an unlisted value is invisible; Pass B needs"
  echo "   the number on the SAME LINE as a fee-ish identifier, so a rate assembled across lines, held in a"
  echo "   map literal (e.g. AFFILIATE_MARGIN_DEFAULTS's per-partner values), or named only 'share'/'split'/"
  echo "   'margin' is out of scope; and .test/.seed/migration/config paths are excluded by design."
fi
exit "$FAIL"
