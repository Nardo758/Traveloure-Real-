# Phase 4 Runbook — Blended Network Fill for Kyoto

**Objective:** Populate Kyoto neighborhoods with real gem and service data, turning the NeighborhoodCard counts from 0/0 (sparse/expected) to real numbers. This activates Phase 3's renderers against actual content instead of empty scaffolding.

**Status:** Schema is live (Phase 2 baseline), seed script is ready, orchestrator annotation is restored. Ready to execute.

## Prerequisites (already done)

- ✅ Phase 2 baseline migration applied to prod (`0004_neighborhood_tagging.sql`)
- ✅ City neighborhoods seeded (8 Kyoto + 8 Paris)
- ✅ Location View orchestrator annotates neighborhoods with gem/service counts
- ✅ NeighborhoodCard component renders the counts in a grid

## Execution (on prod)

### Step 1: Run the Phase 4 network fill seed

```bash
# In prod shell, with DATABASE_URL pointing to prod
npx tsx server/seeds/phase-4-kyoto-fill.seed.ts
```

**Expected output:**
```
[Phase 4] Seeding Kyoto hidden gems with neighborhood tags...
[Phase 4] Gems: 11 inserted, 0 already present.
[Phase 4] Seeding Kyoto provider services with neighborhood tags...
[Phase 4] Services: 6 inserted, 0 already present.
[Phase 4] Fill complete: 11 gems, 6 services inserted.
[Phase 4] Skipped: 0 gems, 0 services already present.
```

### Step 2: Verify neighborhood rollup

```bash
# Still on prod
npx tsx server/scripts/verify-phase-1b.ts
```

**Expected output changes from Phase 2:**
- `[A.2] Kyoto rollup density` should show:
  - Gion: ~2-3 gems/services
  - Higashiyama: ~2-3 gems/services
  - Arashiyama: ~2 gems/services
  - Pontocho: ~1 gem/service
  - Kyoto Station Area: ~1 gem/service
  - Nishijin: ~1 gem/service
  - Kawaramachi/Sanjo: ~1-2 gems/services
  - Fushimi: ~1 gem/service
  - **Total: ~11 gems + 6 services across 8 neighborhoods**

All other checks remain PASS (guardrail, neighborhood seeding).

### Step 3: Verify in UI

Navigate to `/discover/location/Kyoto` on prod.

**By Neighborhood section should now show:**
- Each of 8 neighborhood cards with real gem + service counts
- No longer 0/0 for any neighborhood
- If counts are sparse (1-2 items per neighborhood), that's correct — Phase 4 is the initial fill; Phase 5+ blended expansion happens later

## Data included in this fill

### Gems (11 total)
- **Gion** (2): Gion Corner, Hanami Koji street
- **Higashiyama** (2): Kiyomizu-dera temple, Sannenzaka street
- **Arashiyama** (2): Bamboo grove, Togetsukyo bridge
- **Pontocho** (1): Pontocho alley
- **Kyoto Station Area** (1): Kyoto Tower
- **Nishijin** (1): Textile museum
- **Kawaramachi/Sanjo** (1): Nishiki market
- **Fushimi** (1): Fushimi Inari shrine

### Services (6 total)
- Gion walking tour with photographer
- Temple meditation session (Higashiyama)
- Arashiyama bamboo & tea ceremony
- Pontocho riverside dining reservation
- Nishiki market food tour
- Fushimi sake brewery tour

All gems and services are tagged with the correct neighborhood slugs and are idempotent (safe to re-run without duplication).

## Success criteria

Phase 4 is complete when:
1. ✅ Prod verify-phase-1b runs successfully (Kyoto rollup density shows real numbers, not sparse signal)
2. ✅ `/discover/location/Kyoto` UI shows NeighborhoodCard with non-zero gem/service counts
3. ✅ No TypeScript or database errors

## Notes

- The seed is idempotent — re-running it won't create duplicates. Safe to re-run if needed.
- Gem and service data is demonstration-quality, not production-curated. Phase 5+ will expand with real TravelPulse data and user-created services.
- The orchestrator query (neighborhood annotation) runs for every /api/discover/location/:city request. Performance is acceptable for Kyoto (8 neighborhoods × 2 queries). Watch for N+M scaling if neighborhoods grow beyond 10-20.

## Phase 4 complete gates into

- Phase 3 follow-ups: Swap embed sites, reuse SpontaneousDiscovery primitives, add-to-experience action
- Phase 5+: Expanded network fill, user-created content, discovery refinement
