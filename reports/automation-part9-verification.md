# Part 9 — development QA delivery proof; NOT DEV-CLOSED

## Readiness

**NOT READY for the next Part Gate. NOT RELEASE-CERTIFIED.**

Eight explicitly authorized QA messages have provider-observed **delivered**
statuses. Six reminders traversed the guarded producer and dispatcher in
disposable development schemas. Two item-change copies were separate,
labelled template/provider proofs: the real item-change rows stayed pending.

Two open items prevent closing this part:

1. Fresh typecheck is **119**, above the Part 1 baseline **117**. The two extra
   diagnostics are in the pre-existing vendor-bulk proposal fixture, outside
   this part's approved touch list. No baseline increase or runtime fix was made.
2. Post-delivery review found that the two item-change QA copies equated an
   active listing with availability. That does not prove stock. The harness
   has been corrected to use the recorded slot's remaining capacity and cart
   quantity, or explicitly say availability cannot be verified. This corrected
   wording passed two new dry loops, **but has no real delivered receipt yet**.
   The initial eight-message authorization has been used; no additional emails
   were sent silently.

## Scope and isolation

- Process-only explicit `--isolated-db --deliver-qa` plus proof marker;
  absent opt-in is OFF. No scheduler, workflow or automation registry added.
- Published runtime rejected using `REPLIT_DEPLOYMENT`; require workspace
  `REPLIT_DEV_DOMAIN`, development process environment and an independently
  matching development database fingerprint.
- Native owner creates empty disposable schemas, with schema-local sequences
  and foreign keys. Owned fixtures only; neither public nor production data
  is modified. All proof schemas were removed.
- The existing native owner forwards only a private loopback channel binding
  to its credential-stripped child. Only the parent has provider credentials
  and performs approved QA inbox substitution.
- Ownership requires the schema-local account marker for this run, the
  `traveloure-qa.test` fixture domain, matching outbox identity and guarded
  processing status. Arbitrary recipients and unrelated accounts are rejected.
- Maximum four provider submissions per loop, eight per run. Families can
  submit once only. Stable scoped provider idempotency keys; uncertain
  acceptance blocks subsequent live proof attempts rather than being retried
  with a new key.
- The real transport run recorded **30 rejected requests**, with no additional
  provider submissions.
- Development inbox settings present; both inbox names absent from production.
  No inbox addresses, keys, email bodies or private channel tokens are included
  in these artifacts.
- The test eligibility clock is controlled at noon UTC; actual provider receipt
  observation times are real UTC. The recorded-rails-only override is confined
  to the owned test environment. This is not all-rail or production eligibility
  proof.

## Per-rule evidence

| Rule | Status | Clean loops | Evidence |
|---|---|---:|---|
| Explicit opt-in, published-runtime refusal, malformed permissions | PASS, synthetic negatives | 2 | isolation-loop-1.log; isolation-loop-2.log, 3/3 each, no skips |
| Wrong run, wrong schema, arbitrary recipient, unrelated account, replay and budget rejection | PASS | 2 | isolation logs and 30 live-channel rejections |
| Child contains no provider key or approved inbox settings | PASS | 2 real + 2 final dry | native proof logs |
| Guarded 1h reminder delivered | PASS on readable subset | 2 | receipt table below |
| Guarded 1d reminder delivered, valid-format synthetic prior-step history | PASS on readable subset | 2 | receipt table below |
| Guarded 3d reminder delivered, valid-format synthetic prior-step history | PASS on readable subset | 2 | receipt table below |
| Item-change dispatcher stays held, zero handoffs, no sent timestamp or metadata mutation by copy proof | PASS | 2 real + 2 final dry | native proof logs |
| Item-change template/provider delivery | Transport proven only | 2 | original copy receipts; corrected content is NOT delivery-proven |
| Corrected timestamp-qualified stock wording | Dry proof only; real proof BLOCKED | 2 dry, 0 real | final dry run below |
| Owned schemas removed and parent channel closed | PASS | 2 real + 2 final dry | owner cleanup logs and successful controller exits |
| Normal workspace proof markers absent after invocation | PASS | post-run check | both process marker presence checks false |
| Existing golden regression gate | PASS | 1 fresh full gate | 143 reported pass entries, 0 failing |
| Typecheck at baseline 117 | FAIL; 119 | 1 fresh check | typecheck.log; two inherited diagnostics below |
| Production activation / all-rail certification | BLOCKED deliberately | 0 | existing release blockers remain |

## Actual delivered receipts — original eight-message proof

Run: `0241649c-02ec-4d37-893c-0c8ada57999a`.
Outbox IDs are local to each loop's removed schema; they are not production IDs.

