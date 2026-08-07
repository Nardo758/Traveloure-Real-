P=0; F=0; BAD=()
g(){ n="$1"; shift; if "$@" >/tmp/g.log 2>&1; then P=$((P+1)); echo "OK    $n"; else F=$((F+1)); BAD+=("$n"); echo "FAIL  $n"; tail -6 /tmp/g.log; fi; }
g "money self-test"  node scripts/check-money-endpoints.cjs --self-test
g "money guard"      node scripts/check-money-endpoints.cjs
g "fee self-test"    bash scripts/phase2-fee-gate.sh --self-test
g "fee guard"        bash scripts/phase2-fee-gate.sh
g "claims self-test" node scripts/check-claims-only-user-lookups.cjs --self-test
g "claims guard"     node scripts/check-claims-only-user-lookups.cjs
g "unmounted"        node scripts/check-unmounted-routers.cjs
g "trip-mint"        node scripts/check-trip-mint-owner-access.cjs
g "ledger self-test" node scripts/check-decision-guards.cjs --self-test
g "ledger lint"      node scripts/check-decision-guards.cjs
g "matrix self-test" node scripts/check-coverage-matrix.cjs --self-test
g "matrix lint"      node scripts/check-coverage-matrix.cjs
g "env self-test"    node scripts/check-env-allowlist.cjs --self-test
g "env guard"        node scripts/check-env-allowlist.cjs
g "linkage"          node scripts/check-linkage-preservation.cjs
echo "passed:$P failed:$F ${BAD[*]:-}"
