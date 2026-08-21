# Search write-path trace — why `search_analytics` has 0 rows

**Lane:** B4 (Trailhead sweep) · **Phase 0, READ-ONLY — HARD STOP, no fix applied**
**Branch:** `lane/search-writepath-trace` · **as-of:** `origin/main` @ 2026-08-21
**Class:** absence-compared-to-absence — the writer *looks* live and the client fire *looks* live, but they are **not the same chain**.

---

## Verdict (one line)

`search_analytics` is dark because the **live client search fire and the `search_analytics` writer are wired to two
different, non-overlapping endpoints.** The client's real search event lands in `destination_search_patterns`; the
routes that actually write `search_analytics` have **zero callers anywhere in the client**. The two things the brief
assumed were one chain (`content-query.service.ts:807` + `discover.tsx:563`) are disjoint.

---

## The two chains, traced end to end

### Chain A — the LIVE client fire (writes the WRONG table)

| Hop | Location | What happens |
|-----|----------|--------------|
| 1. Client fire | `client/src/pages/discover.tsx:562-568` | On a real search (`locationFilter.length >= 2`) calls `trackSearchEvent({ destination, searchContext:'discover' })`. Fires for real — `locationFilter` is bound to the search input (`:1176`). |
| 2. Client lib | `client/src/lib/analytics.ts:74-76` | `trackSearchEvent` → `sendAnalyticsEvent('/api/analytics/search-event', data)` (sendBeacon/fetch, fire-and-forget). |
| 3. Route | `server/routes/content.routes.ts:2622` | `POST /api/analytics/search-event` — **exists and is mounted** (`app.use(contentRoutes)`, `server/routes.ts:980`). Responds `202` immediately, then processes async. |
| 4. Write | `server/routes/content.routes.ts:2636-2646` | Calls `storage.createDestinationSearchPattern(...)` → **`destination_search_patterns`** (`server/storage.ts:6592`, `shared/schema.ts:5937`). **It never calls `insertSearchAnalytics`.** |

**Result:** every live search writes `destination_search_patterns`, **never** `search_analytics`.

### Chain B — the `search_analytics` writer (has NO client caller)

| Hop | Location | What happens |
|-----|----------|--------------|
| Writer | `server/services/content-query.service.ts:805-808` | `insertSearchAnalytics()` — `db.insert(searchAnalytics).values(...)`. Correct table, correct columns, no bug in the writer itself. |
| Caller 1 | `server/routes/content.routes.ts:8285` | `POST /api/track/search` → `insertSearchAnalytics(...)`. Mounted, reachable. |
| Caller 2 | `server/routes/content.routes.ts:8470` | `POST /api/track/destination-search` → `insertSearchAnalytics(...)`. Mounted, reachable. |
| Client callers | — | **NONE.** Grep across `client/**` for `/api/track/search` and `/api/track/destination-search` returns zero hits. The only in-repo references are the two route definitions themselves plus one prose mention in a seed-status blob (`content.routes.ts:5114`). |

**Result:** the only routes that write `search_analytics` are never invoked by the app. Dark by omission, not by error.

---

## Root cause (pinned)

**Primary:** `server/routes/content.routes.ts:2636` — the live `POST /api/analytics/search-event` handler writes to
`destination_search_patterns` and **does not call `insertSearchAnalytics`**. This is the handler every real search hits,
so it is where the missing `search_analytics` write should be and is not.

**Secondary (same root, other end):** `server/routes/content.routes.ts:8285` and `:8470` — the two endpoints that *do*
write `search_analytics` (`/api/track/search`, `/api/track/destination-search`) have **no client caller**, so the writer
at `content-query.service.ts:807` is never reached in practice.

Neither of the four suspected failure modes from the brief is the cause: it is not a never-true client condition, not a
cancelled debounce, not a missing route, and not a swallowed insert error. The insert is simply **on a code path the app
never walks**. (Note: Chain A's handler *is* fire-and-forget with a `.catch()` that logs — but that swallow protects the
`destination_search_patterns` write, not `search_analytics`, which is never attempted there at all.)

