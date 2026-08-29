---
name: Background scheduler resilience
description: Rules for preventing in-process scheduled work from amplifying database connection pressure.
---

Scheduled jobs must claim their in-flight state before arming a delayed first run, cap aggregate background concurrency, and retry only transient database/connection failures with bounded backoff. Health probes should use pool-managed queries or release clients in a finally block.

**Why:** Multiple route-registration paths can start the same scheduler before its first timeout fires, while interval jobs can overlap during slow database work. A failed explicit health query can also leak a checked-out client and make later pool-acquisition timeouts look like scheduler failures.

**How to apply:** When adding or changing a background timer, route it through the shared background-job runner, preserve explicit error logging, and verify `/health`, `/health/ready`, and pool waiters under startup and scheduled-job activity.