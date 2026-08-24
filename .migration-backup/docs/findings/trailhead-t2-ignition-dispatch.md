# ⚑ Operation Trailhead — T2.3 Kyoto Ignition Dispatch (Replit hand-off)

**Status: NOT EXECUTED. This is the paste-ready runbook for Leon to run on Replit (which has a DB + Tavily egress). Nothing below has been run by the build lane — no scraper, no DB write, no flag flip.**

Gating: this is a HARD STOP. Do not proceed past a step whose check fails. `DMO_INGEST_ENABLED` is flipped **only** inside step 4 of this dispatch, Kyoto-scoped, by Leon.

---

## 0. Pre-flight — Tavily spend vs the $150 hard cap (R-T1-c)

The discovery ceiling is a config constant, not a literal:
`TAVILY_MONTHLY_CAP_USD = 150` — `server/config/trailhead.config.ts`.
Per-search price assumption (verify against the live Tavily dashboard before running):
`TAVILY_PRICE_PER_SEARCH_USD = 0.008` — same file (basic-depth search = 1 credit; $8 / 1000 credits).

**What the ignition batch actually calls (counted from code, not estimated):**

| Stage | Calls | Source of truth |
|---|---|---|
| Slot-derived gap discovery (Tavily `search`, basic) | **9 queries** | `KYOTO_CONTENT_PLAN` discoveryQueries in `server/services/content-gap-taxonomy.ts` — attraction 2, venue 2, restaurant 2, event 2, destination 1 |
| Heritage-stub enrichment (Tavily `search` + `extract`, per seeded site) | **10 sites × 2 = 20 calls** | `ingestKyotoHeritage` in `server/services/dmo-ingestion.service.ts` (10 seeded UNESCO stubs; 1 discover + 1 extract each) |
| Headroom for retries / extra gap results | ≤ ~11 | pacing + maxResults ≤ 8 per search |
| **Upper-bound total** | **≤ ~40 Tavily credits for the whole ignition** | — |

**Arithmetic (paste to confirm before running):**

```
per-search price      = TAVILY_PRICE_PER_SEARCH_USD = $0.008   (config, verify on dashboard)
ignition upper bound  = 40 credits
ignition cost         = 40 × $0.008 = $0.32
monthly cap           = TAVILY_MONTHLY_CAP_USD = $150.00
headroom              = $150.00 − $0.32 = $149.68   (ignition uses ~0.2% of the cap)
R-T1-c expectation    = "Kyoto batch expected well under $50"  ✔ ($0.32 ≪ $50)
```

If the live dashboard price differs from `$0.008`, recompute here before proceeding; if the recomputed batch cost ever approaches `$50`, STOP and escalate — do not silently exceed R-T1-c's expectation. The $150 cap is **Leon-only** and enforced by watching the Tavily dashboard (there is no in-code $ meter on Tavily — see step 3).

---

## 1. Apply the source registry (idempotent, no scrape)

```bash
# Seeds/updates dmo_sources rows. Idempotent (domain,market) upsert. No egress, no scrape.
tsx server/seeds/dmo-sources.seed.ts
tsx server/seeds/dmo-anchor-registry-sync.seed.ts   # T2.2 — Kyoto anchor enriched; 7 markets born inert/unverified
tsx server/seeds/dmo-kyoto-heritage.seed.ts         # 10 born-hidden Kyoto heritage stubs (if not already seeded)
```

Expected: `dmo-anchor-registry-sync` prints `upserted 7 anchor sources (1 live, 6 born-unverified/inert)`.
The six unverified rows (including the four primary city-DMO portals) stay `is_active=false` until a human verifies the URL — they do **not** participate in the Kyoto ignition.

**Verify the four unverified DMO URLs now** (registry T0 item), by hand, in a browser, before ever activating them:
`bogota.gov.co`, `cartagenadeindias.travel`, `mtdc.co`, `tourism.rajasthan.gov.in`. These are the seven-market staging, NOT Kyoto — leave them inert regardless; verifying them is prep for a future market ignition, not this one.

Confirm Kyoto's live source is present and active:

```sql
SELECT id, domain, source_type, is_active FROM dmo_sources WHERE market = 'japan' AND is_active = true;
-- expect dmo-jp-kyoto-travel (kyoto.travel), plus the existing committed JP sources.
```

## 2. Confirm the slot-derived plan the batch will run

```bash
# Optional read-only sanity print of the plan/diff (pure, no DB, no egress):
tsx -e "import('./server/services/content-gap-taxonomy').then(m=>{console.log(JSON.stringify(m.KYOTO_CONTENT_PLAN,null,2))})"
```

Expect the 5 Kyoto content types with targets attraction 15 / venue 12 / restaurant 12 / event 10 / destination 8 (= 57), each carrying its DMO source id + discovery queries. This hand-set plan is authoritative for Kyoto (the derived browsable-minimum is diffed against it in T2.4, never applied).

## 3. Confirm per-pass cost tracking exists (cite the code)

