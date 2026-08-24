# Trip Plan Card — Mobile Command-Center Lens Audit — Jul 30, 2026

Read-only, code-trace + live-drive re-assessment of `client/src/components/plancard/*` and its rendering
context (`client/src/pages/trip-details.tsx`, the `/trip/:id` route), evaluated against the decision-maker's
product intent: **the Trip Plan Card is the traveler's mobile command center while actively traveling** — the
thing they operate one-handed, on the street, mid-trip. `docs/audits/plancard-audit-jul29.md` (all findings
fixed) audited *correctness*; this audit does not re-report anything from that pass and instead asks whether
a *correct* card is *usable as a command center*.

Method: code trace of every plancard component + the routes/schema behind them, then a live drive — server
booted locally, a real 3-day Kyoto trip built via the live API as `test-traveler-kyoto@traveloure.test` with
today (Jul 29, 2026) as the middle day and 8 timed, geocoded activities, then driven with a cookie-authenticated
Playwright Chromium session at a 390×844 mobile viewport (`/opt/pw-browsers/chromium`). Fixtures deleted and
server stopped at the end — see "Method & cleanup."

## Top 5 recommended moves, in order

1. **Wire the day the page already computes.** `trip-details.tsx:150-160` already contains a correct
   "auto-select today's day" `useEffect` — it computes the right index and calls `setSelectedDay`, but that
   state is **never read again** (not passed to `<PlanCard>`, which manages its own independent
   `useState(0)`). This is the single highest-leverage fix: thread an `initialSelectedDay` prop into
   `PlanCard` and seed its internal state from it. Every other "now" gap (temporal badges, the Navigate FAB,
   the "Live today" pill) already works correctly *once you're on the right day* — they just never get
   the chance to fire on open.
2. **Give the full-card hero a real "Active" state.** `HeroSection.tsx:51-54` computes `statusLabel` from
   `daysUntil` only — a mid-flight trip (`daysUntil <= 0`) always falls through to the generic **"Planning"**
   label, live-confirmed in the screenshots below even on today, Day 2 of 3. The dashboard summary card
   (`PlanCard.tsx` → `getSummaryStatusLabel`, lines 79-90) already has the correct `now >= start && now <= end
   → "Active"` logic three lines away — port it into `HeroSection`.
3. **Collapse Change History by default and demote it below Activities on mobile.** `showChanges` defaults to
   `true` (`PlanCard.tsx:707`) and `SectionTabs`/`ChangeLogPanel` render **above** the activity list
   unconditionally — so a brand-new or quiet trip spends a full amber panel's worth of the first mobile
   screen on "No changes yet" before the traveler ever reaches today's activities. Default it collapsed;
   the existing toggle button already exists to reopen it.
4. **Give every geocoded activity — not just the single "up next" one — a tap-to-navigate affordance.**
   The Navigate FAB (`ActivitiesSection.tsx:585-606`) is real and correctly gated on valid coordinates, but
   it is **one FAB for one activity** (`upNextIndex` on the live day only). A past or future-day activity
   with real `lat`/`lng` has zero maps affordance on its row — confirm-tap-to-navigate should live per-row
   (same `openInMaps` call, same coordinate guard, just attached to each activity instead of only the FAB).
5. **Give the itinerary a real "can't reach the server" state instead of silently degrading to the marketing
   homepage.** A failed API call while the SPA shell is already loaded currently falls through the app's
   auth-gate logic straight to `/` with a "Sign in to continue" modal stacked over the public marketing page
   (live-reproduced below) — worst possible failure mode for a traveler with a network blip mid-trip. This
   doesn't need offline infra (see §5) — just an explicit network-error branch that says "can't reach
   Traveloure, retry" instead of behaving like an expired session.

---

## 1. "Now" orientation — gap table

