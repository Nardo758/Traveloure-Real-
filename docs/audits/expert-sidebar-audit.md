# Expert Sidebar Audit — duplicates, dead surfaces, and the two-lane Workstation

**Date:** 2026-07-25 · **Scope:** every entry in `expert-sidebar.tsx`, every page under
`client/src/pages/expert/`, and the workstation's intake/output pipelines. Method: page → API
map, server registration check per endpoint (mounted vs dark-`experts.routes.ts` vs nowhere),
inbound-link sweep. **This is the assessment; eliminations below need decision-maker sign-off.**

Governing model (ratified 2026-07-25): the **Workstation is the content factory**, used two ways —
**(A) plan custom trips from requests** (client work) and **(B) make content to push to the store
("Ready Made Trips") or social media**. Every sidebar entry should be an intake to the factory, an
output shelf, or account plumbing. Anything else is a candidate to eliminate.

---

## 1. Sidebar entries — what each actually is

### Work group

| Entry | Page | Backend | Verdict |
|---|---|---|---|
| Dashboard | `dashboard.tsx` | `expert/dashboard`, `analytics/dashboard`, `assigned-trips`, `bookings`, `ai-stats`, stripe status — all live | **KEEP** (overview hub) |
| Bookings | `bookings.tsx` | `expert/bookings` (live) | **KEEP** — lane-A intake: paid service bookings |
| Clients | `clients.tsx` (292 ln) | **only** `expert/assigned-trips` | **DUPLICATE** — a re-render of Assigned Trips grouped by traveler. Adds no data. Its detail page `/expert/clients/:id` (`client-detail.tsx`) has **zero API calls** (static mock) and **no inbound links** |
| Assigned Trips | `assigned-trips.tsx` | `expert/assigned-trips` + accept action (live) | **KEEP** — lane-A intake: advisory assignments → Workspace |
| Workspace | `workspace.tsx` | dual-mode (assignment/authoring), all live | **KEEP** — the factory itself |
| Messages | `messages.tsx` (146 ln) | redirect shim → `/chat` (already consolidated) | **KEEP entry, DELETE page** — sidebar can point at `/chat` directly; the shim page + its `assigned-trips` fetch are vestigial |

### Business group

| Entry | Page | Backend | Verdict |
|---|---|---|---|
| Services | `services.tsx` | `expert/services` (live), `expert/analytics` (live), **`expert/service-templates` + `expert/role` = DARK** (`experts.routes.ts`, 200-HTML) | **KEEP but repair** — the bookable-services console (provider_services, a *different* commerce lane from the store: services are fulfilled, store items are content). Two of its four data sources silently return HTML |
| Itinerary Templates | `templates.tsx` | `expert/templates`, `template-sales`, `earnings` (live) | **FOLD (ratified)** — the metadata-only console for `expert_templates`; the one-factory decision retires authoring here. Keep only until stock migration lands |
| Store Listings | `ready-made.tsx` | `expert/ready-made/*` (live, gated) | **KEEP** — lane-B output: the workstation→store pipeline console |
| Booking Partners | `booking-partners.tsx` (479 ln) | **ZERO API calls** — hardcoded Travelpayouts affiliate directory (client-side `TP_MARKER`), outbound links | **RESCOPE OR CUT** — as-is it's a static link farm; the agent-booking work it supports actually happens in the Workspace's Partner Bookings tab (`affiliate-booking-requests/expert`, live). Also drifts against §16's keep-affiliate-URLs-server-side posture |
| Content Studio | `content-studio.tsx` (1120 ln) | `instagram/status`+`publish` (**live** — `app.use("/api/instagram")`) but `expert/knowledge-nuggets` CRUD = **DARK** → the content library can't save/load | **KEEP but repair + connect** — this is lane-B social, and it's half-dead and disconnected from the factory (no path from a workspace build or DMO item into a post) |
| DMO Library | `dmo-library.tsx` | `expert-workspace/*` (live, mounted) | **KEEP** — the factory's ingredient shelf (already bridges into builds) |
| Analytics | `analytics.tsx` (1212 ln) | `analytics/dashboard`, `market-intelligence`, `revenue-optimization`, `referrals` (all live in routes.ts) | **KEEP**, absorb the orphan analytics pages (below) |
| Earnings | `earnings.tsx` | `expert/earnings`, `payouts/request` (live) | **KEEP** |

### Account group

| Entry | Page | Backend | Verdict |
|---|---|---|---|
| AI Assistant | `ai-assistant.tsx` | `expert/ai-tasks*`, `ai-stats` (live) | **KEEP** (candidate to later surface inside the Workspace instead of beside it) |
| Profile | `profile.tsx` | live set | **KEEP** |
| Verification & Payouts | `verification.tsx` (223 ln) | application-status, identity, stripe connect | **DUPLICATE** — `settings.tsx` (644 ln) hits the **identical five endpoints** and wraps them in a fuller page. One of the two should absorb the other |
| Settings | `settings.tsx` | same five + settings UI | **KEEP** (absorb Verification as a tab, or keep Verification and strip it from Settings — either way, once) |

