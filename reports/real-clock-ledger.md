# Real-clock proof ledger

**Part 1 not complete. No real-clock scenario has been started by this run.**

The approved development inbox settings are available. Their values are not recorded here.

| Scenario | Actual start UTC | Exact due UTC | State | Outbox row / provider receipt |
|---|---|---|---|---|
| 2-hour follow-up | — | — | NOT STARTED | None claimed |
| 24-hour follow-up | — | — | NOT STARTED | None claimed |
| 5-day re-engagement | — | — | NOT STARTED | None claimed |

## Why there is no invented WAITING entry

The existing disposable DB-test harness drops its fixture namespace when it exits. A row removed in that cleanup cannot honestly remain WAITING for tomorrow or five days later.

Persistent development fixture isolation and how the **existing** job will process it need a D7 decision. Creating a second scheduler, leaving an unauthorized schema behind, exposing fixtures to uncontrolled background mail or changing production is not an acceptable workaround.

## Entry requirements

When a viable scenario actually starts, append:

- Randomized scenario/account/plan identifiers, never an inbox address or credential.
- Actual UTC start timestamp and original persisted readiness/activity time.
- Exact due timestamp and timezone/window rule used.
- Genuine outbox row ID, its status and later provider message ID.
- WAITING → due check → DELIVERED/SKIPPED/CANCELLED/FAILED with actual timestamps.
- Trigger provenance: real scheduled invocation versus explicitly disclosed manual invocation of the existing job.
- Delivered provider event and browser/inbox evidence, without claiming inbox placement from acceptance alone.

Never backdate the final real-clock proof. Fast fixtures may be backdated only when clearly labeled FAST, not as these entries.
