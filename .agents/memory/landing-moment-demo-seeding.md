---
name: Landing Moment demo seeding
description: How to demonstrate live Landing Moments without weakening attribution or production data safeguards.
---

Landing Moment demos must use real, license-verified photos, unmistakably synthetic `@dev-fixture-*` curators on `@traveloure.test` identities, fixed identifiable fixture IDs, and `ai_generated = false`. A curator must have an expert-form city matching the Moment market; production seeding is disabled and boot purge removes the reserved fixtures.

**Why:** The Moments surface is an attribution trust gate; stock, AI, invented expert identities, or a cross-market handle would make a visual demo contradict the product ruling.

**How to apply:** When a UI demo needs live Moments, use the idempotent demo seed and preserve photo source/license notes. Keep the resolver market guard in product code, honest-omit unresolved captions/bylines, and remove labeled fixtures after capture.