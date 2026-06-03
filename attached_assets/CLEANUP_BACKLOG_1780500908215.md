# Traveloure — Cleanup Backlog (for Replit task planning)

**Purpose:** the prioritized, task-ready cleanup list. Each item is scoped enough for Replit to plan tasks; pairs with `CENTRALIZATION_AUDIT.md` (the detail).
**Rules that apply to every item:** redirect, don't delete (no 404s); no business-logic change inside a consolidation unless named; schema changes via migration on a branch; verify each on dev (Kyoto = real data); confirm "still-unique content" before folding any surface.

---

## P0 — Correctness & money (do first; silent failures here cost real money/trust)

1. **Finish commission centralization.** One `resolveCommissionRates()` over `booking_fee_configs`; fold in `pricing.service.ts` feeRates and the per-partner `*-commissions` services; reconcile `revenue_splits`. Encode the full policy (AI 100% / affiliate 70% / default 25%). *Risk: high (money). Dep: confirm item 2 first.*
2. **Confirm + remove the Python `backend-services/` tier** (or document it as separately-deployed). No TS imports found → likely dead. If its `pricing_service`/`stripe_service` are live anywhere, it's a competing fee/payment source and must be reconciled before item 1 ships. *Risk: high if live. Quick to confirm.*
3. **Close the intelligence feedback loop.** Wire demand-signal regeneration into `TravelPulseScheduler`; confirm analytics (funnel, trip-analytics, `noResultsCount`) feed back into intelligence. *Risk: med. The moat-maker.*

## P1 — Consolidation (user-visible; collapses scatter)

4. **Unify itinerary rendering → one `PlanCard`** (role + stage props); migrate dashboard, trip-details, itinerary, shared-view, and the Expert Workspace onto it; retire the other 3 renderers behind it. *Risk: med (UI). Dep: confirm all 5 sections render.*
5. **Route consolidation** (per `CONSOLE_ROUTE_MAP.md` §flags): `/browse`→`/discover`; discovery cluster fold; expert service-creation 5→1; expert analytics 4→1; role-messages→`/chat`; AI assistants→one. *Risk: low–med. Redirect, don't delete.*
6. **Service catalog → ESO canonical:** demote `service_templates` + frontend hardcoded templates to fallback/migration. *Risk: low–med.*

## P2 — Architecture & maintainability

7. **Modularize `server/routes.ts`** (19k lines, 639 endpoints) by the 7 domains. Continue the started extraction (`booking-actions.ts`, `plancard.routes.ts`). *Risk: med (broad); do incrementally, one domain per PR. Biggest long-term win — also stops line numbers drifting between audits.*
8. **Reconcile the two recommendation engines** (`ai-recommendation-engine` vs `service-recommendation-engine`) into one. *Risk: med.*
9. **Unify caching** (`cache` + `cache-scheduler` + `fever-cache` + `travelpayouts-cache`) onto one cache primitive; per-integration caches use it. *Risk: low–med.*
10. **One maps deep-link builder** (`lib/navigate` + `lib/maps-platform` + inline); fix the `{0,0}` fallback. *Risk: low.*
11. **Verify Stripe service boundaries** (`stripe`/`stripe-connect`/`stripe-payment`) — merge only if overlapping. *Risk: low (verify-first).*

## P3 — Data hygiene & small fixes

12. **Events model:** define one canonical events source + ownership map for the 6 event tables. *Risk: low–med.*
13. **Carried-over small fixes** (from prior specs): dead `saveMutation`, step counter "of 5"→3, NaN rate guard, "AI Gaps"→"Schedule Check" (if not done), `is_active=true` on rejected/draft expert services (hygiene), Unsplash→picsum (if not done). *Risk: low.*
14. **Admin backfill UI** for legacy un-tagged provider neighborhoods (the Phase-1b gap). *Risk: low.*

---

## Suggested sequencing for Replit
- **Confirm item 2 (Python tier) → then item 1 (commission)** — money correctness, in that order.
- **Item 3 (feedback loop)** in parallel — independent track.
- **P1 (4–6)** next — the user-visible consolidations; each ships behind redirects.
- **P2 (7)** as a slow incremental track (one domain per PR), with 8–11 folded in opportunistically.
- **P3** as cleanup-batch PRs.

**Dependency notes:** 1 needs 2 confirmed. 4 needs the 5-section parity check. 5 needs the "still-unique content" check per surface. 7 should run incrementally alongside everything, never as one big-bang refactor.

---

*Replit: plan tasks per item. Each P0/P1 item should ship with a verification gate (`npm run check` + the relevant seam/smoke test from the integration harness). Re-grep counts before editing — `routes.ts` line numbers drift.*
