---
name: Development database host guard
description: Why fixture seeds must not classify Replit development databases by hostname alone.
---

Development databases in Replit can use managed Neon hostnames, so hostname patterns such as `neon`, `prod`, or `production` are not reliable proof that a database is production.

**Why:** A development-only landing seed was incorrectly refused when its configured development database used a Neon hostname.

**How to apply:** Gate fixture seeding with the explicit runtime environment contract (`NODE_ENV` and `ENVIRONMENT`), and keep production startup on the separate purge/no-seed branch.