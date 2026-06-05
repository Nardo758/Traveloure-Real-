# Concierge — Phase A Execution Brief

**Goal:** Ship the gate-free, pay-per-use Concierge loop for the first market: guest → free AI preview → sign up → pay → AI plan → one-tap "have an expert polish this" → request lands in the routing queue → admin confirms → workspace opens. All prices resolve from config, never constants.

**Source:** Concierge Implementation Plan (revised) + Gap Audit (2026-06-05). **Target:** Claude Code, repo working tree.

---

## HOW TO USE THIS BRIEF — READ FULLY BEFORE WRITING CODE

1. Read every phase before starting. Phases share context (the fee resolver, the expert_requests rail).
2. Work in strict phase order: 0 → 8.
3. Each phase ends with a grep + typecheck gate and a commit (`feat(CON-A.Pn): …`). Do not proceed past a failing gate.
4. **Typecheck floor = 140 pre-existing errors** across 25 files (mostly `server/storage.ts`). Every phase must return `tsc --noEmit` / `npm run check` at **≤140 errors**. Better still: no *net-new* errors in the files a phase touches. Anything above the floor is yours to fix before moving on.
5. **Phases that edit `shared/schema.ts` (2, 3, 8) must run SINGLE-SESSION.** Do not run them concurrently with other Claude Code sessions on the same DB/schema file — that's the documented concurrency-conflict surface.
6. File:line refs are from the audit/plan and may have drifted; confirm by reading before editing.

---

## PREREQ STATUS (verified — do not re-do)

LB-P3 functional dependencies are **IN**: optimization router mounted (`server/routes.ts:86` import, `:573` `app.use`), free preview reachable unauthenticated (`optimization.routes.ts:59`), paid endpoints gated (`:162`, `:261`). Phase A rides on these.

- **LB-P3 step 3 (fee defaults → §4.8):** NOT done standalone — **absorbed into Phase 2 (FEE-A)**, which rewrites the same rows. Do not do it separately.
- **LB-P3 step 4 (ungated `/api/ai/optimize-experience`):** open — **closed in Phase 1 of this brief** (it's the revenue back-door; the concierge paywall is theater while it's open).
- **LB-P2 (`itinerary.tsx` 12/70 literals):** P0 but orthogonal to the concierge surface — **run it in a parallel session; gate it on go-live, not on this brief.** Out of scope here.

---

## DECIDED DEFAULTS (do not ask — these are settled)

- **D1 Intent capture:** free-text field + 3–4 chips (intent, eventType, dates, party size).
- **D2 Escalation CTA:** always visible, soft (not a blocking interstitial).
- **D3 Payment rail:** card-first. Credits as a payment path is **deferred from Phase A.**
- **D4 Expert unavailable:** queued, showing estimated price + ETA ("request expert review").
- **D5 AI fee table shape:** keep tier-keyed; add `event_type → tier` mapping (this is FEE-A).
- **D6 Free preview:** guest, no auth.
- **D7 "One AI plan" against future $9 tier:** per trip, with free re-runs within 24h. (Phase A only needs the per-task charge; the allowance counter is Phase B — but model the charge so B can layer on it.)
- **D8 Concierge entry placement:** header CTA + a slot on every PlanCard.
- **D9 Old `/optimize` URL:** 301 redirect to `/concierge?tier=ai`.

---

## GLOBAL "WHAT NOT TO DO"

- **No fee/price/rate constants.** Every charge resolves through the `optimization_fees` config (AI) or `commission.ts:resolveCommissionRates` reading `booking_fee_configs` (expert split). Never a literal.
- **No new routes in `server/routes.ts`.** All Concierge endpoints go in `server/routes/concierge.routes.ts`.
- **Do not rebuild what exists.** The reuse map below lists rails to consume as-is; do not fork `expert_requests`, expert matching, `commission.ts`, `messages.ts`, or PlanCard.
- **Do not build the $9 tier, the allowance counter, overage, member priority routing, or the Full/DFY transactional flow** — Phase B/C.
- **Do not implement the per-expert commission override here** — it's a tracked recruitment gate, not Phase A (see Known Follow-ups).
- **Do not touch `/api/ai/optimize-experience`'s billing beyond Phase 1's access restriction.**
- Do not exceed the 12-error typecheck floor.

