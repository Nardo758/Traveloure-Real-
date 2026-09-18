# Lane report — `2026-09-17-ai-cost-actor-id`

**Ruling:** decision-maker, 2026-09-17. **Migration 310.** SCHEMA lane.
**Reads:** CLAUDE.md §20 (incl. the 2026-09-17 amendment), the "Replit deploy-push vs. our
migrations" CRITICAL block, LD 44 (f), LD 45 (3) / punchlist **D-47**, §13, §18 rule 1, §19.
**Branch:** `task-ai-cost-actor-id` off `origin/main` @ `8a880fd4e`.

---

## What was broken

`ai_cost_tracking.user_id` is a **uuid** column (`025b_ai_cost_tracking.sql`). `users.id` in this
codebase is a **varchar** (`DEFAULT gen_random_uuid()`). A normally-minted account happens to fit;
an OIDC/Replit subject, or any legacy row, does not — its INSERT raises `22P02
invalid_text_representation`. `trackAICost` swallows its own insert error **by design** ("logging
failures should not block the request"), so the **whole cost row vanished**: no row, no log anyone
reads, and an admin cost breakdown that totals less than the platform actually spent.

The READ had the same hole from the other side. `server/services/lead-routing.service.ts` compared
`user_id = <session id>`, which raises the same `22P02` for **exactly the accounts whose rows were
already missing** — into a non-fatal `catch` that logs a message nobody correlates.

The follow-up row this closes (filed by `2026-09-16-l16-lane1b-model-call`) proposed
`ALTER TABLE ai_cost_tracking ALTER COLUMN user_id TYPE varchar`. **That fix is refused.** A
declared type that no longer matches the live column is exactly the deploy-diff prompt CLAUDE.md
§20 rules is **DECLINED BY DEFAULT** — the publish-time drizzle push offers destructive SQL and, on
the same screen, "copy dev database over production". An `ADD COLUMN` has no such prompt.

## What landed

| Object | Shape |
|---|---|
| `server/migrations/310_ai_cost_tracking_actor_id.sql` | `ALTER TABLE ai_cost_tracking ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255);` + a `COMMENT ON COLUMN`. Additive, **NULLABLE, NO DEFAULT, NO DB CHECK, NO INDEX, NO BACKFILL.** |
| `server/migrations/migration-files.ts` | registered after `309`, with the reason and the refused alternative. |
| `shared/schema.ts` | `actorId: varchar("actor_id", { length: 255 })` on the existing `aiCostTracking` declaration (deploy-push durability rule). The table itself was already declared on `main`; this lane added the one column. |
| `server/services/ai-cost-tracker.ts` | the ONE writer: `actor_id` always, `user_id` only when `fitsUuidColumn`. `logger.warn` on a failed insert. Exports `aiCostActorMatchesSql`. |
| `server/services/lead-routing.service.ts` | the admin cost breakdown filters through that one expression. |
| `scripts/preview-ai-cost-tracking-shape.cjs` | read-only pre-publish instrument, `--self-test` + `--json`. |
| `server/__tests__/ai-cost-attribution.db.test.ts` | W1–W7. |
| `.github/workflows/ai-cost-attribution-gate.yml` | its own Postgres job; migrations from EMPTY, the preview's self-test, the preview against that DB, the suite, and a re-run no-op. |

### The exact declared shape

```
ai_cost_tracking
  id           uuid                         NOT NULL  DEFAULT gen_random_uuid()
  source_type  character varying(50)        NOT NULL
  model_used   character varying(100)       NULL
  request_id   character varying(255)       NULL
  actor_id     character varying(255)       NULL                  ← migration 310
  user_id      uuid                         NULL                  ← unchanged, keeps its type
  cost         numeric(10,6)                NOT NULL
  tokens_in    integer                      NULL
  tokens_out   integer                      NULL
  created_at   timestamp without time zone  NOT NULL  DEFAULT now()
  updated_at   timestamp without time zone  NOT NULL  DEFAULT now()

indexes: ai_cost_tracking_pkey
         idx_ai_cost_tracking_source_type_created  (source_type, created_at DESC)
         idx_ai_cost_tracking_user_id_created      (user_id,     created_at DESC)
no CHECK constraints
```

`ADD COLUMN` appends, so on a database that already held rows `actor_id` is physically the LAST
column while the declaration lists it beside `user_id`. Ordinal position is not something the push
acts on, and the preview script compares by NAME for that reason.

### Why NO index

The one reader that filters by an actor filters on the **expression**
`COALESCE(actor_id, user_id::text)`, which a plain btree on `actor_id` cannot serve — it would be
dead weight the publish-time push has to keep agreeing about. An **expression** index would serve
it, and is refused for a different reason: this very table was bitten on Jul 30 2026 by an index
whose declared form and pushed form disagreed by one detail (drizzle's bare `.desc()` emits
`DESC NULLS LAST`), making the push plan `DROP INDEX` + `CREATE INDEX` on **every single publish**.
The reader is a non-fatal ops lookup over a 5-minute window. If it becomes hot, an index is its own
lane with its own measurement.

## Before publishing

```
node scripts/preview-ai-cost-tracking-shape.cjs "<PROD_DATABASE_URL>"
```

Read-only (`SET TRANSACTION READ ONLY`; no INSERT/UPDATE/DELETE/ALTER in the file). It prints every
column and index difference between `shared/schema.ts` and that database.

* **exit 0, "the single difference is the missing `actor_id`"** — publishable. The deploy push must
  offer **exactly** `ALTER TABLE ai_cost_tracking ADD COLUMN actor_id varchar(255);` and nothing
  else.
* **exit 0, "NO DIFFERENCES"** — 310 has already applied there; the push should propose nothing.
* **exit 1** — an UNEXPECTED difference. **DECLINE the deploy SQL (§20)** and escalate: the
  declaration is wrong, not production. A column or index the database has and `schema.ts` does not
  declare is one the push will DROP, permanently.
* **exit 2** — could not connect/query, or **the table is ABSENT**, which is the loss itself, not a
  clean slate. Never a pass.

`--self-test` (no database) proves only that the script's expectation table has not drifted from
the declaration; `--json` prints the same findings machine-readably.

## Proofs — `server/__tests__/ai-cost-attribution.db.test.ts`, 7/7

* **W1** a non-uuid actor writes ONE row, `actor_id` verbatim, `user_id` NULL — with the negative
  beside it: the same id handed to `user_id` still raises `22P02`, so W1 proves the fix and not a
  change of mind about Postgres.
* **W2** a uuid actor writes BOTH, equal — nothing regresses for the accounts that already worked.
* **W3** §13 — no actor ⇒ both NULL. The spend is still recorded; the attribution is not invented.
* **W4** ONE expression attributes the pre-310 row (nothing backfilled), the uuid row and the
  non-uuid row, and attributes a stranger nothing. The non-uuid probe no longer raises.
* **W5** static one-writer pin over `server/` and `shared/`.
* **W6** D-47's three values through the REAL `createProposalFromAsk` (model stubbed, `trackCost`
  NOT injected) for a **non-uuid asker** — the call that before 310 wrote nothing at all.