| Capability | Status | Evidence |
|---|---|---|
| Card opens focused on **today's day** (not Day 1) | **Absent** (dead code found, not missing code) | `PlanCard.tsx:705` — `const [selectedDay, setSelectedDay] = useState(0)`, always. `trip-details.tsx:122,150-160` — a correct today-detecting `useEffect` sets a **page-level** `selectedDay` that is declared and updated but **never read anywhere else in the file** (`grep selectedDay` → 1 hit, its own declaration). It is not passed to `<PlanCard days={planCardDays} … />` (`trip-details.tsx:706-711`, no `selectedDay`/`initialSelectedDay` prop exists on `PlanCardProps`). Live-confirmed: opening the trip today (mid-flight, Jul 29 of a Jul 28–30 trip) renders with **`D1` selected** (`day buttons state: [{"text":"D1…","selected":true}, {"text":"D2…","selected":false}, …]`), screenshot `01-open-defaults-to-day1.png`. |
| "Live today" badge, now-line, Up Next badge | **Exists, correct — but unreachable on open** | `ActivitiesSection.tsx:301-330` (`isLiveDay`, `computeTemporalStates`, `upNextIndex`/`lastPastIndex`, `showNowLine`) is genuinely well-built: re-evaluates every 60s (`setInterval`, line 294-297), correctly derives past/upcoming/future per activity from real `startTime` + a 90-minute assumed duration. Live-confirmed working **once Day 2 is manually tapped**: `badge-live-day` count 1, `now-line` count 1, `badge-up-next-*` count 1 (`day2-today-selected.png`). Gated entirely behind item 1 above — it just never gets the chance to render on open. |
| Auto-scroll to "now" within a busy day | **Absent** | No `scrollIntoView` targeting `upNextIndex` anywhere in `ActivitiesSection.tsx`. A day with several completed items before "now" requires manual scrolling past all of them; only `DaySelector.tsx:16-21` auto-scrolls (its own day *tab* into view, not the activity list). |
| Card-level "what's next" affordance independent of day tab | **Absent** | No cross-day "next up" surfacing anywhere in the card — the only forward-looking element is the single FAB scoped to the currently-viewed live day (see §2). |

**Verdict:** the temporal engine itself is well-designed and correct (confirmed live). The command-center gap is
entirely a **wiring** problem — a fix already half-written at the page level, never connected to the card.

## 2. Actionable rows — what each row offers on tap, today

| Row affordance | Status | Evidence |
|---|---|---|
| Tap-to-navigate (maps deep link) — **current/next activity** | **Exists** | Sticky "Navigate ↗" FAB, `ActivitiesSection.tsx:585-606`, calls `openInMaps` with the activity's `lat`/`lng`/`mapsUrl`; correctly guarded on `hasValidCoords \|\| mapsUrl` so an uncoordinated item renders no dead button (§13-clean). Touch target measured 137×44px (`button-navigate-fab`) — meets the 44px guideline. Only ever shows for `upNextActivity` on the live day. |
| Tap-to-navigate — **every other row** (past/future/other-day) | **Absent** | No `onClick`/maps affordance on the row `<div>` itself (`ActivitiesSection.tsx:427-568`); only the "mark visited" circle and the expert-note disclosure are interactive there. A Day 3 activity with real Kyoto coordinates (confirmed present in the API response) has literally no tap target that opens it in Maps ahead of time. |
| Tap-to-navigate — **transport legs** | **Exists, but data-source-gated** | `TransportConnector` (`ActivitiesSection.tsx:120-266`) has a correct "Open in Maps" button (line 219-229) plus a per-mode picker that also opens Maps on selection (line 244). But leg data comes from `plancardData.days[].transports`, sourced server-side from `itinerary_variant_items`/AI-comparison variants (`plancard.routes.ts:180-198, 263-289`) — **not** from plain manually-built itinerary items. A trip built the ordinary way (as this audit's fixture was, matching a typical traveler's own-added items) has **zero transport legs** and this entire, otherwise-solid UI never appears. |
| Vendor phone tap-to-call | **Absent — data exists, never surfaced** | `vendor_contracts.vendor_phone` (`shared/schema.ts:3077`) exists and can link off an itinerary item via `vendorContractId` (`shared/schema.ts:3198`), but `plancard.routes.ts`'s activity mapping (lines 238-262) never reads `vendorContractId` or joins to `vendor_contracts` at all — no phone number ever reaches the client. Confirmed via grep: zero references to `vendorPhone`/phone anywhere in `components/plancard/*`. |
| Booking confirmation / tracking number on the row | **Absent — data exists, never surfaced** | `itinerary_items.confirmationNumber` and `.bookingReference` (`shared/schema.ts:3203-3205`) exist as real columns but are **not mapped** into the plancard activity response (`plancard.routes.ts:238-262` emits `id, time, name, location, type, status, cost, lat, lng, expertNote, comments, suggestedBy, changes` — no confirmation/reference fields). Grep of `components/plancard/*` confirms zero client references. |
| Mark-as-visited toggle | **Exists, works, but under-sized** | `ActivitiesSection.tsx:410-417, 462-469` — persists to `localStorage` per trip/day/activity, purely local (no server write — fine for a personal checklist). Touch target measured **16×16px** (`button-visited-*`) — well under the ~44px one-handed mobile guideline; the easiest, most "street-use" interaction on the whole card is also its smallest hit target. |
| Per-activity comment count / "N comments" | **Exists as a counter only** | `ActivitiesSection.tsx:548-557` renders a comment count with `cursor-pointer hover:underline` styling but **no `onClick` handler at all** — a dead-looking-live control (styled as tappable, does nothing). |
| Expert tip disclosure | **Exists, works** | `ActivitiesSection.tsx:515-546` — real per-activity `expertNote` (migration 152 column, confirmed populated end-to-end), expand/collapse, no fabrication. |

