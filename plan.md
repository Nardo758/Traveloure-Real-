# Build Plan: Route Criticality → Actionable Work Stages

> Derived from `ROUTE_CRITICALITY_MAP.md` (Pass 1)  
> Branch: `fix/phase-3-0-1-prestep`  
> Goal: Convert ranked journeys + orphan list into sequenced, verifiable build stages.

---

## 0. North Star

**Ship the 8 critical journeys end-to-end with zero orphan gaps.**  
Priority order is fixed by fan-in × money proximity from the route map — not by ease of implementation.

---

## 1. Stage Breakdown

### Stage 1 — Journey 1 Integrity (Discover → Cart → Payment → Booking)
**Priority:** P0 (highest fan-in revenue terminal)  
**Why first:** Every other journey funnels into this path. If it breaks, nothing converts.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 1.1 | Wire orphan `/local-experts` route | `city-feed-card.tsx:697` has `href="/local-experts"` but **no route in App.tsx** — 404 risk | Add `Route path="/local-experts"` in `App.tsx`, map to `ExpertsPage` or new component. Verify no 404. | cross-cutting |
| 1.2 | Surface `EscalationCTA` in `trip-details` | `EscalationCTA` only imported in `PlanCard.tsx` and `pricing.tsx`; **NOT in `trip-details.tsx`** | Import `EscalationCTA` in `trip-details.tsx` at the upsell surface. Verify renders. | cross-cutting |
| 1.3 | Surface `ExpertMatchCard` in discover/service detail | `ExpertMatchCard` only imported in itself + tests; **not in `discover.tsx` or `service-detail.tsx`** | Import `ExpertMatchCard` in `discover.tsx` or `discover-location.tsx` feed. Verify renders. | cross-cutting |
| 1.4 | Wire `SmartServiceRecommendations` into `/discover` | Only used in `dashboard.tsx` and `expert-detail.tsx`; **not in `/discover` or `/services/:id`** | Import in `discover.tsx` or `discover-location.tsx`. Verify ranked recs surface. | cross-cutting |
| 1.5 | Resolve `ItineraryComparisonWithBooking` vs `ItineraryComparisonPage` | Route `/itinerary-comparison/:id` uses `ItineraryComparisonPage` (App.tsx:405), but `ItineraryComparisonWithBooking` is a separate component with `BookingFlowModal` | Decide: either route to `ItineraryComparisonWithBooking` (if it should have booking), or merge booking logic into `ItineraryComparisonPage`. Verify booking CTA works. | Trip |
| 1.6 | E2E verify: Landing → Discover → Cart → Payment → Confirmation | Journey 1 end-to-end | Playwright trace from `/` to `BookingConfirmation`. Stripe PI succeeds. No 404s on any step. | cross-cutting |

**Stage 1 gate:** All 6 tasks complete + E2E trace passes.

---

### Stage 2 — Journey 7 Integrity (Event Coordination: Wedding/Proposal/Corporate)
**Priority:** P0 (highest money complexity, double-count fence)  
**Why second:** Event coordination is where the `$499` floor / `8%` coordination fee and the `$19.99` optimize fee credit intersect. This is the Phase 3.0.1d double-count fence in production.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 2.1 | Verify `/concierge` event type picker flows to event coordinator | `IntentForm` has event type select (wedding/proposal/corporate), but **no event build UI** exists | Event type selection triggers event-specific coordination UI. Verify `/concierge` with `eventType=wedding` shows coordination timeline. | Event |
| 2.2 | Verify `expert/workspace/:tripId` event coordination surface | `ExpertWorkspace` handles trip/experience/event coordination; needs event-specific view | Event workspace shows timeline, vendor matrix, coordination fee. Verify `POST /api/coordination-states` works. | Event |
| 2.3 | Wire `resolveCoordinationFee` into coordination endpoints | `resolveCoordinationFee` (optimization-fee.service.ts:135) exists but **not wired to any route** | Add `resolveCoordinationFee` call to coordination booking creation endpoint. Verify `$499` floor / `8%` logic applies. | Event |
| 2.4 | Wire `buildEventTimeline` into event coordination API | `buildEventTimeline` (event-coordination.service.ts:86) exists but **not exposed in any route** | Add route `GET /api/coordination/:tripId/timeline` calling `buildEventTimeline`. Verify returns timeline. | Event |
| 2.5 | Verify optimize fee credit toward coordination for Events | `creditTowardCoordination` = true for Event branch. Verify UI shows "credited toward coordination" | `optimize.tsx` shows credit badge. `resolveCoordinationFee` subtracts optimize fee. Verify no double-count. | Event |
| 2.6 | E2E verify: `/concierge` (wedding) → Event Coordination → Workspace → Booking | Journey 7 end-to-end | Playwright trace from `/concierge` with wedding event type to `BookingConfirmation`. Coordination fee correct. No double-count. | Event |

