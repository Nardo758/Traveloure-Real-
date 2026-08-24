# AGENTS.md

Architectural decisions, invariants, and product intent live in `CLAUDE.md` (root) — read it before changing
schema, routing, fees, migrations, or approval flows. This file only carries operational setup guidance for
Cursor Cloud agents.

## Cursor Cloud specific instructions

This is a single full-stack TypeScript app (`rest-express`): an Express API + Vite/React SPA served together on
**one port (5000)**, backed by **PostgreSQL 16** (Drizzle ORM). `npm run dev` runs migrations + data seeding on
boot, then serves both the API and the frontend. There is no separate frontend server, no Redis/queue, and no
Docker for the root app (the `attached_assets/*` Dockerfiles belong to unrelated legacy reference projects).

### Environment already provisioned on the VM (persists via snapshot)
- **PostgreSQL 16** is installed locally. DB `traveloure`, role `traveloure` (password `traveloure`, superuser).
- Env vars are exported from `~/.bashrc` (the server does **NOT** load a `.env` file, so vars must live in the
  shell): `DATABASE_URL`, `SESSION_SECRET`, and placeholder `STRIPE_SECRET_KEY`/`AMADEUS_API_KEY`/`AMADEUS_API_SECRET`.
- The `npm install` update script refreshes dependencies on startup. `node_modules` is not snapshotted reliably;
  if imports fail, run `npm install`.

### Starting services (do this at the start of a session)
- **Postgres may be down on a fresh pod** (no init system auto-starts it). Start it with:
  `sudo pg_ctlcluster 16 main start` (check with `pg_lsclusters`). The seeded data directory persists in the snapshot.
- **Run the app:** `npm run dev` (from `/workspace`, in a tmux session). It listens on `http://localhost:5000`.
  Migrations and seeds run automatically at boot — a fresh DB is fully re-seeded.
- Confirm health: `curl localhost:5000/api/health` (200) and `curl localhost:5000/api/ready` (JSON of per-service
  status; `fail`/`warn` entries for XAI/Anthropic/Stripe-webhook/Resend are expected when those keys are absent).

### Non-obvious startup gotchas
- **Hard startup requirements beyond the DB:** the server throws at import if `STRIPE_SECRET_KEY` is missing (must
  be `sk_test_...` outside prod) and if `AMADEUS_API_KEY`/`AMADEUS_API_SECRET` are missing (SDK client constructed
  at module load). Placeholders in `~/.bashrc` let it boot. **To exercise real Stripe payment flows or Amadeus
  flight/hotel search, replace the placeholders with real test credentials** (add them as Secrets).
- **AI features are off without keys.** `XAI_API_KEY`/`GROK_API_KEY` (itinerary generation, TravelPulse) and
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
- **Unit tests:** `npm test` (footer route coverage) and `npm run test:upsell-contract` (needs `DATABASE_URL` set —
  source `~/.bashrc` first).
- **E2E:** `npm run test:e2e` (Playwright) targets `http://localhost:5000`; needs the dev server running and
  Playwright browsers installed (`npx playwright install`), plus the seeded `*.traveloure.test` accounts.
- **Build (prod):** `npm run build` then `npm start`. For development always use `npm run dev`, not the prod build.