| Loop | Family | Outbox row | Provider message ID | Observed status | Proof level |
|---:|---|---:|---|---|---|
| 1 | cart_reminder_1h | 1 | 01a1276a-6e6b-76b2-97b2-b0e2075a2c3b | delivered | guarded readable subset |
| 1 | cart_reminder_1d | 3 | 01a1276a-7229-74be-84d9-274cd2894df6 | delivered | guarded readable subset |
| 1 | cart_reminder_3d | 6 | 01a1276a-75c5-7bb1-8f72-81d4849a2a20 | delivered | guarded readable subset |
| 1 | cart_item_changed | 7 | 01a1276a-79dd-784d-829c-3ddb65d0df06 | delivered | original QA copy only, NOT corrected stock wording |
| 2 | cart_reminder_1h | 1 | 01a1276a-c1a5-7884-8708-de6ab122b985 | delivered | guarded readable subset |
| 2 | cart_reminder_1d | 3 | 01a1276a-c62e-7eca-9ae8-0e78cf04cbd7 | delivered | guarded readable subset |
| 2 | cart_reminder_3d | 6 | 01a1276a-c9bb-7e5c-ab3b-a7cd0836a7bc | delivered | guarded readable subset |
| 2 | cart_item_changed | 7 | 01a1276a-cd18-7ae2-bcef-e5f76f6ffdd3 | delivered | original QA copy only, NOT corrected stock wording |

The controller retrieved each owned message through the provider API and
required `last_event=delivered`, with matching message ID. Provider acceptance
alone was insufficient. Observation timestamps, IDs and statuses are in
`automation-part9-evidence/proof-0241649c-02ec-4d37-893c-0c8ada57999a.json`.

## Final corrected-copy dry proof

`automation-part9-evidence/proof-5261a68c-ca25-4a63-9466-0acd7c804b62.json`:
two clean fresh loops, four synthetic submissions per loop, zero real messages,
both schemas removed. Corrected copy uses server/database check time in UTC,
not the add-time snapshot, and makes no stock claim from listing status alone.
The check qualifies recorded slot capacity only, not external supplier stock.
No application email template or sender was changed.

## Golden and typecheck

Fresh existing golden gate:
`automation-part9-evidence/golden-1-84dbe8af-dd60-420e-803e-c451c5c81b69/results.json`.
**143/143 reported pass entries**, not a claim of 143 unique database tests.

Fresh `tsc --noEmit`: exit 2, **119 errors**, zero diagnostics naming the new
Part 9 tests. Comparison to the retained Part 8 log, normalizing line numbers,
shows precisely two additions:

| Existing file | Location | Diagnostic |
|---|---|---|
| server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts | 41:54 | TS2802, Set iteration requires downlevelIteration or newer target |
| server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts | 46:29 | TS2802, Set iteration requires downlevelIteration or newer target |

Proposed separate approval: change only those two fixture Set iterations to
`Array.from(...)`; preserve fixture behavior, compiler settings and baseline.
Then rerun its tests, golden gate and typecheck. No such edit has been made.

## Carried-forward release blockers

The canonical historical matrix and blocker table remain
`automation-part8-verification.md` and `automation-release-blockers.md`.
In particular, none of these have been removed:

- Stripe activity before durable local persistence / unstamped lifecycle.
- Off-platform partner payment without a local update.
- Fee-ledger sources without proven traveler ownership.
- Actual webhook/success-page handler proof and provenance proposal gaps.
- Normal cart-reminder production sending remains blocked.
- The measured payment/inventory final-read-to-handoff residual is accepted
  for marketing reminders only; it was not fixed and does not apply to
  must-have item-change dispatch.
- Must-have item-change ordering/inventory hold remains.
- Deferred legacy removal identities and other accepted historical blockers
  retain their existing status.

## Failed preparation and exact changes

Before real delivery, a conservative preflight refused the workspace's
`REPLIT_ENVIRONMENT=production` value. Replit's documented published marker
is `REPLIT_DEPLOYMENT`; the guard now also requires the workspace-only domain
and the independent database fingerprint. No environment marker was overridden.

One subsequent dry attempt failed because its synthetic prior-step history
omitted `cartReminderVersion=1`. The fixture was corrected, the failed
sanitized artifact retained, and two clean dry loops completed before arming
real transport. Neither failure sent real email.

Approved implementation touch list:

- scripts/verification/run-commerce-qa-delivery-proof.mjs
- scripts/verification/run-messaging-gate.mjs
- server/routes/__tests__/commerce-real-delivery-proof.db.test.ts
- server/routes/__tests__/commerce-qa-proof-isolation.test.ts
- reports/automation-part9-verification.md
- reports/automation-part9-evidence/

No payment writer, booking/checkout behavior, public/production schema,
migration registration, runtime sender/template or feature flag was changed.
The workspace `.replit` settings change from the secure inbox form was not
edited or reverted by this implementation. Production was not touched.
