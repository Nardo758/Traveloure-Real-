# Proposal only — three focused authentication fixes

**15 October 2026. DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

No implementation, tests, emails, jobs, database changes or production operations
were performed. This is an approval-first proposal, not a PR or runtime patch.
Inspected main: `dcfc3d641241ef6f10fc7df223e5c584697bfed9`.
The relevant four runtime files are unchanged from the audit's inspected main.

## Scope and recommendation

Recommend one small main-based PR with three separately reviewable fixes and
their tests. Use the existing outbox, registry, dispatcher, account records and
token table. Do not reconcile the retired signup snapshot or copy its
outbox/registry/CI. Do not build the remaining auth automation families.

Order: agree the two behavioral decisions below; repair the welcome gate and
reset serialization; then change the neutral signup API and both clients in
the same review unit. Reconcile tests against the approved main head before
running anything. No schema, payment, checkout, fee, feature-flag or scheduler
changes are proposed.

### Decisions that must precede implementation

1. **Neutral registration changes current behavior.** Today registration logs
   new users in and returns a user object, while existing addresses get a
   conflict. To stop those explicit disclosures, the proposal removes automatic
   email/password signup login and presents the same neutral result to both.
   Subsequent sign-in remains the normal authentication path. This is not a
   cosmetic message change; founder approval is required.
2. **Stored verification is required for welcomes.** An SSO or legacy account
   without a trusted stored verification stamp stays pending. No provider trust,
   migration, backfill or SSO writer change is assumed. If another trusted
   verification source is wanted, approve its exact scope separately.

## Exact proposed touch list

| File | Smallest proposed change |
|---|---|
| `server/services/signup-welcome-outbox.service.ts` | Add an unverified-account hold immediately before the existing provider call, under existing outbox/account locks. Preserve existing cancellation and delivery behavior otherwise. |
| `server/replit_integrations/auth/emailAuth.ts` | Serialize reset issuance/consumption on the same account lock; replace explicit duplicate-registration/new-account response differences with the approved neutral contract and handle only the relevant email-uniqueness conflict as duplicate signup. |
| `client/src/pages/Signup.tsx` | Replace registration-success dashboard navigation with the neutral completion state; offer normal sign-in/reset paths. Preserve current validation/consent requirements; do not expand into unrelated signup repairs. |
| `client/src/components/SignInModal.tsx` | Add the same neutral result for signup; keep login behavior. Do not migrate/claim guest state, consume return navigation, or show “Account created” on the neutral signup response. Keep those actions on actual successful login. |
| `client/src/locales/en/auth.json` | Add neutral-result strings only. |
| `client/src/locales/ja/auth.json` | Add matching localized neutral-result strings only; no locale-system refactor. |
| `server/__tests__/signup-welcome-outbox.db.test.ts` | Extend existing guarded welcome DB/pure tests for verified/unverified eligibility and held-row recovery. |
| `server/__tests__/auth-three-defects.db.test.ts` **(new)** | Isolated provider-free route/database tests for reset serialization and the neutral registration contract. |
| `playwright/tests/auth-three-defects.spec.ts` **(new)** | Development-only browser checks for both signup entry points and real verification/reset navigation using captured test-only transport, not real email. |

No other runtime files are authorized by this proposal. The named new test files
are proposed locations, not files already created. Existing test selectors and
mutation-auth checks must be inspected at approval time. If either test requires
an additional CI selector/configuration or route-harness edit, show that exact
addition for approval before making it; do not claim unwired tests run in CI.

## 1. Verify before welcome

**Confirmed evidence:** `signup-welcome-outbox.service.ts`:15–26 checks
account/email/consent/previous delivery, but not verification. Signup enqueues
at `emailAuth.ts`:128, starts verification delivery at 144, and attempts welcome
delivery independently at 148–150. Starting two asynchronous calls in that order
does not enforce verification.

**Proposed minimal behavior:**

- Keep the existing account-plus-welcome enqueue transaction and unique
  obligation. Do not move enqueue into a second route or add a second job.
- Run existing invalid-metadata/account/email/consent/duplicate cancellation
  checks first, unchanged. Deleted/suspended/changed-address records must not
  become permanently waiting just because they are also unverified.
- Before provider handoff, inspect the locked live account's stored
  `emailVerified`. If missing, return the row to `pending`, record
  `awaiting_email_verification`, and set a five-minute retry time using server
  time. Do **not** increment attempts, stamp `sent_at`, mark dead, cancel the
  obligation, or invoke transport.
- After verification commits, the next successful existing outbox drain can
  deliver the same row. No immediate-send hook is needed in the verification
  writer. A five-minute retry is eligibility timing, not a promise that an
  unproven/sleeping runner will execute within five minutes.
- Do not re-send already delivered historical welcomes or invent verification
  stamps. Existing sign-in/SSO behavior is otherwise unchanged by this fix.

**Proof, after approval — fresh randomized fixtures, two clean loops:**

1. Unverified immediate delivery, scheduled drain and admin retry: zero transport
   calls; same pending row/reason; unchanged attempt/sent fields.
2. Verify then send: one transport call from the original row, not a new enqueue.
3. Both orderings: dispatcher locks account before verification versus
   verification commits before dispatch. No provider handoff before a committed
   trusted stamp; deferred row remains recoverable.
4. Two concurrent claims/retries: preserve existing single-claim/idempotency
   behavior. This does not claim real-provider once-only under DB failure.
5. Deleted, suspended, changed-email, no-consent and duplicate-sent accounts:
   existing cancellation still wins; no transport.
