# Lane report — the test-reachability inventory RATCHETS (D-44)

**Ledger row** `2026-09-15-orphan-ratchet`
**Punchlist** **D-44** — ANSWERED (ratchet on new orphans; the `e2e/` limit stays STATED)
**Branch** `task-orphan-ratchet`, worktree `/home/user/wt-ratchet`, off `origin/main` @ `42e5213ef`
**Files touched** `scripts/check-test-files-wired.cjs`, `scripts/test-orphan-baseline.txt` (new),
`.github/workflows/build.yml` (the `test-file-reachability` job only), `.github/branch-protection.json`,
`.github/CI_GATES.md`, `docs/DECISIONS.md`, `docs/PUNCHLIST.md`, this report.
**Not touched** CLAUDE.md (a proposed §18d sentence is at the end of this report), any `server/`,
`client/`, `shared/`, `playwright/` or `e2e/` file, any schema, migration, route or test.

---

## 1 · The ruling

Decision-maker, 2026-09-15, two clauses:

1. **`e2e/` stays outside `TEST_ROOTS`.** The limit is already stated in the script's
   `CANNOT DETECT` block and in the Guard registry; nothing about it changes except that the
   ruling and its date are now recorded beside it. Widening the roots would move both the
   numerator and the denominator and would change what the inventory MEASURES — that is a
   separate decision and this lane does not take it.
2. **THE INVENTORY RATCHETS.** The current orphan set is recorded once, as debt; from now on a
   NEW orphan fails CI, and the recorded list may only SHRINK.

The rule the ratchet enforces is not new — it is `2026-09-14-test-files-wired-orphans`'s:
**a suite leaves the orphan list by being RUN, or by being GONE — never by being named an
exception.** What is new is that the list of suites currently owing that is written down, so
"a suite nobody has ever run" and "a suite somebody just added and did not wire" are
distinguishable facts instead of two identical lines in an advisory printout.

## 2 · Why an advisory inventory needed this

`2026-09-15-test-guard-prose-echo` established the shape of the failure it was repairing:
**an advisory guard is where a defect survives longest, because nothing ever goes red.** The
poisoned predicate reported 477/507 reachable for eight days across two ledger rows. It was
repaired, and the repaired guard still exited 0 on every run — so the 233 suites it now names
correctly could grow to 253 without a single red check.

The ratchet does not repay that debt. It stops it accruing silently.

## 3 · The mechanism

### 3.1 The baseline is RECORDED DEBT, not an allowlist

`scripts/test-orphan-baseline.txt` — one repo-relative path per line, sorted, `#` comments and
blank lines ignored by the reader. Its header says, in the file itself, that a listed suite is
**still owed repair-or-delete**, that the file **may only shrink**, and that the guard fails on
either direction of drift. The distinction matters because the previous two lanes both refused
an allowlist by name; this file must not become one by accident, and the only structural defence
against that is that it can never grow.

Recorded from `origin/main` @ `42e5213ef`, where the inventory reads:

```
test-files-wired: 278/511 reachable; 233 orphan(s)
```

**233 rows** — 203 under `server/`, 30 under `playwright/`. (The `2026-09-15-test-guard-prose-echo`
lane measured 274/507 and 233 on an earlier sha; four suites have been added and wired since, so
the reachable count and the denominator both moved and the orphan count did not.)

### 3.2 The guard's default run

Unchanged: collect test files under `TEST_ROOTS`, trace workflow `run:` commands, print
`test-files-wired: R/T reachable; N orphan(s)` and one `ORPHAN <path>` line per orphan. The full
inventory is still published on every run — the ratchet is a comparison laid over it, not a
replacement for it.

Then, new:

| Condition | Output | Exit |
|---|---|---|
| an orphan NOT in the baseline | `NEW ORPHAN (unreachable test file not in the baseline) <path>` | **1** |
| a baseline path now REACHABLE | `STALE BASELINE ENTRY (remove it from scripts/test-orphan-baseline.txt in this PR) <path> — now REACHABLE from a workflow command` | **1** |
| a baseline path that no longer exists | `STALE BASELINE ENTRY (…) <path> — no longer EXISTS in the test inventory` | **1** |
| the baseline file is missing | `MISSING BASELINE: …` | **1** |
| otherwise | `test-orphan-ratchet: OK — baseline: 233 recorded orphan(s) (debt, not exempt)` | 0 |

