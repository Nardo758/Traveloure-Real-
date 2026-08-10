# Service Fundamentals — Ratified Decisions (Aug 10, 2026)

**Status:** RATIFIED — the decision-maker delegated the five outstanding decision points of the
service-fundamentals brief ("make the best decision for the outstanding items", Aug 10, 2026 session)
and these are the recorded dispositions. Distinct from `PROVIDER_LOGISTICS_DISTRIBUTION_SPEC.md` §6's
D1–D5 (the Workstation logistics set) — same session lineage, different decision set.

**Framing (the brief's premise, carried forward):** every service a provider creates is analyzed
through three lenses — **client/user logistics** (can the buyer receive what they bought?),
**provider back office** (can the seller configure and operate it?), and **provider marketing**
(can the seller distribute it?). A gap in the client-logistics column is a *fundamental* gap: a sold
service the platform cannot fulfill.

## Dispositions

- **D1 — RATIFIED: the workspace is a fundamentals surface; the map is the in-person instrument.**
  Amends ruling 22(b)'s framing only — the Catalog map view is the instrument for the place-anchored
  lane, not the definition of the workspace. Nothing already shipped moves. Each delivery method gets
  the instrument its fundamentals need (map for in-person/hybrid/property — shipped; delivery for
  artifacts; scheduling for live sessions), built one ratification at a time.

- **D2 — RATIFIED AND LANDED (this commit): method-aware fundamentals replace uniform Listing Health
  scoring.** Advisor-fundamentals pattern (deterministic checks, honest omission with a reason —
  `advisor-fundamentals.service.ts` precedent), read-side only, no schema change. Applicability
  predicates live in **`shared/service-fundamentals.ts`** (one definition, both sides of the wire):
  - `exact_pin` applies only to place-anchored services (`in_person`/`hybrid` delivery, or
    `productShape='property'`).
  - `availability` applies only to services needing calendar slots (place-anchored + live
    `call`/`video` sessions). Note `video` is a LIVE session in this platform's vocabulary (the
    storefront's own label is "Video call") — it schedules; it is not an artifact.
  - `photo` / `description` / `pricing` / `approval` are universal.
  - A row with no `deliveryMethod` and no property shape is unclassifiable → keeps the historical
    all-checks behavior rather than guessing an omission (§13).
  Landed in `provider-listing-health.routes.ts` (per-service `omitted[]`, applicable-only score
  denominator), the hand-synced `demand.routes.ts` mirror, and the Catalog UI (`provider/services.tsx`:
  muted "n/a" note with reason on hover; non-place-anchored cards show a neutral delivery-method chip
  instead of a red "no location" pin chip).

- **D3 — RATIFIED AND LANDED: the first fulfillment rail is PDF DELIVERY.** Chosen over call
  join-link and async SLA because it was the sharpest client-logistics gap: a sold artifact with no
  delivery mechanism (`provider_services.serviceFile` was a dead column with zero client references).
  **Reuses the existing column — no migration, no schema change** (publish-trap avoidance): the ORM
  column at `shared/schema.ts` (providerServices.serviceFile) was already declared, just never
  written or read by any surface.
  - **Scope is `pdf` only, deliberately.** `video` is excluded — D2 (above) already ratified `video`
    as a LIVE session ("Video call") that needs `SCHEDULED_METHODS`/availability, not an artifact
    file; the two classifications are mutually exclusive by design. `voice_notes` and
    `async_messaging` are artifact/async delivery too but are not this rail's scope — they follow as
    later rails on the same pattern, alongside call join-link. The shared predicate is
    `isArtifactDelivery` in `shared/service-fundamentals.ts` (`ARTIFACT_DELIVERY_METHODS = {"pdf"}`),
    one definition used by both the fundamentals check and the delivery endpoint.
  - **Upload mechanism:** investigated the codebase for an existing upload/object-storage rail to
    reuse (per the design directive) and found none — `serviceImage`/`galleryImages` (and every
    other "photo" field in the app, including the profile-photo `<input type="file">`, which only
    previews locally via `FileReader` and is never persisted) are plain pasted-URL text fields, not
    an upload pipeline. The deliverable field reuses that exact mechanism: a URL text input on the
    ServiceForm delivery step (`client/src/components/ServiceForm.tsx`), shown only when
    `deliveryMethod === "pdf"`.
  - **Write path:** owner-gated the same way `serviceImage` already is — session/ownership check on
    POST/PATCH `/api/provider/services`, not a privileged §14/§18/§19 field (no rate, no identity, no
    money decision), so no allowlist conversion was required for this column specifically.
  - **Delivery surface:** `GET /api/service-bookings/:id/deliverable` (`server/routes.ts`)
    server-derives every condition — session user = booking's `travelerId`, `status = 'confirmed'`,
    the service is artifact-delivery, `serviceFile` is non-empty — collapsing every failure into one
    undifferentiated 404 (§13) except the "qualifies but not uploaded yet" case, which returns a
    distinguishable `NO_DELIVERABLE_UPLOADED` code. `client/src/pages/my-bookings.tsx` renders a
    "Your deliverable" download link only when the server grants it; the client never re-derives
    eligibility.
  - **Leak-prevention audit (§13 — the file URL is the product; a pre-purchase leak is theft):**
    every non-owner read of `provider_services` was audited. Fixed: `GET /api/services/:id` (public
    detail, `content.routes.ts`), `GET /api/services` (public browse, `storage.getAllActiveServices`),
    `GET /api/discover` (`storage.unifiedSearch`), `GET /api/provider-services` (public browse,
    `server/routes.ts`), `GET /api/experts/:id/services` + `GET /api/experts` + `GET /api/experts/:id`
    (all via `storage.getApprovedServicesForExpert`), `GET /api/service-bookings` (the traveler's own
    bookings list — a booking can exist in a pre-payment claim state before confirmation, so this
    general read strips the field too; only the dedicated `/deliverable` endpoint grants it), and
    `GET /api/cart` (`storage._enrichCartItems` — a cart item is pre-purchase by definition). Owner
    console reads (`GET /api/provider/services`, `GET /api/provider/services/:id`, the Listing Health
    endpoint) and admin reads keep the field, as designed.
  - **Fundamentals check:** `delivery_asset` in `provider-listing-health.routes.ts` (mirrored in
    `demand.routes.ts`'s `getListingHealthSummary`) applies only when `isArtifactDelivery` — unlike
    `exact_pin`/`availability`, a non-applicable service gets neither a check nor an `omitted` entry;
    the check simply doesn't exist for it. Client label added to `HEALTH_CHECK_LABELS` in
    `client/src/pages/provider/services.tsx` ("no deliverable").
  - Proven by `server/__tests__/service-deliverable.http.test.ts` (9 proofs): the 404 negatives
    (non-buyer, unconfirmed booking, no file uploaded), the grant for a confirmed buyer, and the
    leak-prevention proof across the public detail/list/browse/cart surfaces.

- **D4 — RATIFIED (small phase, after D3 or parallel): the social closers.** Frame-aware short links
  (one column on the existing link rail), opportunity→frame suggestions, and a publish button inside
  the share kit wired to the existing Content Studio Instagram publishing. Measurement stays on
  Performance (ruling 22(d) — the share rail never grows its own analytics).

- **D5 — RATIFIED AND LANDED (this commit): storefront location chips.** Text-only, city-level chips
  on `/p/:handle` service cards for place-anchored listings (`storefront.routes.ts` now serves
  `city` + `productShape` on the lane-1 select; `storefront.tsx` renders `📍 {city}` beside the
  existing delivery-method chip). Never the meeting point/address pre-purchase; no map tiles on cards.

## Sequencing

D2 + D5 landed together (read-side, zero schema risk). **D3 (PDF delivery rail) has now landed** as
its own phase (no schema change — the existing `serviceFile` column, read-side + write-side +
leak-prevention). Next: D4. The Expert Console is not being forked to build any of this — the provider and expert
consoles already share the load-bearing layers (`provider_services`, the role-aware ServiceForm
wizard, the share-image rail, the availability editor), and what D2 ported from the expert side is the
Advisor fundamentals *pattern* (contract + honesty rules), not copied code: the checks themselves are
provider-shaped and live in the provider lane.
