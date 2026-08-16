---
name: Conformance walk-through evidence standards
description: How to run UI-vs-mock conformance dispatches so verdicts and evidence survive code review
---
**Rule:** In UI conformance walk-throughs, treat a first-pass DIVERGES as a probable DATA GAP before filing: month grids read materialized `vendor_availability_slots` (authoring-table inserts render "Nothing published yet" until `materializeServiceAvailability`/`materializeDateRangeAvailability` runs), the Route share frame only unlocks for listings WITH route stops (ruling 22d), and orientation cards need real seeded rows. Also: the date-ranges save rail is replace-list — a tester touching the editor can wipe seeded ranges.

**Evidence:** completion review rejects byte-identical screenshots reused across rows and "raw response" JSON lacking method/URL/body/status/order. Capture behavioral rows (e.g. edit-split PATCH tests) as an ordered curl run on a clean listing, log every step's request+response, and screenshot the resulting UI state specifically.

**Why:** Task-completion review diffed screenshot hashes and evidence timestamps; two rejections until evidence was ordered and distinct.

**How to apply:** any future dispatch-style runtime verification (console conformance, journey suites) — seed via the write rails or run the materializer, and build per-row distinct evidence files.
