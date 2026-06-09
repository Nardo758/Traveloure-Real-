# PlanCard Surface Manifest (no-regress baseline)

**Purpose:** a complete inventory of every rendered affordance on the traveler-facing
PlanCard, used as the **must-not-regress baseline** for the PlanCard build. Phases 3 and 4
gate against this list (see "Phase gate" below).

**Scope:** `client/src/components/plancard/` — `PlanCard.tsx` and its sub-components.
`PlanCard` renders two stages off the `stage` prop: `summary` (compact dashboard card →
`PlanCardSummary`, `PlanCard.tsx:752`) and `full` (control center, `PlanCard.tsx:836`).
Primary data source for both: `useQuery(['/api/trips/${id}/plancard'])` → `PlanCardData`
(`PlanCard.tsx:745`; shape in `plancard-types.tsx:192`). Role resolves from
`plancardData.tripRole ?? role` (`PlanCard.tsx:832`).

> **Pairs with:** [`plancard-mobile-delivery-model.md`](./plancard-mobile-delivery-model.md) — *how* the PlanCard reaches the phone (PWA / web-push / SMS). The on-trip affordances below (esp. the `plancard_ontrip` upsell, **B26**) render in-app but depend on that delivery channel, which is **not yet built**.

**Legend:** 💰 = revenue-bearing / conversion affordance (must-not-regress; a phase that
would remove or restructure one **stops and asks first**).

---

## Concrete data baseline — California Coastal Road Trip

The manifest must keep rendering against this trip, and the summary/stats metrics must read:

| Metric | Baseline |
|---|---|
| Days | **8** |
| Activities | **32** |
| Transit legs | **22** |
| Transit time | **14h** |
| Services | **3** |
| Legs (transport) | **22** |
| Expert | **assigned (Expert chip + advisor strip render)** |

> Baseline values are authoritative per the build owner. (Note: an earlier dashboard mock
> in `attached_assets/` showed 29 legs / "14h 41m"; the values above are the agreed baseline
> for this gate.)

---

## Stage A — Summary card (`PlanCardSummary`, `PlanCard.tsx:312–715`)

| # | Affordance | file:line | Data source |
|---|---|---|---|
| A1 | Card container | `PlanCard.tsx:439` | trip |
| A2 | Status pill | `PlanCard.tsx:447` | `getSummaryStatusLabel` ← trip start/end (`:409`) |
| A3 💰 | Expert-review-pending badge | `PlanCard.tsx:455` | `pendingExpertRequest` ← `GET /api/expert-requests?tripId` (`:350`) |
| A4 | Delete | `PlanCard.tsx:466` | `useDeleteTrip` |
| A5 | Countdown | `PlanCard.tsx:476` | `daysUntilDate(trip.startDate)` |
| A6 | Title / dest+dates | `PlanCard.tsx:482` | trip |
| A7 | **Summary metrics: Days / Activities / Transit legs / Transit time** | `PlanCard.tsx:490–506` | `numDays`(`:336`), `totalActivities`(`:330`), `totalLegs`(`:331`), `totalMinutes`(`:332`) ← `plancardData.stats` ?? derived from `days` |
| A8 💰 | Chip: services | `PlanCard.tsx:511` | `GET /api/service-bookings` filtered by tripId (`:374`) → `/trip/:id?tab=bookings` |
| A9 | Chip: transport legs | `PlanCard.tsx:522` | `totalLegs` → `?tab=itinerary&section=transport` |
| A10 💰 | Chip: Expert | `PlanCard.tsx:533` | `advisor` ← `GET /api/trips/:id/expert-advisor` (`:344`) → `?tab=expert` |
| A11 💰 | Chip: AI Optimized / "Re-optimize?" + $ saved + ★ (delta moment) | `PlanCard.tsx:558` | `lastOptimizedAt` + `optimizationDelta` (`:334`) |
| A12 💰 | Advisor strip + expert blurb + suggestions badge | `PlanCard.tsx:603–650` | `advisor`; last assistant msg ← `GET /api/conversations/:matchedConvId` (`:392`); `GET /api/trips/:id/suggestions` (`:367`) |
| A13 | Action items | `PlanCard.tsx:653` | `GET /api/notifications` filtered by tripId (`:380`) |
| A14 | Maps button | `PlanCard.tsx:669` | `openMapsDeepLink` (`:671`) |
| A15 | View itinerary | `PlanCard.tsx:679` | Link `/trip/:id?tab=itinerary` |
| A16 💰 | **Expert-polish CTA "Have an expert polish this" (G8)** | `PlanCard.tsx:691–703` | shown when `showPolishCta = hasActivities && !advisor && !pendingExpertRequest` (`:432`) |
| A17 💰 | ExpertPolishDialog → submit | `PlanCard.tsx:156–284` (confirm `:275`) | `POST /api/expert-requests {requestType:"polish"}` (`:173`) |