---

## REUSE MAP (consume as-is unless noted)

| Need | Use | Evidence |
|---|---|---|
| AI Concierge engine | `/api/ai/optimize-experience` (called via the gated paid path) | `server/routes.ts:1268` |
| Free AI preview | `/api/optimization-preview` | `optimization.routes.ts:59` |
| Paid AI + save-card | `/api/optimization-payments` + `/confirm` (`setup_future_usage: off_session` already wired) | `optimization.routes.ts:162,261` |
| Per-task fee config + resolver | `optimization_fees` + `getFeeForTier` | `shared/schema.ts:876-885`; `optimization.routes.ts:42-52` |
| Expert delivery rail | `expert_requests` (+ `optimizationContext` jsonb) + `lead-routing.service` + `expertCityQueues` + `POST /api/expert-requests` | `shared/schema.ts:5212-5237` (`:5225`); `server/routes/booking-actions.ts:21,60,100,182` |
| Expert matching | `/api/grok/match-experts` + `expertMatchScores` | `server/routes.ts:8379`; `shared/schema.ts:1986` |
| Expert commission split | `commission.ts:resolveCommissionRates` (category fallback OK for Phase A) | `server/services/commission.ts:41-93` |
| Chat | `server/routes/messages.ts` | `:34-323` |
| AI deliverable surface | PlanCard | `client/src/components/plancard/*` |
| Revenue ledger | `platform_revenue` + `revenue-tracking.service.ts` | `:13` |

**Replace, don't reuse:** `client/src/pages/optimize.tsx` (static Paris mock). **Not a queue:** `expertAiTasks` (`schema:2057`, expert Content Studio).

---

## PHASE 0 — Pre-flight discovery (no code)

**Objective:** close the remaining unknowns before touching code.

1. **Step-4 caller grep.** Find every caller of `/api/ai/optimize-experience`:
   ```
   grep -rn "optimize-experience" client/ server/ shared/
   ```
   List who hits it (frontend flows, internal services). This determines what Phase 1 may safely restrict.
2. **Namespace check.** Confirm these are free / not partially built:
   ```
   grep -rn "/api/concierge\|\"/concierge\"\|concierge_requests\|event_packages\|concierge_memberships" client/ server/ shared/
   ```
   Note any `subscription` usage near `revenueSourceTypes` (`schema:3988`) — confirm no half-built subscription code.
3. **Env + seed.** Confirm (names only) Stripe keys present in Replit Secrets; confirm ≥1 **verified** expert exists in a launch market (Kyoto or Mumbai) among the test accounts, so the escalation loop is testable end to end.

**Gate:** caller list, namespace-clear confirmation, and seed/env confirmation written down. No code changed.

---

## PHASE 1 — Close the legacy LLM back-door (LB-P3 step 4)

**Objective:** no free public path to full LLM optimization. The concierge paywall is meaningless while this is open. Phase 0 found **two** route definitions of the same path and **three** real frontend callers — all must be handled or the leak survives.

**Files:**
- `server/routes.ts:1268` AND `server/routes/content.routes.ts:475` — BOTH define `/api/ai/optimize-experience`, both `isAuthenticated` only. Whichever registers last wins; restrict both.
- Frontend callers: `client/src/pages/experience-template.tsx:1007`, `:1710`, `client/src/pages/cart.tsx:910`.

