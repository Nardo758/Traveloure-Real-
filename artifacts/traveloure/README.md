# `artifacts/traveloure` — the live-wired design reference

**This is a reference workspace, not shipped code.** Nothing here is served to a traveler, imported
by the main app, or bundled by `npm run build` at the repo root. The main app cites it only in
comments, as the artboard a page was built from — for example
`client/src/pages/ready-made-detail.tsx`.

It is a private npm package (`@workspace/traveloure`, `private: true`) with its own `vite.config.ts`,
`tsconfig.json` and dependency set. It does not participate in a workspace graph: the root
`package.json` declares **no** `workspaces` key, so `npm ci` at the root does not install this
package, and its imports resolve upward into the root `node_modules` by ordinary Node resolution.

## Why it has 29 test files

More than `shared/` does. They are real assertions about the reference implementations — card link
shapes, disclosure labels, fee arithmetic, wizard field placement — written as the artboards were
built, so that a reference that has silently drifted from its own rules is visible.

**Until 2026-09-23 nothing ran them.** No workflow named this directory, `package.json` declared no
`test` script, and `scripts/check-test-files-wired.cjs` does not scan this root — so the suites were
invisible in both directions: they could pass, fail or rot without anything going amber.

## Running them

```bash
cd artifacts/traveloure
npm test          # 28 node:test suites under src/**/__tests__
npm run typecheck # tsc --noEmit against this package's own tsconfig
```

`npm test` needs no database, no server and no browser. It runs from the root `node_modules`, so
run `npm ci` at the repository root first if you have a clean checkout.

```bash
npm run test:e2e  # the ONE Playwright spec, playwright/marketplace-card-links.spec.ts
```

`test:e2e` is separate because it needs a browser **and** this app running (`npm run dev` here). It
is not part of `npm test` and is not expected to pass unattended.

## Known state, as of 2026-09-23

**342 of 349 pass. 7 fail, from exactly two causes**, both in the tests rather than in the reference
code they cover:

| Failing | Count | Cause |
|---|---|---|
| `src/components/__tests__/city-feed-card-recommendation.test.tsx` | 6 | `No QueryClient set, use QueryClientProvider to set one` — the component under test needs a `QueryClientProvider` wrapper the test does not build |
| `src/lib/__tests__/pricing-fees.test.ts` | 1 | `moved fields are absent from the wizard (ServiceForm.tsx)` — an assertion about where a field lives, which no longer holds |

## What this directory is NOT in

**`artifacts/` is deliberately outside `TEST_ROOTS` in `scripts/check-test-files-wired.cjs`**
(ledger `2026-09-23-orphan-ratchet-scans-scripts`). Adding the root would declare 29 orphans in a
prototype, and because the orphan ratchet refuses to baseline a new orphan, that would force wiring
or deleting 29 reference suites to get CI green.

Bringing this root into the inventory is a decision about what that inventory is *for* — on the
`e2e/` precedent (`2026-09-15-orphan-ratchet`: *"widening the inventory is a decision about what it
MEASURES, and the ratchet does not make it"*). **The honest order is: fix the 7, then wire, then add
the root** — never add the root first and baseline the failures.

## The rule that matters if you edit here

A change to this reference does **not** change the product, and a change to the product does **not**
update this reference. They are kept in step by hand, by the comments in the main app that name the
artboard. If you change one and not the other, say so in the commit — a silently diverged reference
is worse than no reference, because it is still cited.