## Stage B — Full control center (`PlanCard.tsx:836–1078`)

| # | Affordance | file:line | Data source |
|---|---|---|---|
| B1 | Delete (owner-only) | `PlanCard.tsx:844` | `useDeleteTrip` |
| B2 | HeroSection (photo, status, travelers, score) | `HeroSection.tsx:51–96` | `getDestinationPhotoUrl` (picsum, `:19`); score `:77` |
| B3 💰 | Share | `HeroSection.tsx:81` | `shareToken` / `navigator.share` |
| B4 | Export → `/itinerary/:id` | `HeroSection.tsx:88` | Link (no file export; nav only) |
| B5 | Title / destination / dates / cost | `HeroSection.tsx:98–117` | trip + totalCost/perPerson/budget |
| B6 💰 | **AI-Optimized banner ($ saved / +★ / date) — "plan is ready" delta** | `PlanCard.tsx:870–902` | `lastOptimizedAt` + `optimizationDelta` (`:795`) |
| B7 | View-mode toggle (Card / Map Control Center) | `PlanCard.tsx:904–921` | local state |
| B8 | **StatsRow: Days / Activities / Transit Legs / Transit Time** | `StatsRow.tsx:39–53` | `totalActivities/totalLegs/totalMinutes` (`PlanCard.tsx:798–801`); labels ← `templateConfig.statsLabels` |
| B9 | OptimizerMetrics (Score / Cost / Saves / wellness / travel / stars) | `StatsRow.tsx:70–108` | `metrics.*` (`PlanCard.tsx:812–818`) |
| B10 💰 | **EscalationCTA "Have an expert polish this" (G8 / CON-A.P7 / N3)** | `EscalationCTA.tsx:132` (submit `:153`) | price/ETA ← `POST /api/concierge/quote` (`:49`); submit → `POST /api/expert-requests {requestType:"review", source:"plancard_escalation"}` (`:80`); owner-only + full-stage gate (`PlanCard.tsx:948`) |
| B11 | DaySelector | `DaySelector.tsx:25` | `days` + energy profile |
| B12 | SectionTabs (Activities / Transport / Changes; owner+expert) | `SectionTabs.tsx:26` | counts (`PlanCard.tsx:974`) |
| B13 | ChangeLogPanel (attribution) | `ChangeLogPanel.tsx:10` | `changeLog` (`PlanCard.tsx:767`) |
| B14 | ActivitiesSection rows, visited-toggle, expert-note callout, comments | `ActivitiesSection.tsx:351` | `day.activities` + `legs` (`PlanCard.tsx:774`) |
| B15 | ↳ TransportConnector — inline per-leg mode picker + Open-in-Maps | `ActivitiesSection.tsx:120` (picker `:233`, maps `:219`) | `PATCH /api/transport-legs/:id/mode` (`:131`) |
| B16 | ↳ Navigate FAB | `ActivitiesSection.tsx:585` | `openInMaps` |
| B17 | TransportSection per-leg rows, summary, day Maps CTA | `TransportSection.tsx:362` | `day.transports` |
| B18 | ↳ TransportModeSelector | `TransportSection.tsx:57` | `PATCH /api/transport-legs/:id/mode` (`:82`) |
| B19 💰 | ↳ BookingSourceBadge "✓ Book on Traveloure" / "via {partner}" (at-a-glance source label) | `TransportSection.tsx:18–53` (rendered `:437`) | `transport.bookingSource`/`partnerName` |
| B19b 💰 | ↳ **"Book this leg" per-leg booking panel (Phase 3 — LANDED, commit `64432cb`)** | `TransportSection.tsx:173` (toggle `:191`, rendered `:440`) | `GET /api/transport-legs/:legId/options` (`:177`, lazy on open). Platform → green **Book** `button-book-platform-${opt.id}` (`:246`, **no handler yet — stub**); affiliate/deep_link → **View** `button-book-affiliate-${opt.id}` → `window.open(externalUrl)` (`:303`, **wired**). Partners: 12Go/Omio/DiscoverCars/Kiwi/Traveloure (`:165`) |
| B20 | ↳ Suggested-leg **Accept** / **Decline** (Change removed — redundant with the inline mode picker) | `TransportSection.tsx` (accept `:480`, mutation `:344`) | Accept → `PATCH …/status {confirmed}` (persists chosen/recommended mode); Decline → `{dismissed}`. **Both wired.** |
| B21 | MapControlCenter (3 layers: pins / routes / expert-notes; Google/Apple; Add-to-Calendar; route summary; notes panel) | `MapControlCenter.tsx:261` | `days`, `GET /api/geocode` (`:65`), `GET /api/trips/:id/expert-notes` (`:273`); polylines styled by persisted leg mode (`:99`) |
| B22 | Maps button (bottom bar) | `PlanCard.tsx` (bottom bar) | `openInMaps` |
| B23 💰 | **AI Concierge entry "Concierge" (CON-A.P6 / D8)** | `PlanCard.tsx` (bottom bar) | Link `/concierge?intent=…` |
| B24 | View Itinerary | `PlanCard.tsx` (bottom bar) | Link `/itinerary/:id` |
| B25 💰 | **Upsell slot — pre-trip** ("Complete your plan") | `PlanCardUpsellSlot.tsx` (mount `PlanCard.tsx:972`) | `POST /api/upsell/plancard-pretrip`; Explore → `/discover?categoryKey=…` + `POST /api/upsell/click` |
| B26 💰 | **Upsell slot — on-trip** ("Near you on this trip") | `PlanCardUpsellSlot.tsx` (mount `PlanCard.tsx:1017`) | `POST /api/upsell/plancard-ontrip`; same Explore + click attribution. **Renders when the app is open; on-trip delivery gated on an unbuilt push channel — see [`plancard-mobile-delivery-model.md`](./plancard-mobile-delivery-model.md).** Still must-not-regress (the slot itself). |

