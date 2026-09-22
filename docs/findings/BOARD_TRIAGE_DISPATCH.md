# Dispatch v2 — draft-board triage, Replit-side batches only

**Supersedes v1.** v1's build lanes **LANDED in PR #1034** (three Tier-1 contexts required,
`footer-links-smoke` registered Tier 2, mutation-auth coverage freshness wired, `/quick-start`
retired by redirect, CityGrid opening the one modal). v1's board batches did **not** land — they
were blocked because the evidence existed only as chat attachments. **That blocker is gone:** the
evidence is committed at `docs/findings/board-staleness-pass.tsv` and
`docs/findings/BOARD_STALENESS_PASS.md`.

**What changed in the evidence since v1.** G1 (money, 73), G9 (security, 45) and G13 (booking
integrity, 20) were promoted to tier A — every row in all three carries `file:line`. Repo-wide
tier A is **166/564**. The closure list therefore grew from **34 to 59**, and **#1359 was added on 2026-09-22** when re-verification showed my BUILD verdict wrong — **60**.

**This dispatch is Replit's half only.** 68 tier-A code items and 6 decisions are NOT here —
they are listed at the end under "Not yours" so nobody works them twice.

**Constraints — unchanged from v1, they still bind:**
- **Never commit on `main`.** Batches A–C and E touch **no code**; only D does, and barely.
- **No bare `npm install`.** If one runs, the `postinstall` scrub must run and
  `grep -c replit.local package-lock.json` must read **0** before any commit.
- **`TSC_BASELINE`: read from `build.yml` on `main`, never restate.**
- **Publish-time SQL: decline by default (§20).** Batch D is the ONLY place a prompt is legitimate,
  and only under the one narrow exception spelled out there.
- Commit trailers and PR-body attribution on anything that does produce a commit.

---

## Batch A — Close 60. No code, no branch, no PR.

Paste each row's `basis` column from `board-staleness-pass.tsv` into the close comment.

```
#153 #216 #217 #303 #320 #321 #351 #354 #378 #435 #484 #487 #528 #567 #579 #584 #585 #755 #776
#777 #789 #800 #844 #846 #871 #872 #873 #874 #875 #876 #877 #1178 #1182 #1190 #1269 #1271 #1316
#1317 #1327 #1344 #1388 #1391 #1397 #1398 #1399 #1461 #1468 #1471 #1472 #1474 #1475 #1546 #1557
#1558 #1562 #1581 #1582 #1724 #1764 #1359
```

**Nine need a sentence, because the board is wrong rather than merely stale:**

| # | Say this |
|---|---|
| #216 | §18/MI-1 **removed** the stamped per-service rate deliberately. Writing a default re-opens the override that lane closed. |
| #217 | Already stripped twice: `shared/schema.ts:2918` `.omit()` + `storage.ts:2515`. Validation was never the shape — strip-and-derive is. |
| #303 | The number is fiction. `build.yml` holds the live `TSC_BASELINE`, ratcheting down-only. 174 never appears in its history. |
| #378 | A live key in dev **is** the defect. `runtime-health.service.ts:264` already asserts `sk_test_` in non-prod. |
| #872 #873 | `/quick-start` was retired in PR #1034 per LD 42 D14. |
| #1182 | **Already satisfied** — `stripe-connect-reminder.service.ts:119` reads `not in ('complete','active')`. Reminders already stop for `active`. |
| #1344 | Already idempotent — `storage.ts:3539-3546` decrements only on the FIRST transition to cancelled/refunded. |
| #1581 | **Overstated.** Not a double-pay: an atomic conditional (`booking.service.ts:856`, zero-row abort `:870`) plus a unique index (`shared/schema.ts:7010`, migration 203) both hold. Re-file the leftover as a one-line symmetry fix — that INSERT lacks the `ON CONFLICT DO NOTHING` its sibling has at `:917`. |
| #354 | Fixed — and `trip-selection.ts:28` says the regression was **re-found as #972, which is not on this board**. Add #972 when you close this. |
| #1359 | **ADDED 2026-09-22 — my earlier BUILD verdict was wrong, this is CLOSE-DONE.** The "Editing a live listing" panel exists (`ServiceForm.tsx:2285-2330`), renders only for an approved listing, and reads both lanes from `@shared/edit-split` — the module the PATCH handler itself imports, so §23's constraint (READ the server's list, never restate it) holds by construction. Close it; the safety net it was missing landed alongside this correction. |

