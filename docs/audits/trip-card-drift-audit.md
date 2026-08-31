# Trip Card — drift audit → deletion inventory (Phase 0, read-only)

`audited@a1acea2fa` (origin/main HEAD) · **no code changed** · **HARD STOP — Leon rules on the move-to-slip rows**

> Dispatch: audit four docs + the mock against live code, produce the deletion inventory for the current Trip
> Card row by row, and run the D-1 money-safety exposure check. Rulings `2026-08-31-two-surfaces-one-handoff`
> and `2026-08-31-manifest-is-the-boundary` land in Phase 1. Money-adjacent → `[guarded]`.

---

## TL;DR

- **D-1 is EXPOSED — money-safety.** The destructive Regenerate (`POST /api/trips/:id/generate-itinerary`)
  deletes every `origin='ai'` item **with no booking/checkout guard**, so it can drop a **purchased** or
  **ready_for_checkout** AI stop. **A hotfix leads the build** (§D below). This is live on main today.
- **The PlanCard family is healthy and the manifest largely HOLDS.** Nearly all A/B rows verify (mostly
  relocations); **every 💰 affordance still renders**; the phase-gate metrics are **server-derived** (not
  hardcoded); C1–C4/C6 of Piece 3 are **resolved**, C5 half-built. The rot the dispatch targets is **not** in
  the family — it is in **`trip-details.tsx`'s non-family bolt-ons**.
- **C4 is materially closed** — the four renderers consolidated to `PlanCard` (`stage`/`role`/`embedded`).
  DashboardPlanCard is deleted, ItineraryCard gutted to a types-only module, Workspace bespoke removed. Three
  **dead** files remain to sweep: `itinerary/ItineraryMapView.tsx`, `components/trip-card.tsx`, and
  `ItineraryCard.tsx`'s (already-empty) renderer body.
- **Stage A (`PlanCard stage="summary"`) exists but is mis-mounted** — its only live caller is
  `experience-template.tsx:1949`, **not** the dashboard/My-Plans list. The C4 consolidation the row is supposed
  to show (pre-final planning card → post-final summary) is **not built** — My Plans renders an inline
  `TripCard` list tile instead.
- **The "one DTO" claim is drifted** — three (four) trip shapes: `Trip` (`schema.ts:2359`),
  `PlanCardData.trip` (narrow, `plancard-types.tsx:396`), `SlipTrip` (wide, `SlipView.tsx:83`), plus
  `PlanCardTrip` (`plancard-types.tsx:399`). The shared *query key* holds; the type does not.
- **Delivery model is honest and stays filed** — PWA/service-worker/web-push/SMS-consent/10DLC all genuinely
  absent; A18 "SMS opt-in IN-FLIGHT" is vaporware (no code). No push-channel work in this lane.

---

## §A — Four drift tables

### A1. `docs/planning/plancard-surface-manifest.md`

**~40 A/B/C rows verified; all 💰 affordances render.** Rows that HOLD (with relocations) are summarized; every
**drifted / obsolete / half-built** row is called out.

- **Holds (representative):** A1–A18 summary card, B1–B7 hero/toggle, B11–B26 day/activities/transport/map/
  concierge/upsell, C-SpecA/B/C. Metrics relocated into `PlanCardHeader`→`MetricStrip`; concierge relocated to a
  top module; the AffiliateBookButton (activity level) present-but-inert until server stamps a grounding.
- **B8 StatsRow → `drifted`:** the 4-up `StatsRow` grid is replaced by the hero `MetricStrip`
  (`HeroSection.tsx:78-83`); `StatsRow.tsx` now used only by `itinerary-view.tsx`.
- **B10 EscalationCTA → `drifted`:** submits `requestType:"ai_plan_polish"` + `offeringTypeKey` (not `"review"`);
  `source` nested in `optimizationContext`; gate is `!isViewer`, not strictly owner.
- **B12 SectionTabs → `drifted`:** full stage passes only Activities/Transport; "Changes" moved to
  `CollapsedSections`.
