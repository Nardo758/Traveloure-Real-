# Dispatch — draft-board triage application (TRIAGE + 3 SMALL BUILD LANES)

**Source:** staleness pass over all 564 board tasks, run 2026-09-22 against `65076ea`
(`STALENESS_PASS.md` + `staleness-pass.tsv`, one row per task with verdict, routing class,
evidence tier and basis).
**Standing rule this dispatch serves:** `docs/ROADMAP.md` §A — *"Two registers guarantee one gets
answered and the other quietly does not."* The governed register is `docs/PUNCHLIST.md` §1. This
board is a second one. The job is to drain it into the governed register, **not** to work it.

**Constraints — verbatim, they bind every batch below:**
- **Never commit on `main`.** `git checkout -B task-<slug> origin/main`. One PR at a time, serial
  (`docs/OPERATING_PROCEDURE.md` §4). Batches 0 and 1 touch **no code at all**.
- **Do not run bare `npm install`.** If any install runs, the `postinstall` scrub must run and
  `grep -c replit.local package-lock.json` must read **0** before you commit (CLAUDE.md, Lockfile
  purity — 55 polluted URLs reached CI this way on merge `3f5b40f`).
- **`TSC_BASELINE`: read it from `build.yml` on `main`. Never restate it here or anywhere.** It
  only moves DOWN and the gate fails UNDER as well as over.
- **Publish-time SQL: decline by default (§20).** The only approvable prompt is an
  `ADD COLUMN IF NOT EXISTS` matching a registered, unstamped migration. No batch here adds a
  column, so **every** SQL prompt during this work is a DECLINE-and-STOP.
- Commit trailers on every commit; PR body ends with the attribution line and session URL. One
  `docs/DECISIONS.md` row per lane, keyed `YYYY-MM-DD-<kebab-slug>`.
- **Do not open 350 tickets' worth of work.** Nothing outside batches 0–3 is authorized.

---

## Batch 0 — Board hygiene. No code, no branch, no PR. (34 closures + 226 re-files)

**0a. Close these 34 with the basis string from the TSV pasted into the close comment.**
They are built, superseded, duplicated, or aimed at a surface a Locked Decision retires:

`#216 #217 #303 #321 #378 #435 #484 #487 #528 #567 #579 #755 #776 #777 #789 #800 #844 #846
#871 #872 #873 #874 #875 #876 #877 #1190 #1388 #1397 #1398 #1557 #1558 #1562 #1582 #1764`

Five deserve a sentence in the close comment because the board is wrong, not merely stale:

| # | Say this |
|---|---|
| #216 | §18/MI-1 **removed** the stamped per-service rate on purpose. Writing a default re-opens the override that lane closed. |
| #217 | Already stripped in two layers: `shared/schema.ts:2918` `.omit()` + `storage.ts:2515`. Validation was never the right shape — strip-and-derive is. |
| #303 | The number is fiction. `build.yml` holds the live `TSC_BASELINE` and ratchets down-only (199→129). A one-shot "clear the baseline" task replaces a working mechanism. |
| #378 | A live key in dev **is** the defect. `runtime-health.service.ts:264` already asserts `sk_test_` in non-prod. Reopen as "use a test key" or not at all. |
| #872 #873 | LD 42 **D14 retires `/quick-start`.** Batch 2c retires it (redirect + the CityGrid door). Investing in this flow is work against a ruling. |

**Separately — NEEDS-RUNTIME, not in the 34 above:** #525, #632, #1258 need the production DB and cannot be settled from a checkout. #632's migration 075 is
already off disk and out of `migration-files.ts` (registry comment L116–121); what remains is an
operator stamp. #493 does **not** close — it is real (see 0d).

**0b. Merge the duplicate.** #1557 and #1558 carry byte-identical titles. Close one.

**0c. Re-file, do not work: 112 verification tasks.** Every title beginning
Confirm/Verify/Catch/Detect/Test is coverage work, not product work — 20% of the board, and 18 of
Group 1's 73 alone. They belong to the CI-gates program under `.github/CI_GATES.md`, not to a
product queue. Move them; do not schedule them as features.

**0d. Mark 114 tasks "lane brief required" and block them from direct execution.**
60 money (§8/§14/§18/§19), 44 security, 10 schema/publish-trap. Each needs a brief per
`OPERATING_PROCEDURE.md` §3 before any code. Handing one of these to an agent as a one-line
ticket is exactly how the `revenueShareRate` hole got written. #493 (per-booking insurance
amount) and #298 (destination-events uniqueness) are in this set and are genuinely open —
#298 additionally must clear `scripts/preflight-prod-unique-indexes.cjs` **and** be declared in
`shared/schema.ts`, or the deploy push drops the index on the second publish.

**0e. Cap the board.** Arrival ~35/wk against a drain of ~6.4/wk (measured 353→564 over 7.4
weeks, only 48 closed). Set a WIP cap and an expiry; without one the board is ~1,100 items by
January and this dispatch gets re-run on a bigger pile.

---

## Batch 1 — Verify-then-close. No code. (73 tasks, one owner pass)

The probe found the feature area present **and** covered by a file under
`__tests__`/`e2e`/`.github` for these 73 (listed in `STALENESS_PASS.md` §"Verify then close").
Highest yield on the board: one pass should close most of them. For each, open the named area,
confirm, close with the pointer. **Promote to a lane brief only if the gap is real.**

A further 32 (§"Verify") have the area built with **no** test coverage found — those close only
if you also record what covers them, or they become coverage tasks under 0c.

