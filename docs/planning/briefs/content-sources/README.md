# Content source index (decision-maker, 2026-09-29)

Companion data to `../content-sourcing-brief.md`.

| File | What it is |
|---|---|
| `content_sources.seed.csv` | 35 candidate sources (API, affiliate feed, official and editorial pages) across the markets, with covers / does-not-cover, license class and key status. `google_routes` (added Sep 30, 2026) records the Routes API behind the travel-time matrix: live, first Kyoto refresh recorded, covers `transport.local` durations and legs, never fares, passes or last-service rules; its 30-day cache limit is why the refresh is monthly. `eventbrite` (added Nov 12, 2026) is inactive (`active` no, `key_status` none): a partner API for dated events and ticket pages, not a general activity feed. Public event search shut down in December 2019, so bulk access needs the distribution partner program; Kyoto coverage was thin (16 items on 2026-11-12). API Terms §3.2 requires the event title and a direct do-follow link, §3.3 forbids the Eventbrite name or logo without written consent and requires a not-owned-by-Eventbrite disclaimer, and §3.6 forbids a competing product. Unverified: the partner application URL, the affiliate network, and which rate limit (1,000 vs 2,000 calls per hour) applies. |
| `provider_recruiting_sources.seed.csv` | 17 places to recruit providers and experts by market and `roles_needed` key, with outreach etiquette. Supply outreach, not content. |
| `a6-design.md` | How each of the brief's four pending decisions (§11) would change the A6 build. A6 is on hold; this builds nothing. |
| `traveloure-content-source-index.xlsx` | The workbook these came from: Legend, Needs, Sources, Coverage (Kyoto), Providers (recruiting). |

**No code reads these files.** The brief (§5) rules that a source is added by an admin through a surface and a
deploy never adds a site, and no source goes `active` without `terms_checked_at`. So these are the reference the
decision-maker registers from, through the A6 registry surface, after the terms checks. Every row here is `active = no`.
