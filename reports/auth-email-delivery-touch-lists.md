# Authentication email recovery — exact future approval manifests

**Proposal only. These lists are not permission to edit.**
The current deliverable adds only the three authentication proposal reports.
No source or schema file in the lists below was changed.

## A. Proposed writers and runtime files — separate approval required

| Action | Exact path | Bounded touch |
|---|---|---|
| CHANGE | `server/replit_integrations/auth/emailAuth.ts` | Replace reset issuance and `issueAndSendVerification` with transaction-owned token/outbox issuance. Serialize verification burn/replacement. Keep signup's post-commit, non-blocking path and welcome transaction. Add issued-recipient guards to both redemption routes, fresh reset expiry check and atomic verification claim; cancel/erase only related unsent obligations. Preserve password/session purge and public enumeration policy. |
| CHANGE | `server/services/email.service.ts` | Extract the two auth payload builders; replace direct untracked auth actions with the approved durable issuer boundary. Add a narrow checked authentication SDK adapter, stable provider key and final guard, retaining notification-switch bypass and optional reply-to. Do not alter generic transport or other senders. |
| ADD | `server/services/auth-email-outbox.service.ts` | Own transactional pending insertion, dedupe, authoritative send-time checks, uniform lock ordering, terminal cancellation, safe retries, guarded admin recovery and expired-envelope cleanup. Never use generic enqueue's direct-send fallback. |
| ADD | `server/services/auth-email-envelope.ts` | Small encryption/decryption module with authenticated context binding, format/key versioning and static errors. No secret-bearing logs; no new library required by the design. |
| CHANGE | `server/services/email-outbox.service.ts` | Auth-type branch ahead of generic send for all delivery entry points; auth-only expiry housekeeping in the existing drain; contain sanitized auth failures. Leave all non-auth retries, lease behavior, test seams and family handlers unchanged. |
| CHANGE | `server/routes/admin.routes.ts` | Auth-only eligible retry service call instead of blind reset; preserve non-auth retry semantics. Explicitly omit secret envelope/body data from admin projection and exception responses; keep admin authorization. |
| CHANGE | `server/automations/messaging/auth-password-reset-email.ts` | Describe durable issuance, stable obligation identity and guarded retry using the same security producer ID/event; no new activation switch. |
| CHANGE | `server/automations/messaging/auth-verification-email.ts` | Same scoped definition update for verification; no new registry family or scheduler. |

Writer census: account creation remains in its existing transaction; verification
issuance remains after it. Reset issuance, verification issuance/resend, reset
redemption and verification redemption are the auth writers. Outbox insertion,
delivery state, auth cancellation/cleanup and auth-only admin retry are the
delivery writers. No user-email edit writer is included: current account-email
equality and row locking are mandatory, and unexpected external/bypass writes
are an explicit safety limit, not justification to expand this manifest.

Retention manifest — **no edits or deletions**:

- `server/services/signup-welcome-outbox.service.ts`.
- `server/replit_integrations/auth/replitAuth.ts`, Facebook/Instagram integration,
  Passport/session installation and `server/routes.ts` mounting.
- Messaging registry indexes/runtime/provider definition and shared automation
  dispatch infrastructure (reuse existing IDs and provider wrapper).
- Generic non-auth `enqueueEmail`, other email helper families and their
  delivery policy; commerce queue-only blocks, Part 8, payment/booking writers.
- Production configuration, infrastructure and current feature flags.

## B. Proposed schema changes — independent approval required

| Action | Exact schema owner / object | Proposed change |
|---|---|---|
| CHANGE | `shared/models/auth.ts` / `password_reset_tokens` | Add nullable `issued_to_email` text/varchar snapshot. New issuances require it in the issuer; preserve existing hash, token ID, user FK, expiry, used/created stamps and indexes. |
| CHANGE | `shared/models/auth.ts` / `email_verification_tokens` | Same nullable issued-recipient snapshot and new-issuance requirement. |
| CHANGE | `shared/schema.ts` / `email_outbox` | Add nullable `auth_delivery_envelope` JSONB for `{version, keyId, nonce, tag, ciphertext}`. Declare a partial unique expression index `uq_email_outbox_auth_delivery_key` on `metadata ->> 'authDeliveryKey'` where metadata has that key. Mirror its approved SQL definition so schema synchronization cannot drop it. |
| ADD, HELD ONLY | `server/migrations/held/auth_email_delivery.sql` | Unregistered SQL artifact containing exactly the two nullable issued-email columns, nullable envelope column and partial unique index. Add no guessed recipient backfill, token rows, outbox obligations, FK, changed TTL/default, or unrelated constraint. |

This is a proposed held-file path, not an executed or currently existing
migration. A deployable numeric migration ID, registration and production DDL
are deliberately excluded; allocating/registering one needs later release
approval against the then-current migration chain. No schema push is authorized.
The envelope's version/shape and required auth identity are fail-closed runtime
checks because terminal rows intentionally erase envelopes.

Proposed non-secret metadata keys, not new DB columns:
`authDeliveryVersion`, `authPurpose`, `authAccountId`, `authTokenId`,
`authExpiresAt`, `authDeliveryKey`. Purposes are `password_reset` and
`email_verification`; outbox types are `auth_password_reset` and
`auth_email_verification`. Normal auth `html` is an empty string to satisfy its
existing NOT NULL constraint, and `text_body` is NULL. Subject remains a fixed
non-secret label. No raw token or hash is a metadata value or key component.

## C. Future acceptance coverage — no tests implemented here

| Action | Exact path | Purpose |
|---|---|---|
| ADD | `server/__tests__/auth-email-outbox.test.ts` | Pure guard, envelope, retry-boundary and provider-result tests using in-memory synthetic credentials, never printed. |
| ADD | `server/__tests__/auth-email-outbox.db.test.ts` | Two disposable-schema loops proving atomic issuance, consumption, locking, dedupe, lease recovery and guarded retries with intercepted transport. |
| ADD | `server/__tests__/auth-email-delivery.http.test.ts` | Route contract, account ownership, resend, signup/session, replay and error-redaction tests with intercepted email, no real recipients. |
| CHANGE | `server/__tests__/email-outbox.test.ts` | Prove auth dispatch cannot fall through, and non-auth backoff/direct-fallback behavior remains unchanged. |
| CHANGE | `server/automations/messaging/__tests__/producer-boundaries.test.ts` | Auth producers retain IDs/events and carry only allowlisted context; encrypted issuance uses the existing enqueue/provider registry seams. |
| CHANGE | `.github/workflows/suite-server-tests.yml` | Append explicit new test selectors and isolated test setup, failing on skipped/no tests. Retain all existing suites and signup-welcome coverage. |

Run the existing `server/__tests__/signup-welcome-outbox.db.test.ts`,
`server/__tests__/tier2-security-audit.http.test.ts` and request-log redaction
coverage unchanged as regression checks. No broader test rewrite or new runtime
dependency is part of this manifest.

## Decisions the founder must approve before implementation

1. Writer manifest A and schema manifest B individually.
2. Encrypted payload storage, dedicated key lifecycle, and plaintext erasure.
3. Explicit resend HTTP 200 after durable enqueue despite immediate send failure.
4. Recipient-bound redemption, atomic verification claim, final expiry checks,
   and the staged legacy-token cutover described in the proposal.
5. Safe policy for provider-acceptance ambiguity after its verified dedupe window.
6. Development-only intercepted testing first; release and real mail remain
   separately blocked. Signup's pre-enqueue crash gap remains explicitly carried.
