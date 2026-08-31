# Trip Slip (PlanCard) — Feature, Styling & Behavior Specification

> Reference for the Traveloure **Trip slip** — the PlanCard subsystem. One canonical component
> set (`extend-never-fork`) renders a single server DTO (`GET /api/trips/:tripId/plancard`) across
> every surface: the dashboard summary card (`stage="summary"` on `/dashboard`), the full trip card,
> the `/plans/:tripId` Slip, and the optimizer proposal columns. All surfaces share the query key, so
> React Query dedupes.
>
> **Two-surfaces model (Trip Card rebuild, Sep 2026 — ledgers `2026-08-31-two-surfaces-one-handoff`
> … `-stage-a-dashboard`):** the full card is now specifically the **post-final Trip Card** at
> `/trip/:id` — the frozen `trip_finals` snapshot joined to live booking status — while a pre-final
> `/trip/:id` renders an honest "Not final yet → slip" notice, not a control center; live planning
> happens on the **Slip** (`/plans/:tripId`). "Make final" writes a versioned immutable `trip_finals`
> snapshot; `finalVersion` (null pre-final) is emitted on the DTO. Accepting a suggestion, adopting a
> stop, or **buying a service mid-trip** on a currently-finalized trip auto-forks the next version
> (`reFinalizeIfCurrentlyFinal`), so the card advances without a manual re-final.
>
> Sections: **1. Features · 2. Styling · 3. UI Behavior & Editability** (the lifecycle a screenshot pass can't capture).

---

## 1. Features

### Orchestration
- **PlanCard** — family entrypoint; switches on `stage` (`summary`/`full`/`proposal`) and `role` (`owner`/`expert`/`friend`/`viewer`). Owns day/section/view‑mode state. `embedded` prop suppresses traveler chrome inside the expert Workstation.
- **Summary card** — compact dashboard card: photo header, concierge module, chips (services / legs / expert / AI‑optimized + savings + staleness), advisor strip, action items, "Have an expert polish this" CTA + `ExpertPolishDialog`.

### Hero & at‑a‑glance
- **HeroSection / PlanCardHeader** — photo hero + scrim, date‑derived status pill (Active / "N days away" / Upcoming / Planning), "Final" chip, travelers + Traveloure‑score badges, Share/Export, cost & per‑person.
- **MetricStrip** — shared N‑up figure strip giving summary→full continuity.
- **StatsRow / OptimizerMetrics** — Days/Activities/Legs/Time grid + optimizer badges (score, cost, savings, wellness minutes, distance, star delta); server‑derived, renders nothing when empty.
- **UpNextHero** — mobile "Up next" for the live day: countdown, next activity, meeting point, expert tip, mode‑aware action (Navigate / booked‑ride pickup / Book this ride). Self‑hides when nothing is live (§13).

### Day navigation & itinerary body
- **DaySelector** — day chips with a real‑date "today" dot, past‑day dimming, per‑day energy badge.
- **SectionTabs** — Activities/Transport switcher with per‑day counts + confirmed/total progress; locks Transport while a day has pending activities.
- **ActivitiesSection** — the itinerary spine: activity rows with type/status badges, timeline dots, navigate‑to‑Maps, vendor phone/confirmation (real data only), collapsible Expert Tip, per‑item comments, affiliate book button, "now line" + Up‑Next badge. Exports the reusable **RoutingBadge / RoutingActions**; contains `TransportConnector` (inline per‑leg mode picker).
- **TransportSection** — per‑day legs with a booking‑source badge ("Book on Traveloure" vs "via {partner}") and a mode selector.
- **CollapsedSections** — collapse‑by‑default accordions: expert note, map preview, transport, budget (spend bar), purchases, change history — each shows only with real content (§13).
- **plancard-temporal** — the "what's next right now" engine (60s tick, visited‑tracking, countdowns, coord validation).

### Map
- **MapControlCenter** — full Google Maps view with server‑resolved pins (no client geocoding), activity/transport/expert‑note layers, day switcher, open‑in‑maps/calendar.

### Optimizer / proposals
- **ProposalColumn** — a **read‑only** optimizer variant as a compact day‑ordered column; purchased items pinned with the same pill everywhere; "Recommended" chip; anchor line; muted transport summary; a single Apply button.
- **BuildAroundDialog** — the anchor picker: Auto (AI scores hotels/neighborhoods/activities) or pin your own, candidates scored by walk‑minute median; confirms the **paid** optimization before anything runs.

### Concierge / expert / governance
- **ConciergeModule** — "Ask the Concierge" revenue card. **EscalationCTA** — "AI Plan Polish" expert escalation (offering + availability, bookable‑now vs queued).
- **PlanApprovalBanner** — the delivery handshake: "your expert delivered this — Approve / Request changes," or a quiet "approved" chip; renders nothing otherwise (§13).
- **ChangeLogPanel** + **ItemComments** — change history with role‑colored dots; shared per‑item comment threads.

### Actions / commerce
- **BottomActionBar** — mobile fixed bar: Map / Message‑expert‑or‑Get‑help / Share (≥44px, safe‑area inset).
- **PlanCardUpsellSlot** — window‑gated upsell (pretrip "what's missing" / ontrip "near you").
- **AffiliateBookButton** — "Book via your Traveloure agent," self‑hiding unless the server stamped the affiliate booking. *(Inert today — Phase 2b server lane pending.)*

### The Slip surface
- **SlipView** — header (tracking ref + version + phase chip + Optimized badge), status strip (routing‑status counts, zero segments omitted), expert‑note block, item rows (routing pill + anchor glyph + "fixed point"), logistics rows ("added by optimizer"), transition‑log diary footer, finalized‑primacy banner, and **SlipActions** (Share · Preview Trip Card · Add all to checkout · Optimize · Finalize).
- **slip-proposal-preview.ts / slip-plan-actions.ts** — pure delta math (money / drive‑time, `null` when unknown) and plan‑level actions (count optimizable items, honest disabled reasons, bulk route‑to‑checkout).

**Cross‑cutting honesty:** §13 omit‑when‑unknown everywhere · §16 affiliate rail (opaque server token, never a raw partner URL / `window.open`) · all money & geocoding server‑derived · "booking presence = booked state" · routing edges limited to what the `/route` endpoint grants the actor.

---

## 2. Styling

### Routing‑status token layer (`client/src/components/plancard/slip-tokens.ts`)
The single home of these hex values — components read tokens, never re‑declare hexes.

| Status | fg | bg (`+26` ≈15%) | border (`+59` ≈35%) | label |
|---|---|---|---|---|
| `with_expert` | `#2E8B8B` teal | `#2E8B8B26` | `#2E8B8B59` | "With your expert" |
| `ready_for_checkout` | `#E8B339` gold | `#E8B33926` | `#E8B33959` | "In checkout" |
| `purchased` / `booked` | `#5DCAA5` green | `#5DCAA526` | `#5DCAA559` | "Purchased" / "Booked" |
| `in_planning` | — (neutral outline, theme classes) | — | — | "Planning" |

- **Derived tints:** `BOOKED_TINT` and `OPTIMIZED_TINT` reuse the purchased green; `EXPERT_NOTE_TINT` reuses the `with_expert` teal.
- **Mechanism rule (why the module exists):** pills are built from an **inline `style`** (`tintPillStyle`), **never** Tailwind JIT/arbitrary‑value classes — the JIT purge can't see classes assembled from constants. One canonical trip → the same pill on every surface (ruling 8).
- **Pill base:** `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide`. Icons: Users (with_expert) / ShoppingCart (ready_for_checkout) / BadgeCheck (purchased). Logistics = muted outline "logistics" pill, never a routing pill.

### Palettes
- **Slip title:** `font-display` token. *(Fraunces was requested in the dispatch but isn't in the app's loaded font set, so the title rides the existing `--font-display` token rather than adding a dependency.)* HeroSection's full‑stage title uses `DM Serif Display`.
- **Dashboard summary + slip strip (inline warm neutrals):** `#1A1A18` ink · `#7A7A72` muted · `#E8E8E2` hairline (0.5px) · `#FAFAF8` strip bg · coral `#E85D55` primaries · `#5DCAA5` advisor‑online dot · 14px card radius. Summary chips are color‑coded (services blue, transport green, expert indigo, AI‑optimized amber with a stale variant).
- **BuildAroundDialog** uses the console `--earn-*` variables — `--earn-teal #2E8B8B` (same hue as routing teal), `--earn-coral-ink #E85D55` on the confirm button, plus `--earn-border`, `--earn-ink`, `--earn-muted` — light + dark.
- **Expert notes = two styles, one system:** the SlipView note is a **teal** left‑inset (`border-l-2`, `#2E8B8B` label); the per‑item / trip "From your expert" tips are an **amber** inset (`border-amber-200 … bg-amber-50`, 💡 glyph).
- **Over‑photo chrome:** `bg-white/15` + white borders + a dark bottom scrim (`from-black/80 via-black/40`). Traveler surfaces use shadcn theme tokens (`bg-card`, `border-border`, `text-muted-foreground`, `text-primary`); mobile targets `min-h-11` with safe‑area insets.

---

## 3. UI Behavior & Editability

This is the part static screenshots miss: **what is editable, when, by whom, and how the optimized versions persist.** Two families, one DTO — the **original itinerary** (`ActivitiesSection` inside `PlanCard stage="full"`, and `SlipView`) and the **optimized proposals** (`PlanCard stage="proposal"` → `ProposalColumn`, on `/itinerary-comparison/:id`).

### 3.1 The original itinerary IS editable
The owner (and a **write‑access** advisor) acts on their own plan items:
- **Per‑item routing** — `RoutingActions` (one implementation, reused by ActivitiesSection and SlipView rows) → `POST /api/trips/:tripId/items/:itemId/route`. Owner edges: `in_planning → with_expert | ready_for_checkout`, and recall `with_expert → in_planning`, `ready_for_checkout → in_planning`. An assigned expert gets exactly **one** edge (`with_expert → in_planning`). `purchased`/booked rows and rows with no `routingStatus` expose no actions.
- **Add‑all‑to‑checkout** — SlipView bulk‑loops that same per‑item endpoint over `in_planning` items only.
- **Transport‑mode change** — `TransportConnector` → `PATCH /api/transport-legs/:id/mode` (optimistic, rollback on failure).
- **Item CRUD** (create / edit / delete / reorder) exists server‑side — `POST|PATCH|DELETE /api/trips/:tripId/itinerary-items[/:itemId]`, reorder handler — each gated by `canMutateTrip`. *(The slip/PlanCard rows themselves surface routing + transport‑mode + visited‑toggle; full inline activity CRUD is driven by the editor surfaces that consume those endpoints.)*
- **§12 write gating** — `getTripWriteRole` grants write to advisors only when **accepted/assigned, not pending**; a pending advisor → 403. **Origin is stamped server‑side** from the actor's role (`traveler`/`expert`), AI rebuilds stamp `ai`; PATCH strips `origin`/`suggestedBy`/ids from the body (no mass‑assignment).

### 3.2 The optimized versions are READ‑ONLY (in review)
`ProposalColumn` is deliberately read‑only: *"ApplyButton is the ONLY action. NO routing actions, NO per‑item apply, NO save‑for‑later."* Each column shows day‑grouped rows — anchor (purchased) rows with the anchor glyph + purchased pill, variant rows as name/time/price text — a muted server‑computed transport summary, and **one** Apply button. `PlanCard` sends `stage="proposal"` straight to `ProposalColumn` with **no plancard fetch and no routing actions**.

> ⚠️ **Mock vs. shipped code — two divergences to know:**
> 1. **No per‑stop "+" adopt tick.** The `adopt-optimization-mock.html` shows `+` ticks to pull a single stop across. **That is not implemented** — the shipped review UI is whole‑plan Apply only. The per‑stop glyph in code is the informational anchor marker, not an adopt control.
> 2. **Versions are not "their own trips."** The mock/copy says each version is "saved as its own trip." In the data model they are **`itinerary_variants` rows under one `itinerary_comparisons` row**, attached to the single existing trip — persisted *proposals*, not independent editable trips.

### 3.3 How the versions persist
`itinerary_comparisons` (one row, nullable `tripId` → the ONE trip) → `itinerary_variants` (child rows; `source` = `user` | `ai_optimized`, `optimizationScore`, anchor fields) → `itinerary_variant_items` + `itinerary_variant_metrics`. `generateOptimizedItineraries` (the sole writer) writes **only** these variant tables — it never touches the trip's `itinerary_items`. Variants are reachable at `/itinerary-comparison/:id`, individually shareable, and the page polls while `status === "generating"`.

### 3.4 Adopt / keep mechanics
- **Adopt a whole version** — client `applyVariantMutation` = `select { variantId }` → `apply-to-trip` → navigate to the slip. Server `apply-to-trip` runs one **atomic transaction**: it deletes **only `in_planning`** items, **keeps** `with_expert` / `ready_for_checkout` / `purchased` rows, dedupes and inserts the chosen variant's items as ordinary `itinerary_items` (`origin: "ai"`, routing `in_planning`), writes a `variant_applied` diary row, stamps `optimizedAt` + `selectedVariantId`, and **discards the losing variants**. So adopting **mutates the SAME trip in place** — it does **not** create or switch to a new trip. Copy states it verbatim: *"Applying a variant updates the slip in place — the other two are discarded. Nothing is purchased by applying."*
- **Original preservation** — not a separate snapshot; only the `in_planning` subset is replaced. Purchased/with‑expert/checkout rows (the "anchors") survive untouched. **Nothing is charged by adopting** — the optimization *fee* is a separate, earlier gate (§3.6).
- **Keep the original** — the baseline column's "Keep this plan" re‑applies the `source==="user"` baseline (a no‑op‑equivalent); navigating away also keeps it, since nothing applies until Apply is confirmed.
- **Guest/cart flow** is a separate legacy path (`apply-to-cart` + BookThisTrip cards) that adds to cart, not to a slip.

### 3.5 After adopt
Applied variant items become **ordinary `itinerary_items`** with `origin:"ai"` and routing `in_planning` — therefore **fully editable** like any item (routing, transport‑mode, CRUD in §3.1). The applied variant + metrics are retained so the plancard/dashboard can read move‑rationale. **Non‑adopted versions are discarded** (cascade removes their items/metrics/legs) — **except** a variant referenced by a live `shared_itineraries` link, kept so the share URL survives. Discarded versions do **not** remain independently editable.

### 3.6 The review‑first boundary (the refactor)
*"Optimize builds proposals; nothing is applied until you choose"* is enforced at the route boundary:
- **Generation writes nothing to the trip.** `POST /api/itinerary-comparisons/:id/generate` runs the pay/free‑rerun gate, returns `{ status: "generating" }`, then generates variants in the background — it never deletes/inserts `itinerary_items`.
- **Application is the ONLY trip writer** — the delete/insert lives exclusively in `apply-to-trip`.
- **The slip's Optimize deliberately does NOT auto‑apply** — `SlipView.runComparison` navigates to the review page *without* `?autoApply=1` (ledger `2026-08-22-slip-optimize-review-first`). The legacy `autoApply=1` path (old mutate‑in‑place) is now confined to the cart flow.
- Traveler‑facing copy makes it explicit: *"Nothing changes until you apply one — pick the trade‑off that fits, or keep your plan as is."*

### 3.7 Known gaps / TODOs (from code comments)
- **Trip segmentation is recommendation‑only** — displayed & persisted, **no apply action yet** ("Coming soon… nothing here changes your plan").
- **Applied‑variant move metadata is lost on apply** — SlipView shows no per‑item "day 1 → day 5 · rationale" because apply doesn't persist variant move metadata onto `itinerary_items`.
- **Shared losing variants can go stale** — a losing variant kept alive only by a share link has no "outdated proposal" treatment yet.
- **Booking/vault‑token fields are inert** — `bookingToken` and forward‑compat booking fields are undefined today; `AffiliateBookButton` renders nothing until the Phase 2b server lane lands.
- **Route‑shadow caveat** — the live `POST …/generate` is the inline `routes.ts` copy that shadows the `trips.routes.ts` router copy; anchor‑write changes must land on the inline handler.

---

*Source of truth is the code (`client/src/components/plancard/*`, `client/src/pages/{slip-view,itinerary-comparison}.tsx`, `server/routes/{plancard,trips,routing}.routes.ts`, `server/itinerary-optimizer.ts`, `shared/schema.ts`). Where this doc and `docs/design/adopt-optimization-mock.html` disagree (the `+` per‑stop tick and "saved as its own trip"), the code above is authoritative and the mock is aspirational.*
