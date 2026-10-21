# AGENTS.md

Architectural decisions, invariants, and product intent live in `CLAUDE.md` (root) — read it before changing
schema, routing, fees, migrations, or approval flows. This file only carries operational setup guidance for
Cursor Cloud agents.

A new ledger ruling is a new file, `docs/decisions/pending/<YYYY-MM-DD-slug>.md` (one table row, heading
and citation both `R?`). Do not append to `docs/DECISIONS.md` and do not edit an existing
`docs/decisions/<seq>-*.md`. The post-merge stamp numbers the pending file.

## Cursor Cloud specific instructions

This is a single full-stack TypeScript app (`rest-express`): an Express API + Vite/React SPA served together on
**one port (5000)**, backed by **PostgreSQL 16** (Drizzle ORM). `npm run dev` runs migrations + data seeding on
boot, then serves both the API and the frontend. There is no separate frontend server, no Redis/queue, and no
Docker for the root app (the `attached_assets/*` Dockerfiles belong to unrelated legacy reference projects).

### Environment already provisioned on the VM (persists via snapshot)
- **PostgreSQL 16** is installed in the image. Database `traveloure`, role `ubuntu` (peer auth over the local
  socket, no password). The environment `start` script creates the role and database if they are missing and
  starts the cluster (`sudo pg_ctlcluster 16 main start`). Nothing auto-starts Postgres before that script.
- Login shells export dev defaults from `/etc/profile.d/traveloure-dev.sh`. `~/.bashrc` is not a reliable place
  for them: non-interactive bash returns before any lines appended to it. A command that does not see the
  variables should run under `bash -lc` or `source /etc/profile.d/traveloure-dev.sh`.
- `DATABASE_URL` must be `postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql`. The `host` query
  parameter is the unix socket (peer auth as `ubuntu`). A URL whose host `new URL()` cannot parse is refused by
  `demoSeedDatabaseAllowed`, and demo expert/provider seeds are skipped. `localhost` alone needs a TCP password
  this role does not have.
- `SESSION_SECRET` and `STRIPE_SECRET_KEY` have local defaults in that profile script (the Stripe value is an
  `sk_test_` placeholder, not a live key). A real secret in the environment wins. The server also loads `.env`
  via dotenv and does not override variables that are already set.
- Dependencies are installed with `npm ci` during the environment build. If a branch's lockfile differs and
  imports fail, run `npm ci` again.

### Starting services (do this at the start of a session)
- The environment `start` script starts Postgres, then `npm run dev`, and leaves the dev server in the
  foreground on `http://localhost:5000`. It exits immediately when `/api/health` is already 200, so a second
  run does not bind the port again. If `start` did not run (`/tmp/cursor/start-user/` missing), start Postgres
  and the dev server yourself from `/workspace`.
- Migrations and seeds run on boot. Confirm health: `curl localhost:5000/api/health` (200) and
  `curl localhost:5000/api/ready` (JSON of per-service status; `fail`/`warn` for Anthropic, the Stripe webhook
  secret, and Resend are expected when those keys are absent).

### Non-obvious startup gotchas
- **Hard startup requirement beyond the DB:** `server/services/stripe.service.ts` throws at import unless
  `STRIPE_SECRET_KEY` (or `STRIPE_SECRET_KEY_TEST`) is set, and outside production it must start with `sk_test_`.
  The profile default satisfies boot only. **Real Stripe payment flows need a real test secret** added as a
  Secret; it overrides the placeholder. Amadeus is not required to boot.
- **AI features are off without keys.** `GROK_API_KEY` (itinerary generation, TravelPulse) and
  `ANTHROPIC_API_KEY` (chat/optimization fallback) degrade gracefully when absent — the app runs, but AI-generation
  flows won't produce results. Other integrations (Resend email, Google Maps, Viator, Pexels, etc.) are all
  key-gated and skip cleanly when unset.
- Do not run bare `npm install` and commit the resulting `package-lock.json` without the scrub — see CLAUDE.md
  "Lockfile purity". The `.githooks` pre-commit hook (wired by the `prepare` script) handles this automatically.

### Seeded test accounts (dev/CI only, created on every boot)
Password for all: `TestPass123!`
- `test-traveler-kyoto@traveloure.test` (traveler) · `kyoto-food@traveloure.test` (travel_expert) ·
  `kyoto-photography@traveloure.test` (service_provider) · `test-ea@traveloure.test` (executive_assistant) ·
  `test-admin@traveloure.test` (admin)

### Lint / test / build
- **Typecheck (the closest thing to lint):** `npm run check` (tsc, no emit). NOTE: this currently reports
  **pre-existing** type errors on `main` (e.g. in `server/storage.ts`, `server/vite.ts`); they do not block the
  app because dev runs through `tsx` (no typecheck). Do not assume you broke the build if `check` is red — compare
  against `main`.
- **Unit tests:** `npm test` (footer route coverage) and `npm run test:upsell-contract` (needs `DATABASE_URL` —
  `source /etc/profile.d/traveloure-dev.sh` or use a login shell).
- **E2E:** `npm run test:e2e` (Playwright) targets `http://localhost:5000`; needs the dev server running and
  Playwright browsers installed (`npx playwright install`), plus the seeded `*.traveloure.test` accounts.
- **Build (prod):** `npm run build` then `npm start`. For development always use `npm run dev`, not the prod build.
