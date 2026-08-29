# Audit brief — Provider console (Catalog / Workstation / Distribute / Create flow)

**Mock:** `docs/design/provider-console-mockup/mockup.html` (open in a browser; click through)
— `page-catalog.html`, `page-workstation.html`, `page-distribute.html` are single-view
extractions of the same file (regenerated from it, per its README) — treat `mockup.html` as
the source of truth if any diverge. `mock-*.png` are a full-page screenshot per view/state,
listed by filename as a table of contents (e.g. `mock-01-catalog.png`, `mock-03-workstation.png`,
`mock-04..10-create-*.png`, `mock-18-distribute.png`).
**Ledger:** CLAUDE.md §22, §23, §24; `docs/DECISIONS.md` rows 74, 92, 93, 94, 97, 98, 100, 101,
103, 104, 105, 107, 109–114, 2026-08-16-bring-access, 2026-08-17-delete-archive,
2026-08-17-photos-rail
**Status:** Largely merged. Most "gap #N" items the mock tracks carry `builtchip` markers citing
a ledger row and are live; a few carry `propchip` ("Proposed") and are genuinely undecided
proposals, not defects — do not audit those as bugs.
**Live surfaces:**
- `client/src/pages/provider/services.tsx` (Catalog)
- `client/src/pages/provider/workstation.tsx` (Workstation)
- `client/src/pages/provider/distribute.tsx` (Distribute)
- `client/src/pages/provider/service-form.tsx`, `client/src/pages/expert/service-form.tsx`,
  `client/src/components/ServiceForm.tsx` (create/edit wizard)
- `client/src/lib/service-form-steps.ts` (step branching authority), `client/src/lib/service-form-required.ts`
- `client/src/pages/provider/listing-home.tsx` (post-create checklist / submit)
- `client/src/pages/provider/property-create.tsx`, `client/src/pages/provider/bundle-builder.tsx`
- `client/src/components/provider/catalog-map-view.tsx`
- `client/src/pages/service-detail.tsx` (traveler-facing read-out)
- `server/routes.ts` — `PUT /api/provider/services/:id/route-points` (~line 2677),
  `PUT /api/provider/services/:id/pickup-route-points`
- `shared/schema.ts` — `providerServices.pendingChanges`/`editReviewStatus` (~line 970),
  `whatToBring`/`accessNotes` (~line 806)

## Behaviors the mock ratifies

1. **Catalog is "what you sell."** Storefront manager, share kit and Promote have moved off
   Catalog to Distribute; Catalog's header button routes to Workstation, not a form
   (`view-catalog`, `#cat-add`).
2. **Manage ⇄ Preview-as-traveler is a separate axis from List ⇄ Map.** Preview mode applies the
   same public-visibility predicate as the storefront (approved + active only) — paused, draft
   and in-review listings are simply absent, never shown greyed-out.
3. **Catalog's Map mode is a read-only traveler preview, not an authoring surface** (ruling 93,
   Aug 12/13). Pin/stop placement, radius control and an Authoring|Traveler sub-toggle do NOT
   live on Catalog's map. Authoring is the create flow's step 4, "Logistics." The mock's own
   in-page notice states this explicitly and calls it an amendment to an earlier "Catalog is the
   map's authoring home" posture — do not treat the older posture as current.
4. **Unlocated stops are named, never guessed onto the map** (§13/§22c). A route service with
   some stops lacking coordinates shows "X of Y stops located"; a listing with zero coordinates
   renders no map at all — never a city-center fallback, never another listing's shapes.
5. **Route connectors are straight dashed lines labeled as sequence, not travel routing** — no
   invented distance/duration between stops (§22c).
6. **Route stops are a replace-list PUT**, `PUT /api/provider/services/:id/route-points`, owner-gated,
   positions derived server-side from array order. A stop carries both lat/lng or neither
   (half-coordinate rejected 400).
7. **Bring/Access are asked once, free text, and rendered on the traveler page only when
   present** (§13/§24, migration 228). NULL/blank ⇒ the row is omitted everywhere, never shown
   as "nothing to bring" or "no access notes." Copy explicitly disclaims any accessibility
   standard being claimed on the host's behalf.
8. **Availability is ONE editor whose semantics come from the delivery method** — a scheduled
   listing authors slots/weekly patterns, a property publishes date ranges, and a no-calendar
   listing (e.g. a PDF) says so instead of showing an invented empty grid. Lives on Catalog,
   beside the listing (not a second calendar on Calendar or Workstation).
9. **Edit-split on an approved listing** (§23, ruling 112 Q8): price, photos/gallery order,
   availability/slots/blackouts, description wording, Bring/Access, and meeting-pin position go
   live immediately. Listing name, category/offering, delivery method, safety attestations, and
   **adding a route where there was none** re-enter review via
   `provider_services.pending_changes` + `edit_review_status='pending'` — the approved version
   stays live and bookable, shown as `Live` + `Edit in review` on Catalog. Reorder/rename/locate/
   remove of an EXISTING route's stops stays a safe edit.
