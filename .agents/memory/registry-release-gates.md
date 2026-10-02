---
name: Registry migration release gates
description: Operator-required prerequisites before resuming automation-registry migration.
---
Do not resume automation-registry feature work until the customer email fixes are reviewed and published, the independent scheduled runner is genuinely provisioned and verified, production timeout/inventory-failure investigation is reported, and the registry PR's scope is explicit.

**Why:** The operator required all four prerequisites on 2026-10-02 because customer confirmations and reliable job execution must not be postponed behind a registry migration.

**How to apply:** Check actual merged/published code, the separate runner's deployment and run evidence, the timeout report, and the current PR scope. A healthy shared cron heartbeat does not prove which scheduler ran. Do not treat queued auto-merges as completed releases.