**Stage 2 gate:** All 6 tasks complete + E2E trace passes. Double-count fence verified.

---

### Stage 3 — Journey 2 Integrity (Trip Creation → Planning → Optimize → Checkout)
**Priority:** P1 (medium fan-in, high money)  
**Why third:** Planning surfaces are where the reframe branches (Trip/Experience/Event) diverge. PlanCard delivery must work for all three.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 3.1 | Wire `EnhancedPlanningModal` into trip creation | `EnhancedPlanningModal.tsx:77` exists but **not imported anywhere** | Import in `trip-details.tsx` or `/quick-start` flow. Verify destination picker + day planning works. | Trip |
| 3.2 | Create `POST /api/trips/:id/optimize` endpoint | **Does not exist**. Trip optimization flows through `/api/claude/optimize-itinerary` and `/api/trips/:tripId/itinerary/optimize-order` instead | Create canonical `POST /api/trips/:id/optimize` endpoint. Wire `optimize.tsx` to call it. Verify AI optimization returns. | Trip |
| 3.3 | Create `POST /api/experiences/:id/optimize` endpoint | Experience optimize exists (`content.routes.ts:621`), but no explicit experience optimize endpoint | Create endpoint. Wire `experience-template.tsx:675` to call it. Verify AI optimization returns. | Experience |
| 3.4 | Create event optimize endpoint | `pricing.tsx:209` mentions event optimize; **no dedicated event optimize endpoint** | Create `POST /api/events/:id/optimize` or extend existing. Wire concierge event flow to it. | Event |
| 3.5 | PlanCard for Experience | **No PlanCard usage for experiences** | Add `PlanCard` rendering for experience plans. Endpoint + schema if needed. | Experience |
| 3.6 | PlanCard for Event | **No PlanCard usage for events** | Add `PlanCard` rendering for event plans. Endpoint + schema if needed. | Event |
| 3.7 | E2E verify: Trip → Plan → Optimize → Cart → Payment | Journey 2 end-to-end | Playwright trace from `/quick-start` to `BookingConfirmation`. PlanCard renders. Optimize fee correct. | Trip/Experience/Event |

**Stage 3 gate:** All 7 tasks complete + E2E traces for Trip/Experience/Event.

---

### Stage 4 — Journey 3 & 4 Integrity (Expert/Provider Onboarding → Payout)
**Priority:** P1 (supply-side revenue enablers)  
**Why fourth:** Expert and provider onboarding are the revenue supply side. They must be discoverable and bookable.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 4.1 | Verify `ExpertMatchCard` discoverable in feed | `ExpertMatchCard` orphaned (not in any main page) | Surface in `/discover` or `/experts`. Verify match score renders. | cross-cutting |
| 4.2 | Verify expert booking request from `ExpertDetailPage` | `ExpertDetailPage` opens `SignInModal` for booking; verify booking flow works after auth | E2E: `/experts/:id` → `SignInModal` → booking → `BookingConfirmation`. | cross-cutting |
| 4.3 | Verify provider booking from `ServiceDetailPage` | `ServiceDetailPage` has booking CTA; verify provider booking rail works | E2E: `/services/:id` → booking → `BookingConfirmation`. Provider commission (10%) correct. | cross-cutting |
| 4.4 | Verify expert Stripe Connect onboarding | `/expert/earnings` → `stripe-connect-card.tsx` → `POST /api/stripe/connect/onboard` | E2E: expert onboarding → Stripe Connect account created → payout enabled. | cross-cutting |
| 4.5 | Verify provider Stripe Connect onboarding | `/provider/earnings` → `stripe-connect-card.tsx` → `POST /api/stripe/connect/onboard` | E2E: provider onboarding → Stripe Connect account created → payout enabled. | cross-cutting |
| 4.6 | E2E verify: `/become-expert` → Service → Booking → Earnings | Journey 3 end-to-end | Full supply-side trace. Expert creates service. Traveler books. Expert sees earnings. | cross-cutting |
| 4.7 | E2E verify: `/become-provider` → Service → Booking → Earnings | Journey 4 end-to-end | Full supply-side trace. Provider creates service. Traveler books. Provider sees earnings. | cross-cutting |

**Stage 4 gate:** All 7 tasks complete + E2E traces for both expert and provider supply side.

---

