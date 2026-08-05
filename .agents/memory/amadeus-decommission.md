---
name: Amadeus Self-Service decommission
description: test.api.amadeus.com is DNS-dead (as of 2026-08-04); new travel.api.amadeus.com domain rejects the existing keys.
---
Verified 2026-08-04: `test.api.amadeus.com` no longer resolves (Self-Service decommission deadline was 2026-07-17), so every Amadeus call in dev fails at DNS — the SDK config `hostname: 'test'` in the amadeus service points at a dead host. The replacement domain exists (`travel.api.amadeus.com` / `test.travel.api.amadeus.com` both resolve) but the stored AMADEUS_API_KEY/SECRET return 401 invalid_client there — the old Self-Service credentials were not migrated.
**RESOLVED 2026-08-05 — DROPPED (DECISIONS.md ruling 34):** Leon ruled drop, not re-credential. amadeus.service.ts short-circuits every method (AMADEUS_DROPPED guard, empty results, no network); provider-health entry isConfigured=false. Revival requires new credentials AND a new ruling.
**How to apply:** never "fix" Amadeus call paths — empty results from it are by design; full dead-code removal (cache/catalog call sites, env secrets) is separate follow-up work.
