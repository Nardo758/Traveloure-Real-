# Vendor bulk email: retry-safe conversion proposal

**Status: PROPOSAL ONLY — NOT ACTIVATED, NOT RELEASE-CERTIFIED.**

Separate founder approval is required before changing any sender, schema,
registry definition, endpoint behavior or production flag. This is not Part 8
activation. Payment code and commerce flags are outside scope.

## Audit and source ownership

Started from `reports/commerce-direct-senders.md`, family 1. On this checkout:

| Path | Observed behavior / consequence |
|---|---|
| `VendorManagementService.sendBulkVendorEmail`, `server/services/vendor-management.service.ts:234` | Loads all requested contracts, silently filters nonexistent/foreign contracts in the service, then sends sequentially; missing email increments failed and continues. Duplicate IDs are not removed. There is no stable request or recipient identity. |
| Same file, `:283`, `sendEmail(emailPayload)` | Provider acceptance precedes `logCommunication`. If logging throws, the accepted message is counted failed. If logging returns undefined because the contract disappeared, sent still increments. Batch retry repeats accepted recipients. Two concurrent calls can submit the same recipient. |
| `logCommunication` in the same service | Read-modify-write JSON history can lose concurrent entries. A new recoverable path must append under a contract lock and be idempotent; do not rewrite unrelated historical entries or payment methods. |
| `generateCalendarInvite` in the same service | Generates UID/DTSTAMP from the clock; reconstructing on retries changes bytes. Attachments currently exist only in the immediate direct payload. |
| `POST /api/trips/:tripId/vendors/bulk-email`, `server/routes/trips.routes.ts:1200` call | Authenticated, trip-logistics authorization, 5 requests/10 minutes limiter, 1–100 string IDs, subject/body validation and explicit foreign-contract rejection. No batch key. Returns `{sent,failed,failureReasons}`; there is no built-in browser caller found by source search. |
| `email-outbox.service.ts`, `enqueueEmail` | Main-owned row and registry dispatch, but no generic producer dedupe. Insert failure falls through to direct sending. A row ID is not a delivery receipt. Do **not** simply replace sendEmail with this call. |
| Same file, `drainOutbox`, `deliverQueuedEmail`, `attemptDelivery` | Main worker already owns retry/backoff, immediate claims and admin drain. Generic reconstruction omits attachments. Generic finalization checks only processing status, not lease ownership; a reclaimed processing row can be overwritten by an old sender. Generation and signup handlers demonstrate typed opt-in behavior; retain every legacy behavior. |
| `shared/schema.ts`, `emailOutbox` | Authoritative delivery storage. No generic batch unique index, persisted attachments column or dedicated lease token. Reuse metadata for vendor-specific identity, frozen payload and recovery facts. |
| `server/automations/messaging/runtime.ts`, `index.ts`, `delivery-index.ts` | Authoritative registry. Existing enqueue, drain, admin retry and provider-transport nodes supply action wrappers, not durable uniqueness. `email-outbox-enqueue` declares null idempotency. Never copy the registry or add a second scheduler. |
| `server/services/email.service.ts`, `sendEmail` | Already supports `idempotencyKey`, attachments, reply-to and kill switch through the existing provider transport. Provider success means accepted, not delivered/opened. No transport replacement is needed. |
| `server/routes/admin.routes.ts`, outbox retry endpoint | Resets failed/dead rows and kicks the existing general drain. Vendor holds must survive this endpoint and remain fenced at actual handoff; attempt reset must not reset first provider-attempt time or key. |

## Options

1. **Recommended: immutable batch receipt + recipient obligations in the main
   outbox.** A receipt stores request identity and the recipient manifest;
   existing outbox rows alone own delivery status and retry. Slight schema
   addition, but atomic acceptance, addressable results and complete recovery.
2. **Outbox metadata only, serialized by trip lock.** Avoids a receipt table, but
   cannot durably represent all-invalid batches, validate an empty replay, or
   retain the original requested manifest without an artificial non-email row.
   Reject: the outbox must not become a batch receipt store.
3. **Direct loop plus success stamps.** Small patch, but provider acceptance
   before stamp, stamp failures and concurrent requests remain unsafe. Reject.

## Proposed protocol and batch compatibility

### Identity and frozen acceptance

- Require an explicit UUID `batchId` for a new coordinated send. The initiating
  caller creates it once and retains it across timeouts/reloads/retries. Same
  actor + trip + batch ID represents one intent; a deliberately new send uses a
  new ID. No content-only dedupe, server-created retry ID or implicit timestamp ID.
