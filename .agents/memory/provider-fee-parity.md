---
name: Provider fee parity
description: Production verification status for provider commission-band resolution.
---

The production fee-config parity gate passes for default, activities, dining, and provider-commission contexts. The live display endpoint and production charge resolver agree at 25% platform / 75% provider for every checked context.

**Why:** A previously deactivated fee band had left settings pointing at an inactive key. Provider checkout must remain gated on verifying that production settings resolve through active replacement bands.

**How to apply:** Re-run the production parity gate before enabling or materially changing provider checkout or commission settings. A matching display is necessary but should still resolve through active fee-band configuration.