## 3. Help reachability — escalation, message-expert, emergency contact

| Path | Reachable? | Evidence |
|---|---|---|
| **"Request expert" / AI Plan Polish** (`EscalationCTA`) | Reachable on the Itinerary tab, but this is a **paid, queued request** — not live help | `PlanCard.tsx:1023-1042` renders it after both upsell slots, near the bottom of the card. It posts an `expert_request` (`EscalationCTA.tsx:104-141`) with an ETA of hours, not a chat. Live-measured position: **y≈1620px**, i.e. below the fold on a 844px viewport even after the page's own hero — requires ~2 screen-heights of scroll from card-open. |
| **"Message expert"** | **Reachable in 1 tap — but only after an expert is already assigned and has accepted** | `trip-details.tsx:845-850` — the button only renders when `advisor.status === "accepted"`. On a fresh/typical trip (no advisor yet — the realistic state for most trips), tapping "Ask an Expert" (1 tap from Itinerary) shows only "Add a local expert" / "Work with a Trip Planner" (screenshot `06-ask-an-expert-tab-no-advisor.png`) — both start a new matching/request flow, not a conversation. Live-confirmed: `button-message-expert` count = 0 on this tab in that state. |
| **Emergency contact** | **Absent from the traveler surface entirely** | `trip_emergency_contacts` table + `GET /api/trips/:tripId/emergency-contacts(/by-type)` + `POST` (`server/routes/trips.routes.ts:1629-1649+`) are real and live server-side. The only client component that reads them, `client/src/components/logistics/emergency-response.tsx`, has **zero importers anywhere in the app** (confirmed via grep) — it is dead UI. There is no SOS/emergency affordance anywhere in the dashboard layout, trip page, or PlanCard (grep for "Emergency"/"SOS" across layout/dashboard components: no matches). A traveler in a real emergency has no in-app path at all today. |

**Taps from card-open to a genuine live "talk to a human" action, in the realistic (no-advisor-yet) case: infinite** —
the only reachable action is *starting* an expert-request/matching flow, which is not help *right now*.

## 4. One-thumb ergonomics at 390×844 (live-measured)

