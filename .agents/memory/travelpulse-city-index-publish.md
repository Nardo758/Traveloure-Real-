---
name: TravelPulse city index publish compatibility
description: Production retains duplicate normalized city/country rows, so its schema cannot receive the expression unique index through Publish.
---

The normalized city/country unique index is restored in development, but production must run the approved reconciliation operation before publishing/appling the index there.

**Why:** Replit Publish applies schema diffs but does not run the application's data-cleanup migrations against production. The production duplicates make the unique-index DDL fail validation, blocking deployment.

**How to apply:** Run the reconciliation script in audit mode, approve its deterministic canonical choices, apply it transactionally (repointing city-media references first), then publish the index and run the unique-index preflight.