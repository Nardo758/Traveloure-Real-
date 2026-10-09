---
name: Commerce sweep approval boundary
description: Founder limits on queue-only verification, release approval and legacy heartbeat behavior.
---

Commerce email sweep approval is development-verification-only. Passing its
queue/idempotency tests does not authorize production activation or migration
registration. Separate founder release approval is required after quiet hours,
unsubscribe/consent, all-rail paid checks and cancel-at-send safety are proven.

**Why:** The founder explicitly approved infrastructure before send-time safeguards;
the ordinary dispatcher could otherwise deliver unsafe reminders to real travelers.

**How to apply:** Keep verification inside disposable schemas and synthetic QA
recipients. Never infer permission to release from a passing sweep test or from a
held SQL file. Later parts have their own approval and proof gates.

Failure recording is a commerce-specific extension. Preserve other jobs'
success-only heartbeat behavior unless a new ruling explicitly broadens it.

**Why:** The founder required every other job's semantics to remain exactly unchanged,
even though a general failure recorder would appear to be a useful improvement.

**How to apply:** Never fabricate success timestamps for first failures, preserve
past actual success on a commerce failure, and do not silently apply this policy
to all legacy job wrappers.