- Keep existing authorization, trip membership checks and limiter. Validate
  date/boolean types and email syntax before enqueue, with bounded text and total
  attachment bytes. An authorized replay loads its frozen receipt rather than
  re-rendering changed contracts. Recheck trip access even for a replay.
- Persist `vendor_email_batches`: UUID ID; actor and trip scope (scalar IDs,
  no new foreign keys); canonical request SHA-256; immutable manifest JSON;
  accepted-at time. Unique `(actor_id, trip_id, batch_id)`. It has **no retry
  counters, provider state or per-recipient delivery status**: those belong
  exclusively to `email_outbox`.
- Canonical request includes sorted unique contract IDs, exact subject/body,
  calendar option and normalized event instant; recipient/contact snapshots and
  rendered bytes are taken once at first acceptance. Reordering the same set is
  a replay; same ID plus different intent returns 409 without sending anything.
  Store original first-occurrence order for display/immediate attempts.
- Normalize recipient addresses using the existing project's email convention;
  freeze it in the manifest and never recompute identity on a retry. Group
  contracts sharing the normalized address into **one recipient obligation**.
  Distinct addresses get independent rows. Duplicate IDs are collapsed.
- Preserve subject, escaped HTML, plain text and the two-hour calendar event.
  For an address shared by several contracts, one message carries each
  contract's distinct invitation as a separate deterministically named .ics
  attachment. Single-contract messages retain `invitation.ics`. Freeze UID,
  DTSTAMP, event bytes, from/reply-to, recipients and base64 attachments once.
  This single-message grouping is an explicit approval item, not a change made
  here; it avoids contacting one address twice within a batch while retaining
  all its invitations and per-contract history.
- Missing/invalid addresses are manifest failures, not guessed recipients.
  No outbox row exists for them. Replay returns the original failure; repairing a
  recipient requires a new intentional batch. A batch with all missing addresses
  still receives a durable receipt. Foreign IDs reject the entire request.
- Batch receipt and **all valid recipient rows commit in one transaction**.
  Conflict losers load the winning immutable receipt. A crash inside this
  transaction leaves no receipt/rows/send; a crash after commit leaves recoverable
  pending rows. No provider call inside acceptance and no unrecorded fallback.
- Outbox type `vendor_bulk`; unique vendor-only metadata `vendorRecipientKey`
  derived from actor/trip/batch/normalized address using unambiguous canonical
  encoding and SHA-256. Add a partial unique expression index for that type and
  key. No `commerceKey`, marketing-day reservation or copied commerce guard.

### Delivery ownership and unknown acceptance

- Use the existing outbox scheduler and `deliverQueuedEmail` for optional
  sequential immediate attempts after commit. Pending and failures remain
  visible to the same drain, admin list and retry schedule. No second queue,
  worker, heartbeat or internal-job endpoint.
- Add a vendor-only branch in main `attemptDelivery`, calling a focused vendor
  handler. It reloads frozen metadata; do not use the generic reconstructed
  payload or generic status-only finalizer. Preserve attachments, text,
  from/reply-to and exact provider bytes on both immediate and delayed attempts.
- Vendor claims receive a new random lease token in metadata, including
  lease-expired reclaim. All vendor success/failure/history-pending updates
  compare row ID, processing state and that token. Reload ownership immediately
  before provider handoff. Never allow a stale sender to stamp another lease.
  A final check cannot prevent an already-in-flight old request: provider
  dedupe remains essential. Generic legacy claim/finalization stays unchanged.
- Before any provider invocation, durably record first-attempt time and a
  conservative retry deadline. If that write fails: no handoff. Always use the
  **same** provider key (`vendor-outbox-<row ID>`) and frozen payload, including
  after a lost success stamp, timeout, crash or admin retry.
- Acceptance or timeout followed by local failure is UNKNOWN, not a safely
  rejected request. Provider deduplication is time-bounded; verify the actual
  provider contract/retention before implementation. Fixture's 23-hour window is
  synthetic, not provider certification. Set a safety margin for network
  timeout, clock skew and in-flight duration under the approved contract.
- After that safe deadline, **never automatically resend**, even if the row
  remains failed/processing or an admin reset its attempts. Hold as existing
  `dead` with vendor metadata `acceptance_unknown`/`holdReason`; include it in
  the existing dead-letter view. Operator reconciles provider acceptance or
  explicitly authorizes a new send. No assertion of indefinite exactly-once
  delivery: availability is sacrificed for safety beyond the provider window.
