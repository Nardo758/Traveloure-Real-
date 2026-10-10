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

When payment provenance is incomplete, cart reminders remain fail-closed.
The approved interim check disqualifies any traveler payment/booking activity
at or after the server sequence start, even canceled/unsettled activity.
Tripless and residual partner-only carts are ambiguous, not presumed unpaid.
Payment writers and checkout cannot be changed without separate approval.

**Why:** The founder chose conservative query-only suppression instead of an
unapproved payment/cart correlation redesign. Stored ledger timestamps alone
cannot prove external payment activity or serialize the final-read/send race.

**How to apply:** Distinguish readable-record test proof from complete rail
certification. Keep UNKNOWN blockers active, do not use an isolated test override
as release evidence, and obtain separate approval for provenance fixes. Preserve
the current no-email verification boundary until explicitly replaced.

Cart item-change notices are must-have, not marketing: price increases,
decreases and proven availability loss bypass marketing unsubscribe, quiet
hours and its daily cap, but never account/ownership/paid-state safety.
No snapshot means skip, not guessed backfill. Notified values are recorded only
with a committed outbox enqueue; the add-time snapshot remains immutable.

**Why:** The founder explicitly distinguished transactional item changes from
marketing reminders while retaining the same UNKNOWN payment blockers.

**How to apply:** Reuse the shared read-only paid check. Document value-only
dedupe and changes returning A→B→A as limits, not complete event history.
Suppress cart reminders on the local day an item-change notice was actually
sent without permanently consuming later reminder steps.

## Verify-at-send timing policy

The founder accepts a small final-payment-check → provider-handoff race for
marketing reminders only. This does not authorize the same race for must-have
item-change notices, remove payment UNKNOWNs or authorize real sending.

**Why:** Part 6 explicitly accepted the narrow marketing race while retaining
the existing payment-writer and no-foreign-key boundaries.

**How to apply:** Perform the payment read last, render before that read,
measure the residual window honestly, and distinguish synthetic invocation from
network/provider delivery. A database statement-start timestamp is not a globally
trusted eligibility instant. Keep must-have ordering and external/unstamped
provenance blocked until separately proven and approved.

Availability is about the cart's requested units, not whether one unit remains.
A quantity-only edit is not a catalog availability change. Retain stock facts
for comparisons rather than treating a stored availability boolean as valid
for every later quantity.

**Why:** Hostile review found both missed insufficient-stock cases and the risk
of false notices after a quantity edit. The add-time snapshot does not establish
the original requested quantity for historical comparisons.

**How to apply:** Evaluate reference and current stock against the current
server-owned requested units. Preserve comparison facts in notified values;
skip quantities or contexts that cannot be established without guessing.
