---
name: Amadeus decommission
description: Amadeus integration was dropped (DECISIONS.md ruling 34) and its code fully removed in Aug 2026.
---

Amadeus Self-Service was dropped (DECISIONS.md ruling 34, 2026-08-05) and the dead code was **fully removed** on 2026-08-05: service file, `server/types/amadeus.d.ts`, the `amadeus` npm package, all call sites, the provider-health entry, and the CI stub env vars in every `.github/workflows/*.yml`.

**Why:** test.api.amadeus.com went DNS-dead (~2026-07-17) and stored keys 401 on the replacement domain; Leon ruled DROP rather than re-credential.

**How to apply:**
- `/api/amadeus/*` routes still exist (client components call them) but return honest empties / 404s — no live provider behind them.
- Hotel/flight cache-miss paths in `cache.service.ts` return `{data: [], fromCache: false}`; Booking.com fetch-on-miss lives in `experience-catalog.service.ts`.
- Reviving Amadeus requires new credentials AND a new ledger ruling — do not "fix" empty results by re-adding it.
- Agent tooling cannot delete Replit secrets; AMADEUS_API_KEY/SECRET must be removed by the user in the Secrets pane (flagged 2026-08-05).