- Persist acceptance (`sent`, provider ID, timestamp) independently of contract
  communication history. Record `vendorHistoryPending` in the same success
  transaction. A history write failure never turns sent back to failed.
  A narrow repair pass in the existing outbox job processes these sent rows
  **without any transport invocation**, using recipient key as entry identity
  and locked atomic contract appends. Mark each contract repaired so partial
  history writes recover without duplicate entries. Do not reset last-contact
  time to repair time; use original acceptance time.
- Recheck trip existence, contract scope, recipient/address continuity and
  relevant current authorization at handoff; changed/deleted scope cancels or
  holds, never reroutes the frozen obligation. Existing email kill switch
  remains enforced. No inferred marketing consent: arbitrary bulk content
  needs a founder-approved transactional/marketing classification and applicable
  vendor opt-out policy before release. Do not import traveler cart rules.

### Response contract

Retain continue-on-recipient-failure behavior, initial ordering, all selected
contract invitations and truthful per-contract history. Keep legacy
`sent`, `failed`, `failureReasons`, but count `sent` only from persisted provider
acceptance, never from enqueue/history success. Expand with `batchId`, `queued`,
`processing`, `held`, `cancelled`, plus per-recipient outbox ID and status.
Counts are over unique selected contracts; grouped recipients map their accepted
state to all associated contracts. Expose a separate unique-recipient total so
one message is not described as several messages. Counts must partition the
manifest; replay may show later progress but never creates another obligation.

The POST can attempt due recipients sequentially after commit, then returns a
persisted snapshot. A read-only batch-status endpoint supports timeout recovery.
Pending is not failed or sent; provider acceptance is not delivery. Existing
callers must retain the batch ID, understand pending statuses and explicitly
start a new batch for a new intent. No legacy keyless fallback on cutover: return
a clear 400 for missing identity once approved callers have been updated.

## Exact future touch list — requires separate approval

| File / artifact | Approved-scope proposal only |
|---|---|
| `server/services/vendor-management.service.ts` | Replace only bulk-email orchestration/direct call; extract pure calendar/payload rendering or parameterize stable UID/DTSTAMP. Keep payment, balance, contract-stat and document behavior intact. Do not alter unrelated log callers. |
| NEW `server/services/vendor-bulk-email.service.ts` | Batch acceptance/snapshot/status reads, vendor-only outbox handler and atomic history repair. Calls shared DB, outbox and registry; implements no transport or scheduler. Split pure rendering into NEW `server/services/vendor-bulk-email-payload.ts`. |
| `server/routes/trips.routes.ts` | Add batch identity validation and persisted results to existing bulk endpoint; add authenticated `GET /api/trips/:tripId/vendors/email-batches/:batchId` with the same logistics authorization. Preserve membership rejection, cap and limiter. |
| `server/services/email-outbox.service.ts` | Vendor opt-in branch, vendor lease-token assignment in both claim paths; call history repair from existing drain job after delivery. Reuse backoff/max-attempts, keep unrelated claims/results and heartbeat semantics unchanged. No generic fallback changes. |
| `server/automations/messaging/vendor-bulk-email.ts` (NEW), `producer-index.ts` | Register one batch producer event using main definition contract and runtime. Durable uniqueness is enforced in DB, not wrapper memory. Use existing enqueue event for recipient inserts; existing drain/admin/transport nodes stay authoritative. |
| `server/automations/messaging/email-outbox-enqueue.ts`, `email-outbox-drain.ts`, `email-outbox-admin-retry.ts` | Update descriptions narrowly to state vendor queue-only insert/fence/hold exceptions without changing unrelated action contracts. |
| `shared/schema.ts` | Add receipt declaration only. Reuse existing outbox metadata/status columns. No cloned outbox or registry. |
| NEW registered migration under `server/migrations/`, registration in `server/migrations/migration-files.ts` | Create receipt table + scope unique constraint and outbox vendor-only partial unique index. Allocate next main-owned migration number **after approval**; no SQL or registration added now. No new foreign keys or backfill of unknowable past sends. |
| `server/routes/admin.routes.ts` | Vendor-specific retry guard: immutable metadata/deadline/key, held-UNKNOWN rows refused; preserve all other manual retry behavior. Existing list includes safe batch/hold/history-pending context without full message/attachment leakage. |
| `server/services/email.service.ts` | Narrow optional `from` override for the frozen vendor sender address, honored by the same SDK/registry transport. Existing key/attachments/kill switch reused; legacy callers retain defaults. If sender configuration changes, hold rather than silently mutate frozen payload. |
| Existing tests: `server/__tests__/email-outbox.test.ts`, registry delivery tests; NEW vendor DB/HTTP suites and config | Add isolated PostgreSQL/route proofs, shared-mail regressions and network-blocked mocked provider. Model below is retained only as executable specification. |
| Initiating external caller (none located in `client/src`) | Caller inventory is a cutover prerequisite, not assumed UI. Require retained batch IDs and pending-aware results in every caller before endpoint changes. No invented frontend added here. |
| This report and `reports/commerce-direct-senders.md` | Record approval/implementation status and evidence; do not mark family 1 converted until authorized implementation and rollout pass. |