## Publish-trap check — CLEAR

`search_analytics` **is declared** in `shared/schema.ts:6222` (`export const searchAnalytics = pgTable("search_analytics", …)`)
and exists in `server/migrations/000_baseline_schema.sql:2757`. Not a push-drop candidate. The 0-row state is a wiring
gap, not a dropped table. `search_type` is `NOT NULL` (`schema.ts:6226`) — load-bearing for the fix below.

---

## Proposed fix (DESCRIBED ONLY — not applied; Leon reviews first)

**One wire, in the handler the app already hits.** In `POST /api/analytics/search-event`
(`server/routes/content.routes.ts:2622`), add a second write alongside the existing `createDestinationSearchPattern`
call — `insertSearchAnalytics({...})` mapping the already-validated `searchEventSchema` fields:

- `searchType` — **required (NOT NULL)**; the client payload has no `searchType`, only `searchContext`. Set a constant
  (`'destination'`) or derive from `searchContext`. This is the one field that must not be left null or the insert throws
  (into the same fire-and-forget `.catch`, re-darkening it silently).
- `destination` ← `data.destination`; `travelers` ← `data.travelers`; `travelDates` ← `{ startDate, endDate }`;
  `originCountry`/`ipCountry` from header (`cf-ipcountry`) as the sibling handlers already do; `userId`/`sessionId` as in
  Chain B's callers.
- `resultsCount` stays null for now — the client does not send result counts (a separate, pre-existing gap noted in
  `docs/findings/R7_DB_PASS.md`; the "zero-result search *is* the signal" use needs a follow-up to pass `resultsCount`
  from the Discover query, out of scope for this one-wire).

Why this location over the alternatives:
- **Preferred:** the write belongs where searches actually arrive (Chain A's handler), which runs on every real search.
- **Rejected — wire the client to also POST `/api/track/search`:** adds a second network fire and leaves two parallel
  search-tracking rails (`destination_search_patterns` vs `search_analytics`) drifting; the R-series findings already
  treat both as one demand substrate, so co-locating the writes keeps them consistent.

**Confidence: HIGH (≈0.9)** that the disjoint-endpoint wiring is the whole reason for 0 rows — both ends verified by
grep (live client hits `/api/analytics/search-event`; that handler provably omits the `search_analytics` insert; the
`search_analytics` writer's only two routes have no client caller). Residual uncertainty is only whether prod ever hit
`/api/track/*` from some non-repo/out-of-band caller — the 0-row observation from R7 says no.

**Second break found?** No independent second break — the two "breaks" (live handler writes wrong table; writer routes
have no caller) are the two faces of the *same* wiring gap. `resultsCount` never being populated is a real but
*separate, downstream* gap (already tracked in R7), not a cause of the 0-row state.

---

## Recommended ledger row

`2026-08-21-search-writepath-dark` — **`search_analytics` write path is dark: live search fire and the `search_analytics`
writer are wired to different endpoints.** The Discover search fire (`discover.tsx:563` → `trackSearchEvent` →
`POST /api/analytics/search-event`, `content.routes.ts:2622`) writes only `destination_search_patterns`; the routes that
call `insertSearchAnalytics` (`content-query.service.ts:807`) are `/api/track/search` (`content.routes.ts:8285`) and
`/api/track/destination-search` (`:8470`), which have **zero client callers**. Table is declared (`schema.ts:6222`) — not
a publish-trap. Proposed one-wire fix: add `insertSearchAnalytics(...)` to the live `/api/analytics/search-event` handler
(supplying the NOT-NULL `search_type`). `results_count` population is a separate downstream follow-up (R7). **Phase-0
diagnosis only — fix deferred to a follow-up after review.**
