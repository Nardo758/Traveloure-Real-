# FEE-3 — `pricing.service.ts` Deposit Rate + Expert Tier Markups

**Goal:** Remove the hard-coded literals in `server/services/pricing.service.ts:20,119-122` — `depositRate = 0.25`, `expertRates = { standard: 0.10, premium: 0.15, concierge: 0.20 }` — and resolve them through the same admin-editable fee config that the rest of the platform uses. Closes the last of the §4.8 "no fee literals at charge time" gaps.

**Status flagged in tracker:** `FEE-3 / Launch-blocking pending P0 alive-check`. The scoping doc gated execution on confirming the file is actually called at runtime.

**P0 ALIVE-CHECK RESULT (done before this brief was finalized):** ✅ alive. `pricing.service.ts` is consumed by:
- `server/services/booking.service.ts` (depositRate + expert tier markup, lines 287, 291, 301)
- `server/routes/bookings.ts` (mounted at `app.use("/api/bookings", bookingsRoutes)` in `server/routes.ts:559`) — calls `pricingService.estimateTripCost` and `applyPromoCode`

So this is NOT a delete-pass. Real billing surface. Brief proceeds with the fix.

**Owner:** FEE workstream. Pairs with `fee-2-provider-insurance-tier-brief.md`.

**Target:** Claude Code, repo working tree.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. Phases share the `booking_fee_configs` row contract.
2. Work in strict phase order: 0 → 2.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(FEE-3.Pn): …`).
4. **Typecheck floor = 140 pre-existing errors.** Every phase must return `npm run check` at **≤140 errors**.
5. **Phase 1 edits no schema** — only seeds rows into the existing `booking_fee_configs` table via a small migration.
6. File:line refs confirmed via P0 grep; should be stable.

---

## HARD PREREQS

1. **The §4.8 single-resolver pattern is already shipped enough** for this brief. `booking_fee_configs` is the source of truth for category-keyed rates. `getFee()` exists for AI-Concierge. We're routing the pricing-service rates through the booking-side resolver (`booking_fee_configs`) since that's what's category-keyed and already admin-editable in `/admin/fee-config`.
2. **No need to wait for the unification brief.** The two-resolver world (`commission.ts` + `optimization-fee.service.ts`) handles this fine; pricing.service queries `booking_fee_configs` directly via SQL (matching the pattern in `commission.ts`).

---

## DECIDED DEFAULTS

- **D1 Rate storage:** four new rows in `booking_fee_configs`:
  - `category = 'platform_deposit_rate'` — `platform_fee_percent = 25` (the deposit %).
  - `category = 'expert_tier_standard_markup'` — `platform_fee_percent = 10`.
  - `category = 'expert_tier_premium_markup'` — `platform_fee_percent = 15`.
  - `category = 'expert_tier_concierge_markup'` — `platform_fee_percent = 20`.
  Semantic: these rows reuse `platform_fee_percent` as a generic-percent column. The `expert_share_percent` column is left null (or zero) for these rows since the "expert share" semantic doesn't apply to deposit/markup. **Document this inline in the migration so future readers don't misinterpret.**
- **D2 Resolver shape:** new helper in `pricing.service.ts` — `private async loadRateFromConfig(category: string, fallback: number): Promise<number>` — single SELECT against `booking_fee_configs`. 60-second in-memory cache (same pattern as `affiliate.service.ts` post-LB-P4a). Cache invalidates on admin save (best-effort via a TTL — the admin UI can also bust the cache explicitly in Phase 2).
- **D3 Fallback chain:** DB row > in-code constant (kept for safety net). The constants stay at the top of the file as `DEFAULT_*` to be the last-resort fallback if `booking_fee_configs` is unreachable or empty for that category.
- **D4 Caller signature stability:** `getPrice`, `calculatePlatformFees`, `calculateDeposit` etc. keep their existing signatures. The resolution becomes async-internal but the callers don't change.
- **D5 Admin UI:** the four new rows surface in the existing `fee-config.tsx` UI without any new component — the per-category list already iterates `booking_fee_configs` rows.

---

## GLOBAL "WHAT NOT TO DO"

- **Do not delete the in-code constants.** They remain as `DEFAULT_DEPOSIT_RATE`, `DEFAULT_EXPERT_TIER_RATES` — the last-resort fallback when the DB is unreachable. Per §4.8: "the values below are *approved defaults* that ship out of the box."
- **Do not add new tables.** The four rates fit cleanly in `booking_fee_configs` with the right category prefixes.
- **Do not change caller signatures.** This is a guts-only refactor; UI, routes, and other services keep working identically.
- **Do not couple to FEE-2.** Provider tier is a separate dimension; the pricing-service rates are category-keyed.
- **Do not surface the deposit/markup rows as "categories" in the booking flow.** They're rate-config storage only — `category` is being overloaded as a key, not a domain concept. The fee-config UI should label these clearly as "Platform deposit rate" + "Expert tier markups" rather than letting them mix with the booking-category rows.

---

## REUSE MAP

| Need | Use | Evidence |
|---|---|---|
| Rate config storage | `booking_fee_configs` | shared/schema.ts |
| Resolver pattern | `commission.ts:resolveCommissionRates` (SQL-based config read with constant fallback) | shipped |
| In-memory cache pattern | `affiliate.service.ts:commissionCache` (LB-P4a) | `server/services/affiliate.service.ts:31-33` |
| Admin fee UI surface | `client/src/pages/admin/fee-config.tsx` | shipped |

---

## PHASE 0 — Alive-check + caller map (already done; documented)

✅ **Already done.** `pricing.service.ts` is alive — see brief header. Documenting the caller map for Phase 1's awareness:

- `pricing.service.ts:104` — `calculateDeposit(amount, customRate?)` uses `depositRate = 0.25` when `customRate` is undefined.
- `pricing.service.ts:125` — `expertRates[expertTier]` lookup in `calculatePlatformFees` (or similar — confirm exact function name in source). Three tiers, three rates.
- `booking.service.ts:287, 291, 301` — three call sites consuming the above.
- `routes/bookings.ts:156, 183` — two call sites via `estimateTripCost` and `applyPromoCode`.

No more callers to find. Migration affects exactly those code paths.

**Gate:** map noted. No code changed.

---

## PHASE 1 — Seed rate rows + resolver helper in `pricing.service.ts`

**Files:** `server/services/pricing.service.ts`, `server/migrations/024_pricing_service_rates.sql`, `server/migrations/run-migrations.ts`.

**Steps**
1. **Migration `024_pricing_service_rates.sql`:**
   ```sql
   -- FEE-3: seed the pricing.service.ts hard-coded rates into booking_fee_configs.
   -- These rows use the generic platform_fee_percent column as a single-rate
   -- carrier; expert_share_percent is left zero for these categories since
   -- the "expert share" semantic doesn't apply to deposit/markup.

   INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
   VALUES
     ('platform_deposit_rate',          25,  0, true),
     ('expert_tier_standard_markup',    10,  0, true),
     ('expert_tier_premium_markup',     15,  0, true),
     ('expert_tier_concierge_markup',   20,  0, true)
   ON CONFLICT (category) DO NOTHING;
   ```
   Register in `run-migrations.ts` after `023_provider_insurance_tier.sql`.
2. **`pricing.service.ts` helper + replacement:**
   - Add private static maps for constants (rename for clarity):
     ```ts
     private readonly DEFAULT_DEPOSIT_RATE = 0.25;
     private readonly DEFAULT_EXPERT_TIER_RATES = { standard: 0.10, premium: 0.15, concierge: 0.20 } as const;
     ```
   - Add the resolver helper with cache:
     ```ts
     private rateCache = new Map<string, { value: number; expiresAt: number }>();
     private readonly RATE_CACHE_TTL_MS = 60_000;

     private async loadRateFromConfig(category: string, fallback: number): Promise<number> {
       const cached = this.rateCache.get(category);
       if (cached && cached.expiresAt > Date.now()) return cached.value;
       try {
         const result = await db.execute(sql`
           SELECT CAST(platform_fee_percent AS FLOAT) AS rate
           FROM booking_fee_configs
           WHERE category = ${category} AND is_active = true
           LIMIT 1
         `);
         const row = result.rows?.[0] as { rate: number | null } | undefined;
         const value = row?.rate !== undefined && row.rate !== null ? Number(row.rate) / 100 : fallback;
         this.rateCache.set(category, { value, expiresAt: Date.now() + this.RATE_CACHE_TTL_MS });
         return value;
       } catch (err) {
         console.warn(`[pricing] config lookup failed for ${category}:`, err);
         return fallback;
       }
     }
     ```
   - Replace the two call sites:
     - `calculateDeposit`: replace `const rate = customRate || this.depositRate;` with `const rate = customRate ?? await this.loadRateFromConfig('platform_deposit_rate', this.DEFAULT_DEPOSIT_RATE);`. **Note:** this changes the function to async; call sites already await it per the existing `await pricingService.calculateDeposit(...)` in `booking.service.ts:301`, so no caller change.
     - Expert tier lookup: replace inline `expertRates[expertTier]` with `await this.loadRateFromConfig('expert_tier_' + expertTier + '_markup', this.DEFAULT_EXPERT_TIER_RATES[expertTier as keyof typeof this.DEFAULT_EXPERT_TIER_RATES] ?? this.DEFAULT_EXPERT_TIER_RATES.standard)`.
   - Remove the inline literals (the `depositRate = 0.25` field and the `expertRates = {...}` object). Constants now live as `DEFAULT_*` only.

**Acceptance**
- `calculateDeposit` returns the DB-configured rate when present.
- Expert tier markup resolves from DB.
- When DB row missing or unreachable: fallback to in-code constant.
- Cache reduces DB hits to once per minute per category.
- No literal numeric rate is read at charge time — only `DEFAULT_*` fallbacks.

**Verify / Gate**
```
grep -n "depositRate = 0\.25\|standard: 0\.10\|premium: 0\.15\|concierge: 0\.20" server/services/pricing.service.ts
# Expect: only inside the DEFAULT_* constants block, NOT inside any function body.
grep -n "loadRateFromConfig" server/services/pricing.service.ts
grep -n "platform_deposit_rate\|expert_tier_.*_markup" server/migrations/024_pricing_service_rates.sql server/services/pricing.service.ts
npm run check                                                                   # ≤140
```
Commit: `feat(FEE-3.P1): pricing.service rates resolve from booking_fee_configs`

---

## PHASE 2 — Admin UI labels + cache busting

**Files:** `client/src/pages/admin/fee-config.tsx`, possibly `server/routes/admin.routes.ts` for cache-bust signal.

**Steps**
1. **Label the new rows correctly in the admin UI.** The four new categories will appear in the existing per-category list — by default they'd show with their raw keys. Add display-label overrides:
   - `platform_deposit_rate` → "Platform deposit rate"
   - `expert_tier_standard_markup` → "Expert tier — Standard markup"
   - `expert_tier_premium_markup` → "Expert tier — Premium markup"
   - `expert_tier_concierge_markup` → "Expert tier — Concierge markup"
   Group them in a separate "Pricing rates" section below the booking-category rates so admins don't confuse them with bookable-category fees.
2. **Cache busting (best-effort):** the in-process 60s cache means an admin rate change takes up to 60s to propagate. For Phase 2, accept that; document it. For Phase B, add an explicit cache-bust call from the admin save handler — but that requires `pricingService` to be a shared singleton with a `bustCache()` method, which is a small refactor. Note as known follow-up.

**Acceptance**
- Admins see + edit the four pricing.service rates from `/admin/fee-config` with clear labels.
- Saving a rate updates the DB; the change takes effect on next read (≤60s due to cache).

**Verify / Gate**
```
grep -n "Pricing rates\|platform_deposit_rate\|expert_tier_.*_markup" client/src/pages/admin/fee-config.tsx
npm run check                                                                   # ≤140
```
Commit: `feat(FEE-3.P2): admin labels for pricing.service rates`

---

## FINAL VERIFICATION CHECKLIST

- [ ] P1 — DB rates seeded; resolver helper in place; in-code literals removed (constants stay as DEFAULT_* fallbacks).
- [ ] P2 — admin UI labels render the rates clearly; grouped separately from booking categories.
- [ ] No literal rate is read at charge time — only `DEFAULT_*` constants as the last-resort fallback.
- [ ] `npm run check` ≤ 140 (the floor) after every phase.

## KNOWN FOLLOW-UPS

- **Explicit cache-busting on admin save** — Phase 2 leaves up to 60s drift. Make `pricingService` a singleton with `bustCache(category?)` and call it from the admin POST handler. ~30 min of work; not blocking.
- **Resolver unification (FEE-Defer)** — Phase-2 batch brief eventually consolidates `commission.ts`, `optimization-fee.service.ts`, `pricing.service.ts`'s `loadRateFromConfig`, and `affiliate.service.ts`'s `resolveCommission` into one `fee-resolver.service.ts`. Cosmetic; works as four resolvers fine.

## OUT OF SCOPE

- Changing pricing.service.ts's domain logic (estimateTripCost, applyPromoCode, etc.) — guts-only refactor.
- Adding new pricing-service rates (e.g. peak-season markup) — separate scope.
- Cross-cutting fee architecture cleanup — FEE-Defer batch.
- Deposit-rate variation by category, market, or tier — single global rate today; granularity is FEE-Defer territory.
