# Build Brief — Commission Consolidation (Single Admin-Editable Source)
**Target executor:** Replit Agent · **Priority:** #2 · **Against:** pushed HEAD `a3e2bed`
**Read this entire brief before writing any code. Proceed in strict phase order. This touches money — do not skip verification gates.**

---

## The decision (locked) — full fee policy
One resolver encodes this entire policy. Every surface that splits money reads it. No hardcoded literals anywhere.

| Fee type | Platform | Counterparty | Detection |
|---|---|---|---|
| AI-sourced booking | **100%** | — | item has no provider/expert source |
| Affiliate commission | **70%** | expert 30% | revenue type = affiliate / item is affiliate-booked |
| Service provider booking | **25%** | provider 75% | provider-sourced item |
| Expert booking / expert services | **25%** | expert 75% | expert-sourced item / service |
| All other fees | **25%** | 75% | default |

Collapsed logic: `AI → platform 1.00`; `affiliate → platform 0.70`; `else → platform 0.25`. Admin-editable per category via `booking_fee_configs` (overrides the default).

> NOTE: 25% on provider bookings is ~2x the current per-category rates (8–15%) and the plan's 4–12%. Encoded as instructed; flag if providers should stay provider-favorable.

## What's already done (build on it, don't redo)
Commit `fe60c80` already: set the commission-endpoint `DEFAULT_RATE = 0.75` (`routes.ts:18126`), added a `safeParseRate` NaN guard there and in the cart loop (`routes.ts:5663–5668`, fallback `0.75`). **Leave that logic intact** — this brief routes it through the shared resolver but must not lower those values.

---

## ⛔ WHAT NOT TO DO — READ TWICE
- **Do NOT bulk find-replace `0.30`.** The literal means two opposite things. A blind replace will hand the platform 75%. Each site is classified in Phase 2 — change them individually.
- **Do NOT lower the 0.75 expert share** anywhere (commission endpoint, cart). It is the floor.
- **Do NOT** create a fourth parallel rate source. The goal is *fewer* sources, ending at one (`booking_fee_configs` + named constants as fallback).
- **Do NOT** edit the DB by hand. Schema/seed changes go through `drizzle-kit generate` → review → apply, on a branched DB if possible.
- **Do NOT** touch unrelated files or the workspace/PlanCard code.

---

## Phase 0 — Confirm understanding (no code)
Reply with the current value at each site below and whether it is a **platform-cut** or an **expert-share** number. Wait for confirmation.
- `routes.ts:583` `shareRate = Number(service.revenueShareRate ?? 0.30)` → expert-share fallback
- `routes.ts:3289` `platformFee = price * 0.30` → platform-cut
- `routes.ts:3420` `: 0.30` (effectiveRate display fallback) → expert-share, display only
- `routes.ts:5528` `platformFee = subtotal * 0.30` → platform-cut (cart)
- `routes.ts:5654` `platformFee = subtotal * 0.30` → platform-cut (checkout)
- `routes.ts:5668` `safeParseRate(item.service.revenueShareRate, 0.75)` → expert-share (already correct)
- `routes.ts:18126` `DEFAULT_RATE = 0.75` → expert-share (already correct)

## Phase 1 — The single resolver
Create `resolveCommissionRates({ category?, source?, revenueType? })` (e.g. `server/services/commission.ts`):
1. Constants: `export const PLATFORM_FEE_DEFAULT = 0.25;` `export const AFFILIATE_PLATFORM_FEE = 0.70;` `export const AI_PLATFORM_FEE = 1.00;` (expert/provider share = `1 - platformFee`).
2. **Policy order (first match wins):**
   - AI-sourced (no provider/expert on the item) → platform `1.00`.
   - Affiliate (revenueType `affiliate_commission` or affiliate-booked) → platform `0.70` (expert 0.30).
   - Otherwise → look up `booking_fee_configs` by category; if an active row exists use it; else platform `0.25`.
3. Return `{ platformFeeRate, counterpartyRate }` guaranteed to sum to 1 (derive one from the other).

**Gate:** `npm run check` clean; sanity: AI item → 1.00; affiliate → 0.70; bare service → 0.25.

## Phase 2 — Route every site through the resolver
Per the Phase 0 classification:
- **Platform-cut sites** (`3289`, `5528`, `5654`): replace `* 0.30` with `* platformFeeRate` from the resolver (default 0.25).
- **Expert-share fallback** (`583`): replace `?? 0.30` with the resolver's `expertShareRate` (0.75). Keep line 584's `1 - shareRate` derivation.
- **Display fallback** (`3420`): set to `expertShareRate` for consistency (low risk).
- **Commission endpoint** (`18126`) and **cart** (`5668`): keep 0.75, but source it from the resolver so there is one definition. Do not change behavior.

**Gate:** `grep -rn "0\.30" server/routes.ts` → only non-commission hits remain (e.g. `doc.moveDown(0.3)`); zero commission literals. `npm run check` clean.

## Phase 2b — Subsume the OTHER two fee sources (do not skip)
There are two more independent fee definitions that must route through the same resolver, or 25/75 won't hold:
- **`server/services/pricing.service.ts:19` `feeRates` map** (accommodation 0.15, transportation 0.10, activities 0.12, dining 0.08, shopping 0.05, expert_services 0.20, default 0.12). Replace this hardcoded map so `getPriceBreakdown` calls `resolveCommissionRates({ category })` instead. This is the provider-booking platform fee — it becomes 0.25 by policy.
- **`revenue_splits` table** (display + opportunity defaults: service 85%, template 80%, affiliate 60% — `routes.ts:3615`). Reconcile to policy: service/template expert → 0.75 (platform 0.25), **affiliate expert → 0.30** (platform 0.70). Either seed these rows from the policy or have the consuming code read the resolver. Do NOT leave 85/80/60 as competing defaults.

**Gate:** `grep -rnE "0\.15|0\.20|0\.12|0\.08|0\.05" server/services/pricing.service.ts` → no commission rates remain in the map; affiliate split reads 30% expert.

## Phase 3 — Seed + backfill `booking_fee_configs`
- Default row (`category="default"`): platform 25% / expert 75%.
- Migration via `drizzle-kit`; startup backfill updates any legacy 70%/30% rows to the new default **only if** they were never admin-edited (don't clobber intentional overrides — gate on an `is_active`/`updated_by` signal if present, else only touch the `default` row).

**Gate:** query `booking_fee_configs` → default row reads 25/75.

## Phase 4 — Admin editability + cart==checkout proof
- Confirm `POST /api/admin/fee-config` writes a category override and the resolver picks it up live (no restart).
- Confirm `GET /api/cart` and `POST /api/checkout` compute identical per-item splits (same resolver).

**Gate (smoke):** in admin, set `transportation` to platform 10%; add a transport item; verify cart shows expert 90% on that item and checkout charges the same; reset to default.

---

## Done = all true
- [ ] One resolver implements the full policy: AI 100% / affiliate 70% / default 25%; rates always sum to 1.
- [ ] No commission `0.30` literals remain; platform-cut sites use the resolver; share sites use the resolver.
- [ ] `pricing.service.ts` `feeRates` map removed in favor of the resolver; `revenue_splits` reconciled (affiliate expert = 30%, others 75%).
- [ ] `booking_fee_configs` default = 25/75; admin override takes effect live; legacy rows backfilled without clobbering overrides.
- [ ] Cart and checkout produce identical splits via the resolver.
- [ ] AI-sourced items charge platform 100%; affiliate charges expert 30%.
- [ ] `npm run check` clean.
