# Authentication email recovery — approval-only proposal

Status: **PROPOSED, NOT IMPLEMENTED OR ACTIVATED**.

This is a source audit and future design, not delivery evidence or a production
data audit. No emails, database queries, migrations, secrets changes, runtime
changes, or Part 8 activation were performed. Separate founder approval is
required for the writer and schema manifests below. Approval of this document
alone is not release approval.

Companion approval documents:

- `reports/auth-email-delivery-touch-lists.md`: separate writer and schema lists.
- `reports/auth-email-delivery-test-plan.md`: fail-closed acceptance cases.

## Audited current behavior

Read `reports/commerce-direct-senders.md` before investigating its authentication
family. Current source confirms:

| Surface | Observed behavior and consequence |
|---|---|
| Live integration | `server/routes.ts` mounts `setupEmailAuth`; `replitAuth.ts` installs Passport and its session support. This is email/password plus Replit OIDC, not a Clerk migration. Both Passport user shapes are accepted by resend verification. |
| Reset issuance | `/api/auth/forgot-password` issues a random 32-byte credential for an existing account with a password. `password_reset_tokens` stores only its SHA-256 hash, user ID and **60-minute** expiry. Invalid input, unknown email, OAuth-only account and delivery failures return the same generic HTTP 200 message. |
| Reset delivery | `sendPasswordResetEmail` dispatches the existing registry producer and then calls Resend directly. Missing configuration warns and returns; the SDK result's `error` and message ID are not inspected. A resolved provider error can therefore be logged as a sent email. There is no durable delivery row. |
| Reset recovery | The route's comment says the stored token permits retries. It actually permits validation, not reconstructing the lost link: the raw credential is not recoverable from its hash. Another forgot-password request issues another credential; prior unused reset credentials are not burned. |
| Reset redemption | Conditional token claim, password write and both-shape session purge share a transaction. Concurrent replay is guarded. The comparison instant is captured before password hashing; a token can expire during that work. Token rows have no issued-recipient snapshot. |
| Verification issuance | `issueAndSendVerification` inserts a hash-only credential with **24-hour** expiry, then directly sends. Signup starts this after the account/welcome transaction without awaiting it. Failure must not block signup or login. |
| Verification resend | Authenticated `/api/auth/send-verification` reads the caller's account, returns early if already verified, burns prior unused verification credentials, then issues a new one. Burn and issuance are separate writes today; a failure can leave no usable link. Delivery failure currently produces HTTP 500; missing configuration can falsely produce HTTP 200. |
| Verification redemption | `/api/auth/verify-email` reads an unused/unexpired token, stamps the account, then separately stamps the token used. This is not an atomic claim like reset redemption. No issued-recipient check protects a changed account email. |
| Verification delivery | `sendEmailVerificationEmail` has the same missing-key and unchecked resolved-provider-error behavior as the reset helper. |
| Existing durability | `email_outbox` and its existing five-minute drain provide pending/processing/failed/dead/sent/cancelled states, leases and retries. Generic enqueue can fall back to an unrecorded send if insertion fails: **do not use that API for these credentials**. Signup welcome demonstrates transaction-owned insertion and a dedicated delivery handler. |
| Existing retry policy | The service uses six attempts and failure delays of 5, 15, 45, 120 and 360 minutes. The schema default/comment says five; explicitly set six for this proposal, without changing other families' defaults. |
| Existing transport policy | Generic `sendEmail` applies the email-notifications switch and requires reply-to. Direct authentication mail intentionally bypasses that switch and currently does not require reply-to. Routing authentication through generic transport unchanged would alter behavior. |
| Existing registry | `messaging.auth-password-reset-email` and `messaging.auth-verification-email` are security producers with no durable idempotency or retry. Event wrappers preserve callbacks; they do not persist an obligation. The provider wrapper currently passes no message body as registry metadata. |
| Existing operator recovery | Admin retry resets failed/dead rows to pending and resets attempt count, then invokes the existing drain. It does not validate credential expiry. Admin listing selects metadata but not HTML/text; dead-email summaries include `last_error`. Neither path must acquire credential-bearing data. |

These are source findings, not claims about which users or production messages
were affected. No real credentials or links are included in this report.

## Approaches considered

1. **Recommended: encrypted authentication payload on the existing outbox.**
   Atomically persist the token hash and delivery obligation, then reuse the
   registry and drain with a security-specific guarded handler. Adds narrow
   schema and encryption-key lifecycle work; permits recovery of the exact
   issued link without storing plaintext bearer credentials in ordinary bodies.
