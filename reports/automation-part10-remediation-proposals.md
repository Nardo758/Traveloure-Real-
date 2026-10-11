# Part 10 — dispatcher, main reconciliation and held migration proposals

**FINAL STATUS: DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Historical proposal, subsequently approved for dispatcher repair and non-sending
QA start mode only. Results are in `automation-part10-remediation-results.md`.
Main reconciliation and migration renumber remain proposals awaiting approval.
No merge, migration registration, flag change, production action or real email.
Development approval is not release authorization or permission for email.

## 1. Provider acceptance followed by database failure

### Reproduced failure and duplicate risk

Existing evidence: `automation-release-blockers.md` provider-failure section;
`automation-part10-evidence/provider-failure-corrected-loop-{1,2}.log`.
Each fault below was characterized in two randomized inner loops.

| Fault after synthetic provider acceptance | Provider submissions | Durable outcome |
|---|---:|---|
| Actual SQL abort | 1 | Receipt/attempt roll back; fallback records `cancelled/check_failed` despite acceptance |
| Actual deferred COMMIT rejection | 1 | Same lost acceptance and misleading cancellation |
| COMMIT succeeds but acknowledgement is lost | 1 | Durable `sent` survives; function incorrectly returns `cancelled` |
| Abort, then fallback cancellation fails | 2 | Generic catch can make row retryable; another worker submits again |
| New retry wins before stale fallback | 2 | New sent row survives, but second provider submission already occurred |
| New lease wins before stale fallback | 2 | New processing lease survives; second submission occurs afterward |

The synthetic provider deduplicated to one acceptance. That does not prove
Resend or a recipient received only once. Retry after the provider's retention
window, changed payload or missing durable acceptance evidence remains unsafe.

Current code already supplies `cart-reminder-${outboxId}` in
`commerce-send-verification.service.ts`. `email.service.ts` already forwards
that key to the Resend SDK. Simply adding another row-ID key does not fix this.
The transaction surrounding handoff can roll back its own acceptance record;
the outer catch then confuses post-handoff uncertainty with pre-handoff failure.

### Provider documentation verified

Official source, read on 2026-10-11:
https://resend.com/docs/dashboard/emails/idempotency-keys

- Supported for Send Email and Send Email Batch.
- SDK option `idempotencyKey` maps to the HTTP `Idempotency-Key` header.
- Keys are retained **24 hours**, not indefinitely; maximum 256 characters.
- Same key/request within that window returns the original email ID without
  sending again.
- Changed payload with an existing key: `409 invalid_idempotent_request`.
- Concurrent in-flight key: `409 concurrent_idempotent_requests`; documented
  as safe to retry later, within applicable limits.

No provider API request or email was sent to validate this documentation.

### Alternatives and recommendation

1. **Key-only retry:** smallest change but insufficient; key already exists,
   durability and 24-hour expiry remain unresolved. Not recommended.
2. **Committed intent + uncertain-attempt hold:** recommended smallest
   fail-closed dispatcher repair. Uses existing outbox JSONB; no schema change.
   Tradeoff: an interrupted pre-send attempt may need manual reconciliation
   rather than automatic retry. It favors no duplicate over automatic recovery.
3. **Bounded automatic provider retries/reconciliation:** potentially restores
   liveness, but needs immutable actual transport payload, lease fencing,
   conservative retention deadlines and separate provider proof. Defer.

### Approved dispatcher-only design — see implementation results

1. Claim/verify the existing row under recipient/outbox locks. Preserve every
   current consent, timezone, cart, sequence, paid-rail and production hold.
2. In a **committed pre-handoff transaction**, record an attempt intent in
   existing `email_outbox.metadata`: version, row-derived key, attempt token,
   DB-clock start time, payload digest and phase. Increment attempt count and
   reserve the marketing day consistently. Do not send without a confirmed
   durable intent. A COMMIT error/unknown acknowledgement results in a hold,
   not a provider call.
