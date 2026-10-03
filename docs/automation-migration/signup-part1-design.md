# Signup messaging Part 1 — approved design

## Scope
Six active journey nodes: verify_email, welcome_email, verify_reminder_1h,
verify_reminder_1d, verify_reminder_3d, already_have_account. Existing delivery,
chat and other messaging nodes are not part of this six-node count.

Registration responds neutrally for both existing and new accounts. It does not
create an authenticated session: otherwise cookie/auth-state differences reveal
whether the email exists. The caller sees the same check-inbox state. Users can
sign in separately; verification is not a new login gate.

Tokens expire after 24 hours. Resend atomically invalidates unused earlier tokens.
Verification commits before welcome can be delivered. The durable welcome key is
welcome:{user_id}. Reminders are scheduled at 1h, 1d and 3d after account creation,
not after resend. Reminder links lead to verification resend, not expired tokens.

## Architecture
Use the existing email_outbox and its drain, retry and provider transport. Journey
rows carry metadata for node, user, token binding and idempotency. No new table,
scheduler or direct email path. A per-user transaction-scoped advisory lock
serializes token issuance, verification, welcome enqueue and guarded delivery.
The sender re-checks account/token state under that lock. Verification cancels
queued/retrying reminders atomically with its welcome enqueue. Provider work
already started before verification wins the lock cannot be recalled.

The outbox producer fails closed if persistence fails. Welcome has one durable
row; provider retries use the same provider idempotency key. Provider acceptance
is not proof of inbox receipt, and provider deduplication retention is finite.
Reminder deadlines are exact; delivery occurs on the next existing drain after
the deadline, never before it.

## Verification and reporting
Randomized development scenarios, two consecutive clean loops per node, maximum
six loops before structural-risk review. Fixes require the exact failing case
and two variations. Test the token expiry/burn, neutral UI/API, concurrent welcome,
due reminder vs verification, retries and cancellation references.
No real mailbox has been authorized: delivery-dependent results are
"verified in dev, inbox receipt pending", not closed. Test transport interception
proves code execution only, not delivery. These six nodes are email-only, so no
invented in-app notification is added to satisfy evidence wording.

## Corrected master counts
Part 1: 6 active. Part 2: 10 active (including both email-change nodes), plus
google_login_added separately DEFERRED. Part 3: 4 active. Part 4: 3 or 4 active,
depending on signin-velocity reachability. Total: 23 or 24 active; 24 or 25 tracked
including the deferred Google node. Part 2 and later implementation remain outside
this Part 1 dispatch.