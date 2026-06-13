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
post_filter() { grep -viE '/(seed|seeds|fixtures|migrations|config)/' | grep -v 'fee-literal-ok' || true; }

# ── Pass A: known fee VALUES anywhere in logic ──────────────────────────────────
# Optimize prices ($5.99 / $19.99) + deprecated subscription / review-tier values.
VALUE_RE='(^|[^0-9.])(5\.99|9\.99|14\.99|29\.99|39\.99|49\.99|19\.99)([^0-9]|$)'
A_HITS=$(grep -rnE "$VALUE_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null | post_filter)

# ── Pass B: fee-CONTEXT numeric assignments ─────────────────────────────────────
# Catches `serviceFee = 45`, `platformFee: 3`, `commission = 0.25`, `coordinationFee = 499`.
# Anchored on fee-ish identifiers so bare integers (line 45, index 3) don't false-positive.
# `= 0` sentinels (e.g. creditTowardCoordination = 0 for trips) are allowed.
CTX_RE='(fee|serviceFee|platformFee|commission|optimizeFee|coordinationFee|charge|margin)[A-Za-z]*[[:space:]]*[:=][[:space:]]*[0-9]'
B_HITS=$(grep -rnE "$CTX_RE" "${ROOTS[@]}" "${COMMON_EXCLUDES[@]}" 2>/dev/null \
  | grep -vE '[:=][[:space:]]*0[[:space:]]*[;,)]' | post_filter)

if [ -n "$A_HITS" ]; then
  printf '❌ Fee VALUE literals in logic:\n%s\n\n' "$A_HITS"; FAIL=1
fi
if [ -n "$B_HITS" ]; then
  printf '❌ Fee-context numeric assignments in logic:\n%s\n\n' "$B_HITS"; FAIL=1
fi
if [ "$FAIL" -eq 0 ]; then
  echo "✅ Phase 2 fee-literal gate PASSED — fees resolve from config only."
fi
exit "$FAIL"
