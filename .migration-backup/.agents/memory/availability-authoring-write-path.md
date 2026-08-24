---
name: Availability authoring write path
description: Why direct DB inserts into service_availability_patterns never show in the month grid
---
The provider month grid and "Next available" chip read **materialized** `vendor_availability_slots`,
not the pattern tables. Patterns/ranges/blackouts must be authored via
`PUT /api/provider/services/:id/availability-{patterns,date-ranges,blackouts}` (replace-list
semantics), which materializes slots (see `server/jobs/availabilityMaterializationSweep.ts`).

**Why:** rows inserted directly into the pattern tables appear in the editor form but produce
zero bookable cells — it looks like a grid bug, but it is a bypassed write path.

**How to apply:** when seeding availability for tests/benches, always go through the PUT endpoint
with a logged-in owner session; blackouts win over pattern days in the grid (correct precedence).
