---
name: Isolated database constraint identity
description: Preserve the production constraint contract in disposable test schemas rather than relaxing application duplicate detection.
---

Disposable PostgreSQL LIKE INCLUDING ALL clones can preserve uniqueness
while generating different primary/unique constraint names. Those names
are part of the application's error-classification contract.

**Why:** A concurrency fixture can return an unhandled error instead of a
neutral duplicate response solely because the clone renamed a constraint.
Relaxing application duplicate detection to accommodate the fixture would
change runtime behavior for a test-infrastructure defect.

**How to apply:** Preserve source constraint identity and definitions inside
the owned clone. Never rename public constraints or broaden production error
classification to repair a disposable fixture. Keep unrelated missing fixture
configuration separate; successful catalog restoration does not make a
waitlist-blocked signup test pass.