2. Plaintext rendered links in ordinary outbox HTML/text. Smallest change, but
   turns routine outbox reads, diagnostic dumps and backups into credential
   exposure paths. Not recommended.
3. Generate a new credential on each retry. Avoids storing a recoverable secret
   but extends validity or replaces links, and changes resend/reset semantics.
   Does not meet the lifetime-preservation requirement.

## Recommended flow, only after separate approval

### Issue and commit before sending

- A transaction-owned auth issuer locks the account, reads its authoritative
  email, creates the hash-only token record with its issued-email snapshot,
  and inserts one `pending` outbox row. Either both writes commit or neither
  does. Registry enqueue dispatch must propagate failures, never silently
  swallow them or fall back to a direct send.
- Metadata contains only version, purpose, account ID, token-record ID, absolute
  expiry and an obligation identity. The identity is purpose plus token-record
  ID, **not** raw credential, credential hash, email address or expiry bucket.
  A partial unique index enforces one obligation per issued credential.
- A rendered, immutable provider payload is encrypted using AES-256-GCM with a
  fresh nonce. Authenticated associated data binds purpose, account ID, token
  ID, issued recipient and expiry. The envelope carries format version, key
  ID, nonce, authentication tag and ciphertext in a dedicated nullable column.
  The plaintext contains the exact rendered link, name/copy and frozen sender
  headers; never put it in normal outbox HTML, text, metadata or errors.
- Token validation still uses the existing hash. Encryption is for delivery
  recovery, not an alternative credential validator. Use a dedicated managed
  secret, not a session secret or provider key. Retain old decryption keys
  through the lifetime of recoverable rows; missing or unknown keys fail closed.
  Key provisioning/rotation is a separate explicit approval prerequisite, not
  an instruction to request or expose a key in this task.
- Freeze the configured trusted application origin and sender at issuance.
  Build URLs server-side, never from request Host or caller-provided URLs.
  Copy states the fixed absolute expiry; a delayed retry must not promise a
  fresh 60 minutes or 24 hours. The original expiry never changes.

### Preserve caller behavior

- Forgot-password retains generic HTTP 200 and its existing message for every
  input/account/send outcome, skips accounts without a password, and takes the
  recipient only from the matched account. A new request remains a new token;
  do not silently invalidate all other reset links.
- Signup keeps the existing account-plus-welcome transaction, role, consent,
  funnel event, session regeneration, login and HTTP 201 unchanged. Replace
  only the post-commit fire-and-forget verification action with atomic
  token-plus-obligation issuance and best-effort post-commit delivery.
  **Boundary:** a crash before this post-commit issuance still requires the
  user to request verification again. This proposal guarantees recovery after
  a committed obligation's delivery failure, not automatic repair of every
  signup crash. Making verification issuance mandatory in the account
  transaction would change non-blocking signup and needs another approval.
- Explicit verification resend retains authentication, caller-owned recipient,
  already-verified shortcut and response shape. Burn previous unused tokens,
  cancel their unsent obligations, and create the replacement token/obligation
  in one account-serialized transaction. Issuance failure rolls back the burn.
  After successful commit, return the existing HTTP 200 message even if the
  immediate transport fails: it now means durably accepted for delivery.
  This changed failure response must be explicitly approved, not hidden.
- Retry is not resend. Automated or admin retry reuses the same token,
  obligation, expiry, recipient, payload and provider idempotency key. Only a
  new user request can issue a new credential.

### Guard every provider handoff

The existing immediate delivery, scheduled drain and admin retry must all reach
one auth handler before any generic email send. An auth row with invalid
metadata or a missing envelope must not fall through to generic transport.

1. Resolve identifiers without logging bodies; serialize account, token and
   outbox in that consistent lock order, then re-read authoritative state.
   Existing drain claims finish their short outbox transaction first. Issuance,
   resend, redemption and auth admin retry use the same order. Do not copy the
   welcome handler's opposite lock order into this flow.
2. Require valid purpose/version, correct token table, exact token/user binding,
   unused token, `expires_at >` fresh database wall-clock time, existing
   unsuspended/undeleted account, and exact agreement between issued-email,
   current account email and queued recipient. A reset still requires a
   password-bearing account; verification requires an unverified account.
   Missing/malformed/contradictory data means no provider invocation.
3. Decrypt and authenticate the envelope; verify its bound recipient, purpose,
   expiry and payload identity. Never retarget an old token after email change.
