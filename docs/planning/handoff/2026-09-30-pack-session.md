# Pack session handoff — 2026-09-30

The "pack" session (Track A, TravelPulse hygiene, xAI retirement, content facts) is retired on this date and
split into two sessions. This file is the whole state it hands over. Everything below was read from `main`,
the open PR list and the local worktrees at close; nothing is inferred.

## a. Track A status

Spec: `docs/planning/track-a-rollout.md`. Acceptance spec:
`playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts`, run by the required `kyoto-slice` check.

| Step | State | Where |
|---|---|---|
| A0 — prerequisites | **Merged** (the spec and its gate: #1161). Its supply/operator halves (a1–a3 census, the deploy, the Part 6 sessions) are operator facts, not code — see the step's own status line in the rollout doc. | #1161 |
| A1 — the Trips frame | **Merged** | #1176 |
| A2 — Kyoto travel-time matrix | **Merged**, plus the daily refresh schedule | #1178, #1186 |
| A3 — anchor question + option sets | **Merged** (two lanes) | #1179, #1180 |
| A4 — plan-fit in the compare view | **Merged** | #1182 |
| A5 — free draft around the open set + content facts layer | **Merged** (migration 333) | #1184 at `417261af` |
| A6 — gaps and suggestions (Trips) | **Held** — pending the four content-sourcing-brief decisions (§11). No code on any branch (see e). | — |
| A7 — the paid run, one version per hotel | **Not started** | — |
| A8 — choose, finalize, book, cancel | **Design only.** The travel-time-service ruling and the §7 agreement test are recorded in the A8 row (R228, #1191). No implementation branch. | #1191 (docs) |
| A9 — run records and history | **Not started** | — |

Also merged on the Track A path: the expert door (#1183), TravelPulse PR 1 hygiene (#1185), the content-source
index (#1187), the xAI retirement (#1188).

**`kyoto-slice` on `main`** (last recorded run, `5cea8f6e`, run 36679796102): **38 tests — 30 passed, 8
skipped** (the skipped are the `test.fixme` steps that wait on A6–A9). The merges after it (#1190, #1191,
#1189, this handoff) touch no Kyoto path; the required check re-runs on each and was green on every head.

## b. The three merges that closed this session

| PR | Lane | Merged head (PR) | Merge commit on main | Ledger |
|---|---|---|---|---|
| #1190 | AI-task scores + draft cost rows | `b5344060` | `24a44482` | **R227** `2026-09-30-ai-task-honest-numbers` |
| #1191 | A8 doc amendment (travel-time service) | `5dbc840b` | `a60ee3a8` | **R228** `2026-09-30-a8-travel-time-service` |
| #1189 | Affiliate page-extract compliance (migration 334) | `b5f09006` | `2d32b5ab` (merged by the repo owner) | **R229** `2026-09-30-affiliate-extract-compliant` |

Highest R in `docs/DECISIONS.md` at close: **R229**. (Earlier today: #1188 → R226, merge `5cea8f6e`.)

## c. Lanes closed by this session

- **Scraper compliance** (#1189) — extraction on the Anthropic client, cost-tracked to the admin; per-partner
  `page_extract_permitted` + `terms_checked_at` gate (default off); `affiliate_products.source` provenance;
  CLAUDE.md LD 58.
- **AI-task scores + cost rows** (#1190) — random `confidence`/`qualityScore` writers deleted and projected
  null on read; every draft generation writes its `ai_cost_tracking` row from the one generator.
- **A8 doc amendment** (#1191) — one travel-time service ruled, built in A8; §7 acceptance added.
- Earlier the same day: xAI retirement (#1188, R226), matrix daily schedule (#1186), content-source index
  (#1187).

## d. Lanes still open

| Lane | State | Blocked on / owner |
|---|---|---|
| **TravelPulse PR 2** (crowd band) and **PR 3** (weekly generator) | Not started | The BestTime / PredictHQ error text that `trend_source_config` records on the first daily ingestion after the post-#1189 deploy (PR 1, #1185, made each adapter record it). |
| **A6** — registry admin surface, coverage report, `TavilyExtractAdapter` | **ON HOLD** | The content-sourcing brief's four §11 decisions (decision-maker). |
| **Occasion draft party size** (found, not fixed) | For the **Content session** | `server/services/occasion-drafts.service.ts` `buildDraftSlip` sends `travelers: 2` to the model. It must read the party size from the plan (`trips.adults`/`kids`, LD 33), and say nothing when none is stated (RC-12) — never an invented 2. |
| **AI-stats "time saved"** (found, not fixed) | For the **Content session** | `GET /api/expert/ai-stats` (`server/routes.ts`) computes `timeSaved` as an assumed 10 minutes per completed task; `client/src/pages/expert/ai-assistant.tsx` shows it as fact. Hide the row, or label it "est.", until a real measure exists (§13). |
| **A8 implementation** | Design only | The A8 row + "A8 — the travel-time service" section in `docs/planning/track-a-rollout.md`. Starts after A7 per the rollout order. |

## e. Content index

Committed under `docs/planning/briefs/content-sources/` (on `main`):

- `README.md` — what the three data files are; **no code reads them**; every row is `active = no`.
- `content_sources.seed.csv` — 34 candidate sources (incl. `google_routes`, added Sep 30).
- `provider_recruiting_sources.seed.csv` — 17 provider/expert recruiting sources.
- `traveloure-content-source-index.xlsx` — the workbook the CSVs came from.

**No A6 code exists on any branch.** Checked at close: every remote branch pushed in the last 20 days, diffed
against `main`, carries no file matching tavily / coverage-report / content-source / gap-dismiss / registry.
`TavilyExtractAdapter` appears only as a comment in `server/services/content-facts/source-adapter.ts` on `main`
("A6 builds …").

## f. Operator follow-ups (in order)

1. **Deploy `main` at the post-#1189 head** (`2d32b5ab` or later). It carries **migration 334**
   (`334_affiliate_extract_provenance.sql`: three additive nullable columns). Expect `334_*` to be the one
   unstamped migration. If the publish prompt offers SQL, it may be approved only under §20's carve-out (every
   statement an `ADD COLUMN IF NOT EXISTS` matching 334); otherwise **decline the platform diff** — boot applies
   334 a minute later. Verify `/api/health` → `migrations.lastApplied: 334`.
2. **Then revoke `XAI_API_KEY`.** Not before: until that deploy is live, production still runs the old grok-3
   extractor. After it, nothing under `server/` reads the key (the remaining mentions are inert CI stub env
   lines, the `.replit` `javascript_xai` integration entry and old docs).
3. **`PLACE_FACTS_PLACES_ENABLED=1`** once migration 333 is confirmed on production (`lastApplied` ≥ 333). The
   first daily ingestion after that deploy records the BestTime / PredictHQ error text TravelPulse PR 2/3 wait on.

## g. Do-not-touch list

At close there are **no open PRs** other than this handoff's own. No file is owned by an open PR. The `wip/*`
branches in (i) are unreviewed snapshots — not owners of anything, not for merge.

## h. Merge rules as they stand

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

## i. Uncommitted worktree state, preserved

Each was committed as found (`git add -A`) to its own `wip/` branch and pushed. None is reviewed or for merge;
the two "index" snapshots are stale index states (mostly staged deletions against a newer `main`), kept only so
nothing is lost.

| Branch | Commit | From worktree | Contents |
|---|---|---|---|
| `wip/storefront-booking-actions-index` | `4c738278` | `claude/storefront-booking-actions` | 123 files, stale index (30k deletions) |
| `wip/golden-path-trips-kyoto-doc` | `dbd6a91c` | agent worktree off `c99acfa8` | `docs/planning/golden-path-trips-kyoto.md` — an older draft, differs from `main` |
| `wip/slip-funnel-events-doc` | `0e5bf55a` | agent worktree off `c99acfa8` | `docs/planning/slip-funnel-events.md` — an older draft, differs from `main` |
| `wip/platform-payment-failed` | `9e204a5f` | `claude/platform-payment-failed` | 4 files (checkout-claim / email service + two tests), differs from `main` — the R161/R162 lanes merged separately |
| `wip/quotefee-index` | `d2c9f645` | `claude/lucid-galileo-hu7vgw` (`/home/user/tv-quotefee`) | 451 files, stale index (57k deletions) |
