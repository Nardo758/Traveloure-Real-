---
name: Earn demo market constraint
description: The live ready-made listing market contract currently supports Kyoto only.
---

The development database's `ready_made_trips.market` CHECK constraint currently permits only
`Kyoto`. The earn-demo fixture lane therefore creates the requested ready-made listings for Kyoto
and must report non-Kyoto ready-made rows as blocked rather than writing invalid market values.

**Why:** The seed dispatch forbids schema and migration changes, while silently writing Kyoto for
other cities would make city-filtered feeds report false marketplace availability.

**How to apply:** Before expanding ready-made fixtures to other launch markets, obtain the required
product ruling and migration; keep seed behavior explicit and counted until then.