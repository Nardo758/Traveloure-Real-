---
name: Partial migration retries
description: Safe patterns for migrations whose DDL may apply before their ledger entry is written
---

## The rule

Migration SQL must tolerate the database schema being ahead of the migration ledger. In particular, constraint creation needs a catalog guard, and data cleanup that makes the constraint valid must run before the guarded DDL.

**Why:** The migration runner records a file only after its SQL completes; a connection loss or partial execution can leave a constraint installed while the file remains pending, causing every restart to fail on duplicate constraint creation.

**How to apply:** For pending migrations that add constraints, repair violating historical rows first, use an explicit `pg_constraint` existence check around `ALTER TABLE ... ADD CONSTRAINT`, and keep later seed/config operations idempotent with `ON CONFLICT` guards.

## Source/ledger drift

Never treat a migration found only in a development database's ledger as a source-controlled dependency. Reusing that filename with new behavior means the drifted database skips it while a fresh database applies it, permanently splitting schemas. Use a new, additive, idempotent reconciliation migration, or reset the environment only with explicit approval.

**Why:** A migration can be applied on a workspace and recorded in `schema_migrations` before its source file reaches a remote branch. The database then has tables and seed rows the canonical codebase cannot recreate or declare.

**How to apply:** Compare the migration registry and remote tree with `schema_migrations` before adding pricing or entitlement tables. Make the next committed migration safe for both a fresh database and a schema that already contains the abandoned objects; add every persistent table and column to the typed schema in the same change.