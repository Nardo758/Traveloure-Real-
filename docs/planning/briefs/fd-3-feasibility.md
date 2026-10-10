# FD-3 — feasibility in the free draft (Phase 0 + rulings, Oct 10, 2026)

Read on `main` at `5e0a0839b` (R404). Ledger row `2026-10-10-fd3-feasibility` (R?). No migration.

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
6. **Visit length:** a new finding `closes_before_visit_end` — arrival + planned duration against closing time, and
   against `last_admission` when stored. `closed_on_arrival` is unchanged.
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
- The reader takes hours from Places OR a crawled official row carrying the structured shape.
- New `closes_before_visit_end`: for a stop with a start time and a planned duration, end = start + duration; flagged
  when end passes the day's closing time, or when start is after the stored `last_admission` for that weekday (in
  season). Needs both a time and a duration — otherwise the stop is uncounted. Problems-first order: after
  `closed_on_arrival`. Added to `recheckConflicts`.
- New `last_service_missed`: for an estimated or routed transit leg, its end time against stored `last_service`
  facts whose station is within the walk threshold (`ROUTED_WALK_MAX_METERS`) of the leg's origin, for the leg's
  weekday and validity; flagged when every matching last departure is earlier than the leg's departure. No matching
  fact ⇒ not checked.

**d. Day feasibility (`days[].feasibility` on the plancard, pure `feasibilityForDay`).** Per check: `{ checked, of }`
for hours, last admission and last trains; a check with `checked = 0` reads "not checked". The line: "Hours checked
for 5 of 6 stops · last trains not checked". Counts only; no "public"/"local" wording.

**e. Profile.** Delete Kyoto's "Last trains around 23:30" and the train/bus `availableHours`; make `availableHours`
optional in the type.

**f. Tests.** An untagged or unsourced fact never produces a finding; a day with nothing stored says "not checked"; a
stored `last_admission` earlier than the visit's start flags `closes_before_visit_end`; a visit ending after closing
flags it; a missed last service flags `last_service_missed` and an absent one reads "not checked"; text-only crawled
hours are ignored.

## 4. Questions before build
1. **Where the day line renders.** In code the "draft card" is the EMPTY board's card (`plan/SlipEmptyStart.tsx`),
   which exists before a draft. The per-day line fits `DayBlock`, but on the slip it needs one prop passed from
   `SlipView.tsx:2598` — a file this lane has been told not to touch. Allow a one-prop SlipView edit, or render on the
   Trip Card and the versions board only for now?
2. **"Blocks or reorders"** (ruling's test): the free draft's generator does not read findings, so FD-3 flags. Make
   the free draft reorder around a stored `last_admission` (a generator change), or is a flag enough? Also: the
   ruling's test reads "`last_admission` earlier than the visit END"; entry is the arrival, so the brief compares
   last admission with the ARRIVAL and the closing time with the END. Confirm.
3. **Expert-entered `last_admission`:** the admission rule accepts it with an official source, but there is no
   expert entry surface. Build one here, or leave it to the expert-content lane?
4. **Profile spans:** delete the hour spans for Kyoto only, or every market's (all unsourced, all unread)?
5. **`last_service` fact type:** the ruling names the sub-need; a fact type is needed for the structured value. OK to
   add `last_service` as the type beside the sub-need?
