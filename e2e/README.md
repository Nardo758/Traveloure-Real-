# E2E deploy harness

Per-role Playwright harness that runs from the **Claude Code CLI on your PC**
against the deployed Replit URL. Get `smoke.spec.ts` green, then layer the real
tests on top. (Bootstrap brief: `E2E_BOOTSTRAP_README.md` in repo root assets.)

This is intentionally separate from the repo's existing local-dev harness
(`playwright.config.ts` → `./playwright/tests`, localhost:5000). This one targets
a deploy and caches per-role auth state.

## Layout

```
playwright.e2e.config.ts      # desktop + mobile, points at $E2E_BASE_URL
e2e/
  global-setup.ts             # logs in each role once → e2e/auth/<role>.json
  fixtures/
    accounts.ts               # role → seeded account; password from env
    roles.ts                  # authFile() + extended test w/ console-error capture
  specs/
    smoke.spec.ts             # proves the harness works
  auth/                       # generated storageState (gitignored)
```

## Install (on your PC)

```bash
npm i -D @playwright/test dotenv
npx playwright install chromium
```

## Env

Copy `.env.e2e.example` → `.env.e2e` (gitignored) and set `E2E_BASE_URL` +
`E2E_TEST_PASSWORD`. With `dotenv` installed the config auto-loads it; otherwise
export the vars into your shell.

## Run

```bash
npx playwright test -c playwright.e2e.config.ts                  # all projects
npx playwright test -c playwright.e2e.config.ts --project=chromium smoke
npx playwright show-report
```

(Also wired as `npm run test:e2e:deploy` etc. — see package.json.)

## Swap points — as filled from the real app

| # | What | Resolved value |
|---|------|----------------|
| 1 | `.env.e2e` | template in `.env.e2e.example`; `E2E_BASE_URL` defaults to localhost:5000 (this repo's dev port) |
| 2 | `accounts.ts` | real seeded emails (verified vs `playwright/fixtures/test-accounts.ts`), pw `TestPass123!`, env-overridable: traveler `test-traveler-kyoto@`, expert `kyoto-food@`, provider `kyoto-photography@`, ea `test-ea@`, admin `test-admin@` (all `…@traveloure.test`) |
| 3 | `global-setup.ts` | **login is the SignInModal dialog, not a `/login` page.** Calls the modal's real endpoint `POST /api/auth/login {email,password}` from the browser context (passport session cookie → storageState); authed check = `GET /api/auth/user`. UI testids documented inline if true-UI login is ever needed. |
| 4 | `smoke.spec.ts` | title `/traveloure/i` (set client-side by `SEOHead`); authed routes from `getRoleHomePath` — traveler `/dashboard`, expert `/expert/dashboard` (provider `/provider/dashboard`, ea `/ea/dashboard`, admin `/admin/dashboard` available for later flows) |
| 5 | ESM | repo is `"type":"module"`; config uses `process.cwd()`, no `__dirname` |

> **Most likely first red:** the landing smoke asserts **zero** console errors. A
> deploy missing a client key (e.g. Google Maps) can log console errors on `/` and
> trip this. If so, that's a real finding — fix the deploy or scope the assertion.

## Next layers (after smoke is green)

- **Conformance** — `(route, must_contain, must_not_contain)` table so
  terminology/pricing drift fails a test.
- **Five flows** — User·Trip / User·Experience / User·Event / Expert / Provider,
  plus Discover relevance-dominance, each `test.use({ storageState: authFile(role) })`.
- **Gates** — promote `consoleErrors` capture (in `fixtures/roles.ts`) to a hard
  assertion per flow; add no-4xx/5xx and `@axe-core/playwright` once happy paths pass.
