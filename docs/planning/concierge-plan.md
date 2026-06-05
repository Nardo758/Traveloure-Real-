# Concierge Model — Implementation Plan (revised)

**Plan version:** 2 (2026-06-05) — adds the fee-plumbing dependency audit as Section 1 and reconciles with `audit-coverage-tracker.md`.

---

## 1. Fee-plumbing dependency audit

§4.8 (updated v1.3) lists nine fees. The Concierge billing surface only depends on **four** of them. Auditing those four against current code:

| §4.8 fee that Concierge bills | Current state in code | Has admin-editable config? | Resolved via single resolver? | Blocks which Concierge phase? |
|---|---|---|---|---|
| **AI Concierge fee** ($9.99 std / $49.99 event / 5 credits / $0=off, per-event-type) | `optimization_fees` table + `getFeeForTier` (`server/routes/optimization.routes.ts:42-52`) keyed by **complexity tier**, not per-event-type. Mapping (`event → tier`) hard-coded at `smart-sequencing.service.ts:915-921`. No credit-pay; no "$0=off". Router **unmounted** (LB-P3). Defaults $4.99/$9.99/$19.99 don't match §4.8. | 🟡 partial — 3 prices editable at `client/src/pages/admin/fee-config.tsx:471-499`; per-event-type and "off" missing | 🟡 partial — has its own resolver, but separate from the booking-fee resolver | **A** (gates Phase A revenue) |
| **Expert commission split** (15% new / 25% established) for Expert Concierge delivery | `commission.ts:resolveCommissionRates` (`server/services/commission.ts:41-93`) reads `booking_fee_configs`; works as a resolver. But hard-coded constants `EXPERT_SHARE_RATE=0.75`, `PLATFORM_FEE_RATE=0.25`, `AI_PLATFORM_FEE=1.00`, `AFFILIATE_PLATFORM_FEE=0.70` remain as fallbacks (`commission.ts:16-22`). No expert "new vs established" tier exists. | ✅ per-category, ❌ per-expert-tier | ✅ for the per-category dimension | **A** runs on category fallback (acceptable — every expert gets the same split). **B/C** want the tier split to land |
| **Concierge power-user tier** ($9/mo or annual; allowance + overage; no commission discounts) | Not present. No subscriptions table, no allowance counter, no overage branch. `revenueSourceTypes` enum already has `'subscription'` value (`shared/schema.ts:3988`) but nothing writes to it. | ❌ no admin UI, no storage | ❌ — would need a new resolver branch | **B** (hard blocker) |
| **Affiliate margin handling** (pass-through; per-partner retain/markup/rebate) | `affiliate.service.ts:23-52` uses hard-coded in-memory map; ignores admin-editable `affiliate_partners.commissionRate` (`shared/schema.ts:3530`). LB-P4a fixes the column read. No behavior-mode column exists for retain/markup/rebate. | 🟡 commission rate yes (after LB-P4a), behavior mode no | ❌ — service has its own constants | **C** only (Full/DFY routes to providers, which may be affiliate-backed). Phase A's AI-Concierge output references affiliate inventory display-only — no margin handling needed until booking |

**Cross-cutting plumbing gaps from the audit** (none block Phase A by themselves):
- Override granularity global→market→tier→entity (`booking_fee_configs` keyed by category only)
- Effective-dating (no `effectiveFrom`/`effectiveTo` columns)
- Audit trail (no fee-change history table)
- Reset-to-approved-default action (no policy-of-record table)
- Single resolver every charge path reads from — partial: there are **two** resolvers (`commission.ts` for booking; `optimization.routes.ts` for AI fee) plus a hard-coded affiliate map. Phase A doesn't need them unified; Phase B+C benefit but can still ship without.

### The minimum fee plumbing per Concierge phase

| Phase | Required fee plumbing | Status today |
|---|---|---|
| **A** (AI Concierge à-la-carte + Expert escalation) | (i) LB-P3 done; (ii) AI Concierge fee config extended to `event_type → tier` mapping with `$0=off` semantic; (iii) §4.8 defaults reflected. **That's it.** Expert escalation rides existing `commission.ts` resolver at category fallback. | (i) Specced LB-P3; (ii) **NEW WORK — call it `FEE-A`**; (iii) included in LB-P3 |
| **B** ($9 tier) | (iv) `concierge_tier_config` admin-editable: price, included-AI-plans/period, annual rate; (v) `concierge_memberships` storage with allowance counter; (vi) resolver branch at AI charge time: "active membership + allowance remaining → $0; else → §4.8 per-task rate"; (vii) priority-routing branch in `lead-routing.service`. **No commission discounts** (§4.8 explicit). | All net-new. **Call it `FEE-B` + builds B1/B2/B3 from this plan** |
| **C** (Full/DFY) | (viii) Per-package or per-event commission override — could be a row in `booking_fee_configs` keyed by event_type, or per-`event_package`. Doesn't require global→market→tier hierarchy. | Net-new but minimal |

