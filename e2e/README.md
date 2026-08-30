# E2E deploy harness

Per-role Playwright harness that runs from the **Claude Code CLI on your PC**
against the deployed Replit URL. Get `smoke.spec.ts` green, then layer the real
tests on top. (Bootstrap brief: `E2E_BOOTSTRAP_README.md` in repo root assets.)

This is intentionally separate from the repo's existing local-dev harness
(`playwright.config.ts` → `./playwright/tests`, localhost:5000). This one targets
a deploy and caches per-role auth state.

## Layout

```
playwright.e2e.config.ts        # AUTH harness  → $E2E_STAGING_BASE_URL (has globalSetup)
playwright.e2e.public.config.ts # PUBLIC harness → $E2E_BASE_URL (NO globalSetup, no login)
e2e/
  global-setup.ts             # logs in each role once → e2e/auth/<role>.json
  fixtures/
    accounts.ts               # role → seeded account; password from env
    base-url.ts               # single staging-first target resolution
    roles.ts                  # authFile() + extended test w/ console-error capture
  specs/
    public-smoke.spec.ts      # UNAUTHENTICATED — the production smoke
    smoke.spec.ts             # AUTHED — staging only
  auth/                       # generated storageState (gitignored)
```

## Two targets (read this first)

Production **purges** every `@traveloure.test` account on boot (PR #319 P0 fix), so an
auth-dependent suite structurally cannot pass against it — the old deploy smoke died in
`global-setup.ts` with a 401 on every PR for weeks. The suites are therefore split:

| Harness | Target env var | Auth | Workflow |
|---|---|---|---|
| `playwright.e2e.public.config.ts` | `E2E_BASE_URL` (**production**) | none | `e2e-deploy-smoke.yml` |
| `playwright.e2e.config.ts` | `E2E_STAGING_BASE_URL` (**staging**) | seeded accounts | `e2e-staging-auth-smoke.yml`, `e2e-tests.yml` |

Provisioning staging is an owner action — see **`docs/STAGING.md`**.

## Install (on your PC)

```bash
npm i -D @playwright/test dotenv
npx playwright install chromium
```

## Env

Copy `.env.e2e.example` → `.env.e2e` (gitignored) and set `E2E_STAGING_BASE_URL`
(auth runs), `E2E_BASE_URL` (public prod runs) and `E2E_TEST_PASSWORD`. With
`dotenv` installed the config auto-loads it; otherwise export the vars into your shell.

## Run

```bash
npm run test:e2e:public          # UNAUTHENTICATED prod smoke  (needs E2E_BASE_URL)
npm run test:e2e:staging:smoke   # AUTHED staging smoke        (needs E2E_STAGING_BASE_URL)
npm run test:e2e:staging         # full authed journey suite   (needs E2E_STAGING_BASE_URL)
npx playwright show-report
```

> **The target is required and must be HTTPS.** There's no localhost
> fallback: the app's session cookie is `Secure`, so it's silently dropped over
> http (login 200, then `/api/auth/user` 401 reading as bad creds). The config
> throws if it's unset; global-setup throws if it isn't `https://`.

## Specs

- `specs/public-smoke.spec.ts` — **unauthenticated**: public routes render (no 404 /
  blank shell) + `/health`, `/api/version`, `/api/ready` answer. This is what runs
  against production. Never add a login to it.
- `specs/smoke.spec.ts` — **authed, staging only**: landing renders with a session
  (no console errors) + traveler/expert sessions are authenticated (API-login fixture).
- `specs/login-ui.spec.ts` — drives the real **SignInModal** UI (desktop +
  mobile-hamburger triggers) so modal regressions are caught; the API fixture
  only covers session setup, not the human login path.

## CI

- `.github/workflows/e2e-deploy-smoke.yml` runs `test:e2e:public` against
  `secrets.E2E_BASE_URL`. No password, no login.
- `.github/workflows/e2e-staging-auth-smoke.yml` runs `test:e2e:staging:smoke` against
  `secrets.E2E_STAGING_BASE_URL`.

Both are **non-blocking by design** (not required checks). When the target secret is
absent the test job is **skipped (grey)** and the final check renames itself to
`… DID NOT RUN`, with a run-summary banner — a not-configured run must never read as a
pass. When the target IS configured, failures are real and stay red: there is no
`continue-on-error` and no skip-on-401.

## Swap points — as filled from the real app

| # | What | Resolved value |
|---|------|----------------|
| 1 | `.env.e2e` | template in `.env.e2e.example`; `E2E_BASE_URL` **required, HTTPS only** (no fallback — Secure cookie) |
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
