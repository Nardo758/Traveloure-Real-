---
name: Amadeus Self-Service decommission
description: test.api.amadeus.com is DNS-dead (as of 2026-08-04); new travel.api.amadeus.com domain rejects the existing keys.
---
Verified 2026-08-04: `test.api.amadeus.com` no longer resolves (Self-Service decommission deadline was 2026-07-17), so every Amadeus call in dev fails at DNS — the SDK config `hostname: 'test'` in the amadeus service points at a dead host. The replacement domain exists (`travel.api.amadeus.com` / `test.travel.api.amadeus.com` both resolve) but the stored AMADEUS_API_KEY/SECRET return 401 invalid_client there — the old Self-Service credentials were not migrated.
**Why:** any "Amadeus is flaky/silent" symptom is actually total, and no code fix alone can revive it — it needs new credentials (re-register on the new portal or Enterprise contract) or replacement via Travelpayouts. That call belongs to Leon (mdixon5030).
**How to apply:** don't debug Amadeus request code before checking DNS + a raw token call against the new domain; treat provider-health "amadeus down" as expected until the credentials decision lands.