**Both directions fail, and the second one is the half that keeps the list true.** A baseline
that could carry a line for a suite somebody wired last week, or for a file somebody deleted, is
a debt list that quietly rots into fiction — the same shape of untruth the prose-echo lane was
repairing one layer down. So the line must go in the same PR that wired or removed the suite.

Removing a line for a suite that is **still** an orphan does not pass either: it comes straight
back as a NEW ORPHAN. The file cannot be edited into agreement with anything but the tree.

### 3.3 The comparison is pure

`ratchet({ tests, reachable, orphans, baseline })` imports nothing, touches no file system and
never exits — it returns `{ newOrphans, stale }` and the caller decides. That is what makes the
five new fixtures provable with no repository state at all.

## 4 · Fixtures (§18d — a predicate change ships with fixtures)

`node scripts/check-test-files-wired.cjs --self-test` — **12 fixtures, 7 reachability + 5
ratchet**. The seven reachability fixtures from `2026-09-15-test-guard-prose-echo` are untouched
and green.

| # | Fixture | Proves |
|---|---|---|
| R1–R7 | (unchanged) direct file + directory reachability; prose `echo`; real invocation + trailing prose echo; annotation and comment lines; heredoc body; non-existent directory prefix; redirect target | the reachability predicate still reads only real invocations |
| T1 | `ratchet — unchanged inventory passes` | the steady state is green |
| T2 | `ratchet — a NEW orphan fails` | an unreachable file the baseline does not carry is reported and fails |
| T3 | `ratchet — a baseline entry that became REACHABLE fails` | a wired suite's line must go |
| T4 | `ratchet — a baseline entry whose file is GONE fails` | a deleted suite's line must go |
| T5 | `ratchet — a correctly shrunk baseline passes` | the ratchet never blocks a shrink — wire-and-remove in one change is green |

## 5 · CI

`.github/workflows/build.yml`, the `test-file-reachability` job only:

- the display name drops "(advisory inventory)" and becomes
  **`test-file-reachability (ratchet - new orphans fail)`**;
- the `--self-test` step still runs **before** the scan (§18d: a wrong predicate is invisible by
  construction, so the fixtures gate the scan and not the reverse);
- the second step is renamed to say what it now does;
- the job carries the standard `# Status context (for branch-protection required checks):`
  comment block the CI_GATES convention requires.

**The status context uses an ASCII hyphen, deliberately.** A required context that does not match
the job's `name:` byte for byte is a context that never reports, and every PR then sits `blocked`
with all checks green — the failure CI_GATES.md warns about in its own conventions section. The
string will be typed by a human into the GitHub UI (see §7), so an em dash is a needless way to
lose an afternoon.

**Every other workflow that mentions the guard was checked** (`grep -rn check-test-files-wired
.github/ package.json`): `build.yml:48` and `:50` are the only `run:` lines, they are the same two
commands as before, and there is no second invocation anywhere with different roots or flags.
`build.yml:1385`, `build.yml:2614` and `unwired-spec-gate.yml:5` are **comments** that reference
the inventory's behaviour; none of them runs it, and none of them asserts a reachable/orphan
number. `package.json` has no script that runs it. So no other job can go red on the baseline.

## 6 · Verification (all run in `/home/user/wt-ratchet`)

### 6.1 Self-test — 12/12

```
$ node scripts/check-test-files-wired.cjs --self-test
self-test OK — direct file + directory reachability, unreferenced orphan
self-test OK — prose echo naming a runner yields no selectors
self-test OK — real invocation plus trailing prose echo yields only the real selector
self-test OK — annotation and comment lines yield no selectors
self-test OK — heredoc body yields no selectors
self-test OK — non-existent directory prefix matches nothing
self-test OK — redirect target is not a selector
self-test OK — ratchet — unchanged inventory passes
self-test OK — ratchet — a NEW orphan fails
self-test OK — ratchet — a baseline entry that became REACHABLE fails
self-test OK — ratchet — a baseline entry whose file is GONE fails
self-test OK — ratchet — a correctly shrunk baseline passes
self-test OK (12/12 fixtures — 7 reachability, 5 ratchet)
exit 0
```

### 6.2 The guard on the branch — green

```
$ node scripts/check-test-files-wired.cjs        # first and last line; 233 ORPHAN lines between
test-files-wired: 278/511 reachable; 233 orphan(s)
…
test-orphan-ratchet: OK — baseline: 233 recorded orphan(s) (debt, not exempt)
exit 0
```

