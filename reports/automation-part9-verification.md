# Part 9 — development QA delivery proof; DEV-CLOSED

## Readiness

**DEV-CLOSED on the approved isolated QA/readable-record scope.
READY FOR PART 10 when the founder supplies it. NOT RELEASE-CERTIFIED.**

Ten explicitly authorized QA messages have provider-observed **delivered**
statuses. Six reminders traversed the guarded producer and dispatcher in
disposable development schemas. Four item-change copies were separate,
labelled template/provider proofs: the real item-change rows stayed pending.
The original two copies were not corrected-stock wording proofs. The two
additional, separately approved copies prove the corrected wording and
transport only. No reminders were resent.

The two previously open Part 9 proof gaps are now closed:

1. The founder separately approved replacing exactly two Set iterations in
   the vendor-bulk test fixture with `Array.from`. Its 17 tests pass.
   Fresh typecheck is **117**, matching the Part 1 baseline and the retained
   Part 8 diagnostic set. No compiler setting or baseline was changed.
2. Post-delivery review found that the two item-change QA copies equated an
   active listing with availability. That does not prove stock. The harness
   has been corrected to use the recorded slot's remaining capacity and cart
   quantity, or explicitly say availability cannot be verified. It replaces
   rather than appends the unqualified template claim in QA copies. After
   separate approval, two fresh dry loops and two fresh real loops passed:
   price change with unknown stock, then recorded availability loss.
   Both additional copies have provider-observed delivered receipts.
   This does not change any application template or clear the dispatcher hold.

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
- Normal proof mode permits four submissions per loop, eight per run.
  Separately approved `--item-copy-only` permits only the item-change family,
  one submission per loop, two per run. It refuses every reminder family.
  Families can
  submit once only. Stable scoped provider idempotency keys; uncertain
  acceptance blocks subsequent live proof attempts rather than being retried
  with a new key.
- The real transport run recorded **30 rejected requests**, with no additional
  provider submissions. The corrected copy-only run recorded **12 rejected
  requests** and exactly two submissions.
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
| Explicit opt-in, published-runtime refusal, malformed permissions | PASS, synthetic negatives | 2 fresh | copy-isolation-loop-1.log; copy-isolation-loop-2.log, 4/4 each, no skips |
| Wrong run, wrong schema, arbitrary recipient, unrelated account, replay and budget rejection | PASS | 2 fresh | copy isolation logs and 12 corrected live-channel rejections |
| Child contains no provider key or approved inbox settings | PASS | 2 corrected real + 2 corrected dry | native proof logs |
| Guarded 1h reminder delivered | PASS on readable subset | 2 | receipt table below |
| Guarded 1d reminder delivered, valid-format synthetic prior-step history | PASS on readable subset | 2 | receipt table below |
| Guarded 3d reminder delivered, valid-format synthetic prior-step history | PASS on readable subset | 2 | receipt table below |
| Item-change dispatcher stays held, zero handoffs, no sent timestamp or metadata mutation by copy proof | PASS | 2 corrected real + 2 corrected dry | native proof logs |
| Item-change template/provider delivery | PASS, QA transport only | 2 corrected real | corrected copy receipts below; no actual item dispatch |
| Corrected timestamp-qualified stock wording | PASS, isolated QA scope | 2 corrected dry + 2 corrected real | one unknown-stock price scenario and one loss scenario per two-loop run; both stock branches also tested in each isolation run |
| Copy-only budget, reminder-family refusal, replay refusal | PASS | 2 dry + 2 real; 2 isolation | exactly one item copy per loop, no reminder resends |
| Null/invalid capacity never becomes a stock claim | PASS | 2 isolation | qualified-copy test covers known capacity, loss and malformed/unknown facts |
| Owned schemas removed and parent channel closed | PASS | 2 corrected real + 2 corrected dry | owner cleanup logs and successful controller exits |
| Normal workspace proof markers absent after invocation | PASS | post-run check | both process marker presence checks false |
| Existing golden regression gate | PASS | 1 fresh full gate | 143 reported pass entries, 0 failing |
| Vendor-bulk fixture behavior unchanged | PASS | 1 targeted run, 17/17 | vendor-bulk-fixture-regression.log |
| Typecheck at baseline 117 | PASS; 117 | 1 fresh check | typecheck-corrected.log; identical diagnostic set to retained Part 8 baseline |
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

Final copy-only dry proof:
`automation-part9-evidence/proof-b64938ea-ca24-46c0-979c-7bfcabcb9b92.json`:
two clean fresh loops, one synthetic submission per loop, zero real messages,
both schemas removed. Earlier four-family corrected dry evidence is retained
as `proof-5261a68c-ca25-4a63-9466-0acd7c804b62.json`.
Corrected copy uses server/database check time in UTC,
not the add-time snapshot, and makes no stock claim from listing status alone.
The check qualifies recorded slot capacity only, not external supplier stock.
No application email template or sender was changed.

## Additional corrected-copy delivered proof

Run: `16a453a0-059a-4160-ae0e-59489ac20d68`.
Exactly two additional real messages; zero reminder resends.
Each loop uses a new randomized account, cart, service and sequence in a new
owned development schema. Each schema was removed. Outbox IDs are schema-local.

| Loop | Scenario | Outbox row | Provider message ID | Observed status |
|---:|---|---:|---|---|
| 1 | Price change; availability cannot be verified | 1 | 01a1278b-871e-7b42-b294-54dd88d0db2d | delivered |
| 2 | Recorded slot lacks capacity for cart quantity | 1 | 01a1278b-c906-7184-a932-d52ad5736d6b | delivered |

These are two clean common-path copy/transport loops with different scenarios,
not a claim that each variant has two real deliveries. Both wording branches
were exercised in each of the two synthetic isolation runs.
The provider GET matched each ID and `last_event=delivered`; acceptance alone
was not enough. The journal records server check time, provider delivery
observation time, sanitized availability description, IDs and counts.
Actual item-change rows remained `pending`,
`last_error=must_have_payment_ordering_unknown`, `sent_at=null`, with zero
dispatcher provider calls and no metadata mutation from the copy transport.

## Golden and typecheck

Fresh existing golden gate:
`automation-part9-evidence/golden-1-10fba7ea-f5dd-4cf0-9113-2476f2b79a10/results.json`.
**143/143 reported pass entries**, not a claim of 143 unique database tests.

Fresh `tsc --noEmit`: exit 2, **117 existing errors**, zero new diagnostics.
Comparison to retained Part 8 diagnostics, normalizing line numbers, shows
zero additions and zero removals. This is baseline parity, not a clean compiler.

The earlier failed 119-error run remains in `typecheck.log` for audit:

| Corrected test-only file | Original location | Prior diagnostic |
|---|---|---|
| server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts | 41:54 | TS2802, Set iteration requires downlevelIteration or newer target |
| server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts | 46:29 | TS2802, Set iteration requires downlevelIteration or newer target |

The separately approved correction changes only those two Set iterations to
`Array.from(...)`, preserving behavior and dedupe semantics. Its targeted
suite passes **17/17**. Compiler settings and the baseline are unchanged.

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

Separately approved test-only addition:

- server/services/__tests__/fixtures/vendor-bulk-proposal-model.ts
  (the two Set iteration expressions only)

No payment writer, booking/checkout behavior, public/production schema,
migration registration, runtime sender/template or feature flag was changed.
The workspace `.replit` settings change from the secure inbox form was not
edited or reverted by this implementation. Production was not touched.
Part 10 was not started.