### Recommendation on the FEE workstream
The cross-cutting items (override hierarchy, effective-dating, audit trail, reset-to-default, single-resolver unification, expert tier split, affiliate behaviorMode, credit-packages table) are **not blockers for Phase A or Phase B** if you accept the scoped subsets above. They are real gaps but they deserve their own phase-ordered brief — not a Concierge prerequisite. **Keep FEE as a separate workstream**, but split out two small subsets (`FEE-A`, `FEE-B`) that the Concierge plan owns and lands alongside its phases. That keeps Concierge unblocked and avoids the FEE workstream growing into a 6-month prereq.

---

## 2. Reuse map

| Concierge primitive | Existing component / endpoint | Reuse | Evidence |
|---|---|---|---|
| AI Concierge engine | `/api/ai/optimize-experience` | **As-is** (after LB-P3) | `server/routes.ts:1275`; `server/itinerary-optimizer.ts:214,233,328` |
| AI Concierge free preview | `/api/optimization-preview` | **As-is** (after LB-P3) | `server/routes/optimization.routes.ts:59-128` |
| AI Concierge fee + save-card | `/api/optimization-payments` + `/confirm`; `setup_future_usage: off_session` already wired | **Adapt** (per FEE-A) | `server/routes/optimization.routes.ts:42-52,162,231,261` |
| Per-task fee config (admin) | `optimization_fees` table + admin UI | **Adapt** (per FEE-A) | `shared/schema.ts:876-885`; `client/src/pages/admin/fee-config.tsx:471-499` |
| Expert Concierge delivery rail | `expert_requests` + `lead-routing.service` + `expertCityQueues` + `/api/expert-requests` | **As-is** | `shared/schema.ts:5212-5237`; `server/routes/booking-actions.ts:21,60,100,182` |
| Expert matching | `/api/grok/match-experts` + `expertMatchScores` | **As-is** | `server/routes.ts:8379`; `shared/schema.ts:1986` |
| Expert services pricing | `provider_services` | **As-is** (free-form OK for Phase A) | `shared/schema.ts:486` |
| Commission split for expert delivery | `commission.ts:resolveCommissionRates` reads `booking_fee_configs` | **As-is** at category fallback | `server/services/commission.ts:41-93` |
| Chat for expert delivery | `server/routes/messages.ts` | **As-is** | `server/routes/messages.ts:34-323` |
| Expert request optimization context | `expert_requests.optimizationContext` jsonb already present | **As-is** | `shared/schema.ts:5225` |
| AI Concierge deliverable surface | PlanCard | **As-is** | `client/src/components/plancard/*` |
| Free-vs-paid funnel UX pattern | v4 wireframe "AI Optimization Offer" + Plan Comparison + "Talk to Expert" | **Adapt** to single Concierge surface | `attached_assets/TRAVELOURE_COMMERCE_WIREFRAMES_v4_*.md:555-685` |
| Cart → optimize hinge | Cart + comparison flow (G7 wired) | **As-is** | `server/routes.ts:6080-6208,6399-6732` |
| Revenue ledger | `platform_revenue` + `revenue-tracking.service.ts`; `subscription` enum already present | **As-is** | `server/services/revenue-tracking.service.ts:13`; `shared/schema.ts:3988` |

### NOT reusable (flagging so I don't propose rebuilding)
- `/optimize` page (`client/src/pages/optimize.tsx`) — static Paris mock, replace
- `expertAiTasks` (`shared/schema.ts:2057`) — expert Content Studio tooling, not a traveler queue
- Old `request_type IN ('review','review_and_book','full_concierge')` from `COMPLETE_BOOKING_SYSTEM.md` — predates v1.3; keep `expert_requests.request_type` open text

---

## 3. New primitives (build list)

| # | Primitive | Files | Effort | Depends on |
|---|---|---|---|---|
| **N1** | Unified Concierge entry page — intent capture (free-text + chips) + delivery options + upfront prices | `client/src/pages/concierge/index.tsx`, `components/concierge/{IntentForm,DeliveryOptions}.tsx` | M | N2, N4 |
| **N2** | Concierge router service — takes `{intent, tripId?, cartId?, eventType?}` → `{aiPrice, expertPrice?, fullPrice?, expertAvailability, recommended}` | `server/routes/concierge.routes.ts`, `server/services/concierge-router.service.ts` | M | **FEE-A**, expert matching, N4 |
| **N3** | One-tap escalation CTA on PlanCard — pre-fills `expert_request` with AI snapshot | `client/src/components/plancard/EscalationCTA.tsx`, wire into `PlanCard.tsx` | S | existing `POST /api/expert-requests` |
| **N4** | Expert availability service — `{city, eventType}` → bookable now / queued | `server/services/expert-availability.service.ts` reads `expertCityQueues`, `provider_services`, `users` | S | — |
| **N5** | `concierge_requests` table — intent log for funnel metrics + resume | `shared/schema.ts`, `concierge.routes.ts` | S | — |
| **N6** | `event_packages` catalog (Full/DFY) — quote-on-request listings | `shared/schema.ts`, `concierge.routes.ts` | M | — |
| **FEE-A** | Per-event-type AI Concierge fee config — add `event_type` column to `optimization_fees` (or sibling mapping table), `$0=off` semantic, defaults to §4.8 ($9.99 / $49.99) | `shared/schema.ts:876`, `server/routes/optimization.routes.ts:42-52`, `client/src/pages/admin/fee-config.tsx:471-499` | S | LB-P3 |
| **B1** | $9 tier subscription rail — `concierge_memberships` table, Stripe recurring sub (monthly + annual), webhook handlers for `customer.subscription.*` | `shared/schema.ts`, `server/routes/concierge.routes.ts`, `server/routes/webhooks.routes.ts` | M | **FEE-B**, Phase A live |
| **B2** | Allowance counter + overage branch in AI charge path | `server/routes/optimization.routes.ts` (extend), `concierge-router.service.ts` | S | B1, **FEE-B** |
| **B3** | Priority-routing for members in `lead-routing.service` | `server/services/lead-routing.service.ts` (extend) | S | B1 |
| **FEE-B** | `concierge_tier_config` admin-editable: price, included-AI-plans/period, annual rate | `shared/schema.ts`, `client/src/pages/admin/fee-config.tsx` (new tab), `server/routes/admin.routes.ts` (new endpoints) | S | — |
| **C1** | Event quote workflow — draft → traveler approves → Stripe PI → workspace + provider bundle | `server/routes/concierge.routes.ts`, admin quote-review UI | M | N6, Phase A live |