## Batch B — Verify then close: 34. No code.

```
#229 #286 #301 #322 #352 #367 #485 #486 #490 #580 #703 #712 #715 #743 #750 #804 #807 #808 #827
#843 #1176 #1243 #1248 #1259 #1280 #1298 #1299 #1395 #1401 #1402 #1580 #1583 #1670 #1671
```
Each has the feature area present and, where the tier is B, test/CI coverage too. Open the area
named in `basis`, confirm, close. **Promote to a lane brief only where the gap is real.**

## Batch C — Re-file, do not work. No code.

- **112 verification tasks** (titles beginning Confirm/Verify/Catch/Detect) move to the CI-gates
  program under `.github/CI_GATES.md`. They are coverage, not product work.
- **114 governed tasks** (60 money §8/§14/§18/§19, 44 security, 10 schema/publish-trap) get a
  "lane brief required" flag and are blocked from direct execution. A one-line ticket on one of
  these is how the `revenueShareRate` hole got written.

## Batch D — Operator / production. Nine, and only Replit can do them.

| # | Action |
|---|---|
| #143 | Set `STRIPE_CONNECT_WEBHOOK_SECRET` in the production environment. The code side is already wired — `webhooks.routes.ts:564` reads it, `:42` verifies with it, `validate-env.ts:77` requires it. Nothing to build. |
| #632 | Stamp migration 075 on production. It is already off disk and out of `migration-files.ts` (registry comment L116-121); only the prod ledger row is missing. |
| #1258 | Run `scripts/check-undeclared-tables.cjs` against the **production** database. The guard exists; it has never been run against prod from a checkout that cannot reach it. |
| #525 | Verify the migration chain on a fresh production-shaped DB. |
| #1725 | **Read-only, and it UNBLOCKS a checkout lane.** Run `SELECT user_id, count(*) FROM local_expert_forms GROUP BY 1 HAVING count(*) > 1;` against production and report the rows. The fix is a UNIQUE index, but a violated UNIQUE fails the publish and offers the destructive copy-dev-over-prod option, so the duplicates must be known before the migration is written. Report the count — do not delete anything. |
| §7 | **Read-only, and it SIZES a live defect.** `provider_services.form_status` is filtered `= 'approved'` by three queries in `recommendation.service.ts` while NOTHING in the repository writes the column. Report `SELECT form_status, approval_status, count(*) FROM provider_services GROUP BY 1, 2 ORDER BY 3 DESC;` from production. It decides whether the blast radius is every listing or only those created since some historical backfill — the brief (`docs/briefs/FORM_STATUS_FILTERS_EXCLUDE_EVERY_REAL_LISTING.md`) deliberately claims no row count without it. |
| **PAT** | **HIGHEST-VALUE OPERATOR STEP ON THIS LIST, and it unblocks three board tasks.** `enforce-branch-protection.yml` has **403'd on every run since at least 2026-08-30** — including run 853, right after #1034 merged — because `BRANCH_PROTECTION_PAT` is absent and the `GITHUB_TOKEN` fallback cannot update branch protection. **So `.github/branch-protection.json` is a declaration that no automation applies.** Create a repo-scoped PAT with the `administration` scope, store it as the repo secret `BRANCH_PROTECTION_PAT`, re-run the workflow via `workflow_dispatch`, and confirm it goes green — that will be the first time the applied and declared sets are reconciled by machine rather than assumed equal. It unblocks #713/#786/#787, whose green baselines are already measured. Brief: `docs/briefs/BRANCH_PROTECTION_ENFORCER_IS_DEAD.md`. **This writes no SQL and touches no database.** |
| #298 | **Read-only, and it unblocks a schema lane.** `destination_events` has no unique index and four writers with three different dedupe identities. Before one can be written, report BOTH from production: `SELECT source_type, source_id, count(*) FROM destination_events WHERE source_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;` and `SELECT country, city, title, specific_date, count(*) FROM destination_events WHERE source_id IS NULL GROUP BY 1,2,3,4 HAVING count(*) > 1;` Duplicates are likely rather than hypothetical, since three of the four writers dedupe loosely or not at all, and the counts decide whether this needs a dedupe migration before the index. Brief: `docs/briefs/DESTINATION_EVENTS_IDENTITY.md`. **Report the rows — delete nothing.** |
| R-7 | **Read-only.** `provider_services.service_type` carries a second, category-shaped vocabulary beside the declared six. Report `SELECT service_type, count(*) FROM provider_services GROUP BY 1 ORDER BY 2 DESC;` from production so the real value set is known before anything is declared or constrained. Punchlist row, not a board id. |

