---
name: Landing Moment demo seeding
description: How to demonstrate live Landing Moments without weakening attribution or production data safeguards.
---

Landing Moment demos must use real, license-verified photos, a clearly identified test curator, fixed identifiable fixture IDs, and `ai_generated = false`. Development can seed directly; production activation belongs to the normal publish/startup path, never direct production SQL.

**Why:** The Moments surface is an attribution trust gate; stock, AI, or invented expert identities would make a visual demo contradict the product ruling.

**How to apply:** When a UI demo needs live Moments, use the idempotent demo seed and preserve photo source/license notes. Remove the labeled fixtures later rather than changing resolver rules.