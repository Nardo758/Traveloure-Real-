# FD-3 — feasibility in the free draft (Phase 0 + rulings, Oct 10, 2026)

Read on `main` at `5e0a0839b` (R404). Ledger row `2026-10-10-fd3-feasibility` (R409). No migration.

## 1. Rulings (decision-maker, Oct 10, 2026)
1. **Last admission** is a new `last_admission` fact type, structured (per-weekday time, optional seasonal
   range), `source_class = public`, an official source required; written only from official crawled pages or by
   experts citing one. Never parsed from free-text hours. It joins the facts-recheck set. No migration.
2. **The free draft's fetch budget stays zero** (A6-3A unchanged). The post-draft Places hours lookup (12 billed)
   is the only live source; everything else is stored official facts from the registry. A check with nothing stored
   says "not checked" for that day — never silent, never padded.
3. **Last trains** are a named sub-need `transport.local.last_service` (operator, line/station, last departure,
   valid-from/to, official source) from registered operator sources (Kyoto City Bus & Subway, JR West, Hankyu,
   Keihan). Expert hard constraints are not a source. The unsourced "Last trains around 23:30" string and the
   unsourced train/bus hour spans are deleted from the transport profile.
4. **Access route** is official text + link, `link_only`, public tier. Expert versions are local-tier notes, not FD-3.
5. **Expert hard constraints never enter drafts** (claim evidence, LD 27).
6. **Visit length:** two checks, two findings — `after_last_admission` (arrival vs last entry: can you still get in)
   and `closes_before_visit_end` (arrival + planned duration vs closing: will you be put out). `closed_on_arrival` is
   unchanged. Flag only (answer 2).
7. **Duplicate neighbourhood slugs:** a production read first; if duplicates exist, a held merge lane onto the 042
   slugs before FD-5. Not in FD-3.

Out of FD-3: registering the operator sources (Supply Scout); FD-5's official-fact census.

## 2. What exists (file:line)
| Piece | Where | Note |
|---|---|---|
| Fact types | `shared/content-facts.ts:125-141` | no `last_admission`, no `last_service` |
| Sub-needs | `shared/content-facts.ts:37-42` | four; the comment at :33-34 refuses free-text "last-service rules" |
| Writer | `server/services/content-facts/place-facts.service.ts:48-77` `recordFacts` | tags born via `placeFactTags` (`shared/content-tiers.ts:154-159`) |
| Places hours | `server/services/content-facts/places-adapter.ts:48, 246-248` | `{weekdayDescriptions}`; no last entry |
| Crawled facts | `server/services/content-facts/tavily-extract-adapter.ts:47-52, 211-214, 243, 267-283` | value `{text, quote}`; quote verified on page |
| Free draft fetch gate | `server/services/content-facts/fresh-fetch.ts:30-35` | free draft ⇒ null |
| Post-draft lookup | `server/routes/content.routes.ts:5012`; cap `server/config/content-facts.config.ts:57` | Places only |
| TTLs | `server/config/content-facts.config.ts:17-31` | per fact type |
| Findings | `shared/optimizer-lead.ts:18, 40, 56-152, 359-…`; reader `server/services/optimizer-lead.service.ts:49-120` | hours read ONLY in the Places shape (:79-82) |
| Re-check | `server/jobs/factsRecheck.ts:69-80`; set `shared/facts-recheck.ts:13-15` | `closed_on_arrival`, `timed_entry_conflict` |
| Leg modes | `shared/routing-engine.ts:124-142`; `server/data/transport-profiles.ts:29-110` | Kyoto note :38, hour spans on every mode (`availableHours`, required by the type at :12) — read by nothing outside the file |
| Plan legs (free plan) | estimated from `shared/travel-speeds.ts` speeds; routed legs paid only (LD 63) | no line or operator on an estimated leg |
| Day render | `client/src/components/plan/DayBlock.tsx:14-34`, mounted by `SlipView.tsx:2598`, `TripCardDays.tsx:317`, `WorkstationDays.tsx:124` | |

## 3. Build
**a. Types and value shapes (`shared/content-facts.ts`, `shared/feasibility-facts.ts` new, pure).**
- `FACT_TYPES` += `last_admission`, `last_service`; `CONTENT_SUB_NEEDS` += `transport.local.last_service`.
- `last_admission` value: `{ byWeekday: {0..6: "HH:MM" | null}, season?: { from: "MM-DD", to: "MM-DD" } }`;
  `last_service` value: `{ operator, line, station, direction?, lastDeparture: "HH:MM", weekdays: number[], validFrom, validTo }`
  (station point on `place_lat/lng`).
