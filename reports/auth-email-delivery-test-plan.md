# Authentication email recovery — fail-closed acceptance plan

**Planned tests only; not executed or claimed passing.** This proposal-only task
must not implement senders or issue credentials. The exact future test paths
are in `auth-email-delivery-touch-lists.md`.

Use a fresh disposable schema per database loop, synthetic QA accounts and an
intercepted provider. Generate credentials only in memory during future tests.
Assertions compare values without including actual or expected credential data
in assertion messages. Capture and scan logs/traces in memory; reports show
case IDs and outcomes only. Never save links, bodies, hashes or ciphertext to
snapshots, screenshots, PR descriptions or test output.

Required oracle for every blocked case: **zero provider invocations**, unchanged
password/email-verification state where appropriate, a static terminal or
retry reason, and no secret-bearing log or API response.

## 1. Lifetime and expired-token fail-closed tests

- Issue reset and verification at a controlled instant. Assert exact original
  60-minute / 24-hour lifetime; all automatic/admin retries retain both expiry
  and credential identity. No extension, regeneration or fresh validity copy.
- For both purposes: one instant before expiry may send; equality and one
  instant after expiry cancel without sending. Use fresh wall-clock checks,
  including a long-running transaction whose start time is earlier.
- Advance time between rendering/decryption, registry dispatch and actual
  provider action. Expiry at the final guard blocks provider handoff.
- Make reset password hashing cross the expiry boundary. Redemption rejects,
  changes no password/session/token state, and does not accept stale route time.
- Advance backoff to at/after expiry: cancel instead of scheduling a send.
  For reset, after failures at issuance, +5 and +20 minutes, a further
  45-minute delay reaches +65 and must not send the expired link. Drain cadence
  or startup delay may shift attempts later, never validity later.
- A dead auth row whose credential has expired cannot be admin-retried;
  cancelled/consumed rows cannot be resurrected. Expired dead envelopes are
  erased by auth housekeeping without a provider call.
- Stored expiry disagreement, missing expiry, wrong metadata version and
  malformed envelope are all fail-closed. No fallback payload send.

## 2. Retry, persistence and failure-result tests

- Missing provider key, absent sender, thrown SDK exception, resolved SDK error,
  and successful-looking response without a message ID never mark sent.
  Record only allowlisted codes, not exception objects/strings.
- Token insert failure rolls back obligation insertion; obligation insert
  failure rolls back token insertion. No SDK invocation before commit or
  after rollback; generic enqueue fallback is never called.
- Crash immediately after committed issuance: existing drain recovers pending
  row with the same encrypted payload. Crash after lease claim: expired-lease
  recovery retries that same obligation without issuing another credential.
- A transport failure followed by success uses the original recipient/payload,
  provider key and expiry; attempt count increases and retry time follows
  5/15/45/120/360-minute backoff only while valid. Sixth failure becomes dead.
- Unknown encryption key retries only while still valid; invalid tag/AAD,
  wrong-purpose ciphertext, swapped-account/token/recipient envelope or
  malformed format never sends. Key rotation can decrypt valid old-key rows.
- Success clears the envelope and records a real intercepted transport result
  ID; cancel/consume/supersede clears it too. Valid dead rows retain it for
  eligible operator recovery; expiry removes it.
- Test immediate, drain and admin entry points independently against each
  expired/used/changed-owner scenario, then prove all use the same guard.
- Provider result persistence failure after acceptance leaves an ambiguous
  outcome, not a false sent record. Safe retries reuse the provider key;
  outside its independently verified retention window, quarantine/no-send
  until acceptance reconciliation. Do not fabricate a delivered outcome.

## 3. Duplicate, race and ownership tests

- Concurrent enqueue for one token produces one row via unique identity;
  repeated invocation returns that same obligation. Distinct reset requests
  create distinct tokens; do not dedupe all messages for one user/email.
- Concurrent immediate/drain/admin claims have at most one live local provider
  call. Advance through lease expiry while the old sender is stalled: row locks
  prevent parallel auth handoff and stale state overwrite.
