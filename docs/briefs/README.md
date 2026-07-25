# Execution Briefs — protocol

These briefs exist so well-scoped tasks can be executed in **fresh, cheap-model sessions**
(Haiku / Sonnet) without losing the judgment already spent planning them. Each brief states the
model tier it was written for. The safety comes from the **fences**, not the executor: the
behavioral gate scripts, the CI guards, and CLAUDE.md's trap list convert executor mistakes into
mechanical red/green signals — so follow the gates exactly.

## How to execute a brief

1. **Read `CLAUDE.md` first** (the project instructions at repo root). It overrides everything,
   including these briefs. If a brief conflicts with CLAUDE.md, STOP and report the conflict.
2. Work on the branch the session designates (currently `claude/sync-local-repo-2j7ghv` unless
   told otherwise). Never push elsewhere.
3. Do ONLY what the brief scopes. Out-of-scope discoveries get **logged in the final report,
   not fixed**. Do not improvise architecture; if the brief's plan doesn't survive contact with
   the code, STOP and report — do not invent an alternative.
4. **Gates before every commit** (all must pass; report the numbers):
   - `npx tsc --noEmit 2>&1 | grep -c "error TS"` — must equal the baseline you measured BEFORE
     your first edit (pre-existing errors exist; your delta must be 0).
   - `npm run build`
   - `node scripts/check-money-endpoints.cjs`
   - `node scripts/check-unmounted-routers.cjs`
   - The brief's behavioral gate (a `scripts/verify-*.ts` run against a live local server + DB).
     A brief that changes behavior MUST extend its gate with assertions that fail on the old code.
5. **Money rules always apply** (CLAUDE.md §14/§15): amounts and acting identity derive
   server-side (session + stored rows), never `req.body`; anything that moves money or creates a
   purchase uses an atomic conditional `UPDATE … WHERE status = <expected>` plus a deterministic
   Stripe `idempotencyKey`. No fee literals — rates resolve from `fee_bands`/config (§8).
6. **Migrations**: only if the brief says so; always additive-nullable unless the brief says
   otherwise; file in `server/migrations/`, register in `server/migrations/migration-files.ts`.
7. Briefs marked **DECISION GATE** or **HUMAN READ** have a stop condition — respect it.

## Local verification environment

The gates need a running server + Postgres. If the environment doesn't have one:
Debian Postgres on port 5433, database `rmtest`, user/password `postgres`, then
`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rmtest SESSION_SECRET=dev
STRIPE_SECRET_KEY=sk_test_verifyonly npx tsx server/index.ts` (migrations run at startup).
A dummy Stripe key is expected — gates are written to treat Stripe failures honestly.

## Index

| # | Brief | Tier | Status |
|---|-------|------|--------|
| 01 | Ready-made refund reconciliation (persist outcome + admin view) | Sonnet | Ready |
| 02 | Old templates console run-out gating | Haiku | **DECISION GATE** (run-out unconfirmed) |
| 03 | `platform_revenue` on ready-made sales (+ reversal) | Sonnet | Ready — **HUMAN READ** before merge |
| 04 | Guest-invite A2/A3 (TripContext origin + invite-aware strip) | Sonnet | Ready |
| 05 | Provider Back-Office + Social Engine program | — | Phase 0 delivered (`docs/backoffice/`); **HARD STOP** awaiting roadmap approval |
| — | `trips.routes.ts` 57-handler auth reconciliation | **Fable/Opus only** | Not briefed — do NOT hand to a cheap model |