| Element | Measurement | Assessment |
|---|---|---|
| Day selector (`DaySelector.tsx`) | Not `position: sticky` anywhere in its className (`flex gap-1 px-4 pt-3 overflow-x-auto`) | **Not sticky** — scrolls away with the page; live-confirmed by scroll-position screenshots (the selector is only ever visible where its normal document flow places it). |
| Bottom actions (Maps / View Itinerary) | `button-open-maps-*`, `button-view-itinerary-*`: y≈1734px, height 32px each | **Not bottom-fixed** — they're the last thing in the document flow of a ~1900px-tall page, not pinned to the viewport bottom; on a 3-day trip they require scrolling to the very end of the card to reach (screenshot `08-bottom-action-bar.png`). "View Itinerary" is additionally a no-op here — it links to `/itinerary/:id`, which redirects right back to the page already showing (`App.tsx:502-504`). |
| Mark-visited toggle | 16×16px | Below the ~44px one-handed touch guideline (Apple HIG / WCAG 2.5.5 AAA). |
| Tab triggers (`tab-itinerary` etc.) | 32px height | Below the 44px guideline (adequate width, tight height). |
| Card/Map view toggle buttons | 32px height | Same. |
| Day-tab buttons (`button-day-N`) | ~62-68×56px | Comfortable. |
| Navigate FAB | 137×44px | Meets the guideline. |
| **3-day card height** | Full page (including the page's own hero/tabs) ≈**1887–2100px ≈ 2.2–2.5 viewport-heights** for a light 8-activity/3-day trip; a heavier day (5+ items) would push this further, with no collapse of past items to compensate. | Moderate for this light dataset, but every scroll-cost item above (non-sticky day nav, non-fixed bottom bar, always-open Change History) compounds against it. |
| Map / Transport / Stats position relative to day list | Map (`MapControlCenter`) is a **separate top-level view** (Card View / Map View toggle, `PlanCard.tsx:905-928`), not inline with the day list; Transport is a **tab within Activities**, sharing the day scope. Both sit below the day selector, above the activity/transport body. | Coherent placement; the Map view degrades gracefully to a labeled placeholder with working Google/Apple Maps + "Add to Calendar" buttons when `VITE_GOOGLE_MAPS_API_KEY` is unset (screenshot `05-map-view-toggle.png`) — no fabricated map, §13-clean. |
| **Redundant chrome before content** | The full-stage `PlanCard` renders its **own** hero (destination photo, title, dates, budget, share/delete controls — `HeroSection.tsx`) directly beneath `trip-details.tsx`'s **own**, nearly-identical page-level hero (screenshot `02-fullpage-day1-default.png`: two "Mobile Lens Kyoto Trip / Kyoto, Japan / Jul 28–30, 2026" blocks stacked, ~430px + ~250px). | On a 390px-wide phone this is a meaningful, avoidable scroll tax before a traveler reaches Day 1 at all. |
| Always-expanded Change History | `showChanges` defaults `true` (`PlanCard.tsx:707`) | Pushes real activity content down by a full panel's height even when it reads "No changes yet" (see recommendation 3). |

## 5. Network resilience

- **No service worker, no PWA manifest, no offline caching** — confirmed by grep: zero hits for
  `serviceWorker|workbox|navigator.serviceWorker|manifest.json` in `client/src`, `client/index.html`,
  `client/public`. No `<link rel="manifest">` or SW registration anywhere.
- **No online/offline detection UI** — grep for `navigator.onLine|useOnlineStatus|isOnline` across
  `client/src` returns only two incidental comment/best-effort references in `trip-context.ts` (server-sync
  fallback wording), nothing surfaced to the traveler.
- **React Query is configured `retry: false`, `staleTime: Infinity`, `refetchOnWindowFocus: false`**
  (`client/src/lib/queryClient.ts:90-103`) — once a query succeeds it never silently refreshes, which is
  accidentally resilient to *brief* blips while the tab stays open (stale cached itinerary keeps rendering),
  but there is no retry and no explicit error UI wired for the plancard-scoped queries (`PlanCard.tsx:730-734`
  destructures only `data`, never `isError`).
- **What actually breaks, live-reproduced:** on a **cold load** with all `/api/**` calls blocked (the
  realistic "just opened the app with a bad signal" case), the SPA's auth check fails, the router falls
  through the app's normal unauthenticated path, and the traveler lands on `/` — the **public marketing
  homepage** — with a **"Sign in to continue" modal** stacked on top, indistinguishable from "you were logged
  out" (screenshot `07-network-failure-dumps-to-homepage-login.png`; confirmed final URL is `/`, not an error
  state on `/trip/:id`). There is no "can't reach Traveloure, retry" state anywhere in this path.
