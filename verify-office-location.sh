#!/usr/bin/env bash
# Confirms the provider office-location lane (ruling 85) landed in this workspace.
set +e; PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "== Git tip =="
git rev-parse --short HEAD | grep -q 4e3a299 && ok "HEAD at 4e3a299 (office-location tip)" || no "HEAD is $(git rev-parse --short HEAD), expected 4e3a299"

echo "== Source landmarks =="
[ -f server/migrations/207_provider_office_location.sql ] && ok "migration 207 file present" || no "migration 207 missing"
grep -q "207_provider_office_location" server/migrations/migration-files.ts && ok "migration 207 registered" || no "migration 207 NOT registered"
grep -q 'officeLocation: jsonb("office_location")' shared/schema.ts && ok "office_location declared in schema.ts" || no "office_location not in schema.ts"
grep -q 'app.patch("/api/provider-application"' server/routes.ts && ok "owner-gated PATCH endpoint present" || no "PATCH /api/provider-application missing"
[ -f client/src/pages/provider/profile.tsx ] && grep -qi "office" client/src/pages/provider/profile.tsx && ok "office card in provider profile page" || no "office card not found in profile.tsx"
grep -qi "Pre-filled from your office location" client/src/components/ServiceForm.tsx && ok "new-listing pre-fill note in ServiceForm" || no "pre-fill note missing in ServiceForm"
[ -f server/__tests__/provider-office-location.db.test.ts ] && ok "proof suite present" || no "proof suite missing"

echo "== DB (migration applied) =="
if [ -n "$DATABASE_URL" ]; then
  COL=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='service_provider_forms' AND column_name='office_location'" 2>/dev/null)
  [ "$COL" = "1" ] && ok "service_provider_forms.office_location column exists" || no "office_location column NOT in DB — restart the Repl so runMigrations() applies 207"
else
  echo "  ⚠️  DATABASE_URL not set here — check the column after the server boots"
fi

echo "== Guards + type check (source-level) =="
node scripts/check-money-endpoints.cjs   >/dev/null 2>&1 && ok "money-endpoints guard"   || no "money-endpoints guard"
node scripts/check-unmounted-routers.cjs >/dev/null 2>&1 && ok "unmounted-routers guard" || no "unmounted-routers guard"
node scripts/check-decision-guards.cjs   >/dev/null 2>&1 && ok "decision-ledger guard"   || no "decision-ledger guard"
node scripts/check-omit-schema-ratchet.cjs >/dev/null 2>&1 && ok "omit-schema ratchet"   || no "omit-schema ratchet"
echo "  … tsc (ceiling 170): $(npx tsc --noEmit 2>&1 | grep -c 'error TS') error(s)"

echo; echo "RESULT: $PASS passed, $FAIL failed"
