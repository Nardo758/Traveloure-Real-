# Marketplace maps — ground-truthed against `main` (Jul 14, 2026)

Verifies every **code-status** claim in `MARKETPLACE_MAP_demand_v2.md` + `MARKETPLACE_MAP_supply.md`
against current `main` with `file:line`, and separates the **strategic decisions** (not auditable) for
the decision-maker. The maps were a hypothesis built from earlier audits + inference; this makes them fact.

**Headline:** the maps were mostly **stale in the "pessimistic" direction** — they predate this session's
escrow/refund/dispute/read-gate work and the earlier engine unification, so they call **Missing/Dark** many
things that are actually **built and live**. A handful were overstated the other way, and the audit surfaced
**one real bug** (the recommender was 500ing — fixed in PR #174).

---

## 1. Corrections list — where the map ≠ reality (the most valuable output)

### Understated — map said Missing/Dark/Broken, actually BUILT/LIVE
| Map claim | Map said | Actual on `main` | Evidence |
|---|---|---|---|
| **Escrow / hold / delayed release** (the "spine") | Missing; earnings credited early | **BUILT** — `held → releasable → paid_out → reversed`; release job + per-surface windows; earnings born `held` | migrations 112/113; `earnings-release-scheduler.service.ts`; PRs #163/167/169 |
| **Refund** | Missing on every money path | **BUILT** — `refundServiceBooking` (service-booking-native, idempotent) + `/api/bookings/refund` reverses earnings + platform revenue | `stripe-payment.service.ts` `refundServiceBooking`; PR #170 |
| **Dispute / resolution** | Missing (no dispute concept) | **BUILT** — traveler `confirm-completion`/`dispute`, admin `reject`/`uphold` (uphold = reverse + refund) | `routes/bookings.ts`, `routes/admin.routes.ts` disputes; PRs #168/#170 |
| **Recommendations/ranking engine** | Dark (8 endpoints in unmounted `experts.routes.ts`) | **Real impl, MOUNTED in `routes.ts`** — but was **500ing** on 13 stale dynamic-imports; **fixed PR #174** | `recommendation.service.ts` (1430-line impl); endpoints `routes.ts:6767,6800,6828…`; fix #174 |
| **On-platform messaging** | Missing/unconfirmed | **LIVE & reachable** — `/api/messages` router mounted; `user_and_expert_chats` table; `/chat` page; expert/provider msg routes redirect in | mount `routes.ts:481`; `routes/messages.ts:1-209`; `schema.ts:948`; `App.tsx:769` |
| **Supply acquisition funnel (`/earn`)** | Dead/broken | **LIVE & wired** — real 437-line `EarnPage`, role→offering hub, CTAs carry `?offeringTypeKey=` into signup | `App.tsx:235`; `earn.tsx:170,190,258` |
| **Expertise gate / Knowledge Bar** | "confirmed absent" | **EXISTS for the local-expert path** — required "Knowledge Proof" (3 essays ≥50 words) + `localityProof`; stored + submitted. Default `travel_expert`/EA path is selection-only (as claimed) | `travel-experts.tsx:49-63,298-300,397-400`; `schema.ts:344-345` |
| **Provider discovery surface** | Likely Missing/Dark ("no reachable surface") | **EXISTS** — `/service-providers` route + page (service-centric, by category — not provider-*profile*-centric) | `App.tsx:265`; `service-providers.tsx:244-249` |
| **Expert workspace** | Dark | **LIVE** — `/expert/workspace/:tripId` routed; `/api/expert-workspace` mounted (~19 handlers) | `App.tsx:536`; mount `routes.ts:517`; `expert-workspace.routes.ts` |
| **Availability / booking-requests** | Dark (18 endpoints in dark router) | **LIVE** in mounted routes | `routes.ts:7966,7978,7989,8012,8037,8051,885` |
| **Coordination fee** | (flagged buggy) | **FIXED** — reads `budget.amount` jsonb; `$25k → $2000` percent, no unearned credit (re-proved this session) | `routes.ts:8085,8279`; `optimization-fee.service.ts`; #144 |
| **`verified` profiles** | was faked | **FIXED** — `verified === true` | §13; Replit `139d3f71` |

### Overstated — map implied Working, actually a gap
| Map claim | Map said | Actual on `main` | Evidence |
|---|---|---|---|
| **Two-sided fee disclosure** | (traveler✓; expert unconfirmed) | Traveler sees fee at checkout ✓; **expert/provider does NOT see their cut at acceptance** — only post-hoc in a separate earnings dashboard | traveler `cart.tsx:508,1471`; expert accept card `expert/bookings.tsx:475-526` (no money); earnings `routes.ts:4836` |
| **`/provider/settings`** | (implied part of provider tools) | Page routed but **settings GET/PATCH are DARK** (only in unmounted `experts.routes.ts`); identity/Stripe sub-panels work | `App.tsx:626`; dark `experts.routes.ts:692,716`; live app-status `routes.ts:1924` |

### Correct as stated (verified)
- Listing **approval gate** (Phase A templates + F2 services) — **Working**, enforced end-to-end (incl. the marketplace **read-gate** closed this session, PR #172).
- **Checkout** server-derived price + **idempotent**; **A1/A3** client-trusted holes fixed (§14/§15).
- **Ratings/reviews** still **Broken** — fabricated 4.9/4.5, no transaction behind them (§13, open).
- **`90/10` commission literal** still present (§13, open); fee split otherwise in `fee_bands`.
- **Payout** = admin-initiated live (`/api/admin/payouts` +`:id`); self-service **removed** (#160). Verified.
- **EA console** — **Dark** (backend only in unmounted `experts.routes.ts`).
- **Search** — runs, quality-based sort (`popular/price/rating`), **no monetization override** (bounded `FEATURED_BOOST` only, "never bury a better native result").
- **Public `/expert-templates/:id`** — **not registered on `main`**; `packages` tab **hidden**; server reads **approved-gated**. (Deploy tree diverges — un-pushed Phase-B surfacing, the #164 pattern.)
- **`experts.routes.ts`** — **dark, NOT deleted** (1535 lines, imported never `app.use`'d). List-A removed the self-service payout surface, not this file.

### Structure clarifications
- **Matching vs Ranking IS separated in code** (map asked): ranking/recs = `recommendation.service.ts`; matching = `provider-matching.service.ts` + `content-matching.service.ts` (+ `lead-routing.service.ts`). No dedicated expert↔traveler matcher — advisor discovery is browse/filter over `/api/experts`.
- **Expert role model** (map's "12/14 generic `expert`") is a **data** claim, not code — role lives in `users.role` (`userRoleEnum` incl. legacy generic `expert`) + `localExpertForms.expertType`; distribution not determinable from source.

---

## 2. Corrected DEMAND-side map (status now verified)

**Layer 1 — Discovery & Matching**
- Experts discovery — **Working** ✓ (`/experts`,`/experts/:id`, match cards). `App.tsx:253`
- Expert services — **Working** (search + quality ranking, no paid override). 
- Packages/templates — **server read-gated + live; public UI route unregistered on `main`** (deploy has it). Was "orphaned"; server half is live & gated.
- Provider discovery — **Exists (service-centric)**; was "Missing/Dark".
- Recommender/ranking engine — **Real + mounted; restored** (#174); was "Dark".

**Layer 2 — Trust & Safety** (was ~1.5/6, now higher)
- Listing approval gate — **Working** ✓ · Verified profiles — **Working** ✓
- Ratings/reviews — **Broken** (open) · **Messaging — LIVE** (was Missing)
- **Dispute — BUILT** (was Missing) · **Escrow/payment-protection — BUILT** (was Missing)

**Layer 3 — Transaction & Fulfillment**
- Checkout — **Working** ✓ · A1/A3 — **Fixed** ✓ · Marketplace purchase — **gated + read-gated** (server)
- **Refund — BUILT** (was Missing) · **Escrow/delayed release — BUILT** (was Missing)
- Coordination fee — **Fixed** ✓ · Fee-split — `fee_bands`; **`90/10` literal open**; **expert-side disclosure gap** (not at acceptance)

**Layer 4** — Codified governance still Missing · the **8-market call** is the strategic decision (below).

## 3. Corrected SUPPLY-side map

- **L1 acquisition:** `/earn` funnel **LIVE** (was "dead"). Become-expert/provider entries wired.
- **L2 trust/quality:** listing approval **Working**; **a Knowledge-Proof expertise gate EXISTS for local experts** (essays + tenure) — the moat is **partially** built, not "absent". Default expert path still selection-only. No automated scoring (human review).
- **L3 tools/earnings:** workspace **LIVE**, availability **LIVE**, expert earnings **LIVE**; **`/provider/settings` save/load DARK**, **EA console DARK**, provider-earnings endpoint dark (page works off bookings). Payout admin-initiated ✓.
- **L4 retention/anti-leakage:** the trio is now **2/3 present** — **escrow BUILT**, **messaging LIVE**, reviews still **Broken**. Was "none working".

---

## 4. Strategic decisions (NOT code — for the decision-maker)

| Decision | What the maps recommend | Why it's a decision, not a bug | Coupled to |
|---|---|---|---|
| **8 markets vs. one wedge** | Concentrate to one market (density > breadth) | Liquidity/strategy call; costs no code | Everything below |
| **Guild-doc vs. talent-selection vs. hybrid** | Hybrid: guild doc = inputs, talent = judgment | Product/ops model, not a code fact | The market call (talent = slow, market-by-market) |
| **Knowledge Bar standard** | Define what a Local Expert must know (comparative/current/local judgment), per market | Content/curation call | Market + guild/talent |
| **Expertise-verification mechanism** | Scenario-based scored onboarding test | A gate to *build/decide* — note: a **Knowledge-Proof essay gate already exists** for local experts, but is unscored; the decision is whether to add scenario-scoring | Knowledge Bar standard |
| **Anti-leakage strategy** | escrow + messaging + real reviews | Two of three now exist (escrow, messaging); decision is **reviews** (make them transaction-backed) + policy | Escrow (done), reviews (open) |
| **Escrow model** | hold/release/dispute over Stripe Connect delayed payout | **Largely RESOLVED this session** — the spine is built; remaining calls are payout-rail evolution + per-path coverage | — |

---

## 5. Re-sequenced "finish the marketplace" roadmap (on verified state)

The maps' original 7-step sequence assumed escrow/refund/dispute/recommender/messaging were all missing/dark.
**Most of that is now done.** What actually remains, in order:

1. **~~Build the escrow spine~~ — DONE** (Phases 1–4). Refund, dispute, delayed-release, reversal all live.
2. **~~Un-dark the recommender~~ — DONE** (#174). Ranking engine restored.
3. **~~Fix supply acquisition (`/earn`)~~ — already live.** No work.
4. **Reviews integrity** — make ratings transaction-backed (kill fabricated 4.9/4.5). *Now the top real Trust gap.*
5. **Expert-side fee disclosure at acceptance** — show the expert their cut before they accept (small, real gap).
6. **Recover the remaining dark supply tools** — `/provider/settings` save/load + EA console + provider-earnings endpoint (mount/port from `experts.routes.ts`). Scoped by the dark-families triage.
7. **Reconcile marketplace surfacing** — push the deploy's Phase-B `/expert-templates/:id` + packages-tab surfacing to `origin/main` (server read-gate already holds).
8. **Knowledge Bar** — extend the existing local-expert Knowledge-Proof into a scored expertise gate (decision-gated by the market call).
9. **Clean-ups** — `90/10` literal → `fee_bands`; codified governance.

**Bottom line:** the marketplace is far more complete than the maps implied. The money spine, disputes,
messaging, recommender, and acquisition funnel are live. The real remaining gaps are **reviews integrity**,
**expert-side disclosure**, the **dark supply-tools recovery**, the **surfacing reconciliation**, and the
**Knowledge-Bar/expertise-scoring** — the last of which waits on the one-market-vs-eight decision.
