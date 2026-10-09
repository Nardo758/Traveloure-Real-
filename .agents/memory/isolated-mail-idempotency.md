---
name: Isolated mail fixture idempotency
description: Account-wide provider idempotency and delayed receipts in disposable mail verification.
---

Database isolation does not isolate a real mail provider's idempotency namespace.
Fresh fixture schemas can reuse row-counter IDs while the provider still remembers
the earlier request, causing a changed-body idempotency rejection.

**Why:** Real deliveries from an earlier disposable schema used the same
row-derived provider keys as a later schema whose counters restarted.

**How to apply:** Allocate distinct IDs using only owned disposable fixture
sequences before any real send. Preserve the application's actual dedupe and
retry keys, verify sequence ownership, and never change production sequences
or invent provider receipt identifiers.

## Delivery receipt deadlines

Real mail acceptance and a provider-confirmed delivery event are separate.
For multi-mail fixture proofs, submit only authorized QA messages first and
then verify receipts with bounded, rate-limited polling; never count acceptance
as delivery or relax the retained fixture owner's deadline.

**Why:** Waiting serially for each delivered event exhausted the retained
three-minute runner after only four actual deliveries; batched verification
completed the same allowed mailer cases without changing any application writer.

**How to apply:** Persist genuine message IDs and honest unconfirmed states,
emit PASS only for verified delivered/opened/clicked events, and explicitly
separate FAST mailer proof from browser, writer-path and real-clock certification.

## Standalone worker completion

A zero process exit is not enough to prove that awaited native dispatch work completed.

**Why:** A standalone controlled-failure worker exited successfully after retaining a failed row but before writing its final ledger. Exit status alone hid incomplete proof.

**How to apply:** Bound worker lifetime and require an explicit completion record with the expected actual rows/timestamps. A no-op lifetime handle is not a scheduler; it must be cleared when native work finishes.

## Process-kill fixture boundaries

Kill the actual process that owns the transaction, not a launcher that can leave
its child alive holding database locks.

**Why:** A crash fixture launched through the tsx CLI survived a launcher-only
SIGKILL and stalled recovery instead of proving rollback.

**How to apply:** Run TypeScript workers directly with Node's tsx import hook,
or terminate and verify the entire process group. Require an explicit native
commit-boundary signal before killing the worker.
