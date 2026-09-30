# Handoff — pack session close-out (Sep 30, 2026)

The pack session is retired. The Track A session is now the sole merge driver and Golden Path builder. This file
records the state it inherited, as of the merge of #1189.

## State of `main` (head `2d32b5a`)

| Item | State |
|---|---|
| Track A A0–A5 | Merged. |
| Track A A6 | **HELD** (registry surface, coverage report, Tavily adapter). No code on any branch. Do not build. |
| Track A A7 | Not started. |
| Track A A8 | Design ruled in #1191 (R228, `2026-09-30-a8-travel-time-service`). Not implemented. |
| Track A A9 | Not started. |
| kyoto-slice | Required check. 30 passed, 8 fixme of 38. |
| Migrations | 333 on `main` and deployed. **334 on `main` (#1189), not yet deployed.** |
| Highest R-number | **R229.** |

## PRs merged at close-out

| PR | Title | Merge commit | R |
|---|---|---|---|
| #1190 | No invented AI-task scores; every draft generation writes its cost row | `24a4448` | R227 |
| #1191 | A8: one travel-time service ruled (design only) | `a60ee3a` | R228 |
| #1189 | Affiliate page extraction: Anthropic call, terms gate, product provenance (migration 334) | `2d32b5a` | R229 |

## WIP branches

#1192–#1196 were **closed without merging**, and their branches were kept. Each branch holds the uncommitted
worktree state of the pack session. **Delete them after the founder has reviewed them.**

| PR | Branch |
|---|---|
| #1192 | `wip/slip-funnel-events-doc` |
| #1193 | `wip/golden-path-trips-kyoto-doc` |
| #1194 | `wip/storefront-booking-actions-index` |
| #1195 | `wip/quotefee-index` |
| #1196 | `wip/platform-payment-failed` |

## Operator follow-ups (in order)

1. **Deploy `main` at `2d32b5a` or later.** It carries migration 334. Expect one unstamped `334_*`.
   - **Decline the platform's schema diff** (CLAUDE.md §20).
   - Publish. The boot runner applies 334.
   - Verify `GET /api/health` answers `migrations.current: true` and `migrations.lastApplied` = `334_affiliate_extract_provenance.sql`.
2. **Then revoke `XAI_API_KEY`.** Revoke it only after that deploy is live; before it, production still runs the grok-3 extractor.
3. **Then set `PLACE_FACTS_PLACES_ENABLED=1`.** The Places spine bills per call (LD 57 / R223).

## Ownership

**Track A session** (merges every PR, including Content & Signals'):
- `shared/experience-group.ts`, `shared/landing-*.ts`, `shared/city-events.ts`, `shared/partner-hosts.ts`, `shared/payment-on-record.ts`
- `server/services/trip-pass-line-coverage.service.ts`
- the Kyoto spec and `scripts/report-kyoto-supply.cjs`
- `docs/planning/track-a-rollout.md`
- `docs/DECISIONS.md` at merge

**Content & Signals session:**
- `server/services/trend-engine/*`
- `server/services/ai-generation.service.ts`
- the affiliate scraper
- `docs/planning/briefs/content-sources/*`

## Next for Track A

A8's travel-time service goes first, then A7 and A9. All three are built behind flags. A6 stays held, and R211 still
applies: nothing user-visible goes past the A1 gate until the census passes.

---

## Addendum — the pack session's own record (items d, e, h of the close-out ruling)

Written by the retiring pack session. It adds only what the section above does not already carry; where the two overlap, the section above governs.

### d. Lanes still open

| Lane | State | Blocked on / owner |
|---|---|---|
| **TravelPulse PR 2** (crowd band) and **PR 3** (weekly generator) | Not started | The BestTime / PredictHQ error text that `trend_source_config` records on the first daily ingestion after the post-#1189 deploy (PR 1, #1185, made each adapter record it). |
| **A6** — registry admin surface, coverage report, `TavilyExtractAdapter` | **ON HOLD** | The content-sourcing brief's four §11 decisions (decision-maker). |
| **Occasion draft party size** (found, not fixed) | For the **Content session** | `server/services/occasion-drafts.service.ts` `buildDraftSlip` sends `travelers: 2` to the model. It must read the party size from the plan (`trips.adults`/`kids`, LD 33), and say nothing when none is stated (RC-12) — never an invented 2. |
| **AI-stats "time saved"** (found, not fixed) | For the **Content session** | `GET /api/expert/ai-stats` (`server/routes.ts`) computes `timeSaved` as an assumed 10 minutes per completed task; `client/src/pages/expert/ai-assistant.tsx` shows it as fact. Hide the row, or label it "est.", until a real measure exists (§13). |
| **A8 implementation** | Design only | The A8 row + "A8 — the travel-time service" section in `docs/planning/track-a-rollout.md`. Sequencing: see "Next for Track A" above. |

### e. Content index

Committed under `docs/planning/briefs/content-sources/` (on `main`):

- `README.md` — what the three data files are; **no code reads them**; every row is `active = no`.
- `content_sources.seed.csv` — 34 candidate sources (incl. `google_routes`, added Sep 30).
- `provider_recruiting_sources.seed.csv` — 17 provider/expert recruiting sources.
- `traveloure-content-source-index.xlsx` — the workbook the CSVs came from.

**No A6 code exists on any branch.** Checked at close: every remote branch pushed in the last 20 days, diffed
against `main`, carries no file matching tavily / coverage-report / content-source / gap-dismiss / registry.
`TavilyExtractAdapter` appears only as a comment in `server/services/content-facts/source-adapter.ts` on `main`
("A6 builds …").

### h. Merge rules as they stand

- **§20 deploy rule** (CLAUDE.md §20): publish-time SQL is declined by default; the only approvable prompt is
  `ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX` `IF NOT EXISTS` matching a registered, declared, not-yet-stamped
  migration (a UNIQUE index only on a table the same prompt creates, or after a duplicates check). Production's
  migration state is read, never inferred.
- **R-number at merge** (ledger `2026-09-29-r-number-at-merge`): authors write `R?`. Last step before merge,
  after main is in: `node scripts/assign-r-numbers.cjs --write`, then
  `node scripts/check-decision-guards.cjs --require-assigned`, commit, let CI re-run.
- **`kyoto-slice` is a required check** (R203): every PR merges only with it green on the head.
- **One session per file area**: a file area is owned by one session at a time; a second session touching it
  waits or coordinates through the decision-maker.
- Standing: merge method `merge` with `expectedHeadSha`, every check green on the head, `origin/main` unmoved;
  never commit on `main`; a PR carrying a migration, money or Stripe change waits for an explicit ruling.
