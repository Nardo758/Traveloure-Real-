# Signup-notice IP-digest retention

## Owner decision

Approved on 2026-10-18: **“One-hour minimum with the safeguards above
(recommended).”** This records a retention policy only. Cleanup implementation
and activation require separate authorization.

No schema, migration, sender, scheduler, configuration or production changes
are authorized by this decision. No rows have been deleted or redacted.

## Basis and scope

The approved existing-account notice design counts ten notice-eligible attempts
per keyed IP digest per rolling hour, including account-capped attempts stored
as cancelled outbox rows. An already-IP-capped attempt creates no additional
row. The account limit is one notice obligation per rolling 24 hours; recent
delivery and older unresolved obligations also block a new obligation.

The notice source and its evidence were inspected on
`work/signup-existing-account-notice`, not assumed to be deployed or present
on current main:

- `server/services/existing-account-notice.service.ts`
- `reports/signup-existing-account-stage1-plan.md`
- `reports/signup-existing-account-stage1-evidence.md`

This policy covers that notice type only, not general outbox retention,
welcome/reset mail, account deletion, or provider records.

## Minimum retention and eligible cleanup

1. Retain the keyed IP digest for a full rolling hour after `created_at`, using
   the database clock, not a calendar-hour boundary or application clock.
2. Once the row is at least one hour old, delete the whole row **only** when it
   is a recognized, well-formed account-capped audit record: the notice type
   and metadata version match; status is cancelled; the reason is
   `account_daily_limit`; `noticeObligation` is explicitly false; there is no
   provider-attempt evidence, active lease, or retry obligation. A missing or
   false-like obligation marker is not sufficient proof.
3. On recognized actual notice obligations at least one hour old, remove
   **only** `noticeIpDigest`. Keep the row and all other metadata, including
   account identity, obligation marker, attempt state and timestamps. Preserve
   delivery status, provider identifiers and the stable outbox identifier.
4. Never age-delete actual obligations under this policy, including sent or
   cancelled obligations. Pending, processing, failed/retryable and uncertain
   obligations must remain. Uncertain attempts remain held for manual review
   without a time-based release, resend, or automatic retry.
5. Malformed, contradictory or otherwise ambiguous rows are excluded from
   automatic deletion and digest removal. Do not infer non-invocation from a
   terminal status, absent provider ID, elapsed lease or old timestamp.

An hourly cleanup cadence makes normal effective digest retention one to two
hours. Downtime can extend retention; this is not a guaranteed two-hour maximum.
No scheduler is added or activated by this document.

## Why caps and uncertain-attempt safety survive

- **Hourly IP cap:** The inspected counter uses
  `created_at > NOW() - INTERVAL '1 hour'` across notice rows regardless of
  status. A cancelled audit row still consumes allowance for its entire rolling
  hour. Only rows outside that window may be removed or lose their digest.
- **Daily account cap:** Account blocking uses the obligation marker and account
  identifier, recent creation or delivery, unresolved statuses, and the started
  attempt marker, not the IP digest. Removing only that digest does not erase
  those checks. A late delivery retains its separate 24-hour delivery window.
  Deleting audit-only rows cannot release the daily cap because they were never
  obligations.
- **Uncertain handoff:** Preserve the durable started marker, outbox identity,
  provider evidence and manual-review hold even after digest removal. Never
  assume the provider's idempotency key offers indefinite protection. Cleanup
  is not recovery and must not change eligibility or reset an attempt.
- **Concurrency:** A later implementation must recheck eligibility under row
  locks and coordinate with existing enqueue/dispatch locking. Use a consistent
  database-clock cutoff so no enqueue snapshot loses a row it still counts.
  Stale candidate lists, changed status, or failed checks must cause a skip or
  rollback, not broader deletion. Preserve unrelated JSON metadata exactly.

## Required proof before a later implementation can be accepted

Use provider-free, isolated development fixtures; do not restart the app, run a
live drain, send real mail, or modify production to verify cleanup.

- Cleanup leaves all ten counted rows and their digests intact before expiry,
  including cancelled account-capped rows; capacity returns only after expiry.
- Whole-row deletion never touches true obligations or malformed lookalikes.
- Digest-only removal retains the account cap, including late delivery and
  older pending, processing, failed and uncertain obligations.
- Uncertain rows remain blocked after digest removal and process replacement;
  no provider invocation is caused by cleanup.
- Concurrent enqueue, delivery and cleanup cannot shorten either cap or lose
  attempt state. Repeated cleanup is safe; transaction failure does not leave
  partial destructive work or change sender behavior.
- Separate real-clock cap-expiry work remains separate evidence; simulated or
  backdated fixtures do not prove genuine elapsed-hour/day behavior.

## Alternatives considered

Twenty-four-hour digest retention would retain IP-linked information beyond
the hourly counter's need. Indefinite retention would avoid implementing cleanup
but leave unnecessary data unbounded. The owner selected the one-hour minimum
with conservative exclusions and preservation of all actual obligations.
