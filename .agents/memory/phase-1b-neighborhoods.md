---
name: Phase 1b neighborhood system
description: cityNeighborhoods table, neighborhood columns on gems/services, Haversine backfill, verify script quirk on empty dev DB.
---

## The rule
`cityNeighborhoods` is a lookup table keyed by (city, country, slug). The `neighborhood` column on `travelPulseHiddenGems` and `providerServices` is a soft FK to the slug — stable across renames.

## How to apply
- Adding a new city: run `tsx server/seeds/city-neighborhoods.seed.ts` after extending SEED_DATA.
- After seeding, run `tsx server/scripts/backfill-gem-neighborhoods.ts` to assign slugs to existing gems via Haversine proximity.
- Verify with `tsx server/scripts/verify-phase-1b.ts`.

**Why:** Phase 3 ecosystem-unit rolls up content by neighborhood slug. Slug (not name) is used so renames don't break rollups.

## Verify check [B] false-negative on empty dev DB
Check [B] ("Gem backfill ran") requires at least one `travel_pulse_hidden_gems` row with lat/lng populated to pass. On a fresh dev DB with no TravelPulse gems seeded, backfill returns `scanned=0` (correct) but [B] still fails because there's nothing to spot-check. This is expected and will be a real PASS in production. Don't treat [B] failure as a blocker on dev.
