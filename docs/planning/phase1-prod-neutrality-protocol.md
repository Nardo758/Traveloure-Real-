# Phase 1 Resolver Flip — Production Neutrality Verification Protocol

**Status:** Required before the Phase 1.3 resolver flip reaches production pricing.
**Why prod and not staging:** Migration history shows 006–030 weren't all applied to prod, and the `tip` divergence was an admin edit made directly in prod that never propagated to staging. Staging-green proves nothing about prod-safe.

---

## What this protocol verifies

Every active row in production's `booking_fee_configs` returns the SAME platform-take fraction under the new fee_bands resolver as it did under the legacy lookup. Zero divergence across all categories = ship-safe.

---

## What's now in place to enable this

1. **`server/scripts/phase1-neutrality-check.ts`** — runnable against any DB. Queries every active `booking_fee_configs` row, computes old vs new resolver output, prints a diff table. Exit 0 = all zeros; exit 1 = at least one divergence.

2. **Migration 045 (`tip_handling`)** — preserves the live 5 % `booking_fee_configs.tip` rate into a dedicated fee_band. Phase 1.5 fix for the divergence the script caught.

3. **Migration 046 (enumeration)** — seeds a preserving band for EVERY remaining active `booking_fee_configs` row that doesn't already have a semantic mapping. Result: complete-by-construction coverage. Any admin-set per-category rate flows through unchanged, including rates this codebase has never heard of.

4. **`decideBandKey` direct-category fallback** — any non-default named category routes to a direct fee_bands lookup by the category name. Combined with migration 046, this means new admin-added categories in `booking_fee_configs` get the same auto-preservation treatment.

---

## Verification protocol (must complete before prod deploy)

### Step 1 — Snapshot prod's fee tables

On a workstation with read access to prod:

```bash
# Replace PROD_DATABASE_URL with your actual prod DSN.
pg_dump "$PROD_DATABASE_URL" \
  --table=booking_fee_configs \
  --table=fee_bands \
  --table=platform_settings \
  --table=service_categories \
  --no-owner --no-acl \
  > /tmp/prod-fee-snapshot.sql
```

### Step 2 — Restore the snapshot into a sandbox DB

```bash
# Create a throwaway local DB.
createdb traveloure_prod_snapshot

# Load the snapshot.
psql traveloure_prod_snapshot < /tmp/prod-fee-snapshot.sql

# Apply ALL pending migrations (Phase 1 + 1.5 enumeration) against the sandbox.
DATABASE_URL="postgresql://localhost/traveloure_prod_snapshot" \
  npx tsx -e 'import("./server/migrations/run-migrations.ts").then(m => m.runMigrations())'
```

### Step 3 — Run the neutrality script against the sandbox

```bash
DATABASE_URL="postgresql://localhost/traveloure_prod_snapshot" \
  npx tsx server/scripts/phase1-neutrality-check.ts
```

**Pass condition:** every non-skipped row prints `diff = 0.0000 ✓ zero`. Exit code 0.

**If any row shows a non-zero diff:** stop. Don't deploy. Surface the failing category — likely an admin edit the enumeration didn't preserve correctly (or a structural issue with the rate values).

### Step 4 — Verify migrations applied cleanly

The sandbox restore also surfaces migration-application failures that wouldn't show on a clean DB. If `run-migrations` errors during Step 2, the failing migration must be fixed before prod deploy — this is the second bird the user flagged ("running the migrations against a prod snapshot also surfaces whether they even apply cleanly given the 006–030 drift").

### Step 5 — Deploy to prod

Only after Steps 1–4 pass:

1. Deploy code (including the resolver flip + Phase 1.5 fixes).
2. Run migrations in prod via the normal startup flow.
3. Run the neutrality script ONE MORE TIME against actual prod's `DATABASE_URL`:
   ```bash
   DATABASE_URL="$PROD_DATABASE_URL" npx tsx server/scripts/phase1-neutrality-check.ts
   ```
4. Confirm all zeros once more before considering Phase 1 production-live.

---

## What to skip (currently in the script's skip list)

These rows aren't routed through `resolveCommissionRates`, so a diff there isn't a divergence:

- `platform_deposit_rate` — read directly by `pricing.service.ts.loadDepositRate` from `fee_bands.platform_deposit`. Phase 1.3 already swapped this source.
- `platform_transport_commission` — read directly by `transport-booking-options.service.ts`. Out of resolver scope.
- `affiliate_margin_12go` / `_omio` / `_discovercars` / `_kiwi` — read directly by the same transport service. Out of resolver scope.

The script's skip list is hard-coded; if a NEW direct-read category gets added later, update both the skip list and this protocol.

---

## What happens AFTER successful prod neutrality

The resolver flip is proven safe. Subsequent rate edits should go through fee_bands (eventually via the Phase 8 admin UI). The legacy `booking_fee_configs` table becomes dormant — kept in the DB for compatibility with the deprecated admin UI, but no longer the source of truth.

The banner on `/admin/fee-config` (Phase 1 deliverable) tells admins to edit `fee_bands` directly until Phase 8 ships an updated UI.

---

## Decision criteria

| Outcome | Action |
|---|---|
| Sandbox neutrality all zeros | Proceed with prod deploy + Step 5 confirmation |
| Sandbox neutrality has non-zero diffs | Stop. Investigate per-category. Likely missing band or rate misalignment. |
| Migrations fail to apply to snapshot | Fix the failing migration before any prod deploy attempt |
| Prod confirmation neutrality fails (Step 5) | Roll back the resolver flip; investigate before re-attempting |
