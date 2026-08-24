---
name: Partial migration retries
description: Safe patterns for migrations whose DDL may apply before their ledger entry is written
---

## The rule

Migration SQL must tolerate the database schema being ahead of the migration ledger. In particular, constraint creation needs a catalog guard, and data cleanup that makes the constraint valid must run before the guarded DDL.

**Why:** The migration runner records a file only after its SQL completes; a connection loss or partial execution can leave a constraint installed while the file remains pending, causing every restart to fail on duplicate constraint creation.

**How to apply:** For pending migrations that add constraints, repair violating historical rows first, use an explicit `pg_constraint` existence check around `ALTER TABLE ... ADD CONSTRAINT`, and keep later seed/config operations idempotent with `ON CONFLICT` guards.