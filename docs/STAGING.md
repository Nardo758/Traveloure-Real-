# Staging environment — provisioning runbook (OWNER action)

> **Why this is its own doc, not a section of `docs/RELEASE.md`:** `RELEASE.md` is a
> *per-publish* checklist for production (the drizzle-push CHECK trap). This is a
> *one-time infrastructure provisioning* task for a **different deployment**, and it is
> referenced by three CI workflows' failure messages. Mixing a one-time infra setup into a
> per-publish checklist would bury it. `RELEASE.md` links here.

**Status: NOT YET PROVISIONED.** Nothing in this repo can create it — the Replit side is
the owner's action. Until it exists, the auth-dependent CI workflows deliberately report
**"STAGING NOT CONFIGURED — auth smoke DID NOT RUN"** rather than passing silently.

---

## 1. Why staging exists

Production **purges every `@traveloure.test` account on every boot** (the PR #319 P0
security fix). `server/index.ts:438-440`:

```ts
const allowTestAccounts =
  (process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_ACCOUNTS === "1") &&
  process.env.ENVIRONMENT !== "PROD";
if (allowTestAccounts) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }
```

That is correct and is grep-enforced by `scripts/check-env-allowlist.cjs`. The consequence
is structural: **an E2E suite that logs in a seeded account can never pass against
production.** `e2e-deploy-smoke` failed in `e2e/global-setup.ts` with
`401 Invalid email or password` before a single test ran, on every PR, for weeks. That is
noise, not signal.

The resolution (ratified) is a split, not a weakening of the purge:

| Suite | Target | Auth |
|---|---|---|
| `.github/workflows/e2e-deploy-smoke.yml` → `playwright.e2e.public.config.ts` | **production** (`E2E_BASE_URL`) | none — public routes + health endpoints only |
| `.github/workflows/e2e-staging-auth-smoke.yml` → `playwright.e2e.config.ts` | **staging** (`E2E_STAGING_BASE_URL`) | seeded accounts |
| `.github/workflows/e2e-tests.yml` (daily journey suite) → `playwright.e2e.config.ts` | **staging** (`E2E_STAGING_BASE_URL`) | seeded accounts |

This is also a **ruling 33 prerequisite**: "J1 green end-to-end on staging" is the Kyoto
beta gate, and it cannot be met while no staging environment exists.

---

## 2. What the owner must do — required actions

### 2.1 Create a second Replit deployment ("staging")

Autoscale, same repo/branch as production (`.replit [deployment] run = npm start`, which
sets `NODE_ENV=production` — expected and fine).

**It must have its own database.** Do **not** point staging at the production
`DATABASE_URL`. Staging seeds test accounts and writes bookings; sharing the prod DB would
put `@traveloure.test` rows into production, which the purge would then delete on the next
prod boot — a fight between two deployments over the same table.

### 2.2 Set these environment variables on the STAGING deployment

Everything below is read from the code, not guessed; the source is cited.

| Variable | Value | Why — source |
|---|---|---|
| `ALLOW_TEST_ACCOUNTS` | `1` | The opt-in that makes the boot **seed** instead of **purge**. `server/index.ts:439`; also required by the seed's own fail-safe, `server/seeds/e2e-test-accounts.seed.ts:44-52`. |
| `ENVIRONMENT` | **must NOT be `PROD`** (leave unset) | `ENVIRONMENT === "PROD"` overrides `ALLOW_TEST_ACCOUNTS` and forces the purge branch — `server/index.ts:440` and `e2e-test-accounts.seed.ts:45`. |
| `DATABASE_URL` | staging's own Postgres | See 2.1. |
| `E2E_TEST_PASSWORD` | the password the seeded accounts get | `e2e-test-accounts.seed.ts:19` — `process.env.E2E_TEST_PASSWORD \|\| "TestPass123!"`. **Must equal** the GitHub secret in 2.3. If you set neither side, both default to `TestPass123!` and it still works. |
| `STRIPE_SECRET_KEY` | a **`sk_test_…`** key — **NOT `sk_live_`** | With `ALLOW_TEST_ACCOUNTS=1`, `isProdStrictEnv()` is **false** (`server/utils/stripe-key-policy.ts:29-34`), and `checkStripeKeyPrefix` then *requires* the `sk_test_` prefix. A live key makes `server/validate-env.ts:46` **throw at boot**. This is deliberate: E2E journeys create real Stripe objects. |
| `STRIPE_WEBHOOK_SECRET` | staging webhook signing secret | `/api/ready` reports `fail` and returns **503** without it (`server/index.ts:198-204`), which hard-fails the daily journey suite's readiness step. |
| `XAI_API_KEY` | any working key | Same — `/api/ready` `fail` → 503 (`server/index.ts:166-172`). |
| `SESSION_SECRET` | any strong random string | `server/replit_integrations/auth/replitAuth.ts:33` uses it non-optionally. |

Warn-only, not required to make CI green, but the journey specs will degrade without them:
`ANTHROPIC_API_KEY`, `RESEND_API_KEY` (both `warn` in `/api/ready`), plus whatever
third-party keys the specific journeys you care about exercise (`GOOGLE_MAPS_API_KEY`,
`AMADEUS_*`, …). Use **test/sandbox** credentials throughout.

### 2.3 Add these GitHub repository secrets

