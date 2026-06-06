# FEE-3 (narrowed) — Configurable deposit rate (P0 billing fix)

**Scope:** One live billing literal — `server/services/pricing.service.ts:20` `depositRate = 0.25`. Charged to real users who pick "deposit" at checkout (→ written to the `bookings` row and used as the Stripe PaymentIntent amount via `booking.service.ts:301, 336, 346`). Make it config-resolved.

**This is a make-configurable fix, NOT a rate change.** Default stays 25 %; behavior is identical day one. Admin can move it without a redeploy.

**Status flagged in tracker:** `FEE-3 / Launch-blocking (P0 billing literal)`.

**Owner:** FEE workstream.

**Target:** Claude Code, repo working tree, branch `claude/laughing-bardeen-KyTUY`.

---

## DIAGNOSIS (the trace that produced this brief)

`pricing.service.ts` reachability — only TWO surfaces matter:

| Surface | Status |
|---|---|
| `calculatePlatformFees` (`pricing.service.ts:82`) | **Already clean.** Resolves via `resolveCommissionRates(category)` (line 83). Reads `booking_fee_configs`. Not in scope. |
| `calculateDeposit` (`pricing.service.ts:103`) | **Live billing literal.** `this.depositRate = 0.25`. Hit by `bookingService.processCart → booking.service.ts:301`, which feeds the Stripe PI amount in `processCart` (`:336, :346`). **In scope.** |
| `calculateExpertFee` (`pricing.service.ts:118`) | **Dead code.** Zero callers (`grep -rn "calculateExpertFee" .`). Hardcoded 10/15/20 % markups. Handled as a SEPARATE cleanup commit (Step 5). |

Single-source confirmed via:
```
grep -rn "0\.25\|depositRate\|calculateDeposit" server/ client/
```
Only `pricing.service.ts:20` is a charge-path deposit literal. `commission.ts:25 PLATFORM_FEE_RATE = 0.25` is the per-category fallback constant per §4.8 ("approved defaults that ship out of the box") — sibling concern, not in scope.

---

## WHAT NOT TO DO

- **Do not change the effective rate.** 0.25 stays the day-one default; no user-facing change.
- **Do not introduce a new constant.** Resolve from `booking_fee_configs` with **0.25 as the safe fallback** (a missing/unseeded row must NEVER silently drop the deposit to 0 — that would break checkout).
- **Do not add a new admin UI section.** `platform_deposit_rate` surfaces automatically in `fee-config.tsx` via the existing per-category iteration.
- **Do not delete `calculateExpertFee` in the same commit.** Dead-code cleanup ships separately (Step 5) so the P0 diff stays surgical.
- **Do not exceed the 140 typecheck floor.**

---

## STEP 1 — Pre-flight (done; documented)

✅ Single source confirmed. `pricing.service.ts:20` is the only deposit literal in a charge path. Callers of `calculateDeposit`:
- `server/services/booking.service.ts:301` (live `processCart` → Stripe PI)
- `server/services/pricing.service.ts:231` (inside `estimateTripCost`, live `POST /api/bookings/estimate-cost`)

Both call sites need `await` once `calculateDeposit` becomes async.

---

## STEP 2 — Migration: seed `platform_deposit_rate` row

**File:** `server/migrations/023_platform_deposit_rate.sql`, registered in `run-migrations.ts`.

```sql
-- FEE-3: seed the pricing.service.ts deposit rate into booking_fee_configs.
-- platform_fee_percent reused as a generic single-rate carrier; expert_share_percent
-- is zero since the "expert share" semantic doesn't apply to deposit.
-- Seeded at 25 to preserve day-one behavior; admin can edit via /admin/fee-config.
INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
VALUES ('platform_deposit_rate', 25, 0, true)
ON CONFLICT (category) DO NOTHING;
```

---

## STEP 3 — Resolver in `pricing.service.ts`

- Add a private `loadDepositRate()` helper: single `SELECT platform_fee_percent FROM booking_fee_configs WHERE category = 'platform_deposit_rate' AND is_active = true LIMIT 1`. Divide by 100. Safe fallback `0.25` on any failure (DB error, row missing, NULL).
- 60-second in-memory cache (same TTL pattern as `affiliate.service.ts` post-LB-P4a).
- `calculateDeposit` becomes `async`: `const rate = customRate ?? await this.loadDepositRate();`. Returns `Promise<number>`.
- Remove the `private readonly depositRate = 0.25;` field.
- Update the two callers to `await pricingService.calculateDeposit(...)`:
  - `server/services/booking.service.ts:301`
  - `server/services/pricing.service.ts:231` (internal — `await this.calculateDeposit(total)`)

---

## STEP 4 — Verify the rate reaches the money, not just the row

- Confirm the resolved rate flows through to BOTH `bookings.deposit_amount` AND the Stripe PaymentIntent amount (`booking.service.ts:336, 346`). The charged amount must reflect config.
- **Acceptance:**
  - Default → deposit booking still charges 25 % (PI amount unchanged from today).
  - Edit `platform_deposit_rate` via `/admin/fee-config` → next checkout's PI amount matches new rate (within the 60 s cache TTL).
  - Missing config row → safe 0.25 fallback, no checkout break.

---

## GATE (P0 commit)

```
grep -n "0\.25\|depositRate" server/services/pricing.service.ts
# Expect: ZERO matches outside the safe-fallback literal `0.25` inside loadDepositRate.
# The `private readonly depositRate` field is gone.
grep -rn "platform_deposit_rate" server/migrations/023_platform_deposit_rate.sql server/services/pricing.service.ts
npm run check 2>&1 | grep -cE "^[a-zA-Z].*\\.ts\\([0-9]+,[0-9]+\\): error"   # ≤140
```

Commit: `fix(FEE-3): resolve deposit rate from config, remove hard-coded 0.25`

---

## STEP 5 — Separate cleanup commit: delete dead `calculateExpertFee`

Dead code with hardcoded 10/15/20 % markups (`pricing.service.ts:118-127`) — zero callers, already misled this brief's first-pass scoping. Delete it cleanly in its own commit so:
- The P0 diff stays surgical and trivially auditable.
- The landmine is removed before a future audit (or expert-tier feature) wires it up assuming it's canonical.
- When the real expert-tier feature lands, it'll resolve from config anyway, so nothing of value is lost.

```
grep -rn "calculateExpertFee" server/ client/
# Expect: zero matches after deletion.
npm run check 2>&1 | grep -cE "^[a-zA-Z].*\\.ts\\([0-9]+,[0-9]+\\): error"   # ≤140
```

Commit: `chore(pricing): delete dead calculateExpertFee (no callers; landmine removal)`

---

## OUT OF SCOPE

- Expert tier markups (the deleted dead function) — when the real feature lands, it resolves from config.
- `commission.ts` PLATFORM_FEE_RATE / EXPERT_SHARE_RATE constants — §4.8-approved defaults, intentionally kept as last-resort fallback.
- Explicit cache-bust on admin save (60 s TTL is acceptable for a deposit-rate change; making `pricingService` a singleton with `bustCache()` is a 30-min follow-up if drift becomes painful).
- Cross-resolver unification (`commission.ts` + `optimization-fee.service.ts` + `pricing.service.ts`) — cosmetic; works fine as multiple resolvers.