**Steps**
1. Restrict **both** server definitions to internal/expert/admin (role guard or internal-service guard). Confirm registration order so you know which currently wins, but lock both — do not leave the loser reachable. If no legitimate external caller needs the raw endpoint, prefer collapsing to one guarded definition.
2. Repoint all **three** frontend callers to the **free preview path** `/api/optimization-preview`. DECIDED: preview now, not the paid path — keeps these currently-free surfaces working without a surprise paywall. This is a **shape-aware** change: preview returns the heuristic result, not full-LLM output, so adjust each call site's response handling/render — it is NOT a URL swap.
3. The traveler-facing **paid** full optimization is delivered only through the gated path (`/api/optimization-payments` → `/confirm`) on the concierge surface (Phase 6). Do NOT wire a paid charge into these three legacy surfaces in this phase.

**Acceptance:** no unauthenticated/plain-authenticated traveler can obtain full LLM optimization; both route definitions are guarded; all three frontend flows still function (on preview output), none left to 403.

**Verify / Gate**
```
grep -rn "optimize-experience" client/ server/        # both defs guarded; 3 callers no longer hit it
grep -rn "optimization-preview" client/src/pages/experience-template.tsx client/src/pages/cart.tsx
tsc --noEmit                                           # ≤140
```
Commit: `fix(CON-A.P1): guard both optimize-experience defs, repoint 3 callers to preview`

---

## PHASE 2 — FEE-A: per-event-type AI Concierge fee config (absorbs LB-P3 step 3)

**Objective:** the AI Concierge fee resolves per event type from admin config, with §4.8 defaults and a `$0=off` semantic. SINGLE-SESSION (touches schema).

**Files:** `shared/schema.ts:876-885` (`optimization_fees`), `server/routes/optimization.routes.ts:36-52`, `server/services/smart-sequencing.service.ts:915-921` (event→tier map), `client/src/pages/admin/fee-config.tsx:471-499`.

**Steps**
0. **Pre-check (carryover from Phase 1).** Confirm the paid path `/api/optimization-payments` → `/confirm` reaches optimization at the **service layer** (`server/itinerary-optimizer.ts`), NOT by internally calling the now admin/expert-guarded `/api/ai/optimize-experience` HTTP route. If it proxies the guarded route, repoint it to the service call first — otherwise the Phase 1 guard blocks paying travelers (they 403 after payment). If it already calls the service directly, note it and proceed.
1. Add an `event_type` dimension to the fee config — either an `event_type` column on `optimization_fees` or a sibling mapping table — so an admin can set a distinct fee per event type (standard / wedding / proposal / corporate / …). Generate the Drizzle migration.
2. Set defaults to §4.8: **$9.99 standard, $49.99 event types**; support **`$0` = disabled** for any type. Replace `DEFAULT_FEE_CENTS = {simple:499, standard:999, complex:1999}` accordingly — these remain config fallbacks, not hard-coded charge values.
3. `getFeeForTier` (`:42-52`) resolves by `(event_type → tier → price)`, reading the config; never a literal at charge time.
4. Surface the per-event-type rows + `$0=off` in the admin fee UI.

**Acceptance:** changing an event-type fee in admin changes the charged amount; default standard = $9.99, event = $49.99; `$0` disables the charge; no literal charge value remains in the charge path.

**Verify / Gate**
```
grep -n "499\|999\|1999" server/routes/optimization.routes.ts        # expect replaced by config-resolved §4.8 values
grep -rn "event_type" shared/schema.ts server/routes/optimization.routes.ts
tsc --noEmit                                                          # ≤140
```
Commit: `feat(CON-A.P2): per-event-type AI Concierge fee config + §4.8 defaults`

---

## PHASE 3 — N5: `concierge_requests` intent log

**Objective:** persist every concierge request for funnel metrics + resume. SINGLE-SESSION (schema).

**Files:** `shared/schema.ts`, `server/routes/concierge.routes.ts` (new module — create it here).

**Steps**
1. Add `concierge_requests`: `id`, `userId` (nullable for guest preview), `intent` (text), `eventType`, `tripId?`, `cartId?`, `chosenTier` (ai/expert/full, nullable until chosen), `status`, `createdAt`. Migration via Drizzle.
2. Create `server/routes/concierge.routes.ts` and register it at the existing router-registration site (NOT in `routes.ts`). Add a write path for new requests.

