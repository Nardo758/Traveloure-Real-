# Concierge — Phase B Execution Brief ($9 Power-User Tier)

**Goal:** Ship the optional $9/mo (or annual) power-user tier that **discounts but never gates** the Concierge. Members get a priority/retained expert + a capped included AI-plan allowance per period, with overage billed at the existing per-task rate (FEE-A). Non-members continue to use the Concierge à la carte exactly as today. No commission discounts.

**Source:** Business Plan v1.3 §2.3 (Concierge layer) + §4.7 (Concierge tier economics) + §4.8 (admin-configurable fee schedule). Concierge Implementation Plan §3 (B1/B2/B3) + §4 (Phase B sequencing).

**Target:** Claude Code, repo working tree.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. Phases share context (the subscription rail, the allowance counter, the routing branch).
2. Work in strict phase order: 0 → 5.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(CON-B.Pn): …`). Do not proceed past a failing gate.
4. **Typecheck floor = 140 pre-existing errors.** Every phase must return `npm run check` at **≤140 errors**. No net-new errors in the files a phase touches.
5. **Phases that edit `shared/schema.ts` (1, 2, 5) must run SINGLE-SESSION.** Concurrency-conflict surface.
6. File:line refs are from the Concierge plan + Phase A landings (June 2026) and may have drifted; confirm before editing.

---

## HARD PREREQS — DO NOT START WITHOUT THESE

1. **Concierge Phase A is live in production** (not just staging). The $9 tier is a wrapper on top of the per-task pay-per-use flow; if FEE-A's per-event-type fee isn't actually billing, the overage path has no rate to fall back to. Verify before P0:
   ```
   grep -rn "/api/optimization-payments\|getFee" server/  # both should be active
   ```
   The `optimization_fees` table should have the §4.8-seeded rows (migration 017) and admin should be able to edit them via `/admin/fee-config`.

2. **≥ 4 weeks of `aiCostTracking` data exist.** Per §4.7: *"Cost-per-AI-plan must be sourced from the platform's own AI cost tracking, not assumed. The included-plan cap is then set so even a heavy month's included AI stays well under the $9."* Without this data, the allowance cap is a guess, which means the unit economics are a guess. Before P0:
   ```
   SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM ai_cost_tracking;
   -- and the per-plan cost percentile distribution
   SELECT
     PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY cost) AS median,
     PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY cost) AS p90,
     PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY cost) AS p99,
     AVG(cost) AS mean
   FROM ai_cost_tracking
   WHERE created_at > NOW() - INTERVAL '4 weeks'
     AND sourceType = 'ai_concierge';
   ```
   Use this to back-derive the included-plan cap such that *median × cap ≤ ~$1.20* (per §4.7's economics worked example). If the table doesn't exist or has < 4 weeks of data: **stop and surface this**; the brief executes only after data is sufficient.

3. **Per-expert commission override** (`EXP-OVR`) is shipped (`7d1c250`, `5b13915`, `79b335f`). Phase B's priority-routing branch (B3) sits next to this in `commission.ts` and `lead-routing.service.ts` — confirm both still pass typecheck floor.

---

## DECIDED DEFAULTS (do not ask — settled)

- **D1 Pricing:** $9/mo default + 1 annual rate, both admin-editable from day one. Annual rate is a single config value (not a % discount) so the admin can promo without code.
- **D2 Allowance period:** 1 month (calendar), tied to Stripe `current_period_end`. Cap resets on each renewal. **Per-trip accounting** (a member is charged at most one included AI plan per trip per period) matches the existing 24h-free-rerun semantics — overage applies on the *next distinct trip*, not the next call.
- **D3 Overage rate:** Read through `getFee(eventType, tier)` — same resolver as FEE-A. No new rate, no discount on overage. Members pay the same per-task rate as non-members when they exceed their allowance.
- **D4 No commission discounts.** Members do not pay reduced commission on expert services. §4.8 explicit.
- **D5 Priority routing:** Members go to the FRONT of `expert_city_queues.expertIds` rotation for new requests, AND their retained advisor (if any) surfaces first in the Concierge router's expert recommendations. No SLA promises — priority is best-effort routing, not contractual.
- **D6 Retained advisor:** opt-in pairing. On the member dashboard, the user can pick a retained expert from those they've previously booked with. Stored as `concierge_memberships.retainedExpertUserId`. Surfaced first in Phase 7 escalation CTAs.
- **D7 Cancellation:** Stripe's standard `cancel_at_period_end=true` — member keeps allowance through current period end. No prorated refunds. On status flipping to `canceled` at period end, allowance becomes 0 and priority routing falls back to standard.
- **D8 Subscribe surface:** new `/concierge/membership` page reachable from the `/concierge` entry page AND from any post-quote prompt. Two product cards: monthly + annual.
- **D9 Member badge:** small "Member" chip on PlanCards + a `member: true` flag in the `/api/concierge/quote` response (so DeliveryOptions can show "Included" instead of a price on AI tier while allowance remains).

---

## GLOBAL "WHAT NOT TO DO"

- **No fee/price/rate constants.** Tier price + included-plan cap + annual rate live in `concierge_tier_config`. Overage resolves through `getFee()` (FEE-A). Never a literal.
- **Do not gate the Concierge behind membership.** À la carte path must remain unchanged for non-members. The `/api/concierge/quote` shape stays compatible; new fields are additive.
- **No commission discounts** in `commission.ts:resolveCommissionRates`. The per-expert override (`EXP-OVR`) and category lookup remain the entire commission story.
- **Do not bundle multiple member benefits into one Stripe price.** One product, two prices (monthly + annual). Admin-editable price values mean admin needs to update Stripe's prices via dashboard or via a Phase B.5 admin endpoint — flag in the brief which path you choose.
- **Do not store raw Stripe customer/payment-method IDs anywhere except `concierge_memberships.stripeCustomerId` / `stripeSubscriptionId`.** No duplicate ID surfaces.
- **Do not add new routes to `server/routes.ts`.** All Phase B endpoints go in `server/routes/concierge.routes.ts` (extends Phase A).
- **Do not couple priority routing to the AI allowance.** A member with 0 allowance left still gets priority routing for expert escalations — the two benefits are independent.
- **Do not retroactively credit allowance** when a member upgrades mid-month, downgrades, or pauses. Allowance state changes only at Stripe `current_period_end`.

---

## REUSE MAP (consume as-is unless noted)

| Need | Use | Evidence |
|---|---|---|
| Per-task AI fee resolver (overage rate) | `getFee(eventType, tier)` | `server/services/optimization-fee.service.ts` |
| Concierge quote endpoint (extend for member shape) | `POST /api/concierge/quote` | `server/routes/concierge.routes.ts` |
| Concierge router service | `routeConcierge()` | `server/services/concierge-router.service.ts` |
| Existing concierge_requests log | `concierge_requests` | `shared/schema.ts` (Phase A.P3) |
| Expert routing rail (priority injection point) | `lead-routing.service.ts` | `server/services/lead-routing.service.ts` |
| Expert availability service | `getExpertAvailability` | `server/services/expert-availability.service.ts` |
| Existing Stripe client + customer lookup | `stripe.customers.list/create` | `server/routes/optimization.routes.ts:204-224` |
| Revenue ledger | `revenueTrackingService.recordRevenueEvent` + `subscription` enum already in `revenueSourceTypes` | `server/services/revenue-tracking.service.ts:13`; `shared/schema.ts:3995` |
| Webhook handler module | `server/routes/webhooks.routes.ts` | existing |
| AI cost data (sizing the cap) | `ai_cost_tracking` | existing |
| Admin fee UI surface (extend for tier config) | `client/src/pages/admin/fee-config.tsx` | existing |

**Replace, don't reuse:** nothing — Phase B is pure additive on top of Phase A.

---

## PHASE 0 — Pre-flight + cost-data sanity check (no code)

**Objective:** confirm the prereqs are met and the cap can be set against real data.

1. **Concierge Phase A live confirmation.**
   - `/api/optimization-payments` returns a Stripe clientSecret for a wedding eventType payload. If 4xx, A isn't actually live.
   - `/admin/fee-config` shows per-event-type rows with §4.8 defaults editable. Snapshot the current `optimization_fees` rows.
2. **EXP-OVR confirmation.** `commission.ts:resolveCommissionRates` has the Tier-3 per-expert override branch present. (Phase B doesn't touch this but it sits in the same file as B3 routing.)
3. **Cost-data analysis.** Run the percentile query in the Prereqs section. Produce a one-line answer to: **"What is the included-plan cap that keeps median × cap ≤ $1.20 with p90 × cap ≤ $1.80?"** That's the cap to seed `concierge_tier_config.includedAiPlansPerPeriod`.
4. **Existing subscription scaffolding check.**
   ```
   grep -rn "stripe.subscriptions\|customer.subscription\.\|concierge_memberships\|conciergeMembership" server/ shared/
   ```
   `revenueSourceTypes` already has `'subscription'` (`shared/schema.ts:3995`); confirm nothing writes to it yet (Phase A audit confirmed clean). Confirm no half-built subscription rail exists.
5. **Stripe product seeding plan.** Decide: (a) admin creates the Stripe Product + Prices manually in the Stripe dashboard and the price IDs go into `concierge_tier_config`, OR (b) Phase B.5 admin endpoint provisions them programmatically. **Recommend (a)** for Phase B — fewer moving parts; the admin enters two price IDs once.

**Gate:** cost-data answer written down (cap value committed to memory of the executor), Phase A confirmed live, namespace clear, Stripe seeding path chosen. No code changed.

---

## PHASE 1 — FEE-B: `concierge_tier_config` admin-editable storage

**Objective:** the tier price + included-plan cap + annual rate + Stripe price IDs are admin-editable from day one. Single row.

**Files:** `shared/schema.ts`, `server/migrations/022_concierge_tier_config.sql`, `server/migrations/run-migrations.ts`, `server/routes/admin.routes.ts`, `client/src/pages/admin/fee-config.tsx`.

**Steps**
1. **Schema:** `concierge_tier_config` — singleton-ish (enforce one active row via partial unique index):
   ```
   id (uuid)
   monthly_price_cents (int)            -- default 900 = $9.00
   annual_price_cents (int)             -- default 9000 = $90 (admin sets — could be promo)
   included_ai_plans_per_period (int)   -- the cap (P0 derives from cost data)
   stripe_monthly_price_id (text)       -- nullable until admin pastes from Stripe dashboard
   stripe_annual_price_id  (text)       -- nullable until admin pastes from Stripe dashboard
   currency (varchar 3, default 'USD')
   is_active (boolean, default true)
   updated_by (text)
   created_at, updated_at
   ```
   Plus types + Zod insert schema.
2. **Migration `022_concierge_tier_config.sql`:** `CREATE TABLE IF NOT EXISTS …` + a partial unique index `WHERE is_active = true` so app-level guarantees a single live config; seed one row with §4.8 defaults + the included-plan cap from P0. Stripe price IDs start NULL — admin pastes them after creating the Stripe Product.
3. **Admin endpoints (in `admin.routes.ts`):**
   - `GET /api/admin/concierge-tier-config` — return current row.
   - `PATCH /api/admin/concierge-tier-config` — accept `{ monthlyPriceCents?, annualPriceCents?, includedAiPlansPerPeriod?, stripeMonthlyPriceId?, stripeAnnualPriceId? }`. Validate all cents fields ≥ 0; cap > 0. Audit-log via `accessAuditLogs` (matches EXP-OVR.P3 pattern).
4. **Admin UI (in `fee-config.tsx`):** new "Concierge Power-User Tier" card next to the AI Concierge Fees section: monthly/annual price inputs + included-plan cap + two read-mostly inputs for Stripe price IDs. Same Save pattern as the optimization-fees card.

**Acceptance**
- Admin can view + edit price + cap from `/admin/fee-config`.
- Updates audit-log to `accessAuditLogs` with previous → next.
- The single-active-row invariant is enforced at the DB level.
- No fee constants introduced in code.

**Verify / Gate**
```
grep -rn "concierge_tier_config\|conciergeTierConfig" shared/ server/ client/src/pages/admin/
npm run check                                                                   # ≤140
```
Commit: `feat(CON-B.P1): concierge_tier_config admin-editable storage`

---

## PHASE 2 — B1: `concierge_memberships` table + Stripe subscription rail + webhook

**Objective:** Members can subscribe (monthly or annual) and the membership state is the source of truth for B2 (allowance) and B3 (routing).

**Files:** `shared/schema.ts`, `server/migrations/023_concierge_memberships.sql`, `server/routes/concierge.routes.ts`, `server/routes/webhooks.routes.ts`.

**Steps**
1. **Schema `concierge_memberships`:**
   ```
   id (uuid)
   user_id (text, FK users.id, CASCADE, UNIQUE — one membership per user)
   stripe_customer_id (text)
   stripe_subscription_id (text, UNIQUE)
   plan (text: 'monthly' | 'annual')
   status (text: matches Stripe subscription.status — active | trialing | past_due | canceled | unpaid | incomplete)
   current_period_start, current_period_end (timestamp)
   included_ai_plans (int)               -- snapshot at period start from tier_config
   used_ai_plans (int, default 0)
   period_reset_at (timestamp)            -- equals current_period_end; index for cron sweeps
   retained_expert_user_id (text, FK users.id ON DELETE SET NULL, nullable)
   cancel_at_period_end (boolean, default false)
   created_at, updated_at
   ```
2. **Migration `023_concierge_memberships.sql`** — `CREATE TABLE IF NOT EXISTS` with indexes on `(user_id)`, `(stripe_subscription_id)`, `(status)`, `(period_reset_at) WHERE status IN ('active', 'trialing')`.
3. **Subscribe endpoint (`concierge.routes.ts`):**
   - `POST /api/concierge/membership/subscribe` — `isAuthenticated`. Body `{ plan: 'monthly' | 'annual' }`. Looks up the active `concierge_tier_config` row; requires the matching Stripe price ID to be set (else 503 "membership not configured yet"). Creates or reuses a Stripe customer (reuse the helper at `optimization.routes.ts:204-224`). Creates a Stripe Subscription with `cancel_at_period_end=false`, `payment_behavior='default_incomplete'`, returns `{ subscriptionId, clientSecret }` from the latest invoice's PaymentIntent for SCA confirmation on the client.
   - The row in `concierge_memberships` is **NOT created here** — it's created from the `customer.subscription.created` webhook (single write path = single source of truth, avoids double-creation on retry).
4. **Cancel endpoint:**
   - `POST /api/concierge/membership/cancel` — flips `cancel_at_period_end=true` on the Stripe sub. The local row updates from the resulting `customer.subscription.updated` webhook.
5. **Get-me endpoint:**
   - `GET /api/concierge/membership/me` — returns the caller's membership row (or `null`). Phase 5 UI consumes this.
6. **Webhook handler (`webhooks.routes.ts`):**
   - Extend the existing webhook switch to handle `customer.subscription.{created, updated, deleted}` and `invoice.paid` (for the period-reset allowance refill — see step 7).
   - On `customer.subscription.created`: upsert `concierge_memberships` row keyed by `stripe_subscription_id`, snapshot `included_ai_plans` from `concierge_tier_config`, set `used_ai_plans=0`.
   - On `customer.subscription.updated`: update status, period dates, `cancel_at_period_end`.
   - On `customer.subscription.deleted`: status → `canceled`; allowance becomes irrelevant (members can still call /quote — they just don't get the "Included" discount).
   - On `invoice.paid` (new period billed): refill — `used_ai_plans = 0`, snapshot fresh `included_ai_plans` (so the admin changing the cap mid-period takes effect at next billing, not retroactively).
7. **Revenue ledger.** Each successful `invoice.paid` records a `subscription` source-type event via `revenueTrackingService.recordRevenueEvent({ sourceType: 'subscription', sourceId: invoice.id, grossAmount: invoice.amount_paid/100, metadata: { userId, plan } })`. The enum value already exists.

**Acceptance**
- An authenticated user can `POST /membership/subscribe`, complete Stripe Elements payment on the client, and their `concierge_memberships` row appears once the webhook lands (status=`active`, allowance snapshot present, `used_ai_plans=0`).
- Cancel flips `cancel_at_period_end=true`; row updates from webhook; allowance keeps working until period end.
- Revenue ledger has a `subscription` event per paid invoice.
- No subscribe/cancel writes happen outside the webhook path other than the Stripe API call itself.

**Verify / Gate**
```
grep -rn "concierge_memberships\|conciergeMemberships" shared/ server/
grep -rn "customer.subscription\.\|invoice.paid" server/routes/webhooks.routes.ts
npm run check                                                                   # ≤140
```
Commit: `feat(CON-B.P2): concierge_memberships table + Stripe subscription rail + webhook`

---

## PHASE 3 — B2: Allowance counter + overage billing

**Objective:** at AI Concierge charge time, members with allowance remaining get $0 (counter decrements); members with no allowance remaining + non-members pay the standard FEE-A rate. Per-trip accounting per D2.

**Files:** `server/routes/optimization.routes.ts`, `server/services/concierge-router.service.ts`, `server/routes/concierge.routes.ts`.

**Steps**
1. **New helper in `concierge-router.service.ts`:**
   ```
   resolveMemberAllowance(userId, tripId) →
     { hasMembership, allowanceRemaining, isThisTripCovered, includedAiPlans, usedAiPlans }
   ```
   - Look up `concierge_memberships` by `userId` where `status IN ('active','trialing')` and `current_period_end > now()`. If none: `hasMembership=false`.
   - `isThisTripCovered`: check if a prior charge in this period was already a $0 included plan for the same `tripId` (read from `concierge_requests` rows in `status='paid'` linked to this membership in current period). Phase A's 24h-free-rerun semantic still applies inside.
2. **Charge-time branch.** In the `/api/optimization-payments` handler (`optimization.routes.ts:162`):
   - After resolving tier + eventType + fee (current path), call `resolveMemberAllowance(userId, tripId)`.
   - If `isThisTripCovered`: short-circuit — record a "covered_by_membership" `concierge_requests` row, no Stripe PI, return `{ covered: true, allowanceRemaining }`.
   - Else if `hasMembership && allowanceRemaining > 0 && !isThisTripCovered`: decrement `used_ai_plans` (atomic UPDATE), record covered request, no PI.
   - Else: existing path — create Stripe PI for the FEE-A rate (overage works just like any non-member charge).
3. **Atomic decrement.** The decrement is one SQL UPDATE with a guard: `UPDATE concierge_memberships SET used_ai_plans = used_ai_plans + 1 WHERE id = $1 AND used_ai_plans < included_ai_plans RETURNING used_ai_plans`. If `rowCount === 0`, treat as no allowance (race-safe).
4. **Quote endpoint extension.** `routeConcierge()` returns `ai.priceCents` as resolved fee today. Add a `ai.coveredByMembership: boolean` flag computed from `resolveMemberAllowance`; the client uses it to display "Included" instead of a price on the AI card when remaining allowance > 0 and this trip isn't already covered.
5. **Idempotency.** Charge-time decrement is keyed on `tripId + period`; double-clicking "Get plan" won't double-count.

**Acceptance**
- A member with 3 allowance, 0 used, hitting /optimization-payments on Trip A: $0, allowance now 1 used.
- Same member hitting it on Trip A again (within period): $0, still 1 used.
- Same member hitting it on Trip B: $0, 2 used.
- Same member at 3 used hitting Trip C: standard FEE-A rate, PI created.
- Non-member: standard FEE-A rate, unchanged from Phase A.

**Verify / Gate**
```
grep -rn "resolveMemberAllowance\|covered_by_membership\|coveredByMembership" server/ client/src/
npm run check                                                                   # ≤140
```
Commit: `feat(CON-B.P3): member allowance counter + overage at FEE-A rate`

---

## PHASE 4 — B3: Priority routing in `lead-routing.service`

**Objective:** members with active status get FRONT-of-queue routing on new expert requests, AND their retained advisor (if set) surfaces first in expert-tier recommendations. No SLA contract; best-effort priority.

**Files:** `server/services/lead-routing.service.ts`, `server/services/concierge-router.service.ts`.

**Steps**
1. **Lead-routing extension.** In `lead-routing.service.ts`, the place that proposes expert IDs for a new request: pre-fetch caller's `concierge_memberships` (active only). If membership present:
   - If `retained_expert_user_id` is set AND that expert is in the queue AND available: emit them as the first proposal.
   - Otherwise, prepend the requester to `expertCityQueues.expertIds` priority list at proposal time (do NOT mutate the table itself — apply at read time as an ordering hint, not a write).
2. **Concierge-router signal.** Extend the `routeConcierge()` response with `expert.retainedAdvisorId?` so the UI can highlight "Your advisor" on the Expert tier card.
3. **No commission discount.** D4 explicit. Do not touch `commission.ts`.

**Acceptance**
- A member's escalated `expert_request` from the PlanCard CTA appears AHEAD of non-member requests for the same city in the admin routing queue.
- If retained advisor is set + available, the `routeConcierge` Expert tier surfaces them by ID.
- Non-members: unchanged routing behavior.

**Verify / Gate**
```
grep -rn "concierge_memberships\|retained_expert" server/services/lead-routing.service.ts
npm run check                                                                   # ≤140
```
Commit: `feat(CON-B.P4): member priority routing + retained-advisor preference`

---

## PHASE 5 — Subscribe UX + member dashboard

**Objective:** the UI surface for non-members to subscribe and for members to see their state (allowance remaining, period end, retained advisor, cancel).

**Files:** `client/src/pages/concierge/membership.tsx` (new), `client/src/components/concierge/DeliveryOptions.tsx` (extend), `client/src/App.tsx` (route).

**Steps**
1. **`/concierge/membership` page.** Two product cards (monthly $9/annual $90 — read from `/api/admin/fee-config`'s concierge tier section via public-read endpoint OR a slim `/api/concierge/membership/plans` endpoint).
   - Each card: price, "X included AI plans / period", "Priority expert routing", "Retained advisor (opt-in)".
   - Stripe Elements wired against `POST /membership/subscribe`'s returned clientSecret.
   - On confirm, poll `GET /membership/me` until `status=active` (webhook race) — max 5s with fallback "We'll email you when your membership is live" if still pending.
2. **Member dashboard (same page, when `/me` returns a membership):**
   - "X of Y included AI plans used this period · resets {date}"
   - "Your retained advisor: [Name] · Change" (with a small picker of previously-booked experts)
   - "Cancel" button → `POST /membership/cancel`, copy: "Your membership stays active until {period_end}".
3. **DeliveryOptions update.** On the AI tier card: when `route.ai.coveredByMembership === true`, show "Included" badge instead of the price; CTA copy changes to "Use included plan".
4. **PlanCard member chip.** Small "Member" pill near the trip title when the viewer has active membership (one extra query — or piggyback on existing user fetch).
5. **Header CTA.** When `/membership/me` returns null AND the user is on `/concierge`, surface a soft inline "Power-user $9/mo · X plans included" prompt below the IntentForm — never a blocking interstitial (D2 from Phase A still applies).

**Acceptance**
- A non-member subscribes, completes Stripe payment, sees the dashboard with allowance + period end within ~5s of confirm.
- A member sees their allowance reflect their usage; CTA changes to "Included" on the AI tier when remaining > 0.
- Cancel sets `cancel_at_period_end=true`, shows correct end-date copy, membership still usable until period end.

**Verify / Gate**
```
grep -rn "/concierge/membership" client/src/App.tsx
grep -rn "coveredByMembership\|membership/me" client/src/components/concierge/
npm run check                                                                   # ≤140
```
Commit: `feat(CON-B.P5): /concierge/membership subscribe + dashboard`

---

## FINAL VERIFICATION CHECKLIST

- [ ] **P1** — `concierge_tier_config` admin-editable; price + cap + Stripe price IDs configurable; audit-logged.
- [ ] **P2** — Subscribe creates Stripe sub; webhook is the single source of truth for `concierge_memberships` writes; cancel + period-end + invoice.paid all handled; revenue ledger has `subscription` events.
- [ ] **P3** — Member with allowance pays $0 for AI plans (per-trip accounting); overage and non-members pay the FEE-A rate; race-safe atomic decrement.
- [ ] **P4** — Member requests jump the routing queue; retained advisor surfaces first when set/available; no commission discount.
- [ ] **P5** — Subscribe + dashboard + cancel flows work end-to-end; "Included" appears on AI card when applicable; member chip on PlanCard.
- [ ] No new fee/price/rate constants introduced.
- [ ] No new routes added to `server/routes.ts`; everything in `server/routes/concierge.routes.ts`.
- [ ] `npm run check` ≤ 140 (the floor) after every phase.
- [ ] Webhook replay-safe: re-delivering any subscription.* or invoice.paid event is idempotent.

## KNOWN FOLLOW-UPS (not in this brief)

- **Member-only Concierge experiments** (priority email response, early access to features) — Phase B+ after retention data signals.
- **Annual-renewal reminder email** 30 days before renewal — needs the LB-P1 Resend domain verified and an email-scheduler service. Tracked separately.
- **Pause / vacation hold** — not a Stripe-native flow; defer until we see real demand.
- **Gifting a membership** — credit gifting is already Deferred-P2 in the tracker; membership gifting can ride that brief when it lands.
- **Allowance carryover** — explicit no per D2; only revisit if churn data demands.

## OUT OF SCOPE (CON-C territory)

Full / Done-for-You transactional flow · `event_packages` quote workflow · provider bundle assembly · contract surface · per-event commission overrides · admin quote-review queue.

---

## DATA-DRIVEN PARAMETER (must answer before P1 ships)

**Included-plan cap (`included_ai_plans_per_period`)** — set so that, given the median per-plan AI cost from `ai_cost_tracking` over the past 4 weeks:
- `median_cost × cap ≤ $1.20` (per §4.7's economics worked example targeting ~77% margin)
- `p90_cost × cap ≤ $1.80` (heavy-month safety margin)

The cap is intentionally low (likely 3–5 plans/month) so heavy users push themselves into overage, which is ≈100% margin. Per §4.7: *"heavy users increase margin rather than erode it."* Do not raise the cap to "seem more generous" — the unit economics are what makes this tier work.
