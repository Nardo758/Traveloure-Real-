---
name: Transport Commerce Layer
description: Implementation notes for the transport booking resolver (Phases 0-5) — what was replaced, where rates live, what was removed.
---

## What was implemented

`server/services/transport-booking-options.service.ts` — both stub functions replaced:

**findTransportProviders** (Phase 1)
- Only runs for PLATFORM_MODES: taxi/car/shuttle/private_driver/transfer/rideshare
- Two queries merged: location ILIKE match + content_affinity_tags @> array check
- content_affinity_tags query wrapped in try/catch (absent on older dev DBs)
- Commission rate: `resolveTransportCommissionRate()` reads `booking_fee_configs` WHERE category = 'platform_transport_commission'; fallback = TRANSPORT_COMMISSION_DEFAULT constant (10%)

**findAffiliateTransportOptions** (Phase 2)
- 12Go always included; Omio always included; DiscoverCars if distance > 5km; Kiwi if distance > 100km
- Margin rates: `resolveAffiliateMarginRate(partner)` reads `booking_fee_configs` WHERE category = `affiliate_margin_{partner}`; fallback = AFFILIATE_MARGIN_DEFAULTS map
- URL builders: buildTwelveGoUrl, buildOmioUrl, buildDiscoverCarsUrl, buildKiwiUrl — all accept nullable token

## Where rates live

`AFFILIATE_MARGIN_DEFAULTS` and `TRANSPORT_COMMISSION_DEFAULT` in the service file are the **only** approved literal location — fallbacks for when booking_fee_configs table is absent/pre-migration. All actual reads go through the resolver helpers. Migration 031 seeds the real values.

## Phase 3: unified resolver + UI

- `GET /api/transport-legs/:legId/options` in transport-hub.routes.ts — lazy-populates on first call
- `LegBookingPanel` component in TransportSection.tsx — expandable per-leg panel, platform options (green Book CTA) then affiliate deep-links (View + ExternalLink)

## Phase 5: removed widgets

From `client/src/pages/experience-template.tsx`:
- TravelpayoutsTransport function (GetTransfer + Omio UI)
- DiscoverCarsWidget function
- TravelpayoutsNomad function (Kiwi Nomad routes)
- Imports: TransferCard, GroundTransportCard, CarRentalCard, NomadRouteCard

**Why:** These widgets duplicated what the new per-leg booking panel provides, but without revenue tracking or platform-first ordering.

## Notes

- `transportBookingOptions.providerId` column is INTEGER in schema but provider_services.id is UUID — do not populate this field for platform providers (pass as undefined).
- `calculateProviderPrice` now uses real provider pricing: fixed price returned as-is, variable price as per-km rate, no price = $2/km estimate with $5 floor.