3. Only the invocation that created and confirmed that intent may proceed.
   Reacquire the established locks, check intent identity, perform the complete
   live verifier, and put the final payment read immediately before handoff.
   No extra intent write after that final read. Preserve the measured residual
   boundary and all UNKNOWN/must-have holds.
4. Record provider acceptance/ID after handoff in a separate fenced durable
   update. If provider or DB acknowledgement is uncertain, the already committed
   intent survives. Return uncertainty—not a claim that no send occurred.
5. Any existing unfinished intent is **not automatically resubmitted**, even
   after lease expiry, five-minute retry, admin retry or 24-hour key expiry.
   Claim/drain and the dispatcher both enforce this. Stale invocations cannot
   cancel/overwrite newer claims or downgrade durable `sent`.
6. A proven pre-handoff rejection remains a genuine cancellation. After
   invocation, never record `check_failed` cancellation as proof of non-delivery.
   Do not let generic catch turn an unfinished commerce intent into an
   automatically retryable provider call.
7. A successful intent/receipt remains authoritative even if its COMMIT
   acknowledgement was lost. Unknown DB state is held; never invent receipt.
   No automatic marker clearing, new-key retry or claimed universal exactly-once.

Proposed exact JSONB field: `commerceDeliveryAttempt` with `version: 1`,
`key: cart-reminder-${outboxId}`, unique `ownerToken`, database `intentAt`,
`payloadDigest`, and `phase: intent | accepted | uncertain | not_invoked`;
include `providerMessageId` only when actually returned. No token, recipient
or payload body is printed in evidence. An existing attempt field of unknown
version/malformed shape fails closed, not treated as absence.

Proposed existing-state mapping:
- Confirmed committed intent: `processing`; all other claimers exclude it.
- Proven rejection before provider invocation: `cancelled`, actual verifier
  reason, phase `not_invoked`.
- Confirmed provider acceptance and durable completion: `sent`, receipt ID,
  phase `accepted`.
- Any uncertainty after invocation: best-effort fenced `dead`,
  `last_error=provider_acceptance_unknown`, phase `uncertain`, never auto-retry.
  If even this write fails, the original durable `processing/intent` remains
  non-sendable by its marker; it is not silently treated as healthy processing.
- Any non-success transport result after invocation is conservatively held:
  the current adapter cannot reliably distinguish every definite rejection
  from ambiguous network acceptance. No inference from error text.

No new table, column, status enum or migration. Existing metadata records the
intent; an existing non-sendable/held state plus reason distinguishes unresolved
acceptance. This mapping is proposed, not implemented; all transitions and
existing dead-letter visibility will be tested after approval. Do not alter
signup, itinerary or direct-sender behavior.

### Exact proposed implementation touch list

| File | Proposed change |
|---|---|
| `server/services/commerce-send-verification.service.ts` | Committed intent, fenced final verification/handoff/completion, truthful uncertainty |
| `server/services/email-outbox.service.ts` | Commerce-only claim/admin-retry/generic-catch protections; preserve unrelated families |
| `server/routes/__tests__/commerce-provider-failure.db.test.ts` | Original failure reproduction, then corrected durable-intent expectations and concurrency faults |
| `server/__tests__/commerce-provider-idempotency.test.ts` | Actual adapter key/payload contract plus synthetic retention/conflict boundaries |
| `reports/automation-part10-remediation-proposals.md` | Approved design and per-case proof results |
| `reports/automation-final-status.md` | Blocker disposition after actual evidence |

`email.service.ts` is read/verified, not edited: SDK forwarding already exists.
No payment, checkout, booking, schema, migration, production or flag touch.
Any additional file requirement must be brought back for approval.

### Proof plan after approval

1. Reproduce the unchanged faults in a fresh owned development schema, separately
   from handler-replay suites. Save baseline provider-call counts/durable rows.