4. Inside the existing provider registry action, check expiry again immediately
   before SDK invocation with fresh wall-clock time, not the transaction-start
   `NOW()` value. A provider/registry delay can consume the remaining lifetime.
5. Use a narrow authentication transport adapter that retains the current
   general-notifications-switch bypass and optional reply-to behavior. Preserve
   registry provider wrapping, but require a checked SDK result and a nonempty
   message ID before recording provider acceptance.
6. Persist sent/failed/dead/cancelled result while locks are held. A fresh claim
   cannot allow a stale sender to overwrite newer state. Auth paths catch and
   sanitize *all* exceptions, including transaction/SDK failure, before generic
   outbox logging could serialize them.

An expired, used, superseded, changed-recipient or otherwise ineligible row is
terminal `cancelled` with an allowlisted reason and no retry. Retryable transport
or configuration failure is `failed`, or `dead` at six attempts. Missing key,
bad envelope or contradictory bindings must never send; envelope corruption is
terminal cancellation, whereas missing decryption configuration may retry only
while the token is still valid.

Keep existing backoff. If the calculated next attempt is at/after expiry,
cancel with `auth_expired_before_retry` instead of scheduling a useless send.
Admin retry first checks eligibility and remaining lifetime; it cannot resurrect
a consumed/expired token, decrypt for an operator, or mint a replacement.
Cancelled rows remain non-retryable.

### Redemption and secret retention

- Both redemption paths enforce issued-recipient equality under the account
  lock. Reset retains atomic claim/password/session purge; take the validity
  instant after expensive password hashing and inside the transaction.
- Verification becomes a conditional single-use claim plus account stamp in
  one transaction. Exactly one concurrent request succeeds. A changed address
  must never become verified by the previous address's credential.
- Consumption/supersession cancels unsent obligations and removes their
  envelopes in the same transaction. Do not invalidate unrelated reset tokens.
- Successful provider acceptance and terminal cancellation clear the encrypted
  envelope while retaining non-secret IDs and status. A dead row retains it
  only while valid, for guarded operator retry. The existing drain's auth-only
  housekeeping removes expired envelopes, including dead rows; no new timer
  or scheduler is proposed.
- Provider acceptance is not delivered-inbox proof. A later bounce is not
  automatically reissued; any resend request creates a separately authorized
  new credential.
- Logs, admin responses, reports, test output, traces and PR bodies never
  contain credentials, credential hashes, rendered auth payloads or envelopes.
  Persist only static error codes and non-secret record IDs. Existing request
  URL/body redaction is retained and tested, not assumed to cover arbitrary SDK
  exception strings or console logging.

## Duplicate guarantees and their limits

Database uniqueness prevents duplicate obligations for the same credential;
account/token/outbox locking prevents parallel local sends, resend races and
replay overwrites. Reuse one stable provider key based on purpose and token ID
for every attempt. Keep the encrypted payload byte-stable across retries.

A provider can accept a send just before the transaction fails. Database
transactions cannot make that remote side effect atomic. Resend's applicable
idempotency retention window must be verified against current provider
documentation before implementation approval. Automatic or manual retry must
not run beyond the confirmed window after an ambiguous attempt; quarantine
that row as `dead` with `auth_acceptance_unknown`, clear unsafe retry scheduling,
and require acceptance reconciliation rather than claim exactly-once delivery.
Preserve the envelope only until token expiry. The max token TTL is 24 hours,
which is not proof that a provider key remains effective for every permitted
retry. The duplicate test plan distinguishes local uniqueness, provider
deduplication and this unresolved remote outcome.

## Approval and rollout boundaries

The two exact touch lists require separate founder approval. There is no auth
implementation in this task, no migration registration, production inspection,
deployment, or commerce/Part 8 activation. No unrelated sender, payment,
booking, welcome, marketing, heartbeat or scheduler semantics may change.

Future development requires disposable-schema, intercepted-transport tests
first. They must not be presented as real delivered-email evidence.
Production release, real-mail verification, key provisioning and migration
registration each need a later explicit decision. Legacy hash-only tokens
cannot be turned into retriable emails or assigned historical recipients
reliably: do not backfill guessed addresses or reconstruct links. Stage nullable
schema first; keep the old issuer/redeemer until the founder-approved cutover.
Before enforcing issued-email on all redemption, allow the full old 24-hour
verification / 60-minute reset lifetime to elapse after stopping the old issuer,
or obtain explicit approval to invalidate remaining legacy tokens. No silent
legacy invalidation is authorized by this proposal.
