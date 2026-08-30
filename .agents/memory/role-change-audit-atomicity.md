---
name: Role-change audit atomicity
description: Invariants and gotchas for the atomic role-change + audit-record writes.
---

Every users.role change must commit atomically with its access_audit_logs record — role update + audit insert share one db.transaction (updateUserRole, storage.updateLocalExpertFormType with audit param, and the ADMIN_EMAIL bootstrap's BEGIN/COMMIT block). Audit failures now THROW instead of being swallowed; callers must handle the error (admin approval handlers revert the form status and 500).

**Why:** audit inserts used to be fire-and-forget with swallowed errors, so a role change could commit with no record — defeating the audit trail's guarantee.

**How to apply:**
- New role-flip code paths must join the same transaction pattern; never insert the audit record after the role commit.
- access_audit_logs.id has NO database default (schema uses a client-side $defaultFn) — raw SQL inserts must supply the id explicitly or they fail NOT NULL.
- access_audit_logs.actor_id has an FK to users — a nonexistent actorId is the deterministic failure-injection vector for rollback tests (see server/__tests__/role-audit-atomicity.db.test.ts, run with JOURNEY_DB_WRITES_OK=1).
- Known residual gaps (follow-up tasks filed): approval form-status update is compensated, not in the same transaction; oldRole reads lack FOR UPDATE row locks under concurrency.
