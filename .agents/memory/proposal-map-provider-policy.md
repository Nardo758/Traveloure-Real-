---
name: Proposal map provider policy
description: Provider and data-honesty rules for optimizer proposal maps.
---

Use Google Maps through the existing vis.gl plan-map conventions as the primary in-app proposal map. Use Leaflet/OSM only when the Google key is absent or when a share/export surface would make Google unsuitable. Render persisted coordinate pairs only, omit the map canvas when none exist, and treat connectors as straight sequence lines rather than routing claims.

**Why:** The proposal review must remain useful without a Google key while avoiding fabricated city-center pins, travel routes, distances, or durations and respecting provider terms on exported surfaces.

**How to apply:** Reuse the shared focused-proposal map instead of mounting one map per comparison column. Always expose the located/total count and retain ODbL attribution on Leaflet/OSM surfaces.