No other file is implicitly approved. In particular: no checkout/payment writer,
commerce guard/flag, migration 346/347, legacy sender family, production data,
deployment or recurring timer modification.

## Isolated evidence

Command:

```sh
npx vitest run --config vitest.vendor-bulk-proposal.config.ts
```

Files:

- `server/services/__tests__/vendor-bulk-proposal.vitest.ts`: actual live
  service called with isolated contract/history fixtures and mocked transport;
  main registry runtime imported, not reimplemented.
- `server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts`:
  executable **specification** of atomic commit, ownership, provider-key
  retention and repair ordering. It contains no outbox SQL, SDK, scheduler or
  production import. Contract labels stand in for frozen recipient identities.
- Physical transport stub resolved by the dedicated Vitest config and a
  network guard: no real email module, DB connection or secrets reading on the
  corrected run. The test asserts the stub and blocked fetch boundary.

Actual-code cases establish partial retry duplication, accepted-then-log-failed
duplication, simultaneous duplicate batches, repeated contract-ID submission,
continue-after-missing-email behavior and registry non-deduplication.

Specification cases establish atomic aborted enqueue; stable replay and 409
conflict; independent recovery after partial rejection; timeout or lost stamp
with same payload/key; deadline hold; idempotent history repair; fenced stale
owners; both old/new completion orderings after provider acceptance and reclaim;
all **20** order-preserving interleavings of two same-batch
commit→claim→handoff sequences; and distinct intentional batches remaining
distinct. These prove the abstract ordering contract, **not PostgreSQL locking
or future route/worker integration**.

### Isolation incident — do not erase failed evidence

The first run had 13 passing cases and one timed-out concurrency case. In this
Vitest runtime, `vi.mock` alone did not intercept one concurrent dynamic import
of `email.service`: the live sender reported provider acceptance for one
synthetic QA-domain message. No delivery receipt was established. This run is
**not** zero-network evidence and does not authorize any rollout.

Corrected isolation uses a physical transport replacement at resolution time,
plus blocked fetch/Node transport/SDK fallback. The following run passed all
14 then-existing cases with no live sender output. The final run passed **17/17**
cases, including the explicit boundary and stale-completion cases, in 1.48 seconds.
No real
address, provider message ID, credentials or environment values are recorded
here. No flags were changed to run the fixtures.

## Approval and rollout gates

1. Founder approves this exact touch list, receipt schema, address grouping,
   response/caller contract and content/opt-out policy. Approval for this
   proposal task is **not** approval for those edits.
2. Implement on a separately approved branch. Disposable PostgreSQL schemas
   and synthetic QA recipients only; block provider network access. Prove real
   concurrent unique conflicts, transaction rollback, batch fingerprint checks,
   all-invalid receipts, changed/deleted recipients, grouped-address calendars,
   exact attachment bytes, immediate-vs-drain claims, drain-vs-drain reclaim,
   actual lease-token SQL fences, stamp failures/timeouts, both completion
   orders and history repair. Test actual admin retry against expired-window
   holds, pending/failed/dead/cancelled statuses and preserved first-attempt time.
   Prove legacy outbox/auth/booking notifications and registry parity unchanged.
3. Confirm provider retry retention/unknown acceptance reconciliation and
   caller inventory. External caller compatibility and consent classification
   are blockers, not permission to guess. Old direct sends have no durable
   identity: no synthetic historical success/dedupe backfill is possible.
4. Obtain **separate rollout approval** after evidence. Quiesce/fence direct
   bulk callers during the single-writer cutover; never run old and new senders
   in parallel. Do not replay old uncertain batches automatically. Migration
   registration and production application remain human-approved steps.
5. Controlled approved provider acceptance proof/reconciliation precedes broad
   enablement. Observe pending, held, dead and history repair outcomes. Pause
   new batch intake if unhealthy while retaining durable rows and safe retries.
   Never roll back to the direct loop to resend unresolved outbox obligations.

No sender/schema/payment/production-flag changes or activation are delivered by
this proposal. The current duplicate risks remain until separately approved
implementation and rollout.
