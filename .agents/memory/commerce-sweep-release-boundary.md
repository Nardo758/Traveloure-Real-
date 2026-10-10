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

## Cart-reminder policy

The founder's Part 4 rules permit only the 1-hour, 1-day and 3-day steps per
cart activity sequence; 3-day is terminal. Marketing has one shared allowance
per traveler per local calendar day, and an eligible cart reminder takes
priority over a simultaneously due itinerary reminder.

Guest carts become contactable only after authenticated claim. Missing timezone,
missing recipient, absent consent, deletion, suspension or a paid cart on any
payment rail must prevent a reminder; never infer eligibility from missing data.

**Why:** A cart-scoped dedupe key alone cannot prevent cross-family daily-cap
violations, fictional guest consent or reminders after payment.

**How to apply:** Reuse existing timezone handling and recipient locking across
both families, evaluate current eligibility before provider submission, and
prove these policies in isolated development before requesting release approval.

Cart-reminder sending is allowed from 09:00 inclusive to 20:00 exclusive in
the traveler's local time; the complement is the no-send interval.

**Why:** The founder explicitly clarified that "09:00 to 20:00 quiet hours"
meant the allowed sending window, not a daytime prohibition.

**How to apply:** Check both exact boundaries and an explicitly known timezone;
never substitute the server timezone or infer one from a destination.
