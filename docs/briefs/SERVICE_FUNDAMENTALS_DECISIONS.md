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

- **D4 — RATIFIED AND LANDED: the social closers.** Frame-aware short links (one column on the
  existing link rail), opportunity→frame suggestions, and a publish button inside the share kit
  wired to the existing Content Studio Instagram publishing. Measurement stays on Performance
  (ruling 22(d) — the share rail never grows its own analytics).
  - **The closed frame vocabulary** (`shared/share-frames.ts`, `SHARE_FRAMES`): `feed | story |
    route | review` — derived directly from the real share-image render surface
    (`server/routes/share-images.routes.ts`'s `?format=feed|story|route` on the service endpoint,
    `?format=feed|story` on ready-made, and the review endpoint's own single implicit frame), not
    invented (§13). ONE definition, imported by both the short-link create route and the
    opportunity-suggestion route so the server never validates a vocabulary the client doesn't
    render.
  - **Frame-aware short links:** additive nullable `short_links.frame` varchar(20) (migration 193,
    no CHECK — same app-enforced-vocabulary posture the pre-existing `target_type` column already
    uses on this table). `POST /api/short-links` accepts an optional `frame` validated against the
    closed allowlist; omitted stays the historical untagged link, byte-for-byte the same behavior
    as before this change. **Frame participates in the create-path dedupe identity**
    (`owner + targetType + targetId + frame`, `IS NULL`-aware on both `targetId` and `frame`) so a
    frame-tagged request never returns the untagged link (or a different frame's link) and each
    frame mints its own code — the property the whole feature depends on. Redirect (`GET /r/:code`)
    and click counting are unchanged; frame is metadata, not routing. The §14 ownership re-check on
    create is untouched.
  - **Performance-only measurement (ruling 22(d)):** `GET /api/me/link-analytics` gained a
    `frameBreakdown` array (clicks/bookings/revenue grouped by frame) and each per-link row now
    carries its `frame`. §13 honesty: a frame group appears ONLY when the earner actually has a
    link tagged with it — a frame with zero of the earner's links is absent, never a zero-filled
    guess. Legacy/generic NULL-frame links are represented under an explicit `frame: null` /
    "Untagged" bucket rather than being dropped or folded into a real frame. Rendered in
    `client/src/components/backoffice/link-analytics-panel.tsx` (shared expert/provider
    Performance surface). The share kit itself grows no new analytics — this is Performance-only,
    per ruling 22(d).
  - **Opportunity→frame suggestions:** `GET /api/me/posting-opportunities`
    (`expert-console.routes.ts`) now stamps each opportunity with a deterministic
    `suggestedFrame`, no AI: a review-based opportunity always suggests the dedicated `review`
    frame; an open-slot opportunity suggests `route` when that service actually HAS route stops,
    else `feed` — reusing `storage.getServiceRoutePoints` (the SAME source of truth
    `share-images.routes.ts` itself gates the route frame on, per ruling 22(d)) rather than
    re-deriving the "does this service have a route" rule a second way. An opportunity kind with
    no honest mapping gets no suggestion — never a guessed default. Surfaced in
    `share-tools.tsx`'s `PostingOpportunitiesCard` (split into `ReviewOpportunityCard` /
    `SlotOpportunityCard` so each carries its own image-load state): the suggested frame's badge,
    preview image, and the short link minted when acting on the opportunity (now frame-tagged with
    `suggestedFrame`) all agree with each other.
  - **Publish button:** `InstagramPublishButton` (`share-tools.tsx`) wires the EXISTING
    `POST /api/instagram/publish` rail (`server/routes/instagram.ts` — real OAuth + container +
    publish, UNCHANGED, no second Instagram integration) into `OfferingShareDetail` (one button
    per feed/story/route image) and both opportunity cards. Instagram's Graph API fetches the
    image server-side by URL, so the button resolves the share-image path to an absolute,
    publicly-reachable URL (`window.location.origin` + path) before publishing — the same
    resolution `ensureShortLink` already does for short links. Honesty states (§13, never a
    silently-failing button): an unapproved/inactive listing or a route frame with no stops
    disables the button with the reason shown (mirrors the exact gate the `<img>` itself already
    fails on — `routeAvailable`/an `onError` flag, not a second guess at approval state); Instagram
    not connected shows "Connect Instagram to publish" and triggers the SAME OAuth kickoff Content
    Studio uses (extracted to `client/src/lib/instagram-connect.ts` — `connectInstagram()` — and
    Content Studio's own "Connect Instagram" banner now calls it too, so there is one
    implementation, not two); otherwise it publishes.
  - **Deliberately scoped out:** no second Instagram OAuth/publish implementation (reused
    verbatim); no route-format short link for Ready Made Trips (that render surface has no `route`
    format — the allowlist only contains frames that are real); no analytics on the share kit
    itself (ruling 22(d)); no live end-to-end Instagram publish proof in this environment (no
    `INSTAGRAM_APP_ID`/secret configured locally, and the dev server is not publicly reachable for
    Meta's Graph API to fetch from) — verified instead via the existing `resolveInstagramVerifyStatus`
    / `resolveInstagramPublishTokenError` unit contracts (unchanged) and manual confirmation that
    `GET /api/instagram/status` / `GET /api/instagram/config` degrade honestly with no credentials
    configured.
  - Proven by `server/__tests__/short-links-frame.http.test.ts` (7 proofs): an omitted frame
    preserves today's exact dedupe behavior, a frame-tagged request mints and re-fetches its own
    code distinct from the untagged link and from other frames, an out-of-allowlist frame is
    rejected (400), and `frameBreakdown` represents feed/story/untagged honestly while never
    zero-filling a frame the owner has no link for.

- **D5 — RATIFIED AND LANDED (this commit): storefront location chips.** Text-only, city-level chips
  on `/p/:handle` service cards for place-anchored listings (`storefront.routes.ts` now serves
  `city` + `productShape` on the lane-1 select; `storefront.tsx` renders `📍 {city}` beside the
  existing delivery-method chip). Never the meeting point/address pre-purchase; no map tiles on cards.

## Sequencing

D2 + D5 landed together (read-side, zero schema risk). D3 (PDF delivery rail) landed as its own
phase (no schema change — the existing `serviceFile` column, read-side + write-side +
leak-prevention). **D4 (the social closers) has now landed**, the last outstanding decision of this
brief — additive migration 193 (`short_links.frame`), the frame-suggestion read on
`posting-opportunities`, and the share-kit publish button wired to the existing Instagram rail; no
new Instagram integration, no new analytics surface outside Performance. The Expert Console is not
being forked to build any of this — the provider and expert consoles already share the
load-bearing layers (`provider_services`, the role-aware ServiceForm wizard, the share-image rail,
the availability editor), and what D2 ported from the expert side is the Advisor fundamentals
*pattern* (contract + honesty rules), not copied code: the checks themselves are provider-shaped
and live in the provider lane.