**Acceptance:** a concierge request row is created on intent submission; module registered once, no `routes.ts` addition.

**Verify / Gate**
```
grep -rn "concierge_requests\|concierge.routes" shared/ server/
tsc --noEmit                                                          # ≤140
```
Commit: `feat(CON-A.P3): concierge_requests table + concierge.routes module`

---

## PHASE 4 — N4: expert-availability service

**Objective:** decide, per `{city, eventType}`, whether expert delivery is bookable-now or queued (D4).

**Files:** `server/services/expert-availability.service.ts` (new), reading `expertCityQueues`, `provider_services`, `users`.

**Steps**
1. Implement `getExpertAvailability({ city, eventType }) → { bookableNow: boolean, estPrice?, etaHours? }` from existing supply tables.
2. No new storage — read-only over existing tables.

**Acceptance:** returns bookable-now when a matching verified expert has capacity in-market; otherwise queued with est price + ETA.

**Verify / Gate**
```
grep -rn "expert-availability" server/
tsc --noEmit                                                          # ≤140
```
Commit: `feat(CON-A.P4): expert-availability service`

---

## PHASE 5 — N2: Concierge router service + endpoint

**Objective:** one call routes intent to delivery options with upfront prices.

**Files:** `server/services/concierge-router.service.ts` (new), `server/routes/concierge.routes.ts` (extend).

**Steps**
1. `routeConcierge({ intent, tripId?, cartId?, eventType? }) → { aiPrice, expertPrice?, fullPrice?, expertAvailability, recommended }`.
   - `aiPrice` from the FEE-A config (Phase 2).
   - `expertPrice` from expert matching + `commission.ts` (category fallback) + availability (Phase 4).
   - `fullPrice` = "quote on request" stub (catalog only this phase).
2. Expose via `concierge.routes.ts`. Persist the chosen tier back to `concierge_requests`.

**Acceptance:** endpoint returns all tier prices + availability + a recommended tier; AI price matches the FEE-A config; no constants.

**Verify / Gate**
```
grep -rn "concierge-router\|routeConcierge" server/
tsc --noEmit                                                          # ≤140
```
Commit: `feat(CON-A.P5): concierge router service + endpoint`

---

## PHASE 6 — N1: `/concierge` entry page + `/optimize` redirect

**Objective:** the unified request surface (D1, D8) replacing the static mock (D9).

**Files:** `client/src/pages/concierge/index.tsx` (new), `client/src/components/concierge/{IntentForm,DeliveryOptions}.tsx` (new), `client/src/App.tsx` (route + 301), header CTA component, PlanCard slot.

**Steps**
1. Build `/concierge`: intent capture = free-text + 3–4 chips (D1); on submit, call the Phase 5 endpoint; render delivery options with upfront prices (D2 always-visible soft escalation).
2. Free preview path for guests (D6) hitting `/api/optimization-preview`.
3. Add header CTA + a Concierge slot on every PlanCard (D8).
4. **Paid-upgrade CTA on the three legacy surfaces** repointed to preview in Phase 1 (`experience-template.tsx` ×2, `cart.tsx`): alongside the free preview result, surface an "unlock full AI plan ($9.99)" CTA that routes to the gated paid path (`/api/optimization-payments` → `/confirm`). This is where those surfaces convert from free preview to paid — the deliberate paywall the Phase 1 repoint intentionally deferred.
5. `App.tsx`: 301 `/optimize` → `/concierge?tier=ai` (D9); remove the static mock page from routing.

**Acceptance:** guest can preview free; authed user gets priced options; `/optimize` redirects; mock no longer rendered.

**Verify / Gate**
```
grep -rn "/concierge" client/src/App.tsx
grep -rn "optimize" client/src/App.tsx                  # expect redirect, not the mock page
tsc --noEmit                                            # ≤140
```
Commit: `feat(CON-A.P6): /concierge request surface + /optimize redirect`

