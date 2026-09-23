# Dispatch — run and repair the `artifacts/traveloure` reference suites

**For the Replit workspace. Written 2026-09-23 against `main` @ `5967595`.**
Small, self-contained, and **touches no product code** — nothing under `server/`, `client/` or
`shared/` is in scope.

---

## Why this exists

`artifacts/traveloure` is a private reference workspace carrying **29 test files — more than
`shared/`** — and until today **nothing ran them.** No workflow named the directory, its
`package.json` declared no `test` script, and `scripts/check-test-files-wired.cjs` does not scan that
root, so the suites were invisible in both directions: they could pass, fail or rot with nothing
going amber.

They are now runnable. `artifacts/traveloure/README.md` declares what the workspace is and
`package.json` has `test` and `test:e2e`.

---

## The commands

```bash
npm ci                          # at the REPOSITORY ROOT, once — this package has no node_modules
cd artifacts/traveloure
npm test                        # 28 node:test suites under src/**/__tests__
npm run typecheck               # tsc --noEmit against this package's own tsconfig
```

`npm test` needs **no database, no server and no browser**. It takes well under a minute.

```bash
npm run test:e2e                # the ONE Playwright spec — NOT part of npm test
```

`test:e2e` needs a browser **and** this app running (`npm run dev` in the same directory). It is
**out of scope for this dispatch** — do not try to make it pass.

---

## Current state, measured

**342 of 349 pass. 7 fail, from exactly two causes.** Both are defects in the *tests*, not in the
reference code they cover — which is why this is a repair job and not a design question.

### Cause 1 — missing `QueryClientProvider` (6 failures)

`src/components/__tests__/city-feed-card-recommendation.test.tsx`

Every failure is the same error:

```
No QueryClient set, use QueryClientProvider to set one
```

The component under test uses a react-query hook; the test renders it bare. The fix is to wrap the
render in a `QueryClientProvider` with a fresh `QueryClient` per test.

**Do not** stub the hook out to dodge the error — the assertions are about rendered DOM (one is
named *"zero raw keys in rendered DOM (the Commit-1 gate)"*), so a stub that bypasses rendering
would leave the suite green and testing nothing.

### Cause 2 — a stale assertion about field placement (1 failure)

`src/lib/__tests__/pricing-fees.test.ts` — *"moved fields are absent from the wizard
(ServiceForm.tsx)"*

The assertion says certain fields have moved OUT of the wizard. Read the reference `ServiceForm.tsx`
in this workspace and establish which is true:

- **the fields did move, and the assertion's list is stale** → update the list, and say in the commit
  which field moved and where;
- **the fields are still there, and the reference drifted from its own rule** → that is a finding
  about the reference, not the test. **Report it; do not "fix" the test to match.**

This distinction is the whole value of the task. A test that asserts a rule is not repaired by
rewriting it to match whatever the code now does.

---

## Rules

1. **No product code.** If a fix seems to require changing `server/`, `client/` or `shared/`, stop
   and report — it means the finding is bigger than this dispatch.
2. **Do not wire this into CI yet, and do not add `artifacts` to `TEST_ROOTS`.** The orphan ratchet
   refuses to baseline a new orphan, so adding the root while 7 suites fail would force wiring or
   deleting them to get green. **The order is: fix the 7 → wire → add the root.** Adding the root is
   a separate decision about what that inventory measures (ledger
   `2026-09-23-orphan-ratchet-scans-scripts`, on the `e2e/` precedent).
3. **Quote the measured number**, not a projection. If it lands at 348/349 rather than 349/349, the
   remaining one is the finding.
4. One PR is fine — this is small. Append a ledger row naming what you fixed and anything you found
   but did not fix.

---

## Negative space

This dispatch covers the 28 `node:test` suites only. The Playwright spec is excluded above. Whether
this workspace's tests should run in CI **at all** is not decided here and is not yours to decide:
the README states the question and the `e2e/` precedent governs it.