- **Extraction stage (Anthropic place-extraction) IS metered per call** →
  `server/services/dmo-place-extraction.service.ts:220` calls
  `trackAICost({ sourceType: "dmo_extract_places", modelUsed: "claude-sonnet-4-5", costUsd: calculateAnthropicCost(inputTokens, outputTokens), … })`,
  writing a row into `ai_cost_tracking` (`server/services/ai-cost-tracker.ts`; table `025b_ai_cost_tracking.sql`, declared in `shared/schema.ts` per the publish-trap rule). The admin cost breakdown (`lead-routing.service.ts`) reads it.
  Confirm rows land after the run:
  ```sql
  SELECT source_type, count(*), round(sum(cost)::numeric, 4) AS cost_usd
  FROM ai_cost_tracking WHERE source_type = 'dmo_extract_places'
    AND created_at > NOW() - INTERVAL '1 hour' GROUP BY 1;
  ```
- **Tavily discovery/scrape spend is NOT metered in code to `ai_cost_tracking`.** Only call VOLUME is durably recorded — `recordGapFill(...)` (`dmo-ingestion.service.ts:327` → `optimizer-gap-ledger.service`) — plus console logs. So the $150 Tavily cap (R-T1-c) is enforced **Leon-side, by the Tavily dashboard**, which is consistent with R-T1-c being "Leon-only". ⚠️ **FLAG for the orchestrator:** if the decision-maker wants the Tavily $ spend metered in-code (a `sourceType:"dmo_tavily_discovery"` row per pass, mirroring the extraction meter), that is a small follow-up — filed, not built in T2 (it would touch `dmo-ingestion.service.ts`, a file this lane is otherwise not modifying, and the sibling T4 lane is active there).

## 4. Ignite — Kyoto-scoped, DMO_INGEST_ENABLED flip (the ONE flag flip in this whole lane)

```bash
# Leon sets these in the Replit deploy environment (NOT committed):
export TAVILY_API_KEY=<leon's key>     # gates all ingestion; no key ⇒ zero writes (§13)
export DMO_INGEST_ENABLED=1            # D3 opt-in — controls automatic Tavily spend; Kyoto-scoped by code
```

`DMO_INGEST_ENABLED` is read only by `dmo-ingest-scheduler.service.ts` (daily auto-pass) — the pipeline is Kyoto-only by construction (`GAP_CITY = "Kyoto"`, `ingestKyotoHeritage`/`ingestKyotoContentGaps`). No other market ignites (R-T1-b/-d: the seven staged plans are inert config, no ignition flag set).

## 5. Run the slot-derived batch (born-hidden stubs)

Run the on-demand admin trigger (runs the same pass regardless of the scheduler flag), or invoke the services directly:

```bash
# On-demand: POST /api/admin/dmo/ingest-kyoto  (blanket-guarded admin route, §2)
# It runs ingestKyotoHeritage (enrich the 10 heritage stubs) + the gap-fill pass.
tsx -e "import('./server/services/dmo-ingestion.service').then(async m=>{ \
  console.log('heritage:', await m.ingestKyotoHeritage()); \
  console.log('gapfill:', await m.ingestKyotoContentGaps()); \
})"
```

Every row created/enriched here is **born-hidden** by construction:
`status='pending_expert_review'`, `expert_workspace_visible=false`, `discover_page_visible=false`
(seed: `dmo-kyoto-heritage.seed.ts`; gap-fill: `dmo-ingestion.service.ts` insert block). Extraction (step 3) promotes nothing to travelers — it only fills `dmo_extracted_places` child rows.

## 6. PROVE zero traveler-visible rows after the run (the hard gate)

```sql
-- Born-hidden invariant: NO Kyoto DMO row may be traveler-visible after ignition.
SELECT
  count(*)                                             AS total_kyoto_rows,
  count(*) FILTER (WHERE discover_page_visible = true) AS traveler_visible,
  count(*) FILTER (WHERE expert_workspace_visible = true) AS workspace_visible,
  count(*) FILTER (WHERE status = 'published')          AS published
FROM dmo_raw_content
WHERE city = 'Kyoto';
```

**PASS iff `traveler_visible = 0` AND `published = 0`.** (T4 builds the read-path + publish gate separately; nothing in T2 may surface a row.) If either is non-zero, STOP — a born-hidden invariant has been violated; do not let travelers see un-reviewed scraped content. `workspace_visible` may be > 0 only after an admin intake-approves rows into the expert library (the "B" gate) — that is a deliberate human action, not an ignition side effect.

## 7. Fill the T2.4 batch-review pack (the next HARD STOP)

Populate `docs/findings/trailhead-t2-batch-review.md` from this run's numbers (per-category scraped-vs-target, 10-stub extraction-quality sample, cost actuals, duplicate/junk rate, the Kyoto plan diff, and the Edinburgh-promotion recommendation). Leon reviews it before any expert-intake or any second-market discussion. Edinburgh is promoted ONLY by that evidence (R-T1-b), never by schedule.
