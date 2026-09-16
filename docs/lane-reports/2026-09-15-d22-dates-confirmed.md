# Lane report — D-22 + R-4: a plan says whether its dates were chosen

**Branch:** `task-d22-dates-confirmed` · **Base:** `origin/main` @ `9adc2bba3`
**Ledger row:** `2026-09-15-d22-dates-confirmed`
**Punchlist rows:** D-22 (ruled A = yes, 2026-09-15) — struck ANSWERED/landed; R-4 — struck CLOSED
with its remaining third lane named.

---

## What this lane is

D-1 ruled (ledger `2026-09-15-d1-ready-made-editable-template`) that a purchased ready-made trip is
an EDITABLE TEMPLATE on the platform's placeholder dates. R-4's blocker was never the availability
question: **no fact distinguished the fulfilment job's `new Date()` window from a window the
traveler chose, and no client rail re-dated an existing trip row.** D-22 is the column; R-4 is the
rail. One lane, as the punchlist's own lane list scheduled it.

`trips.start_date` and `trips.end_date` are NOT NULL, so every plan HAS a window. That is right —
LD 42 D12 forbids a mint inventing one and `checkSlipPrecondition` ASKS rather than defaulting. But
several mint paths are structurally unable to ask and fill the columns anyway, and on disk and on
every surface their output was indistinguishable from an answer.

---

## Findings

1. **The clone's placeholder was documented only in a comment.** `ready-made-purchase.service.ts`
   writes `new Date()` + `durationDays - 1` with the line *"Placeholder window sized to the plan;
   the buyer re-dates it in their own planner"* — and no code anywhere could act on that sentence.
2. **`useUpdateTrip` had zero call sites.** Confirmed by grep over `client/`, `e2e/` and
   `playwright/`. The owner-gated `PATCH /api/trips/:id` would always have accepted dates
   (`insertTripSchema.partial()`); nothing ever sent them. Dates reached a row at MINT and never
   again.