### Stage 5 — Journey 6 Integrity (Transport Booking)
**Priority:** P1 (high money, affiliate commissions)  
**Why fifth:** Transport is a distinct booking rail with affiliate partners.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 5.1 | Verify transport booking from `PlanCard` | `PlanCard` shows transport legs; `DayTransportPanel` has booking CTA | E2E: Trip with transport → `TransportHub` → `POST /api/transport/book` → booking confirmed. | Trip |
| 5.2 | Verify affiliate attribution for transport | Transport bookings route to affiliate partners (12Go, Viator, etc.) | `affiliate.service.ts` generates link. `POST /api/affiliate/track-click` logs attribution. Verify commission tracked. | Trip |
| 5.3 | E2E verify: `/transportation` → Book → Confirmation | Journey 6 end-to-end | Playwright trace from `/transportation` to `BookingConfirmation`. Affiliate attribution present. | Trip |

**Stage 5 gate:** All 3 tasks complete + E2E trace passes.

---

### Stage 6 — Admin & Trust Infrastructure (Journey 5)
**Priority:** P1 (controls all fee rates)  
**Why sixth:** Admin fee management affects every money journey. Must be correct before scale.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 6.1 | Verify admin fee config edits propagate to checkout | `/admin/fee-config` → `POST /api/admin/optimization-fees` → `bookingFeeConfigs` | Edit fee in admin. Next checkout reflects new fee. No redeploy. | cross-cutting |
| 6.2 | Verify admin payout triggers Stripe transfer | `/admin/payouts` → `POST /api/admin/payouts` → Stripe Connect transfer | E2E: Admin triggers payout. Expert/provider receives funds. | cross-cutting |
| 6.3 | Verify trust enforcement (relevance-dominance) | `upsell-engine.service.ts` `DEFAULT_POLICY` sets `revenueCap: 0.15`, `bandWidth: 0.15` | `upsell-engine.test.ts` passes. Revenue never overrides relevance beyond cap. | cross-cutting |
| 6.4 | Verify click attribution (issue #49) | `UpsellSlot.tsx:99` → `POST /api/upsell/click` | E2E: Click on upsell item → `upsell_impressions.clicked = true`. Attribution tracked. | cross-cutting |
| 6.5 | E2E verify: Admin fee change → checkout amount change | Journey 5 end-to-end | Change fee in admin. Verify checkout amount changes. No code redeploy. | cross-cutting |

**Stage 6 gate:** All 5 tasks complete + fee propagation verified.

---

### Stage 7 — Orphan Cleanup & Redirect Consolidation
**Priority:** P2 (cleanup, not blocking)  
**Why last:** These are gaps that don't block revenue but create confusion.

| # | Task | Evidence from Route Map | Done Criteria | Reframe Tag |
|---|---|---|---|---|
| 7.1 | Remove or wire dev-only routes | `/landing-mockups`, `/architecture`, `/layout-mock`, `/booking-demo` — no production links | Either remove routes or add dev-only guard (e.g., `NODE_ENV === 'development'`). | cross-cutting |
| 7.2 | Wire footer-only routes | `/contact`, `/careers`, `/blog`, `/press`, `/features`, `/visa-help`, `/global-calendar`, `/executive-assistant` — no inbound Link found | Add footer links in `Layout.tsx` or `layout.tsx`. Verify reachable from every page. | cross-cutting |
| 7.3 | Verify all 21 redirects work | Redirect list in §4.3 of route map | E2E: Hit each redirect source → verify target loads. No 404s. | cross-cutting |
| 7.4 | Wire `SerpInquiryDialog` | `serp-inquiry-dialog.tsx` only referenced server-side | Determine if client dialog needed. If yes, wire in search results. If no, remove. | cross-cutting |
| 7.5 | Wire `AddCustomVenueModal` if needed | Only in `expert/workspace.tsx` | Verify it opens correctly. If not needed, remove. | cross-cutting |

**Stage 7 gate:** All 5 tasks complete + no orphan 404s.

---

## 2. E2E Selection (from Ranked Journeys)

These are the only journeys that get bespoke E2E tests. Everything else is integration-tested or unit-tested.

| # | Journey | E2E Name | Scope | Trigger |
|---|---|---|---|---|
| E2E-1 | Discover → Cart → Payment → Booking | `journey-1-checkout` | Landing → `/discover` → `/cart` → Stripe PI → `BookingConfirmation` | Manual + CI on every deploy |
| E2E-2 | Event Coordination (Wedding) | `journey-7-event-coordination` | `/concierge` (wedding) → Event Coordination → Workspace → Booking | Manual + CI on every deploy |
| E2E-3 | Trip → Plan → Optimize → Cart | `journey-2-trip-optimize` | `/quick-start` → Plan → Optimize → `/cart` → Payment | Manual + CI on every deploy |
| E2E-4 | Expert Onboarding → Service → Booking | `journey-3-expert-supply` | `/become-expert` → Service → Booking → Earnings | Manual + CI on every deploy |
| E2E-5 | Provider Onboarding → Service → Booking | `journey-4-provider-supply` | `/become-provider` → Service → Booking → Earnings | Manual + CI on every deploy |
| E2E-6 | Transport Booking | `journey-6-transport` | `/transportation` or `PlanCard` transport → Booking | Manual + CI on every deploy |
| E2E-7 | Admin Fee Propagation | `journey-5-admin-fee` | Admin changes fee → Verify checkout amount changes | Manual + CI on every deploy |
| E2E-8 | AI Assistant → Booking | `journey-8-ai-conversion` | `/ai-assistant` → Conversation → Add to Cart → Booking | Manual + CI on every deploy |

---

## 3. Reframe Conformance Spec (from Branch Tags)

Every planning surface must carry the correct reframe tag. This is the verification checklist.

| Surface | Required Tag | Evidence | Verify |
|---|---|---|---|
| `/quick-start` | Trip | `QuickStartItinerary` | Trip wizard surfaces. No Experience/Event CTAs. |
| `/experiences/:slug/new` | Experience | `ExperienceTemplatePage` | Experience builder surfaces. No Trip/Event CTAs. |
| `/concierge` (default) | cross-cutting | `IntentForm` (no event type selected) | General concierge. No event-specific UI. |
| `/concierge` (event type selected) | **Event** | `IntentForm` (event type = wedding/proposal/etc.) | Event-specific UI. Coordination timeline surfaces. |
| `/trip/:id` | Trip | `TripDetails` + itinerary | Trip-only PlanCard. No Experience/Event PlanCard. |
| `PlanCard` (trip) | Trip | `dashboard.tsx:290`, `trip-details.tsx:661` | Renders trip plan. Transport legs. Day-by-day. |
| `PlanCard` (experience) | Experience | **Not yet implemented** | Must render experience plan. Activity slots. |
| `PlanCard` (event) | Event | **Not yet implemented** | Must render event plan. Timeline. Vendor matrix. |
| `EscalationCTA` | cross-cutting | `PlanCard.tsx` | Upsell CTA on ALL plan types. No branch-specific copy. |
| `OptimizeGateTeaser` | cross-cutting | `optimize.tsx` | Delta-only teaser on ALL optimized plans. |
| `/expert/workspace/:tripId` | cross-cutting | `ExpertWorkspace` | Handles trip/experience/event. Branch-aware UI. |

---

## 4. Sequencing & Dependencies

```
Stage 1 (Journey 1) ──────────┐
                                ├─→ Stage 3 (Journey 2) ──→ Stage 7 (Cleanup)
Stage 2 (Journey 7) ────────────┤
                                │
Stage 4 (Journey 3 & 4) ────────┘
                                │
Stage 5 (Journey 6) ──────────────┘
                                │
Stage 6 (Journey 5) ────────────┘
```

- **Stage 1 and Stage 2 are parallel** (they touch different surfaces).
- **Stage 3 depends on Stage 1** (planning flows into cart).
- **Stage 4 depends on Stage 2** (expert workspace is part of event coordination).
- **Stage 5 depends on Stage 1** (transport books into cart).
- **Stage 6 depends on all** (admin fee changes affect all journeys).
- **Stage 7 is independent cleanup** (can run anytime after Stage 1).

---

## 5. Deliverable Checklist

- [ ] `plan.md` (this file) committed to repo
- [ ] Stage 1 tasks assigned to sub-agents or tracked in TODO
- [ ] E2E test files created for E2E-1 through E2E-8
- [ ] Each stage has a gate condition (E2E trace passes or specific verification)
- [ ] Orphan list from Route Map fully addressed or explicitly deferred
- [ ] Reframe tags verified on every planning surface

---

## 6. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bookingsDomainRoutes` not mounted | High | **P0** — all booking/coordination APIs break | Fix immediately in Stage 1. Verify with `app.use()` grep. |
| `resolveCoordinationFee` / `buildEventTimeline` not wired | High | **P0** — Event coordination fees incorrect | Fix in Stage 2. Verify with endpoint test. |
| PlanCard missing for Experience/Event | Medium | **P1** — can't deliver non-trip plans | Build in Stage 3. Reuse trip PlanCard with branch-specific rendering. |
| Multi-currency missing | Medium | **P0** — all charges in USD regardless of locale | Fix in Stage 1. Make `currency` dynamic in Stripe PI. |
| Expert/Provider onboarding friction | Low | **P1** — supply-side growth blocked | Monitor in Stage 4. Simplify if needed. |

---

**End of plan.**