- On a **warm** page (data already in memory) with a subsequent full network cut, the app doesn't crash —
  cached data just keeps rendering (an accidental benefit of `staleTime: Infinity`), but a genuine reload
  (app killed and reopened, common on mobile) re-triggers the cold-load failure above.

## 6. What exists that a command center wants (build on, don't rebuild)

| Capability | Status | Notes |
|---|---|---|
| Server-persisted, resolve-on-write geocoding | **Genuinely solid** | `plancard.routes.ts:20-47` (`resolveMissingItemCoordinates`) geocodes once, persists to the row, bounded per-request (`MAX_PER_REQUEST=12`) so a cold trip can't stall the response; the client never geocodes (`MapControlCenter.tsx:51-54` comment + code confirm). |
| Multi-day map with routes, pins, expert-note pins, layer toggles | **Genuinely solid** | `MapControlCenter.tsx` — real polylines colored by transport mode, per-pin `InfoWindow`, a dedicated amber "Expert Notes" pin layer, Activities/Transport/Expert-Notes layer toggles with live counts, and — independent of whether the interactive map itself can render — always-available **"Open in Google Maps" / "Open in Apple Maps" / "Add to Calendar" (.ics export)** buttons for the whole day's stop sequence (`handleGoogleMaps`/`handleAppleMaps`/`handleAddToCalendar`, lines 305-367). This is exactly the kind of "plan the whole day into your phone's native tools" affordance a command center wants, and it already works today. |
| Transport leg mode-switching + booking-source badges | **Solid, but gated to AI-variant trips** | `TransportSection.tsx`/`TransportConnector` — optimistic mode PATCH with rollback, "Book on Traveloure" vs. "via {partner}" badges, per-leg Maps deep link. Only populated when a trip has gone through the AI itinerary-comparison pipeline (see §2) — most manually-built trips never see it. |
| Per-activity expert notes | **Solid** | Durable `expertNote` column (migration 152), rendered as an expandable tip inline and as a distinct map pin layer; correctly scoped to the trip owner (the yesterday audit's leak finding was on the *share* surface, not this one). |
| Live temporal state engine | **Solid** | See §1 — correct, self-updating, just unreachable on open. |
| Change log / activity history | **Exists, correct after yesterday's fix, but low-value real estate use** | `ChangeLogPanel.tsx` now reads the right field; the gap here is placement/default-state (§4/recommendation 3), not correctness. |
| Emergency contacts | **Backend-only, no consumer** | See §3 — real schema + endpoints, dead client component, zero reachability. |
| Booking confirmation numbers / vendor phone | **Backend-only, no consumer** | See §2 — real columns, never mapped into the plancard response or rendered. |
| Escalation to a human | **Exists as a paid async request, not live help** | See §3. |

---

## Recommended build program

### Ratification-free (pure improvements — no schema, no notifications, no offline infra, no structural change)

1. Thread the page's already-computed "today" day index into `PlanCard` (new optional `initialSelectedDay`
   prop, seed `useState` from it) — closes the single biggest gap in §1.
2. Port `PlanCardSummary`'s correct `now >= start && now <= end → "Active"` status logic into `HeroSection`'s
   `statusLabel` computation (currently future-only).
3. Default `showChanges` to `false` on the full-stage card (or gate the default on `changeLog.length > 0`),
   and/or move the `ChangeLogPanel` below the activity list on mobile widths.
4. Extend `openInMaps`/`hasValidCoords` tap-to-navigate to every activity row with real coordinates, not only
   the single live-day FAB target — same helper, same guard, attached per-row.
5. Enlarge the mark-visited toggle's hit area to ~44×44px (visual dot can stay small; hit target should grow
   via padding, matching how `button-navigate-fab` already sizes correctly).
6. Wire the comment-count control's `onClick` (currently styled interactive, does nothing) or remove the
   pointer/hover affordance if comments aren't meant to be tappable from here.
7. Add a genuine network-error branch (distinct from "not signed in") so a failed API call surfaces "can't
   reach Traveloure — retry" instead of falling through to the public homepage + login modal.
