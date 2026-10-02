---
name: Reference data in isolated live verification
description: Empty constraint-preserving schemas need platform catalog and fee data before payment fixtures are usable.
---
Keep all foreign keys when isolating payment tests, and seed the required non-personal platform reference catalogs and fee configuration explicitly.

**Why:** An empty clone correctly refused request-mode checkout, lacked commission bands, and rejected payment-regression fixtures referencing platform offering keys. These are fixture prerequisites, not grounds to relax production safeguards.

**How to apply:** Discover the relevant reference constraints, copy only allowlisted platform-owned reference data, and never copy users, credentials, overrides, or customer bookings. Isolate serial defaults as well as tables; retain no public search-path fallback.