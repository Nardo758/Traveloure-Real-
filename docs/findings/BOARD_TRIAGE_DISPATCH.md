# Dispatch v2 — draft-board triage, Replit-side batches only

**Supersedes v1.** v1's build lanes **LANDED in PR #1034** (three Tier-1 contexts required,
`footer-links-smoke` registered Tier 2, mutation-auth coverage freshness wired, `/quick-start`
retired by redirect, CityGrid opening the one modal). v1's board batches did **not** land — they
were blocked because the evidence existed only as chat attachments. **That blocker is gone:** the
evidence is committed at `docs/findings/board-staleness-pass.tsv` and
`docs/findings/BOARD_STALENESS_PASS.md`.

**What changed in the evidence since v1.** G1 (money, 73), G9 (security, 45) and G13 (booking
integrity, 20) were promoted to tier A — every row in all three carries `file:line`. Repo-wide
tier A is **166/564**. The closure list therefore grew from **34 to 59**.

**This dispatch is Replit's half only.** 68 tier-A code items and 8 decisions are NOT here —
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

## Batch A — Close 59. No code, no branch, no PR.

Paste each row's `basis` column from `board-staleness-pass.tsv` into the close comment.

```
#153 #216 #217 #303 #320 #321 #351 #354 #378 #435 #484 #487 #528 #567 #579 #584 #585 #755 #776
#777 #789 #800 #844 #846 #871 #872 #873 #874 #875 #876 #877 #1178 #1182 #1190 #1269 #1271 #1316
#1317 #1327 #1344 #1388 #1391 #1397 #1398 #1399 #1461 #1468 #1471 #1472 #1474 #1475 #1546 #1557
#1558 #1562 #1581 #1582 #1724 #1764
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

## Batch D — Operator / production. Only 4, and only Replit can do them.

| # | Action |
|---|---|
| #143 | Set `STRIPE_CONNECT_WEBHOOK_SECRET` in the production environment. The code side is already wired — `webhooks.routes.ts:564` reads it, `:42` verifies with it, `validate-env.ts:77` requires it. Nothing to build. |
| #632 | Stamp migration 075 on production. It is already off disk and out of `migration-files.ts` (registry comment L116-121); only the prod ledger row is missing. |
| #1258 | Run `scripts/check-undeclared-tables.cjs` against the **production** database. The guard exists; it has never been run against prod from a checkout that cannot reach it. |
| #525 | Verify the migration chain on a fresh production-shaped DB. |

**§20 applies to all four.** The ONLY approvable publish prompt is an `ADD COLUMN IF NOT EXISTS`
matching a registered, unstamped migration. None of these four adds a column, so **any** SQL
prompt they raise is a decline-and-stop. Never accept "copy development database to production"
under any wording.

## Batch E — Cap the board.

Arrival ~35/wk against a drain of ~6.4/wk (353→564 over 7.4 weeks, 48 closed). Batches A and B
remove 93 in one pass; without a WIP cap and an expiry the board is back over 500 by December and
this dispatch gets written a third time.

---

## Not yours — so nobody works it twice

- **68 tier-A code items** are being done in the Claude Code checkout, where the `file:line`
  evidence was produced. Highest-value among them: #1563 (an unguarded `registerContent` await can
  abort trip creation — §15b), #1429 (Accept renders beside a status badge already reading
  accepted), #1347 (`total_revenue` only ever increments while `bookings_count` decrements),
  #350/#857 (optimizer PaymentIntent failures unhandled), #1255 (a §13 zero-fill on commissions),
  #1725 (no uniqueness on expert applications).
- **8 decisions** belong to the decision-maker in `docs/PUNCHLIST.md` §1, not to any agent:
  **#215 #411 #495 #861 #1348 #1666 #1679 #1686**. Two of those are urgent because the CODE
  CONTRADICTS THE BOARD: **#861** — `commission.ts:521` returns the *beta rate* when its setting is
  missing, so exiting beta by removing the setting silently reverts every provider; and **#1348** —
  `storage.ts:3535-3538` explicitly declines the guarantee the task asks for, in a comment.
- **Already fixed here, do not re-file:** the NUL-byte guard blind spot
  (`demand-rollup.compute.ts:161`, `vendor-contract-board.ts:138`) — one raw NUL per file made grep
  skip them entirely, blinding every shell guard including the fee-literal gate. No board task
  covered it.