- Simulate provider acceptance followed by local commit loss. A provider mock
  honoring stable keys returns the same acceptance ID without a second accepted
  message; separately test an expired dedupe window yields no automatic send.
  Label this simulated provider behavior, not remote exactly-once proof.
- Verification resend burns/cancels old unused credentials and obligations
  atomically. Replacement insertion failure restores the old usable state.
  Concurrent resends serialize and leave only the last committed token usable.
- Race resend, verification consumption, reset consumption and account-email
  update against delivery. Exercise the common account→token→outbox lock order
  with timeouts so deadlocks are failures, not skipped cases.
- Change account email: old queued message is neither delivered to the old
  address nor retargeted to the new one; old credential cannot reset the changed
  account or verify its new address. Missing/deleted/suspended account blocks.
- Caller A cannot request verification for account B through body metadata or
  recipient parameters. Both supported Passport user shapes resolve the
  authenticated owner. Unknown recipient data never falls back to another
  account found by email.
- Missing token row, wrong token table/purpose, mismatched account ID, already
  used token, passwordless reset account and already-verified verification
  account suppress the old queued obligation.
- Concurrent reset redemption: one success, losers fail, exactly one password
  transition and session purge in the same transaction. Purge failure rolls
  back claim and password, preserving existing protection.
- Concurrent verification redemption: one success with account and used stamp
  committed together; injected stamp failure rolls both back.

## 4. Signup, API and unrelated-behavior regressions

- Registration still creates role=user, records consent, atomically queues
  welcome, regenerates session ID, logs in and returns the same HTTP 201 shape.
  Verification transport or post-commit issuance failure does not block it.
  Explicitly demonstrate the carried pre-enqueue crash gap; do not claim
  account creation alone proves verification delivery durability.
- Forgot-password malformed input, unknown email, passwordless account,
  valid account, enqueue failure and transport failure keep the same generic
  HTTP 200 body; no token/outbox ID or delivery reason is exposed.
- Verification resend unauthenticated/account-missing/already-verified paths
  retain status/body contracts. Failed durable issuance returns its generic
  error; committed enqueue plus failed immediate delivery returns the approved
  HTTP 200 body, and later drain succeeds within lifetime.
- General notification switch off still allows eligible auth mail through the
  existing provider registry seam, while generic notification mail remains
  suppressed. Missing reply-to does not newly block auth; sender/key failures
  are explicit recoverable failures, never false acceptance.
- Existing welcome eligibility/dedupe, itinerary cancellation, booking alerts,
  generic enqueue fallback, non-auth admin retry, six-attempt service backoff,
  commerce queue-only barriers and heartbeat behavior stay unchanged.
- Legacy hash-only rows receive no guessed backfill or manufactured emails.
  Test founder-selected staged grace cutover; new recipient requirements must
  not silently invalidate still-live pre-cutover tokens.

## 5. No-secret-output tests and completion evidence

Capture raw console, structured logger, registry context, database-error
serialization, API responses, admin list/retry responses and dead-letter digest
inputs. Inject provider/DB exceptions deliberately containing synthetic secret
material; output must omit it rather than rely on common-field redaction.
Exercise token query/body request redaction too. Admin projections and digest
never include envelopes or rendered auth bodies; safe IDs and static codes
remain visible.

Before future development closure:

1. Run pure guards/crypto/transport cases, then **two independent clean
   disposable-schema loops** of the transaction/race cases.
2. Run route contract cases and the unchanged welcome/security/log regression
   suites. Fail if database coverage is skipped or no tests execute.
3. Check TypeScript against the current established baseline without raising
   it; record only non-secret test case outcomes and unresolved limits.
4. Confirm diff matches separately approved writer/schema lists, and retains
   no production or Part 8 activation.

These criteria are a future acceptance contract, not validation results for
this documentation change. Actual inbox delivery and production rollout remain
separate founder-approved work.
