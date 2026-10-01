---
name: Production geocoding verification
description: Use normal boot geocoding results, not extra probes, to verify production access.
---

Use the normal seeded-venue boot geocoding result as the production reachability
observation. Do not send separate Nominatim requests merely to test egress.
Previously located rows do not establish that this boot made a successful request;
an already-seeded cohort can correctly leave reachability untested.

**Why:** The operator chose the application's own post-publish behavior as the
empirical test and requested a cached health observation, avoiding extra public
geocoder requests. A skipped lookup must not become false evidence of reachability.

**How to apply:** After confirming the published build contains the geocoding
change, read its cached health observation first. Use read-only cohort queries as
supplementary evidence. A seeder failure can mean a timeout, non-OK response or
other geocoder failure, not necessarily egress denial: inspect boot logs before
recommending a host allowlist change. Publishing and republishing remain operator
actions.