3. **R-4 clause (c) has no function to call, and this lane did not invent one.** The brief asked
   for "the EXISTING clone-date revalidation … find the function it landed". The lane it cites
   (`2026-09-14-clone-date-revalidation`, commit `262681738`, PR #903) landed **verification only —
   zero code**, precisely because the moment this lane now provides did not exist. The punchlist's
   own lane list says "Availability revalidation stays a third lane." The read half is still
   unbuildable from ratified readers: `resolveBuyAction` is date-blind, and the only date-scoped
   read is one month-at-a-time query per service that no slip surface makes. **The absence is
   annotated at the route** (a note above the handler) rather than faked with a call that cannot
   answer the question (§13).
4. **Two createTrip callers invent their window outright** — the cart convert-to-itinerary mint
   (`today` / `today + 7`) and, half of it, the Plus occasion draft. That is why the stamp is
   **opt-in at the mint site** rather than unconditional inside `storage.createTrip`: a default of
   "confirmed" would have made those two lie the moment the column landed.

---

## Mint-site table

Ten sites write a `trips` row. Each is annotated in place with its number and its reason.

| # | Site | Window comes from | Stamps? |
|---|---|---|---|
| 1 | `POST /api/trips` (`server/routes.ts`, the LIVE handler) | the body; `insertTripSchema` REQUIRES both dates and the client's ONE mint door (`mintTripSlip`/`checkSlipPrecondition`) REFUSES rather than defaults | **STAMPS** |
| 2 | `POST /api/trips` (`trips.routes.ts`, the SHADOWED twin) | same | **STAMPS** (kept in step deliberately — a resurrected twin that stopped stamping re-opens the gap) |
| 3 | cart-checkout auto-trip (`server/routes.ts`) | `bodyStart`/`bodyEnd` if sent, else the scheduled-item minimum, else `defaultStart` | **STAMPS only when both came off the request** |
| 4 | cart convert-to-itinerary mint (`server/routes.ts`) | `today` / `today + 7` — the handler's own arithmetic | **NULL** |
| 5 | AI quick-itinerary (`server/routes.ts`) | `dates?.start`/`dates?.end`, else "3-day trip starting tomorrow" | **STAMPS only when the request carried both** |
| 6 | `POST /api/user-experiences` auto-trip (`content.routes.ts`) | `experience.eventDate`, else today | **STAMPS only on a stated `eventDate`** |
| 7 | `PATCH /api/user-experiences/:id` auto-trip (`content.routes.ts`) | same | **STAMPS only on a stated `eventDate`** |
| 8 | AI snapshot mint (`saveGeneratedItinerarySnapshot`) | the caller's — three callers, each decided (below) | see 8a/8b/8c |
| 8a | Plus occasion draft (`occasion-drafts.service.ts`) | the member's registered occasion date; END is the scheduler's single-day assumption | **NULL** |
| 8b | Grok generate (`content.routes.ts`) | the request's `dates.start`/`dates.end` — a dateless request is a 400 | **STAMPS** |
| 8c | save-as-trip (`content.routes.ts`) | the stored generation's own dates — a dateless row is a 422 | **STAMPS** |
| 9 | cart auto-trip raw SQL (`booking.service.ts`) | first cart line's `date`, else today | **STAMPS only when the line carried a date** |
| 10 | saved-trip conversion raw SQL (`booking.service.ts`) | `saved.start_date`/`end_date`, else today / today + 7 | **STAMPS only when both were stored** |
| — | **READY-MADE CLONE** (`ready-made-purchase.service.ts`) | `new Date()` + `durationDays - 1` | **NULL — explicitly written, not omitted** |
| — | **EXPERT AUTHORING build** (`ready-made.routes.ts`) | synthetic anchor on a template | **NULL** |
| — | **EXPERT AUTHORING build** (`expert-workspace.routes.ts`) | synthetic anchor on a template | **NULL** |

**The two expert authoring builds were decided structurally, not by judgement:** an authoring build
has `userId = NULL` by design — which is also why the pre-trip event pen is not drained there — so
there is no traveler principal present to choose a date, and no date can be claimed as chosen.

**8a (the Plus occasion draft) was the one close call.** Its START is the member's own registered
occasion date (LD 26) — genuinely their answer — but its END is the scheduler's *"resident occasions
are single-day"* assumption. A confirmation stamp is ONE fact about the PAIR, so half an answer
cannot earn it: the member said when the occasion IS, never how long a plan around it runs.

---

## What landed

**Schema / migration**
- `trips.dates_confirmed_at` — additive nullable timestamp, **NO DEFAULT, NO CHECK, no index**,
  declared in `shared/schema.ts` (deploy-push durability rule), **NO BACKFILL**.
- `server/migrations/302_trips_dates_confirmed_at.sql`, registered after 301. Additive DDL only; no
  CHECK added or changed, so `preflight-prod-constraints.cjs` needs no manifest entry.
- `insertTripSchema` `.omit()`s the column; no pick re-admits it (§19).

**The one derivation — `shared/plan-dates.ts`**
`planDatesAreConfirmed` (accepts the stamp OR the server's already-resolved boolean),
`planInstantIsClaimable` (the CONJUNCTION: a pinned instant needs a real zone *and* a real day),
`planDatesLabel` + the three copy constants. Read by the `.ics` exporter, both `.ics` routes, the
plancard DTO, `/api/me/upcoming`, `formatCountdown` and the slip header.

**Writers (two, both in `server/storage.ts`)**
- `createTrip(trip, options?: TripMintOptions)` — `datesChosenByTraveler` is **opt-in**; omitting it
  makes no claim. That is the safe failure mode: a mint written tomorrow under-claims rather than
  certifying a guess.
- `updateTrip` — stamps `now()` whenever `startDate` or `endDate` is in the update. The R-4 rail.
  Both writers also **strip** an incoming `datesConfirmedAt` so an `as any` caller is covered
  (the two-layer placement §18 uses for a rate).

**Readers (§13)**
- `.ics`: `datesConfirmed === false` withdraws the zone from the ONE pinning decision, so the export
  keeps LD 30's floating output. `undefined` leaves existing behaviour byte-for-byte.
- plancard DTO: `trip.datesConfirmed`, **always present and BOOLEAN** (never the timestamp) — the
  FALSE value is the load-bearing half, so it is assigned, not spread.
- `/api/me/upcoming`: `datesConfirmed: false` on the `trip_start` and `handover` rows only, and the
  row is **still emitted** — LD 45 (8) omits an UNDATED row, and this one has a date; what it lacks
  is anybody's answer.
- `formatCountdown` / `UpNextHero` / `PlanCard`: the countdown is withheld for an unconfirmed plan,
  exactly as for an unknown zone.

**The rail's client (R-4)**
`client/src/components/plancard/SetPlanDates.tsx` — the placeholder chip, the sentence, and an
OWNER-ONLY "Set your dates" dialog (two native date inputs, inverted range refused in the dialog)
calling `useUpdateTrip`. Mounted in the slip header beside the rendered range. Renders **nothing**
for a confirmed plan.

---

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **129** errors = `TSC_BASELINE` (129); diffed line-by-line against `origin/main` — zero net-new |
| `npm run build` | green |
| `node scripts/check-decision-guards.cjs` | `decision-guards lint OK (0 deferred warning(s))` |
| `node scripts/check-money-endpoints.cjs --self-test` | `self-test OK (37 predicate fixtures)` |
| `node scripts/check-money-endpoints.cjs` | exit 0 |
| `bash scripts/phase2-fee-gate.sh` | `✅ Phase 2 fee-literal gate PASSED` |
| `node scripts/check-test-files-wired.cjs --self-test` | `self-test OK (7/7 fixtures)` |
| `node scripts/check-test-files-wired.cjs` | exit 0 — both new suites reachable; `scripts/test-orphan-baseline.txt` does not exist on this base (PR #942 unmerged) so there is nothing to update |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK (307 files, 302 registry entries, 3 grandfathered) |
| `server/migrations/__tests__/chain-integrity.test.ts` | 2/2 |
| `node scripts/check-undeclared-tables.cjs` | 301 DB tables vs 301 declared — no undeclared tables |
| every other `scripts/check-*.cjs` | green |
| **all 302 migrations from EMPTY** on a local Postgres 16 | `302 newly applied, 0 already recorded, 302/302 total` |
| `server/__tests__/dates-confirmed.db.test.ts` K1–K7 | **7/7** against that database |
| `client/src/lib/__tests__/plan-dates.test.ts` P1–P7 | **7/7** |
| `client/src/lib/__tests__/trip-card-one-page.test.ts` | **18/18** (T5's call pin REPAIRED to assert the invariant, not the argument spelling) |
| `server/__tests__/ics-calendar.test.ts` | 9/9 |
| `server/services/__tests__/upcoming.test.ts` | 9/9 |
| `client/src/lib/__tests__/slip-first-paint.test.ts` | 15/15 |
| `grep -c replit.local package-lock.json` | **0** |

**The negative:** K3 and K7 both FAIL on `origin/main` — with no column there is no way to tell the
clone's placeholder from a chosen window, and the exporter pins a confident `…Z` instant to it.

---

## Proposed CLAUDE.md sentence

Not applied by this lane (build lanes do not edit CLAUDE.md). Proposed as an amendment to **Locked
Decision 30**, after its `(a) trips.timezone` clause, and cross-referenced from **42 D12**:

> **A PLAN ALSO SAYS WHETHER ITS DATES WERE CHOSEN (amended Sep 15, 2026 — ledger
> `2026-09-15-d22-dates-confirmed`; migration 302).** `trips.start_date`/`end_date` are NOT NULL,
> so D12's "no mint may invent a date" cannot be enforced by the schema alone: the ready-made
> clone, the two expert authoring builds and several cart mints fill a window in because the
> columns demand one. `trips.dates_confirmed_at` is the fact that tells those apart — additive
> nullable, NO DEFAULT, NO CHECK (the publish-trap posture), declared in `shared/schema.ts`, NO
> BACKFILL. **NULL = NOT CONFIRMED, and never "no dates"** (the plan HAS a window; nobody chose
> it): every reader labels it a PLACEHOLDER, the `.ics` keeps this ruling's FLOATING output rather
> than pinning an instant to a day nobody picked, and 45 (6)'s countdown is withheld — a pinned
> instant needs a real DAY as much as a real ZONE. **SERVER-DERIVED, never client-settable (§19,
> the same posture as `timezone` and `market_slug`):** `insertTripSchema` omits it and no pick
> re-admits it; `storage.createTrip` takes the MINT SITE's own `datesChosenByTraveler` — **opt-in,
> so a mint that says nothing makes no claim** — and `storage.updateTrip` stamps `now()` on any
> date change, which is the ONE re-date rail (the owner-gated `PATCH /api/trips/:id`, whose first
> client caller is the slip header's owner-only "Set your dates", D16). The reader-side derivation
> is ONE module, `shared/plan-dates.ts` (§18 rule 1). **Availability revalidation on a re-date is
> NOT part of this and is not built** — it has no read half yet, and saying so is the honest half
> of shipping without one.

---

## Not done

- **Availability revalidation on a re-date (R-4 clause c).** No function exists to call; the lane
  that was to build it landed verification only, and the punchlist keeps it as a third lane. Its
  *input* now exists, which is the whole thing that was blocking it.
- **The My-plans row and the Trip Card hero do not yet render the placeholder chip.** The DTO and
  the derivation carry the fact to both; only the slip header and the countdown read it in this
  lane. Adding the chip to those two surfaces is a render change with no new rule behind it.
- **No backfill, deliberately**, so every legacy plan reads as unconfirmed. That is the honest
  reading — nobody was asked — but it means a long-standing traveler-chosen window shows the
  placeholder chip until they touch it once. Stated here rather than papered over.
- **The monolith's `PATCH /api/trips/:id` is not driven over HTTP** (it cannot be mounted without
  booting the app). K4/K6 drive the mountable `trips.routes.ts` twin, which shares the admission
  schema and the one storage writer; the suite header states this as its negative space.
- **CLAUDE.md untouched**, per the lane brief — the sentence above is a proposal.
- **`playwright/` untouched** (lane V-31 owns those files).
