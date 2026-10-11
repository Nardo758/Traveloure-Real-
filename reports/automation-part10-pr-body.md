# Commerce automation Parts 1–10: development proof and final gates

**DRAFT — DEVELOPMENT REVIEW ONLY. NOT MERGE-READY OR RELEASE-CERTIFIED.**

This updates the existing implementation PR rather than creating a second one.
The implementation carries the corrected cart-email-state test and dependencies,
Parts 1–9 evidence, the 15-trigger archive and cutover record, removal/KEEP/UNKNOWN
inventory, residual-window measurements and direct-sender report.

## Final development evidence

- Typecheck: **117 existing diagnostics**, exactly the retained baseline set;
  zero new diagnostics. Baseline unchanged. Not a globally clean build.
- Guard batch: **78/78** after wiring the provider-idempotency test into the
  existing isolated CI command. Initial 77/78 retained; no orphan-baseline bump.
- Golden: **143/143 reported entries**, zero failures; not 143 unique DB tests.
- Cart Parts 2–5: **11/11 reported TAP entries in each of two fresh runs**.
- Send/verifier/replay/QA isolation: **9/9 in each of two corrected runs**.
- Provider-failure suite: **15/15 in each of two separately isolated runs**.
  These tests deliberately reproduce lost receipts/duplicate submissions;
  passing tests do not mean those safety failures were fixed.
- Actual sendEmail → mocked Resend SDK: **16/16**; vendor proposal: **17/17**.
- QA dry proof: **two clean randomized loops**, four synthetic submissions
  each, all owned schemas removed, **zero real sends**.
- Mutation-auth manifest/inventory and coverage regenerated; checks pass.
- Development catalog: **zero public commerce triggers**; archived DDL has 15.

All initial failures and corrected runs are retained in the evidence. A combined
suite initially counted eight unrelated handler-fixture alerts in a drain test.
The correction is schema isolation only: assertions/runtime behavior unchanged.

## Previously authorized actual delivered messages

`reports/automation-part9-verification.md` lists all ten provider-observed
delivered message IDs and schema-local outbox IDs. Part 10 sends nothing real.
The separately approved corrected item-copy receipts, outbox row 1 in each
distinct loop schema, are:

- `01a1278b-871e-7b42-b294-54dd88d0db2d` — delivered.
- `01a1278b-c906-7184-a932-d52ad5736d6b` — delivered.

These are monitored-development QA copies, not actual item-change dispatch or
literal `.test` mailbox delivery. No recipient address, inbox setting or key is
included. The six guarded reminder receipts use controlled fixture eligibility
times; they are **not real elapsed next-day proof**.

## Required review files

- `reports/automation-part10-final-report.md`: every rule classified Satisfied,
  Fixed, Deferred or Open; final command counts and scope.
- `reports/automation-part10-evidence/`: sanitized current logs, baseline
  comparison and original/corrected command records.
- `reports/commerce-development-triggers.sql`: full catalog-derived DDL for all
  15 approved development trigger instances and observed backing definitions;
  ARCHIVE ONLY, do not execute/register.
- `reports/commerce-part7-trigger-cutover.md`: removal archive/evidence.
- `reports/commerce-part7-removal-inventory.html` and
  `reports/commerce-part7-unknown-classification.md`: removed/kept/import/UNKNOWN
  lists. Historical 37-wrapper/helper identities remain accepted blockers;
  eight unused backing-function deletions remain deferred.
- `reports/automation-part6-verification.md`,
  `reports/automation-part8-verification.md`: measured payment/inventory
  residuals and rule matrices. Marketing payment residual 25.628 / 31.907 ms
  in retained two-loop synthetic evidence; no production latency claim.
- `reports/commerce-direct-senders.md`: ten families, unused confirmation
  helper and extra operational paths; vendor bulk first, no sender conversion.
- `server/__tests__/cart-email-state.db.test.ts`: corrected test carried in
  this actual implementation PR, not just the separate archive PR body.

## Explicit merge / release blockers

- Current-main read-only merge preview has a conflict in
  `server/services/cart-projection.service.ts`. No runtime reconciliation here.
- The held, unregistered heartbeat draft
  `360_job_heartbeats_nullable_success.sql` conflicts in numbering with main's
  registered occasion migration 360. Do not register, renumber or apply it in
  this PR without a separate founder schema decision. Main owns 346 and 347.
- UNKNOWN payment lifecycle/ownership rails remain. No payment-writer,
  checkout, booking or provenance implementation changes in Part 10.
- Must-have item-change ordering/inventory hold remains; actual dispatch held.
- Provider success followed by DB failure can lose acceptance evidence and
  produce duplicate submissions. Mock dedupe is not a real-provider guarantee.
- Marketing final-read/handoff residual is accepted only for marketing.
- Normal commerce sending blocked. No production release authorization.
- Real elapsed next-day proof and approved production commit/configuration,
  scheduler execution and actual delivery checks remain open/deferred.

**Part 4 is DEV-CLOSED on the readable-record subset, not genuinely complete.**

## Merge write-back / ledger

- [ ] Actual human merge authorized after integration/review gates.
- [ ] Append the decision ledger row **at actual merge**, including reviewed
      implementation reference. No merge or ledger write claimed now.
- [ ] CLAUDE.md delta or explicit no delta assessed at merge.
- [ ] Expire only deferred/expected-fail entries actually satisfied.
- [ ] Supersede volatile brief claims by annotation where actually warranted.
- [ ] Separate release authorization before any production action or check.

Guard approval, production, account and expert requests remain held.