10. **KNOWN DEFECT S-1 — absence is already tracked; report state, do not file as new.** The
    ratified two-column "goes live immediately / re-enters review" explain panel (drawn in the
    mock's `#edit-split` card) has no counterpart in `listing-home.tsx` today; the only signal a
    provider gets is the "Edit in review" pill after the fact. Constraint on any future fix: it
    must READ the server's own split, never restate the list client-side (derivation-drift class).
11. **Workstation is the one door.** Every "Add New Service" affordance routes here first
    (single / bundle / property tiles); picking a live service category jumps straight into
    Basics with the category pre-selected. Bundles and properties are built on Workstation, sold
    from Catalog — Workstation's "Your bundles"/"Your properties" cards are orientation, not a
    second Catalog.
12. **The create flow's step list is generated from the delivery method** — not a fixed 4-step
    wizard. Canonical branch shapes (all 7 delivery methods present, no eighth):
    `in_person`/`hybrid` → Basics · Scheduling · Capacity · Logistics (· Online for hybrid) ·
    Review; `video`/`call` → Basics · Session details · Review; `pdf` → Basics · What they get ·
    Review; `voice_notes`/`async_messaging` → Basics · Async details · Review.
13. **Step-naming note (not a bug):** "Logistics" is the NEW name for the spatial/map step
    (step 4); the step that used to be called Logistics (timing, duration, cutoffs, booking
    rules, and — per this mock — Bring/Access) is now named **Scheduling**. Bring/Access is
    asked on Scheduling, which behaviorally still never appears on the pdf/video/call/async
    branches — matching CLAUDE.md §24's "never on the pdf/async branches" claim even though the
    step's name changed since that text was written.
14. **A typed address is never a location** — the meeting pin (and route stops) save only on an
    explicit "Confirm this location" action, never from geocoding a typed string.
15. **Distribute hosts Storefront, Share kit (feed/story/**Route** frame) and Promote,** reached
    via a sidebar entry. The Route share frame reuses the same authored stops/sequence as the
    map — no invented distance. Measurement stays on Performance (`LinkAnalyticsPanel`) — the
    share rail does not grow its own analytics.
16. **Calendar stays read-only**; every chip deep-links to the listing's own availability editor
    on Catalog. (The mock notes an open amendment-on-offer to reverse this — flag as proposed,
    not a divergence.)

## Visual grammar

- `builtchip` (teal/filled) = ratified AND built, with a ledger citation — treat as current
  behavior to verify. `propchip`/"Proposed" (outline) = ratified design or open proposal only,
  not yet built — report presence/absence, do not flag as a missing feature bug.
- Numbered ghost dots (①…⑲) key into the mock's own end-of-file gap glossary — cross-reference
  by number, not by re-deriving meaning from the dot alone.
- `notice` (solid border) = a stated ruling/behavior; `note-quiet` = explanatory color-commentary,
  not itself a requirement.

## How to audit

1. `grep -n "editReviewStatus\|pendingChanges" server/routes.ts` — confirm the route-points PUT's
   identity-edit branch (adding a route to an approved listing with zero existing stops) and the
   PATCH `/api/provider/services/:id` handler both write to `pending_changes`/`edit_review_status`,
   never accept them from the client body.
2. `grep -n "Edit in review" client/src/pages/provider/services.tsx` — confirm the pill renders;
   then check `client/src/pages/provider/listing-home.tsx` for the two-column split panel text
   ("Goes live immediately" / "Re-enters review") — expected ABSENT (S-1, tracked).
3. Open `/provider/services`, toggle Manage ⇄ Preview as traveler — confirm a paused/draft
   listing disappears rather than greying out; toggle List ⇄ Map — confirm Map mode has no
   pin/stop-placement controls, only a read-only preview + "Not located" list.
4. Open the create flow, switch delivery method on step 1 — confirm the step list
   (`client/src/lib/service-form-steps.ts`) regenerates to the shapes in behavior 12, with no
   Logistics/Scheduling/Capacity steps for pdf/video/call/async methods.
5. `grep -n "whatToBring\|accessNotes" client/src/pages/service-detail.tsx` — confirm trim-or-omit
   rendering (absent when null, never "none").
6. `grep -n "route-points" server/routes.ts` and open a listing's create-flow Logistics step —
   confirm stops save via the replace-list PUT and half-coordinate stops are rejected.
7. Open `/provider/distribute` — confirm Storefront/Share kit/Promote live here (not on Catalog)
   and the Route share format is present beside Feed/Story.

## Known divergences / notes

- The mock's own in-page notices flag two intentionally-open items as NOT part of this
  approval: moving demand-heat/coverage-gap overlays from Catalog's map to Performance, and
  whether Calendar becomes the availability editor's home instead of Catalog. Both are proposals
  on record, not defects — do not audit against them as if ratified.
- CLAUDE.md §22's literal text ("the map authoring surface lives on Catalog") is the SUPERSEDED
  side of an in-repo amendment (ruling 93, Aug 12/13): Catalog's map is now traveler-preview-only
  and authoring moved to the create flow's step 4. Audit against the mock/ledger's current
  posture, not §22's original wording.
- `docs/design/service-creation-mock.html` (a separate assigned mock, see its own audit brief) is
  a slightly less-resynced export of the same underlying artifact — e.g. it still shows the
  delete/archive item as "build pending" where this mock shows it "built." Treat this file
  (`provider-console-mockup/mockup.html`) as the more current source where the two disagree.