- ONE admission `admitFeasibilityFact(draft)`: refuses a shape that does not parse, and refuses unless the row is
  `origin = crawled` with `license = official` and a `source_url`, or `origin = expert_nugget` carrying an official
  `source_url`. The tag pair is `public` (FD-2 ruling 1 mapping gives `link_only` for official). `recordFacts` calls it.
- TTLs: `last_admission` 30, `last_service` 30 (config, env-overridable).

**b. Extraction.** The extract adapter may return `last_admission` for `stop.hours`/`stop.ticketing` and
`last_service` for `transport.local.last_service` only as STRUCTURED fields with a verbatim quote verified on the
page (same refusal list); free text for these two types is refused. Crawled `hours` gains an optional structured
`weekdayDescriptions` produced the same way. An existing text-only crawled `hours` row is never parsed and stays
"not checked".

**c. Findings (`shared/optimizer-lead.ts`).**
- The reader takes hours through ONE feasibility reader (`feasibilityFactsForTrip`, place-facts.service): the plan's
  own rows plus official rows stored for the item's place id by any plan, in FD-2's precedence (official first for a
  hard fact), tagged rows only, Google-shaped lines only.
- `after_last_admission`: arrival later than the stored last entry for that date (in season). Equal is in.
- `closes_before_visit_end`: open at arrival, but the visit's end (end time, else start + duration) passes closing.
  No end and no duration ⇒ unchecked. A stop closed on arrival stays `closed_on_arrival`'s.
- `last_service_missed` (review guards, Oct 10, 2026): every stored `last_service` whose station is within 1.2 km
  (`ROUTED_WALK_MAX_METERS`) of the ride's start is considered — **none stored ⇒ "not checked"; any still running
  at departure ⇒ no finding; only when all have passed ⇒ the ride counts.** A free plan stores no estimated legs,
  so the ride is derived the way the engine picks its default mode (`defaultRoutedMode`: over 1.2 km and the market
  lists transit); a leg the plan shows for the pair wins with its own mode. The ride departs when the stop it
  leaves ends. **An inferred ride reads hedged** — "N rides may leave after the last train or bus"; a stored leg
  keeps "N rides leave after …". **Coverage depends on which operators are registered**: until Supply Scout
  registers JR West, Hankyu, Keihan and Kyoto City Bus & Subway, the finding under-reports (an unregistered
  operator's station has nothing stored, so a ride there is "not checked", never "fine").
- All three join `recheckConflicts`. Order: after `closed_on_arrival`.

**d. Day feasibility (`days[].feasibility` on the plancard; words `feasibilityLine`, shared/plan-feasibility.ts).**
`{ stops, hoursChecked, lastEntryChecked, rides, ridesChecked }`; a check with nothing stored reads "not checked"; a day
with no ride has no last-train clause (no question to answer). Rendered on every day block: slip (one prop at
`SlipView.tsx:2598`), Trip Card, Workstation, and the versions board's Your plan. Counts only; no tier words.

**e. Profile.** Delete every market's `availableHours` (unsourced, unread) and the field from the type; delete Kyoto's
"Last trains around 23:30". One commit.

**f. Tests.** An untagged or unsourced fact never produces a finding; a day with nothing stored says "not checked"; a
stored `last_admission` earlier than the ARRIVAL flags `after_last_admission`; a visit ENDING after closing flags
`closes_before_visit_end`; a missed last service flags `last_service_missed` and an absent one is unchecked; text-only
crawled hours are ignored.

**Cross-plan boundary (review, Oct 10, 2026).** Official crawled facts (our extraction from an official page) are
read for the same place id across plans. Google Places hours stay per-plan under LD 57: the cross-plan read takes
`origin IN (crawled, expert_nugget)` with `license = official` only, so another plan's Places row never feeds a
finding (pinned by G8). The existing post-draft lookup's place-id cache (R-u) still COPIES a Places answer onto
this plan's own item with its original expiry — that is LD 57's ratified per-plan copy, unchanged here.

## 4. Answers (decision-maker, Oct 10, 2026)
1. The one-prop `SlipView.tsx:2598` edit is allowed; the line renders on the day block everywhere it appears.
2. Flag only; no free-draft reorder. Last admission vs ARRIVAL, closing vs visit END — two checks, two findings.
3. No expert entry screen here. **Dependency recorded for the expert-content lane:** an expert screen to enter
   `last_admission` with its official source; the admission rule already accepts `origin = expert_nugget`.
4. Delete the spans for every market, and the Kyoto note — one commit.
5. `last_service` is a structured fact type beside the sub-need, same admission rule.

Build order as built: types + admission + extraction → findings → re-check → per-day count → day-block line →
deletions → tests. The duplicate-slug merge (ruling 7) gates only neighbourhood-keyed parts; FD-3 keys nothing by
neighbourhood.
