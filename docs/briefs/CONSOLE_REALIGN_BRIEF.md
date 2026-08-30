# Console Realign Brief — entry surfaces, one rail, one Inbox, honest engagement

**audited@4f07ee1a** (2026-08-03) — volatile claims as-of that SHA; re-verify at Phase 0.
**R-series now lives in DECISIONS.md** (ruling 28: series folded under original letters, CLOSED — all new rulings use the numeric sequence). This section remains the verbatim text of record.
**Status:** RATIFIED by the decision-maker (Aug 2–3, 2026) — "proceed as recommended" on the full set.
**Mockup of record:** claude.ai artifact `9547d288` (6 tabs; one canonical dataset). Annotations ①–⑰ there = the rulings here.
**Execution protocol:** model-tiered (docs/EXECUTION_MAP.md posture): Fable plans/reviews; Sonnet-tier agents execute
the lanes below. No lane begins Phase 1 without its executor re-verifying file:line ground truth (audits may be stale).
**Standing rules that govern every lane:** CLAUDE.md §13 (honest-or-absent, never fabricate), §14/§15 (money), the
one-home rule, absorb-first (a surface retires only after its unique functions are rehomed — inventory on record),
extend-never-fork for the plancard family, additive-only schema (declare everything in shared/schema.ts).

## Ratified decisions

- **R-A (Home).** The existing dashboard design stays byte-for-byte EXCEPT: (1) a compact slip strip caps the
  embedded Plan Card — `TRV-` ref, four routing-status count pills, "Open slip" — never wider than the card;
  (2) the "New experience" CTA keeps its look but opens the intake panel (R-C). Right rail (Travel Pulse etc.) untouched.
- **R-B (one create rail).** All trip creation converges on `POST /api/trips` → `storage.createTrip` (mints owner row +
  trackingNumber). The four parallel client create paths converge; orphaned `create-trip.tsx` and dead `useOptimizeTrip`
  are deleted; the four hand-rolled comparison-creators become one shared helper (killing the hardcoded
  "Paris, France" fallback). Every create lands on `/plans/:tripId` (the born slip — honest v0, no invented progress).
- **R-C (intake).** "Plan new" becomes a PANEL (opened from any + New plan / New experience CTA), not a sidebar
  destination: Step 1 where/when/travelers → Step 2 shape (experience types + "Plan it with AI" as a shape option) →
  Create → slip. `/experiences` route remains as a redirect/host for the panel; templates become slip-side actions.
- **R-D (AI planner).** The chat stays; a live DRAFT PANEL (TripContext fields) fills only from what the conversation
  actually establishes ("not discussed" = empty, never invented); "Create this plan" → R-B rail → slip. No trip is
  persisted unless created.
- **R-E (landing rules).** Planning-phase arrivals land on the slip: create (any door), both apply paths (the
  `?autoApply=1` divergence dies), My plans "View" (merges with "Open slip"; Trip Card is a button on the slip),
  converts, and plan-change notifications (`?item=` anchor). Sidebar highlights "My plans" for `/plans/*`.
  "My Plans & Events" retitles "My plans".
- **R-F (Trip Card delivery — Finalize).** Additive nullable `trips.finalized_at` timestamp (NOT a revival of the dead
  `trips.status` — Lane 3 Option B stands). Slip gains "Finalize plan": sets timestamp, fires "Your Trip Card is ready"
  notification, Trip Card becomes primary immediately; reversible via "Back to planning" (clears it). Both write
  trip-scoped diary events `plan_finalized` / `plan_reopened` (ruling-16 pattern). DEFAULT when never pressed:
  auto-handover at T-48h before startDate (date-derived), same notification = last-call booking nudge. Primary-surface
  rule everywhere: `finalized_at ∨ now ≥ startDate−48h ∨ underway → Trip Card`. Finalize is a RENDERING flip, never a
  money event: staged items warn, never block. Expert-built trips keep delivery→review→approve first.