---

## Revenue / conversion affordances (must-not-regress set)

1. Expert-polish CTA (summary) — `PlanCard.tsx:697` → dialog → `POST /api/expert-requests {polish}` (A16/A17).
2. EscalationCTA (full, G8) — `EscalationCTA.tsx:132` → `POST /api/expert-requests {review}`, priced via `/api/concierge/quote` (B10).
3. AI Concierge entry — `PlanCard.tsx:1056` → `/concierge` (B23). **Confirmed present on the card.**
4. Expert chip + advisor strip — `PlanCard.tsx:533`, `:603` (A10/A12).
5. AI-Optimized / Re-optimize delta — summary `:558`, full banner `:874` (A11/B6).
6. Service-bookings chip — `PlanCard.tsx:511` (A8).
7. **Per-leg "Book this leg" panel** — `TransportSection.tsx:173` (B19b): **platform Book wired → Stripe checkout** (`bookMutation` `:186`, onClick `:265`; via strand PR #46/#47, prod-safe via migration 050) **and** affiliate **View** deep-link (`:303`).
8. Share / Export (virality) — `HeroSection.tsx:81`, `:88` (B3/B4).
9. **Upsell slots — pre-trip + on-trip** — `PlanCardUpsellSlot.tsx` (B25/B26): `POST /api/upsell/plancard-{pretrip,ontrip}` → Explore to category-filtered `/discover` with `POST /api/upsell/click` attribution. Gates #49/#51 merged + **runtime-verified**.

## Flags — present in code but not rendered / half-wired

- **Suggested-leg Accept/Change — RESOLVED.** Accept is wired (`acceptLeg` → `PATCH …/status {confirmed}`, persists `confirmedMode`; `TransportSection.tsx:344`/`:480`); the redundant **Change** button was removed (the inline `TransportModeSelector` already handles mode swaps). Decline unchanged.
- **"Book this leg" platform Book — RESOLVED (now WIRED).** The platform green **Book** CTA (`bookMutation` `:186`, onClick `:265`) creates a Stripe checkout (strand PR #46/#47; prod-safe via migration 050 making `service_bookings.service_id` nullable). Affiliate **View** (`:303`) and the source badge (`:18–53`) unchanged.
- **`plancard_pretrip` / `plancard_ontrip` upsell slots — RESOLVED (LANDED & runtime-verified; was MISSING).** `PlanCardUpsellSlot` (`PlanCard.tsx:972`/`:1017`) consumes `POST /api/upsell/plancard-{pretrip,ontrip}`; one slot per temporal window; Explore → category-filtered `/discover` (gate #51) with `POST /api/upsell/click` attribution (gate #49). Now in the must-not-regress set (B25/B26).
- **Export button** (`HeroSection.tsx:88`) is labelled "Export" but only links to `/itinerary/:id` (no PDF/file export). *(Still the one open half-wired item.)*

## Phase touch surface

- **Phase 3 (per-leg transport / "by-leg" build) — COMPLETE:** `TransportConnector` + `TransportModeSelector` mode-swap, polyline restyle, per-leg `LegBookingPanel`, **platform Book → Stripe** (`bookMutation` `:186`/`:265`), and suggested-leg **Accept** (`:344`/`:480`) all wired; redundant Change removed. Backlog: affiliate **View** click-tracking parity (the booking panel's deep-link doesn't yet hit the upsell click endpoint).
- **Phase 4 (mode-config consolidation + upsell slots) — upsell slots LANDED:** `PlanCardUpsellSlot` (pretrip/ontrip) consuming the upsell engine; gates #49 (click attribution) + #51 (`categoryKey` resolver) merged + runtime-verified. **Backlog:** real `cartItems` (already-in-plan suppression) + optimizer `emptySlotCategoryKeys` (gap-driven pretrip). Mode-taxonomy divergence note unchanged (`transport-mode-taxonomy-audit.md`; do not collapse).

---

## Phase gate (apply to Phases 3 AND 4)

> **Gate:** every affordance in this PlanCard surface manifest still renders, and the
> summary/stats metrics still read **8 / 32 / 22 / 14h** on the California trip
> (3 services · 22 legs · Expert assigned). Revenue affordances (💰 above — expert-polish
> CTA, EscalationCTA, Concierge entry, Expert/service chips, AI-Optimized delta,
> Share/Export, Book-this-leg panel, upsell slots) are **must-not-regress**: if a phase would remove or
> restructure one, it **stops and asks the build owner first**.

**Phase-1/2 build history this baseline rides on:** `f3eba7a` (Phase 1 — three-layer map),
`408747f` (Phase 2 — deep-link builder), `ba59270` (maps escape-hatch single-source),
`1838672` (summary de-dup). Transport/booking rows verified against branch HEAD including
`64432cb` (transport booking system / Phase 3 partial). Branch: `claude/plancard-piece3`.
