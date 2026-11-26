---
name: Development database host guard
description: Why fixture seeds must not classify Replit development databases by hostname alone.
---

Development databases in Replit can use managed Neon hostnames, so hostname patterns such as `neon`, `prod`, or `production` are not reliable proof that a database is production. An explicit opt-in flag alone is also insufficient: reject database fixtures when either `NODE_ENV` or `ENVIRONMENT` identifies production.

For provider-free database tests, use an explicitly owned, socket-only local PostgreSQL cluster under a short temporary path. Pass `NODE_ENV=test`, an explicit non-production `ENVIRONMENT`, and a local socket URL through a process-only environment; do not inherit workspace database variables or inspect secret values. Stub real providers, then stop and remove the cluster. Prefer mocked database calls when a unit test does not need a real database.

**Why:** A development-only landing seed was incorrectly refused when its configured development database used a Neon hostname. Separately, a workspace can report `ENVIRONMENT=PROD` while `NODE_ENV` is not production; a fixture test guarded only by `NODE_ENV` can then run against the configured database. Unix socket paths have a strict length limit, and a filtered Node test run can print results without exiting.

**How to apply:** Require the explicit test opt-in, check both `NODE_ENV` and `ENVIRONMENT` before any fixture query/write, and keep production startup on the separate purge/no-seed branch. Do not probe production data to decide whether a test target is safe. For isolated tests, keep socket paths short and run independent test files serially; count a round only when the process exits with a test summary. In a nested worktree, verify that installed tools have their entry points before retrying installation.