**§20 applies to all nine.** The ONLY approvable publish prompt is an `ADD COLUMN IF NOT EXISTS`
matching a registered, unstamped migration. None of these nine adds a column — four are
`SELECT`s and one is a repository secret, all writing nothing to any database — so **any** SQL prompt they raise is a decline-and-stop. Never accept "copy development database to production"
under any wording.

## Batch E — Cap the board.

Arrival ~35/wk against a drain of ~6.4/wk (353→564 over 7.4 weeks, 48 closed). Batches A and B
remove 93 in one pass; without a WIP cap and an expiry the board is back over 500 by December and
this dispatch gets written a third time.

---

## Not yours — so nobody works it twice

- **68 tier-A code items** are being done in the Claude Code checkout, where the `file:line`
  evidence was produced. **Two have LANDED (PR #1035, merged `f0184c0`) — do not re-file them:**
  #1563 (an unguarded `registerContent` await could abort a trip that had already been created —
  now guarded per §15b) and #1347 (`total_revenue` only ever incremented; all three admin readers
  now aggregate realized money over `service_bookings`). **Still open here:** #350/#857 (optimizer
  PaymentIntent failures unhandled — briefed, awaiting one ruling), #1255 (a §13 zero-fill on
  commissions — briefed, awaiting one ruling), #302 (78 ZodError sites, seven response shapes),
  #1725 (no uniqueness on expert applications — **blocked on Batch D's duplicate query above**).
- **6 decisions** belong to the decision-maker in `docs/PUNCHLIST.md` §1, not to any agent:
  **#215 #411 #495 #1666 #1679 #1686**. **#861 and #1348 were RULED under delegation on 2026-09-22**
  (ledger `2026-09-22-early-adopter-gate-exit`, `2026-09-22-denorm-counters-are-display-only`) and
  have left this list — the early-adopter gate KEEPS its fallback direction (returning the cheaper
  band on an unknown is the safe failure for a fee; the real hole is that beta can be exited by
  *deleting* the setting), and the denorm counters are display/ordering values, so making one
  transactional is DECLINED. **#1679 is now sized** and is two questions, not one: coverage reads
  291/589, and the 298 remaining split into **88** in risk-bearing categories (admin 5, payments 17,
  user-data 66) and **210** `other` routes where "no authorization" is likely the correct answer
  rather than a gap.
- **One NEW live defect, briefed not fixed — `docs/briefs/FORM_STATUS_FILTERS_EXCLUDE_EVERY_REAL_LISTING.md`.**
  `provider_services.form_status` is filtered `= 'approved'` by three queries in
  `recommendation.service.ts` (`:716`, `:1066`, `:1402`) while **nothing in the repository writes
  the column** — so they match seeded rows and exclude every real listing, including on the live
  unauthenticated `GET /api/recommendations/user`. Batch D's §7 query sizes it. No board task covers it.
- **Already fixed here, do not re-file:** the NUL-byte guard blind spot
  (`demand-rollup.compute.ts:161`, `vendor-contract-board.ts:138`) — one raw NUL per file made grep
  skip them entirely, blinding every shell guard including the fee-literal gate. No board task
  covered it.
