# Content source index (decision-maker, 2026-09-29)

Companion data to `../content-sourcing-brief.md`.

| File | What it is |
|---|---|
| `content_sources.seed.csv` | 33 candidate sources (API, affiliate feed, official and editorial pages) across the markets, with covers / does-not-cover, license class and key status. |
| `provider_recruiting_sources.seed.csv` | 17 places to recruit providers and experts by market and `roles_needed` key, with outreach etiquette. Supply outreach, not content. |
| `traveloure-content-source-index.xlsx` | The workbook these came from: Legend, Needs, Sources, Coverage (Kyoto), Providers (recruiting). |

**No code reads these files.** The brief (§5) rules that a source is added by an admin through a surface and a
deploy never adds a site, and no source goes `active` without `terms_checked_at`. So these are the reference the
decision-maker registers from, through the A6 registry surface, after the terms checks. Every row here is `active = no`.
