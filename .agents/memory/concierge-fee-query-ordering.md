---
name: Concierge fee query ordering
description: getFee() must ORDER BY is_disabled DESC so disabled admin-override rows beat seeded defaults
---

## Rule
`getFee(eventType, tier)` in `optimization-fee.service.ts` looks up the first
active row for an event_type. Without `ORDER BY is_disabled DESC`, postgres
non-deterministically returns the seeded (is_disabled=false) row before any
admin-inserted disabled row, breaking the `$0=off` gate.

**Why:** The seeded row (e.g. birthday/simple) and a test/admin disabled row
(birthday/standard) are both active. `.limit(1)` with no ORDER BY picks either
one. A disabled row should always take precedence as an admin override.

**How to apply:** Any change to the getFee event-type lookup path must keep
`orderBy(desc(optimizationFees.isDisabled))` before `.limit(1)`.