- **B19b per-leg Book → `drifted` (improved):** platform **Book now WIRED** (`bookMutation`
  `TransportSection.tsx:257` → `POST /api/transport-booking-options/:id/book`); affiliate path **no longer
  `window.open`** — routes to the §16 agent rail (`button-book-affiliate`, `POST /api/affiliate-booking-requests`).
- **B21 MapControlCenter → `drifted` (fixed leak):** expert-notes layer reads the `expertTravelerNote` prop, no
  longer fetches the **private** `/api/trips/:id/expert-notes` (leak closed).
- **B24 View-Itinerary bottom-bar → `obsolete`:** deliberately removed as a no-op redirect.
- **B4 Export → `half-built`:** label + nav only, no file export (matches the doc's own flag).
- **A18 SMS opt-in → `holds` (absent):** still no code, as the doc states.

### A2. `docs/design/trip-slip-spec.md`

**Largely holds.** Every §1-named component exists; all §3 editability gates match live code
(`routing.routes.ts:103-175` owner/expert edges, `canMutateTrip`/`getTripWriteRole` §12 gating,
origin/PATCH-strip at `trips.routes.ts:1441/3201`). Drifts:

- **§1 path drift:** `slip-proposal-preview.ts` and `slip-plan-actions.ts` are in **`client/src/lib/`**, not
  `components/plancard/` (the doc's stated home).
- **§3.2 ProposalColumn "Apply-only" → `drifted`/`obsolete`:** a per-stop **"+" adopt tick** shipped
  (`ProposalColumn.tsx:164`, `POST /api/itinerary-comparisons/:id/adopt-stop`, `adopt-stop.db.test.ts`). The
  spec's "no per-stop adopt tick — not implemented" divergence note is now false.
- **"One DTO" → `drifted`:** the three/four trip shapes above.
- **Undocumented new plancard components:** `FinalizeBookingModal.tsx`, `TripPassCard.tsx`,
  `ProposalComparisonMap.tsx`, `primary-action.ts`, `day-map-actions.ts`, `affiliate-booking.ts`,
  `plancard-types.tsx`, `__tests__/`.

### A3. `docs/planning/plancard-mobile-delivery-model.md`

**Honest — every claim holds.** All four delivery-step ✅/❌ marks accurate. **PWA manifest, service worker,
web-push, SMS-consent store, 10DLC/Twilio — all `absent`** (only matches are node_modules/docs/mockups; email is
Resend-only). **A18 "SMS opt-in IN-FLIGHT" → vaporware** (no form field, column, or route). Delivery model stays
filed; no push-channel work in this lane (per "What Not To Do").

### A4. `attached_assets/PLANCARD_SPEC_*.md` (Piece 3) — C1–C6

| # | Claim | Live | Verdict |
|---|---|---|---|
| C1 | 3 map layers, only 2 built (no notes) | `MapControlCenter.tsx:306` all three; notes toggle `:522`, pins `:201`; private-note leak fixed | **resolved** |
| C2 | Accept/reject suggestions; accept-only | `TransportSection.tsx:406` accept + `:418` decline, gated `:536` | **resolved** |
| C3 | Booking badges live in ItineraryCard not PlanCard | `BookingSourceBadge` now in `TransportSection.tsx:20-52`; affiliate via §16 agent rail | **resolved** |
| C4 | One card documented, **4 renderers built** | consolidated to `PlanCard` (`stage`/`role`/`embedded`); the other 3 eliminated (census below) | **resolved** |
| C5 | Maps handoff fragmented (2 libs); no-waypoint `{0,0}` bug | 0,0 fixed (`MapControlCenter.tsx:88-100` fitBounds/geocode); **2 libs still coexist** (`openInMaps` navigate.ts:133 + `openMapsDeepLink` maps.ts:241) | **half-built** |
| C6 | Hero photo via discontinued `source.unsplash.com` | swapped to stable `images.unsplash.com/${id}` (`plancard-types.tsx:150`); "null today" comment stale | **resolved** |

**Renderer census (the deletion-candidate set):**

| Renderer | file | family/independent | alive/dead |
|---|---|---|---|
| PlanCard (+ PlanCardSummary, ProposalColumn) | `plancard/PlanCard.tsx` | Family | **alive** (canonical) |
| SlipView | `plancard/SlipView.tsx` | Family | **alive** |
| ClientFormatView | `build-formats/ClientFormatView.tsx` | wraps PlanCard | **alive** (Workstation only) |
| inline `TripCard` | `my-trips.tsx:138` | list tile (not itinerary) | **alive** (→ `/plans/:id`) |
| **DashboardPlanCard** | — (no file) | Family | **dead** (deleted) |
| **ItineraryCard** (renderer) | `itinerary/ItineraryCard.tsx` | Independent | **dead** — gutted to types-only (types still imported) |
| **ItineraryMapView** | `itinerary/ItineraryMapView.tsx` | Independent | **dead** (zero refs) |
| **Workspace `DayCard`/`ARow`** | — | Independent | **dead** (workspace embeds `<PlanCard embedded>`) |
| **standalone `TripCard`** | `components/trip-card.tsx` | list tile | **dead** (zero imports) |

---

## §B — Mock (`plancard-mockup-v3`) vs live, Stage A / Stage B

| Mock module | Stage | Live | Status |
|---|---|---|---|
| A1 shared header (status/title/loc+date/countdown) | A | `PlanCardHeader.tsx:33` via `PlanCard.tsx:457` | present |
| A2 4-up metric strip | A | `MetricStrip.tsx` via `PlanCardHeader` | present |
| A3 chips (services·legs·expert·saved $) | A | inline `PlanCard.tsx:505-595` | **different** — "saved $" is the AI-Optimized pill; chips data-gated, not always-on |
| A4 Concierge ("per-task fee") | A | `ConciergeModule.tsx:19` via `PlanCard.tsx:497` | **different** — copy differs, whole-card link (no "Start →") |
| A5 SMS "Trip alerts" consent card | A | — | **absent** (mock marks it dead/gated too) |
| A6 Your expert (avatar + msg preview) | A | `PlanCard.tsx:599-648` | present (advisor-gated) |
| A7 bottom bar (Maps + View Itinerary) | A | `PlanCard.tsx:666-686` | present |
| B1 same header + metrics "grown up" | B | `HeroSection.tsx:34` via `PlanCard.tsx:946` | **different** — Stage B uses `HeroSection` (photo hero), not the Stage-A `PlanCardHeader`; shares only `MetricStrip` (hidden < `sm`). **The mock's "same header both stages" thesis is only half-built.** |
| B2 Concierge | B | `ConciergeModule` via `PlanCard.tsx:1031` | present |
| B3 view toggle (Card / Map Control Center) | B | `PlanCard.tsx:1037-1060` | **different** — labels "Card View"/"Map View" |
| B4 map pins + polylines | B | `MapControlCenter.tsx` (real Google Maps) | **different** — real maps, named info-cards not numbered pins |
| B5 leg pills w/ mode swap on map | B | mode swap in `TransportSection.tsx:59` (card list); map display-only | **different** — swap is a card-list dropdown, not tappable map pills |
| B6 map layer toggles (Pins/Routes/Notes) | B | `MapControlCenter.tsx:467-545` | **different** — "Activities/Transport/Expert Notes" |
| B7 map "↗ Maps" | B | `MapControlCenter.tsx:437-463` | **different** — separate Google/Apple/Calendar buttons |
| **B8 💰 per-leg booking (platform Book + affiliate)** | B | `LegBookingPanel` `TransportSection.tsx:244` | **different** — behind a "Book this leg" toggle; affiliate = §16 agent rail (not outbound "View ↗") |
| **B9 💰 upsell (plancard_ontrip)** | B | `PlanCardUpsellSlot.tsx:34` via `PlanCard.tsx:1171` | present |
| **B10 💰 escalation ("polish / From $49")** | B | `EscalationCTA.tsx:54` via `PlanCard.tsx:1197` | **different** — price resolved live, not hardcoded $49 |
| B11 bottom bar | B | `BottomActionBar.tsx:23` | **different** — Map/Message/Share; "View Itinerary" removed (the full stage *is* the itinerary) |
| suggested-leg Accept/Decline | B | `TransportSection.tsx:536-559` | present (live; not drawn in this mock) |
| "Final·vN" version chip | A/B | closest: `finalDress` "Final" badge `HeroSection.tsx:117` | **absent** (also not truly in this mock) |

**The three 💰 must-not-regress modules (B8/B9/B10) all live *inside* the PlanCard family** — so removing
trip-details' non-family bolt-ons cannot regress them (they ride the mounted `<PlanCard>`).

---

## §C — Deletion inventory (`trip-details.tsx`, per ruling `2026-08-31-manifest-is-the-boundary`)

"Anything on `trip-details.tsx` outside the PlanCard family is a violation to remove." Each row: **KEEP**
(manifest / family), **DELETE**, or **MOVE-TO-SLIP** (Leon rules on these). D-1…D-5 from Flow-audit #2 mapped.

| # | Feature on trip-details | file:line | flow-audit map | disposition | note |
|---|---|---|---|---|---|
| 1 | `<PlanCard stage="full">` | 757 | D-2 | **KEEP** | the Trip Card's Stage B core; canonical, not a fork |
| 2 | Hero title/dates/party + Share + Maps | 447-624 | SHARED | **KEEP** (family/chrome) | already in HeroSection too |
| 3 | **Status badge = dead `trip.status`** | 486-488 | §3 dead field | **DELETE** | ratified-dead (ruling 2); retire the read |
| 4 | Expert-workspace status badge | 493-510 | RECORD | KEEP-or-fold | additive field; fold into Make-final chrome |
| 5 | **Regenerate / Generate itinerary (destructive)** | 625-636, 707-732, 1497-1520 | **D-1** | **DELETE** (+ D-1 hotfix first, §D) | ruling: "no Regenerate on the card ever again" |
| 6 | **Booking Summary "Total Pending" (stale `generatedItinerary` blob)** | 771-818 | RECORD, stale source | **DELETE** | ruling: card renders from snapshot + live booking rows only; stale-blob path deleted |
| 7 | "Add a Booking" button (inert) | 820-831 | dead | **DELETE** | no handler |
| 8 | EscalationCTA rendered **directly** (also inside PlanCard) | 943-947 | D-4 | **DELETE** (dup) | the PlanCard-mounted one (KEEP) is the survivor |
| 9 | Assigned-expert card + Message expert | 846-904 | D-3 | **MOVE-TO-SLIP?** | slip owns expert handoff; Leon rules |
| 10 | Expert-advisor **assign picker** (offering-type→expert→POST) | 915-928, 1234-1397 | D-3 | **MOVE-TO-SLIP?** | slip has "Send to expert" routing + approval, not this picker; Leon rules |
| 11 | Suggestions list + **Approve ("& add to itinerary") / Decline** | 951-1073 | PLANNING (details-only) | **MOVE-TO-SLIP?** | approve materializes an item — a plan mutation; belongs on the planning surface; Leon rules |
| 12 | Marketplace **Services grid + Add-to-cart** | 1075-1161 | D-5 | **MOVE-TO-SLIP?** ⚠️💰 | a real purchase path (`POST /api/cart`); do not drop silently — Leon rules (slip vs Discover) |
| 13 | Temporal anchors: `TemporalAnchorManager`(×2), `ScheduleValidator`, `EnergyBudgetDisplay`, `AnchorSuggestionsPanel`, `WeddingAnchorPresets` | 647-671, 1168-1186 | PLANNING (details-only) | **MOVE-TO-SLIP?** | flight/hotel-time capture; not a duplicate; Leon rules where it lives |
| 14 | Guests tab: `GuestInviteManager` / "Set up guest list" (event trips) | 1191-1223 | SHARED (event) | **MOVE-TO-SLIP?** | event/party feature; Leon rules (slip mode vs separate event surface) |
| 15 | Dead renderers — `ItineraryMapView.tsx`, `components/trip-card.tsx`, `ItineraryCard.tsx` renderer body | (files) | census | **DELETE** | zero refs / zero imports; keep ItineraryCard *types* |

**Clear DELETEs (no ruling needed):** rows 3, 5, 6, 7, 8, 15. **KEEP (manifest):** rows 1, 2, 4.
**Leon rules (MOVE-TO-SLIP candidates):** rows 9, 10, 11, 12⚠️, 13, 14. Row 12 is money-adjacent — flagged; must
not be dropped without an explicit call.

After the DELETEs + ratified MOVEs, `trip-details.tsx` reduces to **the PlanCard mount + Make-final-aware
chrome** (ruling `2026-08-31-two-surfaces-one-handoff`).

---

## §D — D-1 exposure & hotfix proposal `[guarded]`

**Exposed: YES.** `POST /api/trips/:id/generate-itinerary` (`server/routes.ts:1333`) authorizes the caller
(owner/expert/EA, 1369-1376) but its rebuild delete (**routes.ts:1520-1531**) guards **only on `origin`**:

```sql
DELETE FROM itinerary_items WHERE trip_id = ? AND (
  origin = 'ai'
  OR (origin IS NULL AND (suggested_by IS NULL OR suggested_by <> 'expert'))
)
```

It spares `origin ∈ {traveler, expert}` but **deletes every `origin='ai'` row regardless of
`routing_status`/booking.** An AI-suggested stop is `in_planning` by birth and the slip's "Add to checkout" /
"Add all to checkout" routes it to `ready_for_checkout` (origin preserved), and checkout-confirm flips it to
`purchased` (+ `booking_id`). So Regenerate can:
- **drop a `purchased` stop** — deletes the itinerary row carrying the booking linkage while the charge stands
  (the plan loses a paid stop; a §14/§15-adjacent integrity break), and
- **wipe a `ready_for_checkout` selection** — desyncing the cart projection (`syncItemProjection` keys on
  `itinerary_item_id`).

There is **no `routing_status`/booking pre-check** anywhere in the handler (1333-1531).

**Proposed hotfix (its own `[guarded]` commit, leads the build):** add a survivor clause to the delete so it can
never destroy a committed row — spare any item with `routing_status IN ('ready_for_checkout','purchased')` **or**
a non-null booking linkage. Minimal shape:

```ts
await db.delete(itineraryItems).where(and(
  eq(itineraryItems.tripId, trip.id),
  or(eq(itineraryItems.origin, "ai"),
     and(isNull(itineraryItems.origin),
         or(isNull(itineraryItems.suggestedBy), ne(itineraryItems.suggestedBy, "expert")))),
  // NEW: never delete a checked-out or purchased row, whatever its origin.
  notInArray(itineraryItems.routingStatus, ["ready_for_checkout", "purchased"]),
  // (belt-and-braces if the column exists) isNull(itineraryItems.bookingId),
));
```

Validated with a negative DB test (regenerate leaves a `purchased`/`ready_for_checkout` AI row intact) before
push. Confirm the exact booking-linkage column name (`bookingId` on `itinerary_items`) at build time. This
closes the exposure **independently of** the trip-details deletion timeline — it's live on main now.

---

## HARD STOP — what Leon rules

1. **Go / no-go on the D-1 hotfix leading the build** (recommend: yes, immediately — it's a live money-safety
   hole).
2. **The six MOVE-TO-SLIP rows** (§C rows 9–14): for each, *move to the slip* vs *delete* vs *keep on the Trip
   Card*. Row 12 (marketplace add-to-cart) is money-adjacent — needs an explicit call.
3. Confirm the **KEEP/DELETE** dispositions (rows 1–8, 15) as read.
4. Then **"go"** for the build (trip_finals snapshot, snapshot-only render, deletion pass, Stage-A dashboard
   consolidation, expert-notes-to-snapshot, docs supersession, suites).

*Nothing built beyond this report. `[guarded]`: no 💰 affordance removed, no booking status snapshotted, no
push-channel work, no Regenerate retained.*