---

## PHASE 7 — N3: PlanCard escalation CTA

**Objective:** one-tap "have an expert polish this" on every AI deliverable, pre-filling an `expert_request` with the AI snapshot.

**Files:** `client/src/components/plancard/EscalationCTA.tsx` (new), wire into `PlanCard.tsx`.

**Steps**
1. CTA POSTs to the existing `POST /api/expert-requests`, passing the PlanCard's AI output into `expert_requests.optimizationContext` (`schema:5225`).
2. Availability-aware (Phase 4): bookable-now vs queued "request expert review" (D4). Always visible, soft (D2).

**Acceptance:** tapping it creates an `expert_request` carrying the AI snapshot; lands in the routing queue; respects availability.

**Verify / Gate**
```
grep -rn "EscalationCTA\|expert-requests" client/src/components/plancard/
tsc --noEmit                                            # ≤140
```
Commit: `feat(CON-A.P7): PlanCard expert-escalation CTA`

---

## PHASE 8 — N6: `event_packages` catalog (catalog only)

**Objective:** Full/DFY listings as "request a quote" stubs. No transactional flow (that's C1). SINGLE-SESSION (schema).

**Files:** `shared/schema.ts`, `server/routes/concierge.routes.ts`, minimal admin create-listing UI.

**Steps**
1. Add `event_packages`: `id`, `eventType`, `market`, `title`, `description`, `priceFrom?`, `status`. Migration.
2. Catalog read endpoint + an admin create/list UI. The Full tier in the router (Phase 5) points here as "quote on request."

**Acceptance:** admin can create an event package; it surfaces as a quote-request stub; no checkout flow built.

**Verify / Gate**
```
grep -rn "event_packages" shared/ server/
tsc --noEmit                                            # ≤140
```
Commit: `feat(CON-A.P8): event_packages catalog (quote-on-request)`

---

## FINAL VERIFICATION CHECKLIST

- [ ] No free public path to full LLM optimization (P1).
- [ ] AI Concierge fee resolves per event type from config; $9.99/$49.99 defaults; `$0=off`; no charge literals (P2).
- [ ] Concierge loop works end-to-end for a verified-expert market: guest preview → pay → AI plan → escalate → expert_request in queue → admin confirm → workspace.
- [ ] Expert split rides `commission.ts` category fallback (per-expert override NOT implemented here).
- [ ] All concierge endpoints in `concierge.routes.ts`; nothing added to `server/routes.ts`.
- [ ] `/optimize` 301s to `/concierge?tier=ai`; static mock not rendered.
- [ ] `tsc --noEmit` ≤ 140 (the floor) after every phase.

## KNOWN FOLLOW-UPS (not in this brief)
- **Per-expert commission override** (nullable `commissionRateOverride` + branch in `commission.ts:41-93` before category fallback + admin field). **BLOCKS BETA OUTREACH** — must land before any §6.9 "20% vs 25%" recruitment message is sent. Hard gate on recruitment, not on this brief.
- **Premium feature fee** — re-added to §4.8 as Deferred-P2 (bookkeeping).
- **Credits as a Concierge payment rail** — deferred from Phase A per D3.
- **LB-P2** (`itinerary.tsx` 12/70 literals) — parallel-session P0; gate on go-live.

## OUT OF SCOPE (Phase B / Phase C briefs)
$9 concierge tier (subscription rail, allowance counter, overage, member priority routing, admin tier config) · Full/DFY transactional flow (quote → approve → PI → workspace + provider bundle) · per-expert/`expertTier` system · provider insurance-tier capture + tier-based commission · fee override hierarchy (global→market→tier→entity) · effective-dating · fee-change audit trail · affiliate `behaviorMode` · native-first browse sort · KYC/AML hooks · background-check + appeals · email-verification send/confirm · cart multi-currency + sharing · review-specific moderation · `server/routes.ts` defragmentation.