8. Map `itinerary_items.confirmationNumber`/`bookingReference` into the `plancard.routes.ts` activity
   response and render them on the row when present — real data, currently computed and stored but never
   surfaced; no fabrication risk since it renders only when the column is non-null.
9. Fix "View Itinerary" at the bottom of the full-stage card — it currently links back to the page it's
   already rendering (`/itinerary/:id` → redirect → same `/trip/:id?tab=itinerary`); either remove it in this
   context or repoint it somewhere additive.
10. Consider a stub "Emergency" entry point that at minimum surfaces the concierge/expert escalation and any
    trip-level emergency contacts *that already have data* — do not fabricate contacts; if
    `trip_emergency_contacts` has no rows for a trip, show nothing rather than a placeholder (§13 discipline).
    Full design of an SOS flow is a structural decision (see below) — this item is scoped to *wiring the
    existing dead component to real data*, which is ratification-free; making it a persistent/sticky
    command-center element is not.

### Decision-needed (schema, notifications, offline infra, or structural/format changes — CLAUDE.md §17 routes
these through the Client-channel distribution format as the ratified home for structure changes)

1. **Sticky day selector / sticky bottom action bar** — a real layout/structure change to the card, which
   §17 explicitly scopes the Client channel (`embedded` Trip Card format) as the ratified home for. Flagging
   the gap here; the fix itself needs that format decision, not an ad hoc CSS change.
2. **Per-row tap-to-call for vendor phone** — the data path doesn't exist yet (`plancard.routes.ts` would
   need to join `vendorContractId → vendor_contracts.vendor_phone`); low-risk to build (existing FK, existing
   column) but touches the plancard response shape, so scope it deliberately rather than bundling into a
   "pure improvement" pass.
3. **Live "how far away / how late" status** — nothing in scope today computes real-time distance-to-venue or
   ETA; do **not** build a fake "12 min away" without a real location signal (§13 discipline) — this needs a
   device-location or transit-API decision before any UI is built.
4. **Offline/PWA caching** — genuinely absent (§5); a real investment (service worker, cache strategy for the
   plancard payload) — decision-needed by definition, not a CSS/wiring fix.
5. **A true "message my expert" reachable before an advisor is assigned** — today's model requires an
   accepted advisor first; making live help reachable earlier (e.g., a general concierge chat) is a product/
   routing decision (touches the Concierge/booking-actions flow), not a plancard-local fix.
6. **Emergency contact as a first-class, always-reachable command-center element** (vs. the ratification-free
   "wire it if data exists" item above) — deciding where it lives structurally (sticky header icon? dedicated
   tab?) is a structure change under §17.

---

## Method & cleanup

Server: `service postgresql start` (already provisioned `traveloure_b2` DB, reused — not recreated); then
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure_b2 SESSION_SECRET=verify-secret
STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY] AMADEUS_API_KEY=dummy AMADEUS_API_SECRET=dummy PORT=5000 npx tsx server/index.ts`,
stopped at the end of the session (`kill` on the background process). Account used:
`test-traveler-kyoto@traveloure.test` / `TestPass123!` (pre-existing seed account).

**Fixtures created and deleted** (confirmed removed by post-cleanup `SELECT count(*)` on each table):
- Trip `565fc786-3ce1-49d8-962c-4ab7390e8c7c` ("Mobile Lens Kyoto Trip", Jul 28–30 2026, spanning "today"
  Jul 29 as the middle day) — deleted via `DELETE /api/trips/:id` (204), which cascade-deleted its 8
  `itinerary_items` rows and its `generated_itineraries` row (verified: all three `count(*)` queries return 0
  post-delete).
- A matching `generated_itineraries` row was created directly via `POST /api/generated-itineraries` (the
  surface `trip-details.tsx` actually renders from — distinct from the `itinerary_items`-backed
  `/api/trips/:id/plancard` endpoint the previous audit used standalone) so the live drive exercised the real
  traveler-facing page, not just the API. Same cascade-delete covered it.

Screenshots referenced above live alongside this report in `docs/audits/plancard-mobile-assets/`.
