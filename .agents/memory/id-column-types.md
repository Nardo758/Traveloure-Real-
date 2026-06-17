---
name: users/trips ID column types
description: users.id and trips.id are varchar, not uuid — matters for FK columns in new migrations
---

## Rule
`users.id` and `trips.id` are `varchar` (set via `$defaultFn(() => crypto.randomUUID())`), NOT Drizzle `uuid()` type.

**Why:** Any new table column that references users.id or trips.id as a FK must use `VARCHAR` not `UUID`, or Postgres rejects the constraint with "foreign key constraint cannot be implemented" (type mismatch varchar vs uuid).

**How to apply:**
- In SQL migrations: use `VARCHAR` (no length) for user_id/trip_id columns; omit FK REFERENCES if rows must survive parent deletion (e.g. analytics tables)
- In Drizzle schema: use `varchar("user_id")` not `uuid("user_id").references(() => users.id)`
- Example: funnel_events table uses varchar for both user_id and trip_id, no FK constraints
