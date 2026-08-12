# Catalog & Distribute — Execution Map

**Status:** ratified 2026-08-11 (decision-maker, in session) → DECISIONS.md **ruling 74**.
**Source mockups:** Catalog Preview (`artifact 2caaa7c9`), Distribute (`artifact 842acf20`),
Transport & Logistics (`artifact ea8cefed`), this map (`artifact f29a6519`).

Build the two approved provider-console surfaces (Catalog Preview + Distribute) plus the
Transport & Logistics step, as verifiable lanes in two waves. **Most of this is reuse** — the
surfaces largely exist and are scattered. Each lane follows the standing discipline: a ledger
note before/at build, the full keep-green battery + all guards exit 0, the tsc ratchet holds,
committed proofs (negatives first), independent verification at the seam.

## Governance that binds every lane
- **§13 honesty** — no invented distances/drive-times, no guessed pins, real data only; absent renders as absent.
- **§14 / §19** — any client-reachable new field (surcharge, display options) is server-derived or a pick-based allowlist; amount/identity/rate never off `req.body`.
- **Publish-trap** — every new column declared in `shared/schema.ts` + registered, additive-nullable, app-enforced (no DB CHECK).
- **Caption hold** — fee-waiver wording stays out until the traveler fee is billed on the direct path; Distribute ships the neutral "book direct" copy only.

## Ratified design decisions (ruling 74)
- **One door.** Add New Service → **Workstation** (service / bundle / property). One creation flow, lighter code.
- **Catalog = Manage home + Preview toggle.** Preview reuses the *shared* traveler card (extracted in C1) and honors real storefront visibility (approved+active only).
- **Per-listing display options.** `show_price` + `booking_mode` (instant/request/hidden) — provider's call. **Hidden price is allowed for ALL services**, not only quote-based ones (default still shows price). **Hover-Edit is KEPT** on Preview cards (hover-only; one click to fix what you spot).
- **Map = traveler layers + business layers**, all §13-honest.
- **Distribute is a full page**, four channels (Storefront · Marketplace · Direct · Social), reached from Workstation. **Storefront/share tools stay on Catalog**; Distribute deep-links.
- **Promote → Distribute.** Catalog's Promote container becomes a per-listing on-ramp into Distribute — keep the timely nudges, move the channels to the one hub. No second share surface.
- **Measurement stays on Analytics/Earnings** — Distribute deep-links, never grows its own analytics.

## Codebase anchors (from the inventory pass)
- Catalog page: `client/src/pages/provider/services.tsx:793` (List/Map toggle `:803/:1023`, storefront header `:201`, availability `:346`, Promote/`PostingOpportunitiesCard` `:1224`, health `:820`).
- Traveler card: `OfferingCard` is **local, un-exported** in `client/src/pages/storefront.tsx:141`; Catalog draws its own inline markup `services.tsx:1064-1214`.
- Map: `ServiceLocationMap` (`client/src/components/service-location-map.tsx:133`, renders pin/radius/route/drag; nothing when no pin `:177`) inside `CatalogMapView` (`catalog-map-view.tsx:83`).
- Distribute parts: short-links `server/routes/short-links.routes.ts` (POST mint, PATCH expiry, `/r/:code`); share images `server/routes/share-images.routes.ts` (`format=feed|story|route`); rails `server/services/rails-attribution.service.ts`; posting-opps `GET /api/me/posting-opportunities`; link analytics `GET /api/me/link-analytics` + `LinkAnalyticsPanel`.
- Gates: `publish-verification.service.ts` `resolvePublishVerification`, `attestation-publish-gate.service.ts` `checkAttestationPublishGate`.
- Logistics: `ServiceForm.tsx` step 2 already writes all 11 D7 fields (`showLogisticsCapture:1232`, block `:2614-2851`); migration 195. **10/11 fields have NO server reader** — only `changeCutoffHours` (`deposit.service.ts:94`).

## Lanes

