# Content source index (decision-maker, 2026-09-29)

Companion data to `../content-sourcing-brief.md`.

| File | What it is |
|---|---|
| `content_sources.seed.csv` | 34 candidate sources (API, affiliate feed, official and editorial pages) across the markets, with covers / does-not-cover, license class and key status. `google_routes` (added Sep 30, 2026) records the Routes API behind the travel-time matrix: live, first Kyoto refresh recorded, covers `transport.local` durations and legs, never fares, passes or last-service rules; its 30-day cache limit is why the refresh is monthly. |
| `provider_recruiting_sources.seed.csv` | 17 places to recruit providers and experts by market and `roles_needed` key, with outreach etiquette. Supply outreach, not content. |
| `traveloure-content-source-index.xlsx` | The workbook these came from: Legend, Needs, Sources, Coverage (Kyoto), Providers (recruiting). |

**No code reads these files.** The brief (§5) rules that a source is added by an admin through a surface and a
deploy never adds a site, and no source goes `active` without `terms_checked_at`. So these are the reference the
decision-maker registers from, through the A6 registry surface, after the terms checks. Every row here is `active = no`.
