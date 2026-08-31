# Scheduler Reliability — Phase 0 Audit (read-only)

**Lane:** `scheduler-reliability` (Lane 1, issue #1712) · **as-of** `c757678c`
**Author:** Claude Code · **Status:** HARD STOP — awaiting ratification of the conversion set

> This is the read-only classification the dispatch's first hard stop calls for. Nothing here is
> built. The build (internal routes + cron workflow + idempotency proofs) does not start until the
> decision-maker ratifies **which jobs convert** and the per-job in-process-timer disposition.

---

## The problem, restated from evidence

The app runs on Replit **Autoscale**, which scales the instance to zero between requests. An
in-process `setInterval` only fires while an instance happens to be warm, so **~24 scheduled passes
across ~20 jobs are unreliable by construction** — the daily/hourly ones may not fire for long
stretches, and the only passes that reliably run are the *delayed first passes* fired on every cold
boot.

Those boot-time first passes are themselves the second half of the problem. All background work
shares **one connection pool** with request handlers:

- `server/db.ts:13` — `new Pool({ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })`.
- There is **no dedicated background pool**. Every scheduler's `db`/`pool` is the same 20-slot pool
  the HTTP path uses.
- `runBackgroundJob` (`server/services/background-job-runner.ts`) caps *background* concurrency at
  `MAX_CONCURRENT_BACKGROUND_JOBS = 4` and skips overlapping same-name passes — but **several jobs
  bypass it** and call the DB directly: `stripe-connect-reminder`, `fx-rate-refresh`,
  `travelpulse-demand-refresh`. Those are not counted against the cap.

On a cold boot the seeding pipeline (`runDatabaseSeeding` + `grokDiscoveryService.backfillGemPhotos`)
and a staggered herd of scheduler first passes (2/3/5-min offsets) all contend for the 20 slots
against incoming traffic. When the pool is saturated, `connectionTimeoutMillis: 5000` makes an
acquire wait 5s and then throw **"timeout exceeded when trying to connect"**.

**This single root cause explains all four production sightings:**

| Sighting | Mechanism |
|---|---|
| earnings-release timeout | `earnings-release` first pass (2 min) waits >5s for a pool slot at boot |
| auto-complete DB error | `booking-auto-completion` first pass (3 min) same contention / transient connection error |
| health-check 500 bursts | `checkDatabase()` (`server/infrastructure/health.ts:29`) runs `pool.query("SELECT 1")` on the same pool; when saturated it hits the 5s connect timeout → `unhealthy`. Pool health degrades at `waitingCount > 5` (`health.ts:53`). The bursts *are* the pool telling you it is exhausted. |
| seed connection timeout | seeding competes with the first-pass herd for the same 20 slots |

**Is the timeout a pool-exhaustion symptom? Yes.** The pool is shared, small (20), and has a short
5s connect timeout; the health router's own DB probe uses it and reports `degraded`/`unhealthy` off
`waitingCount`/utilization. The timeouts are the acquire-wait exceeding 5s under contention, not slow
queries.

**Why conversion helps twice.** Moving MONEY/INTEGRITY jobs to an idempotent internal endpoint fired
by an external cron (the ratified occasions pattern) (a) makes them *actually run* on Autoscale, and
(b) removes their delayed-first-pass from the boot herd, cutting pool contention at exactly the
moment the four sightings occur.

---

## The proven pattern (reference)

`POST /internal/run-occasion-drafts` (`server/routes/internal.routes.ts`) + `.github/workflows/occasion-drafts-daily.yml`:

- Auth: shared secret `INTERNAL_JOB_SECRET`, read from `x-internal-secret` header **or** `Authorization: Bearer`, compared with `crypto.timingSafeEqual`. 503 when the secret is unset, 401 on mismatch.
- Workflow: `curl -sf`-style POST to `https://www.traveloure.com/internal/...`, fails visibly on non-200 / curl error, `timeout-minutes` set.
- Idempotent by a ledger, so the endpoint and the in-process defense-in-depth timer firing in the same window produce exactly one effect.

**Leon's ops row — verified, not assumed:** `INTERNAL_JOB_SECRET` is already referenced by
`occasion-drafts-daily.yml`, `persona-nightly.yml`, and `walkthrough-weekly.yml`, so the GitHub
Actions secret is already configured for this repo. New workflows reuse it as-is.

---

## Full job inventory & classification

Cadence key: the interval of the recurring `setInterval` (first pass is always delayed). "Idempotent
today?" is assessed against double-fire (retry/overlap) **and** the atomic-conditional / dedupe
guarantees documented in each file.

### MONEY (and money-adjacent)

| # | Job (`runBackgroundJob` name) | What it does | Location | Cadence | Idempotent today? | If it double-fires | If it never fires for a week | Convert? |
|---|---|---|---|---|---|---|---|---|
| 1 | `earnings-release` | Flips matured earnings `held → releasable` (atomic conditional `releaseMaturedEarnings`) | `earnings-release-scheduler.service.ts:40` | hourly | **Yes** — atomic `UPDATE … WHERE`; 2nd pass matches nothing | Safe no-op | Matured earnings never become releasable → **payouts stall** (money owed, not paid) | **YES (Tier 1)** |
| 2 | `booking-auto-completion` | Flips paid `confirmed → completed`, **mints held earnings**; payment-gated against Stripe; Pass-2 ledger heal | `index.ts:704` → `jobs/bookingAutoCompletion.ts` | hourly | **Yes** — atomic conditional flip + DB-guarded idempotent mint (migration 203) | Safe — one flip, one mint, one diary row | Bookings never complete → **earners never credited**, revenue never recognized, payouts stall | **YES (Tier 1 — the critical one)** |
| 3 | `stripe-reconciliation` | Daily Stripe-vs-DB **drift detector**; append-only exception rows; one narrow late-promote via shared `promotePaidCheckout` | `index.ts:647` → `jobs/stripeReconciliation.ts` | 24h | **Yes** — `dedupe_key` + `ON CONFLICT DO NOTHING`; promote is atomic | Safe | **Money-vs-DB drift invisible for a week** (detection is the only eye on cart-rail drift) | **YES (Tier 1)** |
| 4 | `checkout-sweep` | Voids un-authorized checkout claims after TTL, reclaims slot capacity; never voids a row with a live PI | `checkout-claim.service.ts:1234` | (see file) | **Yes** — atomic conditionals on the provisional predicate (§15b) | Safe — void and promote can't both win | Abandoned claims never reclaimed → **slot inventory leaks** (`booked_count` stuck), provisional bookings linger | **YES (Tier 1 — money-safety spine)** |
| 5 | `partnerize-report-poll` | Pulls commission reports, auto-matches against `affiliate_earnings` | `cache-scheduler.service.ts:111` | (report interval) | **Yes** — `matchRecords` idempotent for matched rows | Safe | Affiliate commissions unmatched → payout reconciliation stalls | **Recommend YES (Tier 1, lower priority)** — but see Lane 4 (Partnerize 404: possibly misconfigured URL) |
| 6 | `travelpayouts-report-poll` | Same, Travelpayouts/WeGoTrip action rows | `cache-scheduler.service.ts:129` | (report interval) | **Yes** — same | Safe | Same as #5 | **Recommend YES (Tier 1, lower priority)** |

### INTEGRITY

| # | Job | What it does | Location | Cadence | Idempotent today? | If double-fires | If never fires for a week | Convert? |
|---|---|---|---|---|---|---|---|---|
| 7 | `availability-materialization` | Extends rolling 60-day availability horizon (ADD-ONLY, `ON CONFLICT DO NOTHING`) | `index.ts:657` → `jobs/availabilityMaterializationSweep.ts` | 24h | **Yes** | Safe | Availability window shrinks toward today → **future slots stop being bookable** | **YES (Tier 2)** |
| 8 | `booking-expiry` | Auto-cancels stale `pending_payment` **legacy** bookings (>48h) | `booking-expiry-scheduler.service.ts:43` | 4h | **Yes** — atomic `UPDATE … WHERE status='pending_payment'` | Safe | Stale unpaid legacy bookings linger uncancelled (no money moved) | **YES (Tier 2, low urgency)** |
| 9 | `itinerary-generation-sweep` | Flips orphaned paid `generating → failed` so paid travelers aren't stuck on an infinite spinner | `itinerary-generation-sweep-scheduler.service.ts:67` | **5 min** | **Yes** — atomic conditional | Safe | **Paid travelers stuck on infinite spinner** | Convert **as coarse backstop only** — needs low latency; keep in-process as primary (see cadence note) |
| 10 | `email-outbox` | Drains/retries the email outbox (incl. **booking-confirmation emails**) | `email-outbox.service.ts:354` | **5 min** | Assumed yes (claim-on-drain) — **verify in build** | Depends on drain claim | **Queued emails never sent** (confirmations, etc.) | Convert **as coarse backstop only** — latency-sensitive; keep in-process primary |
| 11 | `fx-rate-refresh` | Upserts FX fallback rates from Frankfurter (daily) | `fx-rate-refresh.service.ts:59` | daily | **Yes** — upsert | Safe | FX **fallback** rates go stale (live path still primary) | Optional (Tier 3) |

### COSMETIC / ops / content

| # | Job | What it does | Location | Cadence | Notes |
|---|---|---|---|---|---|
| 12 | `trip-card-handover` | T-48h "Trip Card ready" nudge notification | `trip-card-handover-scheduler.service.ts:60` | hourly | Idempotent (`NOT EXISTS` dedup). Engagement nudge, not integrity. Optional. |
| 13 | `stripe-connect-reminder` | In-app payout-setup reminders every 72h | `stripe-connect-reminder.service.ts:82` | 72h | Restart-safe via cooldown query; **bypasses `runBackgroundJob`**. Optional. |
| 14 | `admin-digest` | Daily ops email (prod only) | `admin-digest-scheduler.service.ts:42` | 24h | Ops observability. Optional-convert for reliability. |
| 15 | `nightly-qa` | 02:00 UTC QA snapshot + admin email | `index.ts:730` → `jobs/nightlyQA.ts` | 24h@2am | Ops. A silently-stopped nightly QA is a real observability loss — optional-convert. |
| 16 | `demand-rollup` | Recompute partner-demand metrics (REPLACE-BY-DATE) | `index.ts:670` → `jobs/demandRollup.ts` | 24h | Idempotent. Analytics. Optional. |
| 17 | `onepager-revalidation` | Withdraw stale recruitment one-pager approvals | `index.ts:683` → `jobs/onepagerRevalidation.ts` | 24h | Idempotent. Recruitment integrity, low urgency. Optional. |
| 18 | `cache-refresh` | Hourly cache warming | `cache-scheduler.service.ts:78` | hourly | Cosmetic. Leave in-process. |
| 19 | `partnerize-campaign-sync` | Partnerize campaign catalog sync | `cache-scheduler.service.ts:93` | (sync interval) | Content. Leave. (Partnerize 404 → Lane 4.) |
| 20 | `travelpayouts-cache-prune` | Prune expired `travelpayouts_cache` rows | `cache-scheduler.service.ts:146` | hourly | Housekeeping. Leave. |
| 21 | `travelpulse-daily-refresh` | Refresh stale AI city intelligence | `index.ts:638` | 24h | Content freshness; error-counted, safe. Leave. |
| 22 | `travelpulse-demand-refresh` | Demand-signal refresh across operating markets | `travelpulse-scheduler.service.ts:72` (started in `routes.ts:10996`) | 24h | **Bypasses `runBackgroundJob`** on its inner interval path partly. Content. Leave. |
| 23 | `dmo-ingest` | Kyoto DMO enrichment (env-gated **OFF**) | `dmo-ingest-scheduler.service.ts` | daily | Off by default. Leave. |
| 24 | `dmo-extraction-warmup` | **Once per boot** (not recurring) backlog extraction | `index.ts:713` → `jobs/dmoExtractionWarmup.ts` | per-boot | Not an interval; leave as boot task. |
| 25 | `occasion-drafts` | Plus occasion draft builder | `occasion-drafts-scheduler.service.ts:44` | daily | **ALREADY CONVERTED** — internal endpoint + workflow live. Reference, no work. |

---

## Recommended conversion set (for ratification)

**Tier 1 — convert now (MONEY / money-adjacent).** All are already double-fire-safe, so the
`[guarded]` "no MONEY job can double-pay" proof is *already structurally true*; conversion changes
only the trigger, not the safety.
`earnings-release`, `booking-auto-completion`, `stripe-reconciliation`, `checkout-sweep`
(+ `partnerize-report-poll`, `travelpayouts-report-poll` — money-adjacent, lower priority).

**Tier 2 — convert (INTEGRITY):** `availability-materialization`, `booking-expiry`.

**Tier 2 cadence exceptions — `itinerary-generation-sweep` (5 min) and `email-outbox` (5 min):**
GitHub Actions cron has a 5-min floor **and drifts 5–15 min under load**, so an external cron is a
poor *primary* for a latency-sensitive 5-min job. Recommendation: **keep these in-process as primary**
and either skip the external trigger or add it only as a coarse (e.g. 30-min) backstop. **Decision
needed.**

**Tier 3 — leave in-process (COSMETIC/ops/content):** everything else. Optionally convert
`nightly-qa` and `admin-digest` for ops reliability if desired.

**In-process timer disposition after conversion.** No job in the convert set has double-fire risk
(all idempotent), so every converted timer is **kept as best-effort defense-in-depth** (the occasions
precedent) — none needs removal for safety. If you prefer to remove a converted timer to shrink the
boot herd further, that is a contention choice, not a safety one; call it per-job at ratification.

---

## Questions for the decision-maker (the hard stop)

1. **Ratify the Tier 1 + Tier 2 convert set** above (6 MONEY + 2 INTEGRITY), or adjust.
2. **`itinerary-generation-sweep` and `email-outbox`** (5-min, latency-sensitive): keep in-process
   primary with no/coarse external backstop, or force full conversion despite Actions drift?
3. **Partnerize/Travelpayouts report-polls:** convert now, or hold until Lane 4 resolves the
   Partnerize 404 (configured-but-wrong-URL vs vestigial)?
4. **In-process timers for converted jobs:** keep all as defense-in-depth (recommended), or remove
   any specific one to reduce boot contention?
5. **One workflow or several?** Recommendation: **one `jobs-cron.yml`** with a job per cadence bucket
   (hourly, 4-hourly, daily) POSTing each internal route, reusing `INTERNAL_JOB_SECRET`.
6. **Out of scope for this lane but surfaced here (file, don't fix):** the shared 20-slot pool with a
   5s connect timeout and no dedicated background pool is the deeper root cause; jobs that bypass
   `runBackgroundJob`'s concurrency cap (`stripe-connect-reminder`, `fx-rate-refresh`,
   `travelpulse-demand-refresh`) sidestep the pool protection. A dedicated small background pool (or
   routing all timers through `runBackgroundJob`) would harden the boot window independently of this
   conversion. Escalated, not built.
