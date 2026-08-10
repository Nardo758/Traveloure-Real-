# Provider Workstation — Logistics Illustration & Distribution Coupling

**Status:** PROPOSED — awaiting decision-maker ratification of the decision points in §6.
**As of:** Aug 10, 2026, branch `claude/sync-local-repo-2j7ghv`. Grounded in the logistics-layer research
sweep (file:line evidence inline); premise corrections in §1 are findings, not opinions.

---

## 0. Role definition (the framing this spec locks)

- **Catalog** (`/provider/services`) is the **shelf**: what you sell — listings, approval state, Listing
  Health, share tools. It already does this job and is not changed by this spec.
- **Workstation** (`/provider/workstation`) is the **bench**: how an offering *works* — today the build
  ladder (single service → bundle → property). This spec adds the missing bench capability: **illustrating
  the logistics behind an offering** — where it happens, where it goes, what the journey looks like — and
  feeding that illustration straight into distribution.

## 1. Premise corrections (what the code already has)

The starting complaint was "providers don't illustrate the logistics behind their offerings — no map view
of the service location or the route the service takes." Research shows the gap is real but sits in a
different place than assumed:

1. **A pin picker EXISTS and is wired end-to-end.** `client/src/components/backoffice/location-point-picker.tsx`
   (Google Maps via `@vis.gl/react-google-maps`, click-to-drop, drag-to-adjust, confirm-gated) is mounted in
   the ServiceForm meeting-location card (`ServiceForm.tsx:1916-1930`) and the Workstation property flow
   (`provider/workstation.tsx:1059-1067`). The server write path (`server/utils/service-location.ts`) strips
   raw client coordinates, derives `locationPrecision` server-side, and never touches `city` (§13/§14 posture).
   **It renders `null` when `VITE_GOOGLE_MAPS_API_KEY` is unset** (`:46`, `:224`) — the probable reason it
   reads as absent in a running console. Ops item, not a build item (§6 D5).