6. Null-stamp SSO/legacy fixture stays held; explicit trusted stored stamp can
   proceed. No guessed provider verification or backfill.
7. Signup transaction fault still rolls account and obligation back together.

## 2. New reset request invalidates the earlier link

**Confirmed evidence:** `emailAuth.ts`:334–345 inserts another unused reset
token without revoking earlier tokens. Consumption at 397–425 atomically claims
one token and changes password/session state, but does not serialize against
issuing another token.

**Proposed minimal behavior — existing table, one common lock order:**

- Reset issuance transaction: lock the existing account row; mark all prior
  unused reset tokens for that account used with server time; insert the new
  hashed token; commit. Preserve neutral forgot-password responses, token TTL,
  OAuth-only handling and existing post-commit sender.
- Reset consumption: identify the candidate token's account without claiming
  it, acquire that **same account lock**, then recheck/conditionally claim the
  still-unused, unexpired token. Keep password update and existing session
  purge in that transaction.
- Both paths use **account before token** lock ordering. Do not add an account
  lock after claiming a token: that can deadlock with an issuer that holds the
  account while revoking tokens.
- “Newest” means latest successfully serialized issuance, not latest mail
  arrival or which request began first. Old emails can arrive later and contain
  an invalid link; do not promise ordering from the direct email provider.
- An issuance rollback leaves the earlier link valid and no new usable token;
  successful later issuance invalidates all earlier unused links.

**Proof, after approval — two clean randomized loops:**

1. Request A then B: A fails safely; B works once; B replay fails.
2. Two simultaneous issuances: at most one unused valid token after both commit;
   only the last committed issuance works.
3. Old-token consumption versus new issuance, both account-lock orderings:
   consume-first can complete before replacement; issue-first makes old
   consumption fail. No half password/session/token state or deadlock.
4. Forced issuance failure rolls back revocation and insertion together.
   Forced password/session-purge failure rolls back claim and password change.
5. Other accounts' tokens/sessions are untouched; expiry and generic failure
   messages remain; unknown/OAuth-only requests retain existing neutral behavior.

This fixes token lifecycle, **not** durable auth-email retry. Do not import the
separate auth-outbox conversion proposal or change direct auth senders here.

## 3. Neutral signup response

**Confirmed evidence:** `emailAuth.ts`:95–105 explicitly reveals an existing
account; 153–185 creates a new session and returns `201` plus user details.
`Signup.tsx`:38–45 redirects successful registration to dashboard.
`SignInModal.tsx`:136–160 assumes success is authenticated, claims guest state
and navigates. Replacing just the error sentence leaves these differences.

**Proposed minimal consistent contract:**

- For valid new-address and duplicate-address submissions, return the same
  **202** and same neutral JSON shape, with no user ID, role, email or
  account-existence field. Suggested text: **“If this address can be used,
  check your email for next steps. You can also sign in or reset your password.”**
- Only the new account performs existing creation, consent recording,
  verification issuance and welcome enqueue. A duplicate does not change the
  existing account/password, create a welcome, log anyone in, or trigger new
  existing-account email. A06's separate notification is not being built here.
- Do not create a new authenticated session for either registration outcome.
  Preserve any pre-existing session; ordinary login and SSO are not redesigned.
  Keep guest data/return destination until an actual authenticated login.
- Normalize the relevant unique-email race to this response, without hiding
  unrelated database/provider/application errors as successful signup.
- Match password-hashing work for valid new/duplicate submissions to remove
  the obvious early-return cost difference; retain applicable existing abuse
  protections. Measure latency in approved tests. Do not claim constant-time
  network behavior or complete resistance to statistical enumeration.
- Keep malformed input, missing consent and registration-disabled behavior
  correct. Do not expand into unrelated form/consent, account provisioning or
  rate-limit architecture changes without a new touch-list approval.

**Proof, after approval — two clean randomized loops:**

1. Same HTTP status and full JSON shape for valid new and existing addresses;
   no user/account-existence identifiers and no newly authenticated session.
2. New account has one welcome obligation held until verification; duplicate
   leaves original identity/password/roles/obligations unchanged.
3. Concurrent duplicate/new registration: one account, one welcome obligation,
   same neutral responses; unrelated DB fault remains a truthful failure.
4. Both browser entry points show the same neutral completion state, not
   dashboard, “Account created,” duplicate-account error, or guest-claim action.
   Sign-in/reset links work and login preserves guest claim/return behavior.
5. Existing validation, consent, disabled-signup, session-fixation protections
   for actual login, role assignment and CSRF behavior remain; no silent bypass.
6. Record valid new/duplicate response timings and hashing behavior with mocked
   transport. No real email or artificial network-timing guarantee.

## Gates and proof limits

After scope approval: reproduce each exact defect with new tests first; make
only approved edits; rerun the failing cases plus two variations and two clean
loops. Run the existing signup/itinerary regressions, mutation-auth generation
and guards for changed routes, and typecheck against the **fresh actual main
baseline**, preserving the established 117-diagnostic ceiling and no new-module
diagnostics. If main has drifted, report it; never raise the baseline or claim
a globally clean build.

Disposable development DB schemas, browser execution and provider-free transport
must be explicitly included in approval. No live sweep/drain, startup/restart,
real email or production verification is authorized now. Use an approved owned
test target; do not start the regular app on an unsafe sender path.

Mocked transport proves attempted calls, local state and controlled races.
It cannot prove real delivery, inbox placement, client rendering, network
timing, real-provider idempotency or recovery after ambiguous acceptance.
Those remain separate bounded approvals and evidence requirements.

**No merge, migration registration, feature flag, payment/checkout or production
change. No release activation.**
