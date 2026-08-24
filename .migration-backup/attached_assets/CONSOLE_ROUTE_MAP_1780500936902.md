# Traveloure — Complete Console → Route Map

**Source:** `client/src/App.tsx` (full scan). **145 routes** across **5 consoles** + public surfaces + redirects.
**Purpose:** connect every console to its routes; surface mis-wires, duplicates, and the cross-console seams.

Routing is `wouter`. Gated routes render `<ProtectedRoute component={X} requiredRole="…" />`. Gate = the console.

---

## Console 1 — Public + Traveler (gate: none / default `user`)

**Public / marketing:** `/` LandingPage · `/how-it-works` · `/pricing` · `/about` · `/features` · `/faq` · `/help` (+ `/support` → same HelpPage) · `/contact` · `/careers` · `/blog` · `/press` · `/privacy` · `/terms` · `/accept-terms` · `/partner-with-us` · `/become-expert` (TravelExpertsPage) · `/become-provider` (ServicesProviderPage).

**Discovery (public):** `/discover` DiscoverPage · `/experts` · `/experts/:id` · `/service-providers` · `/experiences` · `/experiences/:slug` · `/discover-experiences` · `/deals` · `/spontaneous` · `/hidden-gems` · `/optimize` · `/quick-start` · `/transportation` · `/global-calendar` · `/services/:id` · `/browse` BrowsePage · `/vendors` · `/visa-help`.

**Traveler app (gated `user`):** `/dashboard` Dashboard · `/my-trips` · `/trip/:id` TripDetails · `/itinerary-comparison/:id` · `/itinerary-view/:token` · `/trips/shared/:token` · `/cart` · `/payment` · `/bookings` MyBookingsPage · `/contracts/:id` · `/profile` · `/credits` CreditsBillingPage · `/notifications` · `/expert-status` · `/provider-status` · `/chat` · `/ai-assistant`.

---

## Console 2 — Local Expert (gate: `expert`) — 28 routes

| Route | Component |
|---|---|
| `/expert/dashboard` | ExpertDashboard |
| `/expert/assigned-trips` | ExpertAssignedTrips |
| `/expert/workspace/:tripId` | ExpertWorkspace |
| `/expert/clients` · `/expert/clients/:id` | ExpertClients · ExpertClientDetail |
| `/expert/messages` · `/expert/messages/:clientId` | ExpertMessages |
| `/expert/bookings` | ExpertBookings |
| `/expert/services` | ExpertServices |
| `/expert/services/new` · `/expert/service-wizard` | ServiceWizard |
| `/expert/services/:id/edit` | ExpertServiceForm |
| `/expert/services/templates` | ServiceTemplates |
| `/expert/custom-services` | ExpertCustomServices |
| `/expert/templates` | ExpertTemplates |
| `/expert/content-studio` · `/:contentType` | ExpertContentStudio |
| `/expert/earnings` | ExpertEarnings |
| `/expert/performance` | ExpertPerformance |
| `/expert/revenue-optimization` | ExpertRevenueOptimization |
| `/expert/analytics` | ExpertAnalytics |
| `/expert/leaderboard` | ExpertLeaderboard |
| `/expert/contract-categories` | ExpertContractCategories |
| `/expert/booking-partners` | ExpertBookingPartners |
| `/expert/ai-assistant` | ExpertAIAssistant |
| `/expert/verification` · `/settings` · `/profile` | ExpertVerification · ExpertSettings · ExpertProfile |

---

## Console 3 — Service Provider (gate: `provider`) — 13 routes

`/provider/dashboard` ProviderDashboard · `/provider/bookings` · `/provider/messages` · `/provider/services` · `/provider/services/new` (ProviderServiceForm) · `/provider/services/:id/edit` (same) · `/provider/earnings` · `/provider/performance` · `/provider/analytics` · `/provider/calendar` · `/provider/resources` · `/provider/profile` · `/provider/settings`.

---

## Console 4 — Admin (gate: `admin`) — 23 routes