2. **The gap is the DISPLAY layer.** No traveler-facing surface renders the pin: `service-detail.tsx` shows
   `location` text + `meetingPoint`/`pickupAddress` prose only (never `latitude`/`longitude`, `dropOffPoint`,
   or `serviceRadius` — the interface at `:78-87` doesn't declare them); the storefront shows a single text
   line (`storefront.tsx:341-345`). A provider can confirm an exact pin that no one ever sees.
3. **Route rendering ships twice already, provider-unreachable both times:** the ready-made teaser map
   (`server/services/ready-made-teaser-map.service.ts` — server SVG, OSM geography layer, bounded privacy
   jitter, ODbL attribution) and the SocialKit "THE ROUTE" story frame
   (`SocialKitCard.tsx:297-374` — same projection helpers, client SVG). Both consume `itinerary_items`
   coordinates; neither has a provider-service data source to draw from.
4. **No route model exists for services.** `transport_legs` is trip-scoped and stores endpoints only
   (haversine, no geometry — `shared/schema.ts:5343-5392`, `transport-leg-calculator.ts:146`); real Google
   polylines are fetched by `routes.service.ts` and discarded. `trip_segments` does not exist.

## 2. Capability 1 — SHOW the logistics that already exist (display layer; no schema change)

**2a. Service-detail logistics map card.** On `/services/:id`, when the service has coordinates, render a
small map panel: the pin (with the honest precision label — "exact location" vs "approximate area" mirroring
`pinStatus`, `provider/services.tsx:653-668`), the `serviceRadius` as a circle when present, and the existing
meeting/pickup/drop-off prose beside it. Rendering rules:
- Coordinates absent → the card does not render (item simply doesn't appear — the platform-wide §13 pattern).
- Reuse the existing key-handling ladder: Google when `VITE_GOOGLE_MAPS_API_KEY` is set, Leaflet/OSM fallback
  otherwise (`leaflet-plan-map.tsx` + the `gm_authFailure` degrade in `workspace.tsx:52-92` are the pattern).
- ODbL attribution ("© OpenStreetMap contributors") wherever an OSM layer draws (CLAUDE.md §20b).
- Also surface `dropOffPoint` and `serviceRadius` in the prose block — captured today, never rendered.

**2b. Storefront location strip (optional, same wave or next).** `/p/:handle` gains a compact map strip
plotting the earner's approved services' pins (exact pins as dots, approximate as soft circles), riding
`GET /api/storefront/:handle`'s existing offering rows + one added coordinates field per service. Away-mode
aware; renders nothing when zero offerings carry coordinates.

**2c. Workstation logistics rung.** The Workstation gains a "Logistics" card per approved service: pin
status, radius, route status (Capability 2), with edit links into the ServiceForm step that owns each field.
This is the bench view of the same data — no new store, just the Workstation finally showing what the bench
is for.

## 3. Capability 2 — Route illustration for mobile services (new child table; needs ratification)

Tours, transfers, crawls, and progressive experiences have a *journey*, not a point. Proposal:

**3a. New table `service_route_points`** (decision point D1): ordered, provider-confirmed stops as
first-class child rows of `provider_services` — the `dmo_extracted_places` shape (CLAUDE.md §20a):
`ON DELETE CASCADE`, `UNIQUE (service_id, "position")`, columns ≈ `id, service_id, position, name,
latitude, longitude, google_place_id (nullable), note (nullable)`. Declared in `shared/schema.ts`
(publish-trap rule — a table the code depends on must be declared or the deploy push drops it) and
registered in `server/migrations/migration-files.ts`.
- Authoring in the ServiceForm (step 2, below the meeting-location card, gated on in-person/hybrid) and
  surfaced on the Workstation logistics rung: add stops via the same Places-autocomplete + server-geocode +
  pin-confirm pattern the expert workspace already implements (`workspace.tsx:383-433`, `:546-561`) — every
  point is provider-confirmed, never inferred (§13).
- **Connectors are straight lines and say so.** `L27-workspace-plan-map.md` rule holds: a straight-line
  path "must not be sold as a routing check." The route visual is *illustration of sequence*, labeled by
  stop count ("5 stops"), never a km/duration claim unless real routing data exists (none does today —
  the SocialKit precedent deliberately omits the km figure for exactly this reason, commit `cefc4b8`).
- **Rejected alternative:** reusing `transport_legs` — it is trip/variant-scoped with exactly-one
  enforcement, expert-authored semantics, and per-leg transport-mode machinery a service route doesn't
  want. Bending it would couple the provider catalog to the trip engine.

**3b. Renderer reuse, not a third implementation.** The route draws with the existing projection helpers
(`shared/geo/market-geography.ts` `projectPoint`/`projectPath`) + the market geography layer
(`GET /api/markets/geography`, DB-first with fallback), in the same visual language as the teaser map:
numbered dots, polyline connectors, geography under-layer when the market has one, honest absence when not.

## 4. Capability 3 — Distribution coupling (the point of all of it)

Every logistics visual becomes distributable the moment it exists:

- **4a. New share-image format `service-route`** (feed + story) in `share-images.routes.ts` /
  `share-image.service.ts`: a satori element-tree panel — service name, the route/pin drawn via
  `projectPath`/`projectPoint` as SVG paths, stop count, ODbL line when geography draws. Same F2 gate as
  the existing service formats (approved + active only). The rail is pure data-in/buffer-out; this is a
  new kind string + composer, no architectural change.
- **4b. Provider share kit gains the logistics frame.** The per-service share dialog in
  `provider/services.tsx` (C9) adds the route/map frame beside the existing feed/story frames — the
  provider console's equivalent of the expert SocialKit's "THE ROUTE."
- **4c. Public surfaces close the loop.** The service-detail map card (2a) means every tracked short link
  (`targetType: "service"` → `/services/{id}`) now lands on a page that *shows* the logistics — link
  clicks → a listing that illustrates the journey → booking, measured by the existing
  clicks→bookings→revenue rail. No short-link changes needed.
- **4d. (Filed, not this wave)** A `route_illustrated` Listing Health check for route-suited categories —
  only after Capability 2 lands and only where the check can be computed honestly.

## 5. Defects & ops items this research surfaced (fix regardless of ratification)

1. **`POST /api/geocode` fabrication fallback** (`content.routes.ts:3620-3658`): a substring-matched
   hardcoded city-centre dictionary (`FALLBACK_COORDINATES`) used on Google miss — outside the single
   geocode path (`server/utils/geocode.ts`) and against the migration-129 no-fabrication posture. Proposed:
   remove the fallback (miss ⇒ null), or at minimum stamp results from it with an explicit
   `precision: 'city_fallback'` that no §13 surface accepts. **D4.**
2. **Stale header** in `provider-listing-health.routes.ts` — warns it is pending mount; it is mounted
   (`server/routes.ts:116`, `:902`). Comment fix.
3. **Env:** `VITE_GOOGLE_MAPS_API_KEY` (client map render) and `GOOGLE_MAPS_API_KEY` (server geocode —
   `GET /api/geocode` returns 503 without it) must be set in Replit Secrets for the already-shipped pin
   picker to appear at all. **D5.**

## 6. Decision points (decision-maker)

- **D1 — Ratify `service_route_points`** (§3a): new child table, additive migration, declared in
  `shared/schema.ts`. Schema changes require explicit approval per CLAUDE.md.
- **D2 — Exact-pin publicity.** The teaser map jitters stops (±250m, seeded) to protect itinerary IP. A
  provider's *meeting point* is arguably meant to be public — but a home-studio provider may not want an
  exact public pin. Options: (a) render exactly what the provider confirmed (they control the pin);
  (b) per-service "show exact pin publicly" toggle, default approximate. Recommendation: **(a)** for
  meeting points (it is where clients must go anyway), with the pin picker's own labels making the
  choice legible; revisit if a complaint pattern appears.
- **D3 — Phasing.** Recommended order: **Capability 1 (display) → 4a/4b (share formats) → Capability 2
  (route table) → storefront strip (2b)** — display-first ships value with zero schema risk and makes the
  already-collected pins pay for themselves before any new authoring is built.
- **D4 — Remove the `POST /api/geocode` fallback dictionary** (§5.1).
- **D5 — Set the two Google keys in Replit** (§5.3) — unblocks the existing picker immediately.

## 7. Invariants that bind every phase

- Never a fabricated coordinate: absent data renders as absence, never a guess (migration-129 posture,
  `service-location.ts` rules 1–5).
- Straight lines are never sold as routing; no invented km/duration figures (L27 rule; `cefc4b8` precedent).
- ODbL attribution wherever OSM-derived geography renders; never derive geometry from Google's map
  (`shared/geo/market-geography.ts:3-4`); Google Places `html_attributions` displayed as provided.
- The vector-tile interactive map remains PARKED (CLAUDE.md §20b) — nothing here starts it.
- Share formats gate on approved+active (F2); the storefront lists only approved offerings.
- One geocode path (`server/utils/geocode.ts`); one pin-write path (`service-location.ts`); one route
  renderer vocabulary (projection helpers) — no parallel implementations.
