# Traveloure — Centralization Audit (scattered → canonical)

**Purpose:** every place similar code / data / routes are scattered, and the single canonical home each should collapse into. Pairs with `CLEANUP_BACKLOG.md` (the prioritized task plan).
**Source:** full repo scan. Refs are illustrative; re-grep before editing.

---

## 1. Code — scattered logic → one module

| Scattered across | Canonical target | Notes |
|---|---|---|
| **Commission/fee:** ~8 `0.30` literals · `pricing.service.ts` feeRates map · `booking_fee_configs` · `revenue_splits` · `booking-com-/fever-/viator-commissions` services · (Python `pricing_service.py`) | **one `resolveCommissionRates()` resolver** reading `booking_fee_configs` (Brief #2) | 5+ sources today; the per-partner `*-commissions` services should feed the one resolver, not own rates |
| **Itinerary renderers:** `PlanCard` · `DashboardPlanCard` · `ItineraryCard` · Workspace bespoke (`DayCard/ARow`) | **one `PlanCard`** (role + stage props) | mounted by dashboard, trip-details, itinerary, shared-view, and workspace |
| **Recommendation:** `ai-recommendation-engine` + `service-recommendation-engine` | **one recommendation service** | two engines; confirm which owns demand-signal → service matching |
| **Caching:** `cache.service` + `cache-scheduler` + `fever-cache` + `travelpayouts-cache` | **one cache layer** + the scheduler | per-integration caches should use a shared cache primitive |
| **Maps handoff:** `lib/navigate` + `lib/maps-platform` + inline handler in `PlanCard.tsx` | **one maps deep-link builder** | three paths today; one had a `{0,0}` fallback bug |
| **Stripe:** `stripe` + `stripe-connect` + `stripe-payment` | verify boundaries (may be legitimately separate) | confirm no overlapping charge/payout logic before merging |

## 2. Data — overlapping tables → one model or clear ownership

| Scattered across | Canonical target | Notes |
|---|---|---|
| **Events (6 tables):** `live_events` · `destination_events` · `travel_pulse_calendar_events` · `fever_event_cache` · `tourist_help_me_guide_events` · `ea_events` | **one events model** (or a documented ownership map: which is source-of-truth, which are caches/contexts) | the by-date Events view + matching need ONE canonical event source |
| **Service catalog:** `service_templates` · `expert_service_offerings` (ESO) · `expert_custom_services` + frontend hardcoded templates | **ESO canonical** (decided earlier) | demote `service_templates`/hardcoded to migration/fallback only |
| **Demand/intelligence:** `service_demand_signals` + `destination_metrics_history` + the analytics tables | confirm a single demand source feeding the feed/recs | the regeneration + feedback-loop work (Brief: intelligence) |
| **Fee config (see §1):** `booking_fee_configs` + `revenue_splits` + per-service `revenueShareRate` | `booking_fee_configs` canonical; others are overrides | |

## 3. Routes — duplicate/leftover → consolidate (from `CONSOLE_ROUTE_MAP.md`)

| Scattered | Canonical | Action |
|---|---|---|
| `/browse` (live BrowsePage) | `/discover` | redirect |
| `/discover-experiences` · `/spontaneous` · `/hidden-gems` · `/deals` | `/discover` (tabs/filters) | fold/redirect (check unique content first) |
| Expert service creation ×5 (`services/new`, `service-wizard`, `services/templates`, `custom-services`, `templates`) | one `ServiceWizard` flow | redirect the rest |
| Expert analytics ×4 (`performance`, `revenue-optimization`, `analytics`, `leaderboard`) | one analytics surface | merge + redirect |
| `/expert/messages`, `/provider/messages` | `/chat` (role-scoped) | redirect |
| AI assistants ×4 (`/ai-assistant`, `/chat`, `/expert/ai-assistant`, `/ea/ai-assistant`) | one role-scoped assistant | reconcile |

## 4. Dead / parallel code

| Item | Finding | Action |
|---|---|---|
| **Python `backend-services/`** (`pricing_service`, `availability_service`, `affiliate_service`, `stripe_service`, `booking_bot`) | **No TS imports found — appears unwired** | confirm dead vs separately-deployed; if dead, remove (it shadows TS pricing/stripe — a latent fourth fee source) |
| **`server/routes.ts`** (19,279 lines, 639 endpoints) | monolith; extraction started (`booking-actions.ts`, `plancard.routes.ts`) | modularize by the 7 domains |

---

## Canonical homes summary
- **Money** → `resolveCommissionRates()` over `booking_fee_configs`.
- **Itinerary UI** → `PlanCard`.
- **Recommendations** → one recommendation service.
- **Events data** → one events model.
- **Service catalog** → `expert_service_offerings`.
- **Caching / maps** → one shared primitive each.
- **API** → domain-modularized routes.
- **Dead Python tier** → removed (once confirmed).