`/admin` → redirect `/admin/dashboard`. Then: `/admin/dashboard` · `/admin/users` · `/admin/experts` · `/admin/providers` · `/admin/plans` · `/admin/revenue` · `/admin/analytics` · `/admin/tourism-analytics` · `/admin/categories` · `/admin/search` · `/admin/notifications` · `/admin/system` · `/admin/data` · `/admin/affiliate-partners` · `/admin/content-tracking` · `/admin/content-mapping` · `/admin/services` · `/admin/ai-costs` · `/admin/payouts` · `/admin/fee-config` · `/admin/platform-providers` · `/admin/routing-queue`.

---

## Console 5 — Executive Assistant (gate: `executive_assistant`) — 13 routes

`/ea/dashboard` EADashboard · `/ea/clients` · `/ea/executives` · `/ea/calendar` · `/ea/events` · `/ea/communications` · `/ea/travel` · `/ea/venues` · `/ea/gifts` · `/ea/reports` · `/ea/ai-assistant` · `/ea/profile` · `/ea/settings`. (Plus public landing `/executive-assistant`.)

---

## Redirects already wired (do NOT reopen)
`/itinerary/:id` & `/my-itinerary/:id` → `/trip/:id` · `/create-trip` → `/experiences` · `/help-me-decide` → `/discover` · `/explore` → `/discover` · `/travel-experts` · `/services-provider` · `/credits-billing` · `/checkout` · `/admin` → `/admin/dashboard`.

---

## Wiring flags & fixes
1. **`/browse` is a live `BrowsePage`** while its sibling `/explore` already redirects → make `/browse` redirect to `/discover` (the unfinished half of the consolidation).
2. **Expert service-creation has 5 entry points** — `/expert/services/new`, `/expert/service-wizard` (both `ServiceWizard`), `/expert/services/templates`, `/expert/custom-services`, `/expert/templates` → consolidate to one flow.
3. **Expert analytics overlap** — `/expert/performance`, `/expert/revenue-optimization`, `/expert/analytics`, `/expert/leaderboard` are four takes on performance → merge.
4. **Duplicate messaging** — `/expert/messages` and `/provider/messages` vs the shared `/chat` → redirect role messages to `/chat`.
5. **Duplicate AI assistants** — `/ai-assistant`, `/chat`, `/expert/ai-assistant`, `/ea/ai-assistant` → reconcile to one assistant surface, role-scoped.
6. **Discovery cluster** — `/discover-experiences`, `/spontaneous`, `/hidden-gems`, `/deals` fold into `/discover` per the marketplace redesign.

---

## Cross-console seams (this is the "connect the consoles" part)

Routes don't just live inside a console — they hand off *between* consoles. These are the seams that map to the shared objects + backbones. Wiring the consoles correctly = wiring these:

| Seam | Flows between | Shared object / backbone |
|---|---|---|
| **Lead pipeline** | Traveler ("Ask/Plan" on `/discover`, `/trip/:id`) → Admin `/admin/routing-queue` (confirm) → Expert `/expert/workspace/:tripId` | **Expert lead** |
| **Experience build** | Traveler `/trip/:id` (add) → Expert `/expert/workspace/:tripId` (fill) → PlanCard (`/itinerary-view/:token`, `/trips/shared/:token`) | **Experience** |
| **Provider supply** | Provider `/provider/services` → Admin `/admin/services`, `/admin/platform-providers` (oversight) → traveler feed (`/discover`) | **Content/supply backbone** |
| **Money** | all bookings → Admin `/admin/revenue`, `/admin/payouts`, `/admin/fee-config` (the 25/75 resolver) → Expert `/expert/earnings`, Provider `/provider/earnings` | **Transaction** |
| **Intelligence** | TravelPulse/demand → Admin `/admin/tourism-analytics`, `/admin/analytics` → feeds `/discover` ranking; activity loops back | **Location intelligence** |
| **Affiliate** | Admin `/admin/affiliate-partners`, `/admin/content-tracking`, `/admin/content-mapping` → traveler feed booking | **Content/supply backbone** |

**Verification target:** each seam above is a route-to-route handoff that must carry the right object end-to-end. The recurring failures (lead never reached `/expert/workspace`, commission disagreed before reaching `/expert/earnings`) were all broken seams in this table — so connecting the consoles = confirming each row's handoff is wired and tested.

---

*145 routes, 5 gated consoles. Re-run the extraction after any `App.tsx` change. Component names map 1:1 to `client/src/pages/**`.*
