---
name: Crash fixture process boundaries
description: A kill must reach the process that owns the native database transaction.
---

Kill the actual process that owns the transaction, not a launcher that can leave
its child alive holding database locks.

**Why:** A crash fixture launched through the tsx CLI survived a launcher-only
SIGKILL and stalled recovery instead of proving rollback.

**How to apply:** Run TypeScript workers directly with Node's tsx import hook,
or terminate and verify the entire process group. Require an explicit native
commit-boundary signal before killing the worker.