* **W7** the live column matches the declaration (type, length, NULLABLE, no default), the index set
  is exactly 025b's two plus the primary key, and the table carries no CHECK.

## Validation

tsc `129` = baseline · `npm run build` OK · `check-decision-guards` OK · `check-money-endpoints`
`--self-test` (37 fixtures) + scan exit 0 · `phase2-fee-gate.sh` exit 0 ·
`check-test-files-wired --self-test` 12/12 + `test-orphan-ratchet: OK` (baseline untouched, 33) ·
`check-duplicate-migration-prefixes` OK (310 registry entries) · `check-undeclared-tables` OK
(305/305) · chain-integrity 2/2 · **migrations 001→310 from EMPTY on a local Postgres, then a
re-run no-op (0 newly applied, 310 recorded)** · the shape preview reports **ZERO diff** against
that database · new suite 7/7 · neighbours `ai-ask-create-rail.db` 13/13 and
`ai-ask-create-rail` + `booking-verification` 48/48 · `grep -c replit.local package-lock.json` = 0.
No CHECK added or changed ⇒ `preflight-prod-constraints.cjs` needs no `CONSTRAINT_MANIFEST` entry
(and that script has no `--self-test` mode).

## Left, named

* **How much spend was lost before 310 is unanswerable**, not unfinished: a row that was never
  written leaves nothing to count (§13). No estimate was invented. The writer's new `logger.warn`
  is the forward-looking answer.
* **Nothing else filters by actor.** `getCostStats` aggregates by `source_type` only and was not
  touched; `lead-routing.service.ts` is the single actor-filtering reader on `main`.
* **The `logger.warn` reaching an operator is not asserted** — a log line's delivery is not a thing
  CI can prove. W1's negative proves the condition that triggers it.
* **No new reader, surface, route or read exposure.** `actor_id` is written and read only by the
  two files above; no API payload carries it.
