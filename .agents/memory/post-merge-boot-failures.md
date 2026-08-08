---
name: Post-merge boot failures
description: ERR_MODULE_NOT_FOUND at server start after a task-agent merge usually means node_modules wasn't synced, not a code bug.
---

**Rule:** If the server crashes on boot with `ERR_MODULE_NOT_FOUND` right after a task-agent branch merge, check whether the package is declared in package.json but missing from node_modules before hunting for branch bugs. Fix is `npm install`, then restart.

**Why:** Aug 2026 Clerk-auth merge: `passport` was in package.json but the merge reconciliation never ran the dependency install; two restart attempts failed identically and looked like a branch regression. The crash happens before `runMigrations()`, so unapplied migrations pile up behind it.

**How to apply:** On any post-merge boot failure, `grep package.json` for the missing package + `ls node_modules/<pkg>`. If declared-but-missing, `npm install` is the reconciliation, not a workaround. Also note: stale imports of removed auth systems (passport et al.) are boot-blockers — module-level imports crash the whole server.