### Wave 1 — ship the two pages (mostly reuse, low risk)
- **C1 · Extract the shared traveler card** — ✅ **DONE** (`4f8d3f2`, ruling 74): `OfferingCard` → `client/src/components/OfferingCard.tsx` (shared/exported, faithful move), adopted by storefront; Catalog adoption is C2. Storefront DOM byte-unchanged. *Gates C2.* No schema.
- **C2 · Manage ⇄ Preview toggle** — ✅ **DONE** (`2ed4328`, ruling 74): client-only view-mode on Catalog (`client/src/pages/provider/services.tsx`). Manage = today's operational cards (unchanged); Preview renders C1's shared `OfferingCard`, filtered to the SAME storefront predicate `storefront.routes.ts` `loadStorefront` applies (`approvalStatus='approved' AND status='active'`), so paused/draft/unapproved listings drop out exactly as on `/p/:handle`. Manage/Preview is a separate axis from List/Map (governs the list grid; map unchanged). Hover-Edit kept (ruling 74 res. B) as an overlay sibling of the card link — storefront card byte-unchanged, C1 not regressed. Proof: `playwright/tests/catalog-preview-toggle.spec.ts` (the seeded `kyoto-interpreter` "Business Document Translation" is approved+draft → in Manage, absent from Preview). No schema.
- **C3 · Per-listing Book & price options** — ✅ **DONE** (`361dce8`, ruling 74/75): new `provider_services.show_price` (bool, DEFAULT true) + `booking_mode` (varchar, app-enforced `bookingModeEnum` instant|request|hidden, NO DB CHECK, NULL = unset ⇒ resolved from account `service_provider_forms.instantBooking:509` by `resolveBookingMode`, migration 202, both DECLARED in `shared/schema.ts`). `OfferingCard` extended with optional `showPrice?`/`bookingMode?` (default = today's behavior); `showPrice=false` ⇒ honest "Enquire for pricing" (never $0, §13); `bookingMode` drives the CTA. Catalog Manage "Card shows" control (`CardShowsControl`) PATCHes one pref; the null-default is resolved in ONE place server-side (`resolveBookingMode`, called on the storefront read AND the owner read) so every card is concrete. These are DISPLAY prefs (not §14/§18/§19 money fields) so NOT stripped — money guard + omit-ratchet stay green; the schema stays `.omit()`-based (`.pick()` conversion is the standing `#PS18` job, not this lane). Proof: `server/__tests__/service-display-options.http.test.ts` (9, negatives first) + `playwright/tests/service-display-options.spec.ts`. Migration + schema (publish-trap), money guard clean.
- **C4 · Map — traveler layers** — mostly done; ship the honest "X of Y located" + unpinned rail. No schema.
- **D1 · Distribute shell + Storefront + Marketplace** — ✅ **DONE** (`a20cf0f`, ruling 74/76): new full page `/provider/distribute` (`client/src/pages/provider/distribute.tsx`, provider-gated route in `App.tsx`, reached from the Workstation header's Distribute action). Storefront channel = a SECOND MOUNT of Catalog's now-`export`ed `ProviderStorefrontHeader` (storefront/share tools STAY on Catalog). Marketplace channel = owner-gated `GET /api/provider/services/:id/publish-readiness` that COMPOSES approval status + `resolvePublishVerification` + `resolveAttestationShape`/`checkAttestationPublishGate` (re-derives none); `isLive` = the storefront read's own `approved AND active`, a blocked listing shows the true ordered gate reason with a fix deep-link (§13). Listing selector from `GET /api/provider/services`; `channels-container` seam left for D2–D4/C6. Caption hold honored (neutral copy, no fee-waiver wording). Proof: `playwright/tests/distribute-shell.spec.ts`. No schema. *Gates D2–D4, C6.*
- **D2 · Direct-link channel** — reuse short-links + rails. Caption hold (grep clean). Needs D1. No schema.
- **D3 · Social-kit channel** — reuse share-image rail + posting-opps + promo-text; deep-link to Catalog share studio. Needs D1. No schema.
- **D4 · Channel-state strip + analytics deep-link** — reuse link-analytics; no duplicated analytics. Needs D1. No schema.
- **C6 · Promote → Distribute** — rework `PostingOpportunitiesCard` container into the on-ramp. Needs D1. No schema.
- **T1 · Polish the existing logistics step** — bring `ServiceForm` step 2 up to the mock (transport provision, radius-or-route never-clobber, points, timing, capacity, booking rules) on fields that already persist. No schema.

### Wave 2 — make the data earn its keep (money/data, higher care)
- **T2 · Wire the D7 consumers** — calendar ← duration/buffer/start-window/lead-time · matching ← party size · trip-anchor ← `canAnchor` · travel pricing ← radius (see B1). Each its own lane; scheduling/§15-adjacent.
- **B1 · Travel-surcharge zones** — provider-set fee beyond a distance ring; listing config, but changes the charge → money lane (§14, server-derived, money guard). Migration + schema.
- **B2 · Demand heat + coverage-gap alerts** — overlay from **real** booking/search rows only (§13); low-signal shows "not enough signal yet". Read-only.

**Dependencies:** C1→C2; D1→{D2,D3,D4,C6}. B1 before T2's travel-pricing reader (shared surcharge model). Everything else independent.