### 6.3 A NEW orphan fails

A throwaway `shared/__ratchet_probe__/probe.test.ts` (created, run against, deleted):

```
$ node scripts/check-test-files-wired.cjs
test-files-wired: 278/512 reachable; 234 orphan(s)
NEW ORPHAN (unreachable test file not in the baseline) shared/__ratchet_probe__/probe.test.ts

test-orphan-ratchet FAILED: 1 new orphan(s), 0 stale baseline entry(ies).
A NEW ORPHAN is wired into a workflow or deleted — never added to scripts/test-orphan-baseline.txt,
which may only SHRINK (ledger 2026-09-14-test-files-wired-orphans: a suite leaves the orphan list by
being RUN or by being GONE, never by being named an exception).
A STALE BASELINE ENTRY is a line to delete in the same PR that wired or removed that suite.
exit 1
```

### 6.4 Deleting a baseline line for a still-orphan suite fails — as a NEW ORPHAN

This is the correct classification, and worth stating: the baseline cannot be trimmed to make a
red run green, because the trimmed path immediately re-enters as an orphan the file does not
carry.

```
$ node scripts/check-test-files-wired.cjs     # baseline line for text-sanitizer.test.ts removed
test-files-wired: 278/511 reachable; 233 orphan(s)
NEW ORPHAN (unreachable test file not in the baseline) server/utils/__tests__/text-sanitizer.test.ts
test-orphan-ratchet FAILED: 1 new orphan(s), 0 stale baseline entry(ies).
exit 1
```

### 6.5 A baseline path that does not exist fails — STALE

```
$ node scripts/check-test-files-wired.cjs     # "server/__tests__/does-not-exist.test.ts" appended
test-files-wired: 278/511 reachable; 233 orphan(s)
STALE BASELINE ENTRY (remove it from scripts/test-orphan-baseline.txt in this PR)
  server/__tests__/does-not-exist.test.ts — no longer EXISTS in the test inventory
test-orphan-ratchet FAILED: 0 new orphan(s), 1 stale baseline entry(ies).
exit 1
```

### 6.6 A baseline path that is REACHABLE fails — STALE (the other arm)

```
$ node scripts/check-test-files-wired.cjs     # a genuinely wired suite appended to the baseline
STALE BASELINE ENTRY (remove it from scripts/test-orphan-baseline.txt in this PR)
  shared/__tests__/booking-agent-vocabulary.test.ts — now REACHABLE from a workflow command
test-orphan-ratchet FAILED: 0 new orphan(s), 1 stale baseline entry(ies).
exit 1
```

The baseline was restored byte-for-byte after each probe (6.4–6.6) and the green run in 6.2 was
re-taken afterwards.

### 6.7 Repository gates

| Check | Result |
|---|---|
| `node scripts/check-test-files-wired.cjs --self-test` | **12/12**, exit 0 |
| `node scripts/check-test-files-wired.cjs` | `278/511 reachable; 233 orphan(s)`, ratchet OK, exit 0 |
| `node scripts/check-decision-guards.cjs` | (see §9) |
| `bash scripts/phase2-fee-gate.sh` | (see §9) |
| `npx tsc --noEmit` error count | (see §9) — **no TypeScript was touched by this lane** |
| `npm run build` | (see §9) |
| `grep -c replit.local package-lock.json` | (see §9) |

## 7 · THE HUMAN STEP — branch protection

`test-file-reachability (ratchet - new orphans fail)` was added to
`.github/branch-protection.json` and to the CI_GATES.md **Tier 1** table. **The enforce workflow
cannot apply it.** `enforce-branch-protection.yml` needs repo *administration* rights, which is
not a grantable `GITHUB_TOKEN` scope; it authenticates with the `BRANCH_PROTECTION_PAT` secret and
falls back to `GITHUB_TOKEN` **only so the failure is a clear 403 rather than a crash**. That
secret is not configured, so the JSON is a declaration and nothing more until a human does:

> GitHub → repository → Settings → Branches → edit the `main` rule → "Require status checks to
> pass before merging" → add the context string **`test-file-reachability (ratchet - new orphans
> fail)`** exactly (ASCII hyphen, one space either side of it, no trailing period) → Save.

GitHub only offers contexts that have reported at least once, so apply it after this PR's CI run
has populated the name.

Until that is done the gate **runs and goes red on a new orphan but does not block the merge
button** — which is honest to state rather than to imply otherwise: the JSON entry is the
declaration, the PAT or the human is the enforcement.

## 8 · Negative space (§18d — green means green-within-stated-bounds)

- **The ratchet does not make a baseline row acceptable.** It catches exactly two things: a NEW
  unreachable test file, and a baseline row that has gone stale. The 233 rows it carries are
  still 233 unrun suites, each still owed repair-or-delete. A green run here means the debt did
  not grow — nothing more.
- **`e2e/` is still invisible** (ruled 2026-09-15: stated, not widened). `TEST_ROOTS` is
  `server`/`shared`/`client`/`playwright`, so an `e2e/` spec can be added, wired or orphaned and
  this guard will not notice in either direction.
- **The reachability predicate's own blind spots are unchanged and now bound the ratchet too.** A
  runner reached through a construct the tokenizer does not model — an `eval`, a `$(…)`
  substitution, a one-line `for … do` body, a reusable workflow or action, a matrix-expanded
  selector, a custom launcher, a computed `testDir` — is MISSED. So a "NEW ORPHAN" line can in
  principle name a file that IS run by a command this parser cannot follow. The answer to that is
  to make the invocation legible, **never** to add the file to the baseline.
- **Reachable still does not mean passing, or meaningful.** The inventory answers "does a
  workflow command NAME this file". A reachable suite can be green and vacuous; that gap is
  `spec-coverage-gate`'s and the anti-vacuity assertions', not this guard's.
- **The baseline is a path list, not a content hash.** A suite that stays at the same path while
  its assertions are gutted is invisible here, as it always was.

## 9 · Validation summary

Run in `/home/user/wt-ratchet`, on the branch (and re-run on the merge commit after
`origin/main` was merged in — see the PR body for the merge-commit figures):

| Gate | Result |
|---|---|
| `node scripts/check-test-files-wired.cjs --self-test` | **12/12 fixtures OK**, exit 0 (7 reachability + 5 ratchet) |
| `node scripts/check-test-files-wired.cjs` | `278/511 reachable; 233 orphan(s)` → `test-orphan-ratchet: OK — baseline: 233 recorded orphan(s) (debt, not exempt)`, exit 0 |
| `node scripts/check-decision-guards.cjs` | `decision-guards lint OK (0 deferred warning(s))`, exit 0 |
| `bash scripts/phase2-fee-gate.sh` | `✅ Phase 2 fee-literal gate PASSED`, exit 0 |
| `npx tsc --noEmit -p tsconfig.json \| grep -c "error TS"` | **129** = `TSC_BASELINE` in `build.yml` — **unchanged; this lane touched no TypeScript** |
| `npm run build` | exit 0 (`dist/index.cjs`; the 10 esbuild warnings are the pre-existing baseline) |
| `grep -c replit.local package-lock.json` | **0** |
| `python3 -c "json.load(...)"` on `.github/branch-protection.json` | valid, 10 contexts |

## 10 · Proposed CLAUDE.md §18d sentence (NOT applied by this lane)

CLAUDE.md was deliberately not touched. If the decision-maker wants the rule recorded in §18d
beside the command-parsing paragraph, the proposed sentence is:

> **AN INVENTORY THAT NEVER GOES RED IS A MEASUREMENT, NOT A GATE — SO THE MEASUREMENT RATCHETS
> (ledger `2026-09-15-orphan-ratchet`).** `check-test-files-wired.cjs` reported its orphan count
> and exited 0, which is exactly the posture that let a poisoned predicate run green for eight
> days; the count could have doubled without a single red check. The current orphan set is now
> recorded once in `scripts/test-orphan-baseline.txt` and the guard fails on either direction of
> drift — a NEW orphan, or a recorded row that has since been wired or deleted — so the file can
> only SHRINK and the recorded debt is always true. **A BASELINE IS RECORDED DEBT, NEVER AN
> ALLOWLIST:** `2026-09-14-test-files-wired-orphans` rules that a suite leaves the orphan list by
> being RUN or by being GONE, and a listed suite is still owed exactly that. The same shape
> applies to any guard whose honest answer today is a number nobody can drive to zero this week:
> record it, fail on growth, and state what the record does not excuse.
