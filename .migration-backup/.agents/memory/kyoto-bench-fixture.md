---
name: Kyoto bench fixture
description: Durable dev-DB expert fixture kyoto-temples@traveloure.test — provenance, reconcile contract, and who owns it
---

# Kyoto bench fixture

`kyoto-temples@traveloure.test` (password: standard bench convention `TestPass123!`) is a DURABLE dev-DB fixture: a `local_expert` seeded via the full application lifecycle (guarded submission → `pending` → admin approval → role flip). It is deliberately never cleaned up — the journey suite consumes it. Registry: `docs/testing/CONSOLE_SIGMA_AUDIT.md` §12.

**Rules:**
- Never seed a Kyoto expert with a bare role flip — the fixture's value is its lifecycle provenance (`local_expert_forms` row `approved`, `city='Kyoto'`).
- The seeding test (`console-sigma-kyoto-bench.http.test.ts` K4) RECONCILES partial states: missing form → guarded submission; pending/rejected → admin approval; stale password → converged. Safe to re-run any time.
- There is NO DB CHECK on `local_expert_forms.status`; the only born-approved gate is `insertLocalExpertFormSchema` (strips `status`, clamps `expertType` — also the privilege-escalation guard). Filed as a bench-gap candidate.
- Expert application machine is `pending → approved|rejected` (no persisted draft state); rejection allows one resubmission back to pending.

**Why:** journey-suite waves need a stable Kyoto expert with real provenance; ad-hoc role-flipped users invalidate gate assertions.