- **R-G (sidebar 13→10).** Retire entries: Plan new (→ panel), Messages (→ Inbox's Messages tab; /chat stays the thread
  page), Notifications page (uniques rehomed: DELETE-notification + deep-links + per-row mark-read → Inbox Updates tab;
  quick glance → bell, whose rows GAIN deep-links + "View all"; accept/decline booking is an earner action — it already
  lives on expert/provider Inbox queues and leaves the traveler shell). Repoint Experts → `/experts` (the /chat href was
  an unexamined first-commit artifact). KEEP: Home, My plans, AI planner, Discover, Experts, Bookings (sole home of
  escrow confirm/dispute, reviews, visa, refunds, Packages/B3 — deliberately not absorbed), My events, Trip Cart,
  Inbox, Profile. Retired routes redirect (the B5/C1 pattern); one icon map (the 13-type superset) replaces the three
  divergent copies.
- **R-H (engagement layer — the X factor).** Home gains "While you were away" (diary rows since last visit — expert/
  agent/checkout actors; new notifications; destination trending from the REAL travelpulse endpoints; countdown) and
  "Today's move" (single highest-urgency REAL item: staged-awaiting-checkout → expert-reply-waiting → undecided days).
  Last-visit marker: client-side per-user (no new table in v1). Every line traces to a real row — no invented nudges.
- **R-I (§13 widget fixes — MANDATED, ship first).** (1) `TravelPulsePanel` queries nonexistent `/api/travelpulse/feed`
  and renders 8 hardcoded fallback strings — wire to the real `/api/travelpulse/cities`/trending endpoints, honest
  empty state, delete the fabricated fallback. (2) Dashboard greeting "N actions needed today" filters notification
  types nothing writes (always 0) — derive from real unread actionable notifications or remove. (3) `PlanCard.tsx:388`
  filters `n.tripId` (never set; real value is `n.data.tripId`) — fix the filter so per-trip action items work.
- **R-J (Connected AI — MCP connector, LATER lane, gated on R-B).** One remote MCP server + OAuth; any MCP client
  (Claude, OpenClaw, …). Ratified: **agents build & stage, humans pay** (agent may reach `ready_for_checkout`, never
  complete purchase in v1); agent may send items `→with_expert` through the normal lead routing; `agent` actor joins
  the diary vocabulary; scoped tokens, rate limits, revocation; settings page per mockup Tab 5. Own brief before build.

## Lanes (Sonnet executors; Fable reviews each on report)

| Lane | Scope | Files (verify first) | Guards/gates |
|---|---|---|---|
| E1 | R-I widget fixes | TravelPulsePanel.tsx, dashboard.tsx greeting, PlanCard.tsx:388 | tsc baseline, no new fetch loops, §13 |
| E2 | R-B rail + landings (R-E) | cart.tsx, itinerary-comparison.tsx (kill :819 divergence), SavedTripsSection, ai-itinerary-builder, delete create-trip.tsx + useOptimizeTrip, shared comparison helper, my-trips View→slip | tsc, build, no server money-path changes |
| E3 | R-C intake panel + R-G sidebar + R-A Home strip | new intake component, dashboard-sidebar.tsx, dashboard.tsx, my-trips title | absorb-first checklist, redirects listed in role-routes pattern |
| E4 | R-G unified Inbox + bell | inbox.tsx, notifications.tsx (→redirect), notification-bell.tsx | DELETE endpoint keeps a caller; deep-links proven |
| E5 | R-F Finalize | migration (next free number, additive, declared), routes (owner-gated, diary events), slip button, primary-rule helper | preflight n/a (no CHECK); diary events trip-scoped |
| E6 | R-D AI-planner draft panel | ai-assistant.tsx + extraction endpoint (existing conversation service) | §13: only established fields |
| E7 | R-H engagement layer | Home digest + Today's move (needs E1 + E5's helper) | every line traces to an endpoint |
| E8 | R-J MCP connector | own brief first | §14/§15; staged-only |

Order: E1 ∥ E2 → E3 ∥ E4 → E5 → E6 ∥ E7 → E8. One commit per lane, Fable-reviewed. tsc baseline at dispatch: 200.