## 2. Orphan pages (on disk, routed or not, **zero inbound links**)

| Page | Routed? | API | Note |
|---|---|---|---|
| `service-wizard.tsx` | `/expert/service-wizard` | live services endpoints | The retired create wizard — Phase-3 retirement already filed (§5); route still registered, unlinked |
| `service-listings.tsx` | `/expert/service-listings` | `expert/service-listings` (live) | Parallel listings console to `services.tsx` — unlinked duplicate |
| `service-form.tsx` | `/expert/services/...` route | shared ServiceForm host | Canonical builder host — keep, it's reached by navigation from services.tsx internals |
| `service-templates.tsx` | **NOT routed** | — | Dead file |
| `content-create.tsx` | **NOT routed** | — | Dead file (content-studio's `:contentType` route reuses content-studio.tsx) |
| `performance.tsx` | `/expert/performance` | `analytics/dashboard` | Subset of Analytics — unlinked duplicate |
| `revenue-optimization.tsx` | `/expert/revenue-optimization` | `revenue-optimization`, `referrals`, `tips` | Overlaps Analytics' own revenue-optimization section — unlinked duplicate |
| `leaderboard.tsx` | `/expert/leaderboard` | **none** (static) | Unlinked static mock |
| `contract-categories.tsx` | `/expert/contract-categories` | **none** (static) | Unlinked static mock |
| `client-detail.tsx` | `/expert/clients/:id` | **none** (static) | Mock detail for the duplicate Clients page |

## 3. The two-lane Workstation — current wiring vs the model

### Lane A — custom trips from requests

| Request type | Intake exists? | Reaches the Workstation? |
|---|---|---|
| Advisory assignment (`trip_expert_advisors`) | ✅ Assigned Trips (accept → workspace) | ✅ assignment mode |
| Paid service booking | ✅ Bookings page | ➖ fulfillment is per-service, not itinerary work — correct as-is |
| Partner/affiliate booking requests (§16 agent rail) | ✅ Workspace "Partner Bookings" tab | ✅ |
| **Event-coordination engagement** (Phase 1c `assigned_expert_id`) | ❌ **GAP** — admin assigns a coordinator, but **no expert-side list** of "my coordination engagements" exists (verified: no query on `assignedExpertId` in storage). The workspace's Event Coord tab is per-trip, reachable only if the expert already knows the trip | ❌ the assignment dead-ends until the expert stumbles into it |
| Traveler `service_requests` (demand capture) | admin triage only (by design today) | filed follow-up: feed accepted requests to experts |

### Lane B — content to the store / social

| Output | Pipeline | State |
|---|---|---|
| Store listing (cloneable trip) | Workspace authoring → quality-structure submit gate → admin queue | ✅ push built (b41dc525); admin approve + store shelf = task #158 |
| Store itinerary (`expert_templates`) | separate metadata console, no itinerary editor | **FOLD** into the one factory (ratified; stock-migration decision open) |
| Social content | Content Studio: nugget library **dark**, Instagram publish live, **no bridge** from workspace builds or DMO items into a post | **REPAIR + CONNECT** — this is the biggest lane-B break |

## 4. Recommended eliminations (need sign-off)

1. **Delete pages (dead files / unlinked mocks):** `service-templates.tsx`, `content-create.tsx`,
   `leaderboard.tsx`, `contract-categories.tsx`, `client-detail.tsx`, `messages.tsx` (point the
   sidebar at `/chat`), + their routes.
2. **Delete unlinked duplicates after a diff-harvest** (§9 lesson — check for superior deltas
   first): `performance.tsx`, `revenue-optimization.tsx` (→ Analytics), `service-listings.tsx`
   (→ services.tsx), `service-wizard.tsx` (the already-filed Phase-3 retirement).
3. **Merge Clients into Assigned Trips** (same data; keep one grouped-by-client view there) and
   drop the Clients sidebar entry, or make Clients a real CRM view only when it gets real data.
4. **Merge Verification & Payouts into Settings** (identical backends) — one page, one sidebar entry.
5. **Rescope Booking Partners** — either fold the partner directory into the Workspace's Partner
   Bookings tab (where the live agent rail is) or park it; today it's a static affiliate link page.
6. **Repair the dark backends the sidebar depends on:** `expert/knowledge-nuggets` (Content
   Studio's library), `expert/service-templates` + `expert/role` (Services page) — port from
   `experts.routes.ts` into a mounted router per the §9 playbook (port verbatim, delete the dark twin).
7. **Build the two missing factory wires:** (a) expert-side "my coordination engagements" intake
   (lane A); (b) Workspace/DMO → Content Studio bridge (lane B) so a build or library item can
   become a post draft.

**End-state sidebar (proposed):** Work = Dashboard · Bookings · Assigned Trips (with client
grouping) · Workspace · Messages(→/chat). Business = Services · Store Listings · Content Studio ·
DMO Library · Analytics · Earnings. Account = AI Assistant · Profile · Settings (incl.
verification & payouts). Itinerary Templates exits when the stock migration lands; Booking
Partners folds into the Workspace.