---

## Batch 2 — Three build lanes. Serial, one PR each, in this order.

### 2a — Require the gates that already exist (closes #713 #786 #787 #790)

`.github/branch-protection.json` carries **10** contexts. `CI_GATES.md` Tier 1 declares **13**.
`enforce-branch-protection.yml` verifies applied-vs-declaration — but nothing verifies the
declaration against the tier table, so it drifted. These three are Tier 1 and not required:

- `ci-db-setup-lint (no inline migration steps)`
- `earn-page-smoke (Playwright DOM gate)`
- `verify-service-offering-types (HTTP count gate)`

Add them. Then, per Tier 2's own rule ("add once a green baseline exists"), promote on a
**confirmed green run** only: `verify-neighborhoods (logic gate, no DB)` (#787),
`e2e-selection-controls (DOM gate)`, `lockfile-purity (no replit.local)` — and read the
lockfile-purity note first: the job name exists in two workflows and GitHub tracks contexts
per workflow/job, so requiring it once covers one workflow.

**#713 is not a config edit yet.** `footer-links-smoke (Playwright DOM gate)` appears in **no**
tier table — the gate is unregistered. Register it in `CI_GATES.md` with a tier first (the
"Convention for future gates" three-step: tier table → exact context string in
`branch-protection.json` → required-check comment block in the workflow YAML). Choosing its tier
is a judgement call; if it is Tier 3 by nature, #713 closes as a conflict with the registry.

**Do not** add a context whose string is not the job's `name:` verbatim, and do not require a
gate that has never gone green — a red required context blocks every open PR in the repo.

### 2b — Make the security coverage number real (unblocks #1677 #1678 #1679)

`generated/security/mutation-auth-coverage.md` reads **0/588 tested** with a stale evidence hash
(2026-08-26). The six live probe suites **do** run and pass in `suite-mutation-auth.yml` — so the
report is misleading, not the coverage absent. Cause: `check:mutation-auth-coverage` exists in
`package.json` and is wired into **no workflow**.

Regenerate the artifact, then wire `check:mutation-auth-coverage` into CI beside the existing
`check:mutation-auth` step so it cannot rot again. **Then** size #1677/#1678/#1679 — they are one
program over 588 endpoints, not three tickets. Do not "fix" the 0/588 by editing the report.

### 2c — Execute LD 42 D14: retire `/quick-start` (closes #872 #873)

D14 is **wave 1** — no schema, no new decision. It has been open since 2026-09-05 while the board
accumulated two tasks asking to invest in the retired surface.

- `client/src/App.tsx:604` routes `/quick-start` to a 1,124-line `ProtectedRoute` page.
  **Follow the in-file precedent — `Redirect`, do not delete the route:** `/checkout` →
  `<Redirect to="/cart" />` at `:1230`, and the `/payment` comment at `:608` states why
  ("the app-routes CI gate visits every registered route" — a removed route that something still
  links to fails the gate instead of resolving).
- `client/src/components/travelpulse/CityGrid.tsx:127` navigates to
  `/quick-start?destination=…&country=…`. That is D14's other half: **"Plan now" opens the one
  modal with `{city, country}` pre-filled** via `usePlanning().open(source)`. The grid holds both
  fields, so under **D13 it must pass both** — and `scripts/check-planning-entry.cjs` grows the
  per-surface required-field entry with `--self-test` fixtures run before the guard.
- Run `app-routes-gate`, `navbar-links-gate` (both `navbar-links-smoke` and
  `hardcoded-links-check`) and `check-planning-entry.cjs --self-test` locally before pushing.
- Ledger row + a CLAUDE.md delta recording D14 as executed (ruling executed ⇒ delta, §3).

---

## Batch 3 — Route to `PUNCHLIST.md` §1 as D-rows. Do not build. (4)

| # | Why it is a decision |
|---|---|
| #495 | Per-market insurance **rate** — a fee decision; §8 forbids the literal either way. |
| #1666 | Self-describing: "define repeat-booking attribution **before** applying any fee benefit". |
| #1686 | "Restore provider fee bands **before** provider checkout is enabled" — a money/sequencing gate. |
| #1679 | A program, not a task. Size it after 2b. |

---

## What this dispatch deliberately does NOT do

- **It does not work the 350 `BUILD` rows.** 383 of 564 are tier-C (routed by rule, staleness not
  individually probed). Treating a tier-C row as verified-open is the same error the board already
  makes. Promote a group to tier A before scheduling it — G1 (money) and G9 (security) first,
  since that is where tier-C rows carry the most risk.
- **It does not touch any §14/§15/§17/§18/§19 rail.** No amount, actor, rate, idempotency key or
  atomic claim changes in batches 0–3.
- **It does not close #1359.** Real, and CLAUDE.md LD 23 already tracks it as defect S-1 — but the
  board's one-liner drops the binding constraint: the provider-facing panel must **READ the
  server's own field-split list**, never restate it client-side. Needs a brief, not a ticket.
- **It adds nothing to the board.** Four open debts CLAUDE.md names by hand are absent from all
  564 and stay out of scope here: LD 40 lane-2's remaining id-addressed rails (`?clientId=`,
  `/expert/clients/:clientUserId`, `ConversationSummary.otherUserId`), availability revalidation
  on a re-date (LD 30, "not built"), LD 48's missing parent-cancel notification and uncalled
  `revertPurchasedItemsForBooking`, and D10's unruled `boys-trip` vocabulary. They belong in
  `PUNCHLIST.md` §1, added by a human who owns them.