---

## 4. Phasing & cut line

### Phase A — "Concierge is real" (MVP, first market)
**Sequenced steps:**
1. **Prereq:** Launch-Blocker Phase 3 lands (AI Concierge router mounted + §4.8 defaults).
2. **FEE-A** lands (per-event-type fee config + `$0=off`).
3. **N5** `concierge_requests` table.
4. **N4** expert-availability service.
5. **N2** concierge router + `concierge.routes.ts`.
6. **N1** Concierge entry page (`/concierge`); redirect `/optimize` → `/concierge?tier=ai`.
7. **N3** PlanCard escalation CTA wired to existing `expert_requests`.
8. **N6** `event_packages` table + admin "create quote" UI (catalog only).

**Cut justification:** for any market with ≥1 verified expert, a guest can land → free preview → sign up → pay → AI plan → tap "have an expert polish this" → request lands in routing queue → admin confirms → workspace opens. Complete pay-per-use Concierge loop using §4.8-resolved prices, no constants. Expert split rides category fallback (75/25), acceptable for launch.

### Phase B — "$9 concierge tier"
1. **Prereq:** Phase A live + ≥4 weeks of `aiCostTracking` data so the included-allowance cap can be set against real cost-per-plan (per §4.7).
2. **FEE-B** lands.
3. **B1** subscription rail.
4. **B2** allowance counter + overage.
5. **B3** priority routing for members.

### Phase C — Full / Done-for-You
1. **Prereq:** Phase A live + N6 catalog populated for ≥1 event type per market.
2. **C1** quote → approve → PI → workspace + provider bundle.
3. **Optional FEE-C** (per-event-type commission override).

---

## 5. Open decisions (resolved)

| # | Decision | Resolution |
|---|---|---|
| D1 | Intent capture | Free-text + 4 chips: intent, eventType, destination, dates |
| D2 | Escalation CTA trigger | Always visible, soft |
| D3 | Concierge spend rail | Card-first (Phase A); credits accepted on toggle later |
| D4 | Expert availability fallback | Queued with est. price + ETA |
| D5 | AI Concierge fee table shape | Keep tier-keyed; add `event_type → tier` mapping (FEE-A) |
| D6 | Free preview gate | Guest (no auth) |
| D7 | "One AI plan" unit | Per trip; free re-runs within 24h |
| D8 | Concierge entry placement | Header CTA + slot on every PlanCard |
| D9 | Old `/optimize` URL | 301 redirect to `/concierge?tier=ai` |

---

## 6. Tracker reconciliation

See `audit-coverage-tracker.md`. Net moves applied:
- CON-A items promoted to "Specced (plan)" — `/optimize` mock, AI Concierge pay-per-use, Expert escalation + availability, FEE-A, N5, N6.
- Per-expert commission override added as new row, owner **CON / owned**, "BLOCKS BETA OUTREACH". Hard gate on the §6.9 "20% vs 25%" recruitment language going out.
- Hard-coded literals split: `itinerary.tsx` → LB-P2, `affiliate.service.ts` → LB-P4a, `commission.ts` AI/AFFILIATE constants → CON-A (FEE-A), `pricing.service.ts` → FEE.
- Single fee resolver promoted to "Partial" — LB-P2 + LB-P3 partially address it.
- Email verification moved to "LB-P1 (dep)" — dependency of Specced item, not orphaned.
- Premium feature fee restored to §4.8 as Deferred-P2 (drop was edit artifact).

**Net new tables across all phases:** `concierge_requests` (A), `event_packages` (A), `concierge_memberships` (B), `concierge_tier_config` (B). **One server route module:** `server/routes/concierge.routes.ts`. **One new page:** `/concierge`. Everything else is reuse or extension.