| Secret | Value | Required? |
|---|---|---|
| `E2E_STAGING_BASE_URL` | staging's **HTTPS** URL, no trailing slash — e.g. `https://traveloure-staging.replit.app` | **Yes.** Its presence is the single signal that switches the auth workflows from "did not run" to running. HTTPS is mandatory: the session cookie is `Secure` and is silently dropped over http, which resurfaces as a misleading 401. |
| `E2E_STAGING_TEST_PASSWORD` | same value as staging's `E2E_TEST_PASSWORD` env var | Optional. Falls back to the existing `E2E_TEST_PASSWORD` secret, then to `TestPass123!`. Add it only if you want to rotate staging's password independently of the existing secret. |
| `E2E_BASE_URL` | **production** URL | Already exists. Now used **only** by the unauthenticated production smoke. Do not repoint it at staging. |

> **Never set `ALLOW_TEST_ACCOUNTS` in a GitHub workflow that targets a deployment.** That
> is exactly what `scripts/check-env-allowlist.cjs` (c) fails on, and CI will go red. The
> opt-in belongs on the staging *deployment's* env, never in a workflow file.

### 2.4 How the seeded accounts get created

Automatically, at **staging boot**. `server/index.ts` calls `seedE2EAccounts()` on the
allowed branch; it is idempotent (existing rows are left alone, missing terms-acceptance
timestamps are backfilled). No manual step, no `npm run seed:e2e-accounts` needed — though
that script exists and can be run against staging's `DATABASE_URL` if you ever need to
re-seed out of band.

The five accounts (`server/seeds/e2e-test-accounts.seed.ts:31-37`), plus one upcoming
"Kyoto Discovery Trip" for the traveler:

| Email | Role |
|---|---|
| `test-traveler-kyoto@traveloure.test` | `user` |
| `kyoto-food@traveloure.test` | `travel_expert` |
| `kyoto-photography@traveloure.test` | `service_provider` |
| `test-ea@traveloure.test` | `executive_assistant` |
| `test-admin@traveloure.test` | `admin` |

---

## 3. Confirming it works

1. **Boot log** — staging's deploy log should show `E2E test accounts ready (dev/CI)` and
   `+ Created …` / `✓ … already exists` lines. If instead you see
   `[security] Neutralized N @traveloure.test account(s)`, the deployment took the **purge**
   branch: `ALLOW_TEST_ACCOUNTS` is not `1`, or `ENVIRONMENT` is `PROD`.

2. **Login probe** (the exact check CI runs first):

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST "https://<staging-url>/api/auth/login" \
     -H 'Content-Type: application/json' \
     -d '{"email":"test-traveler-kyoto@traveloure.test","password":"<E2E_TEST_PASSWORD>"}'
   ```

   `200` = provisioned. `401` = accounts absent or password mismatch. `000` = unreachable.

3. **Readiness**: `curl -s https://<staging-url>/api/ready | python3 -m json.tool` — must be
   HTTP `200` with `"ready": true` and no `"status": "fail"` check.

4. **Run the workflow**: Actions → *E2E Staging Auth Smoke* → Run workflow. Before the
   secret exists the final check reads
   `STAGING NOT CONFIGURED — auth smoke DID NOT RUN`; after, it reads
   `auth smoke verdict (staging)` and the `auth smoke (staging)` job actually executes.

5. Locally: `E2E_STAGING_BASE_URL=https://<staging-url> E2E_TEST_PASSWORD=… npm run test:e2e:staging:smoke`

---

## 4. Open questions for the owner (not determinable from the repo)

1. **Replit plan / deployment slot** — does the account allow a second Autoscale deployment,
   and should staging instead be a *Reserved VM* (always-on, avoids the 10-minute cold-wake
   window `e2e-tests.yml` budgets for)? Cost/plan decision.
2. **Staging database provenance** — fresh empty DB (relies entirely on startup seeds), or a
   scrubbed copy of production? The repo has no scrub tooling; a fresh DB is the assumption
   this runbook is written against.
3. **Custom domain vs `*.replit.app`** — either works; only HTTPS matters.
4. **Stripe test-mode account** — which Stripe test account/webhook endpoint should staging
   point at? Reusing production's webhook endpoint will not work (different signing secret).
5. **Deploy cadence** — should staging auto-deploy from `main` on every merge? The daily
   journey suite's "STALE DEPLOY" warning exists because the target can lag `main`; a
   deploy-on-merge staging makes that warning meaningful.
6. **`GIT_COMMIT` injection** — production does not inject it, so `/api/version` reports the
   esbuild-embedded SHA. Confirm staging's build does the same so the stale-deploy check works.

---

## 5. Invariants — do not "fix" these away

- **Do not** add `ALLOW_TEST_ACCOUNTS` to any workflow that names a deploy URL. Guard (c) of
  `scripts/check-env-allowlist.cjs` fails closed on *any* form of the token there.
- **Do not** point `playwright.e2e.config.ts` (which has a login `globalSetup`) at
  production. That is the original bug.
- **Do not** add a login to `e2e/specs/public-smoke.spec.ts` or a `globalSetup` to
  `playwright.e2e.public.config.ts`.
- **Do not** re-add `continue-on-error` or a "skip on 401" branch to the staging workflow. A
  401 from a *configured* staging target means staging is misprovisioned, which is a real
  failure. Only an *absent* `E2E_STAGING_BASE_URL` may skip, and it skips loudly.
