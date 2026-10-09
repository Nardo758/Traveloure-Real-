---
name: Cart automation metadata ownership
description: Founder decisions on atomic activity timestamps, immutable snapshots and payment-cleanup separation.
---

Cart activity means an actual add, removal or quantity change. Page views, metadata
updates and background projections are not activity. Derive inactivity from persisted
server-authored activity, never from observers or general display update timestamps.

**Why:** General update timestamps can manufacture activity during reconciliation;
using them would delay or incorrectly restart reminders.

**How to apply:** Keep clock and real cart mutation in the same statement. The founder
explicitly replaced the best-effort stamp condition with atomic fail-closed writes.
Build stamps with a pure, input-safe function; never accept client clock/snapshot state
or guess missing legacy timestamps and snapshots.

Snapshots preserve add-time facts. After a change notice, compare against the last
notified values, not permanently against the original snapshot.

**Why:** A return to the original price after an intervening notice is a new change,
while repeating the same current values is not.

**How to apply:** Keep display metadata independent, and queue/notified bookkeeping
atomic without moving activity.

Post-payment cart cleanup is explicitly excluded from activity stamping.

**Why:** It executes after a confirmed charge; marketing bookkeeping must not change
payment/error semantics or disturb surviving unpurchased partner lines.

**How to apply:** Preserve that cleanup behavior and verify surviving rows remain
unchanged; payment-aware send-time rules belong in the separately approved lifecycle.