2. Apply only approved dispatcher-side changes; no real provider transport.
3. Reproduce again, then require **two consecutive clean randomized loops**:
   committed-intent failure causes zero calls; post-acceptance SQL/COMMIT
   failures preserve intent; lost acknowledgement preserves durable receipt;
   failed fallback, stale fallback, expired lease, admin retry and competing
   workers cause no second automatic submission.
4. Test crash after intent/before handoff; it remains held, not silently resent.
   Test at/after 24-hour provider retention boundary with a TTL-limited mock,
   and changed-payload/concurrent-key conflict responses.
5. Preserve every final verifier cancel reason, daily cap, quiet hours,
   production/UNKNOWN/must-have holds and non-commerce behavior. Measure the
   final-read/handoff window again; run approved golden/guard/typecheck gates.

Mocks prove application control flow and durable database behavior. They cannot
prove real Resend dedupe, retention enforcement, ambiguous network outcomes,
delivery events, inbox delivery or eventual recovery of every uncertain send.
Those remain separately authorized real-provider proof, never implied here.

## 2. Current-main conflict — BOTH versions, no resolution

Refreshed main: `e8dabc1d61f6666117bf43ff9fde4caa939ebf1f`.
Review branch checkpoint: `62f7fc2bee21f5f934bd2790fcbfe5c35789c96b`.
Read-only merge preview found these **five** conflicting files:

- `server/services/cart-projection.service.ts`
- `generated/security/mutation-auth-manifest.json`
- `generated/security/mutation-auth-inventory.md`
- `generated/security/mutation-auth-coverage.json`
- `generated/security/mutation-auth-coverage.md`

