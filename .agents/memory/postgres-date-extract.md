---
name: PostgreSQL date extraction
description: Use date_part() not EXTRACT() to avoid type errors in raw SQL queries.
---

## Rule
Use `date_part('month', column)` and `date_part('year', column)` instead of `EXTRACT(MONTH FROM column)` or `EXTRACT(YEAR FROM column)` in raw Drizzle `sql` template queries.

**Why:** `EXTRACT(MONTH FROM ...)` returns type `double precision` in newer PostgreSQL, which causes `extract(unknown, integer)` errors when the argument type isn't resolved cleanly in prepared statement contexts.

**How to apply:** In any `sql\`...\`` template that extracts date parts, replace `EXTRACT(MONTH FROM col)` with `date_part('month', col)`. This applies to seasonality, trip duration, and any time-bucketing queries.
