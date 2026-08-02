---
name: Amadeus Self-Service API discontinued
description: Why all Amadeus calls fail and what to do about it
---

Amadeus shut down its Self-Service API on **July 17, 2026** — keys disabled, portal closed, and `test.api.amadeus.com` / `api.amadeus.com` no longer resolve in DNS. This is a vendor decommission, NOT a container DNS/egress problem (general DNS works).

**Why:** the app's entire `/api/amadeus/*` surface plus `/api/catalog/flights` depended on it; every call now 500s. Task exists to retire or replace it (Amadeus Enterprise is the only official successor and requires a contract).

**How to apply:** never debug "Amadeus NetworkError/DNS fail" as an environment issue; treat any remaining Amadeus code as dead until a replacement decision is made.