Full unchanged cart-projection versions:
[main](https://github.com/Nardo758/Traveloure-Real-/blob/e8dabc1d61f6666117bf43ff9fde4caa939ebf1f/server/services/cart-projection.service.ts)
and [review branch](https://github.com/Nardo758/Traveloure-Real-/blob/62f7fc2bee21f5f934bd2790fcbfe5c35789c96b/server/services/cart-projection.service.ts).
The generated versions are available at those same commit refs and their exact
paths; they are generated outputs, not manually selected authoritative code.

The actual textual source conflict is:

```ts
// MAIN
import { stampItemSourceClass } from "@shared/content-tiers";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

// REVIEW BRANCH
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
```

Additional semantic differences must be reviewed, even where Git auto-merges:

| Site | Main version | Review branch version | Proposed combined behavior |
|---|---|---|---|
| Plan-item creation in materialization and conversion | `stampItemSourceClass(buildPlanItemValues(...))` | `buildPlanItemValues(...)` | Keep main's source-class wrapping at both sites |
| `syncItemProjection` | Single item-ID argument | Optional `realCartActivity = hasCartActivityOrigin()` | Preserve origin-aware activity scope without changing routing ownership |
| Existing projected cart update | `.set(values)` | SQL quantity-change CASE: stamp genuine quantity activity, otherwise preserve automation state | Keep main values and branch one-statement clock/snapshot preservation |
| Newly projected cart insert | `.values(values)` | `addedCartState(..., realCartActivity)` | Retain main refusal/pricing/ownership logic; stamp only genuine add |
| Projection deletion | Direct delete | Activity-aware atomic delete when origin says genuine activity | Preserve non-activity reconciliation neutrality and atomic real removal |
| Cart-to-item conversion delete | `tx.delete(...).returning(...)` | `deleteCartRowsWithActivity(..., tx)` | Same existing transaction; preserve main item source class and branch cart guarantees |

Proposed import union retains **both** `stampItemSourceClass` and `sql`, plus
branch state helpers. Do not take either entire file wholesale. Preserve main's
FD-2 source classification, published-price/checkout refusals, item values,
transactional conversion and routing ownership. Preserve atomic cart-clock
writes, immutable add-time snapshots, resume/quantity/removal behavior and
display/background neutrality. No payment code changes.

**Exact proposed reconciliation touch list:** cart-projection service,
`server/__tests__/cart-email-state.db.test.ts` for combined guarantees,
and the four generated security files via their existing regeneration commands.
Rerun main's relevant cart/guest/source-class regressions and Parts 2/7 golden
proofs on the approved combined branch, with two clean cart loops and unchanged
typecheck baseline. Any extra runtime dependency requires a revised touch list.

**Waiting for founder approval AND main-owner review.** No merge, reset,
force-resolution, main overwrite or generated-file reconciliation performed.

## 3. Held migration renumber proposal

On refreshed main, both numeric SQL filenames and `migration-files.ts` reach
**368**; no 369 filename or registry entry exists. Main's 360 is
`360_occasion_descriptions.sql`.

Propose renaming the held draft, only after approval:

`360_job_heartbeats_nullable_success.sql`
→ `369_job_heartbeats_nullable_success.sql`.

Its existing SQL remains:

```sql
ALTER TABLE job_heartbeats ALTER COLUMN last_success_at DROP NOT NULL;
```

369 is provisional, not reserved: re-fetch/recheck at actual approval/registration
time. **No rename, SQL change, registration, migration run or production action
performed.** Main's 346/347 ownership is unchanged.

## 4. Requested genuine real-clock start — BLOCKED, not falsely WAITING

Development settings `SIGNUP_QA_TEST_INBOX` and
`ITINERARY_OUTCOME_TEST_EMAIL` are present by name. No addresses printed.
The approved 1d proof maps to `SIGNUP_QA_TEST_INBOX` in the parent only.

The current approved path cannot retain a genuine scenario:
- Controller accepts only `--deliver-qa` / `--dry-run` (and copy-only modifier);
  neither starts a retained real-clock fixture.
- Its fixture rig uses a fixed 2030 eligibility anchor and synthesizes prior
  reminder history; do not relabel that as real activity.
- The schema owner enforces three minutes, then unconditionally removes its
  namespace. This cannot preserve a cart until tomorrow.

No scenario has been created under that incompatible path. No scenario ID,
real start or due time is invented. The ledger remains OPEN, not WAITING.

### Separate QA-only start-mode proposal

Proposed exact touch list:
- `scripts/verification/run-commerce-qa-delivery-proof.mjs`
- `scripts/verification/run-messaging-gate.mjs`
- New `server/routes/__tests__/commerce-real-clock-start.db.test.ts`
- `reports/real-clock-ledger.md` and `reports/automation-final-status.md`

Add an explicit **start-only, no-provider mode** to the existing approved
controller/owner. Keep fingerprint, owned-schema, QA-account and recipient
guards. No provider SDK initialization/channel handoff in this mode; child has
no credentials/inbox values. Retain only the explicitly owned QA namespace
under recorded ownership; no public/application schema alteration, second
scheduler or new unauthenticated capture path.

Create a fresh randomized authenticated fixture through the real approved cart
writer, using actual server/database time with no override. Record the new
scenario/sequence/cart IDs, database start and exact start + 1h / +24h / +72h
threshold instants. Bind only the approved inbox setting name in reports.
Choose a known fixture timezone and record actual quiet-hours/daily-cap effects.

The 1d sequence cannot fabricate an earlier 1h send: record real preceding-step
history only. If future 1h delivery is not separately authorized/completed,
the 1d check remains blocked by that prerequisite. At the threshold, verify
cart/account/recipient/consent/timezone/sequence, every readable payment rail,
daily cap and prior step; UNKNOWN blockers remain. Never bypass them for proof.

After a successful actual start, append its real timestamp/due times and mark
WAITING. No background email is scheduled or sent; future sending requires
separate explicit authorization. No NEXT-DAY PROVEN until the genuine due-time
pair has a matching provider-observed delivered receipt.

The QA-only adaptation was approved and implemented. The genuine ledger now
records WAITING with real timestamps; no email was sent or scheduled. Earlier
BLOCKED/NOT STARTED observations above describe the pre-approval state only.
