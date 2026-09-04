# Wedding / occasion flow — build sequence and tracking

Companion to `docs/design/wedding-flow/README.md` (the artboard index). That file says what each
mock is and whether it has been checked; **this file says what order to build in, and how a lane is
proven done.** Written 2026-09-04, repo state `main` ≈ `584c9e584` (post-#744).

Update the State column in the same commit as the work. A lane whose state is not updated by its
own commit is how a "done" surface turns out never to have shipped.

---

## 0. Four findings that change the plan

These were found while writing this file. They are stated up front because three of them are
invisible from the artboards alone.

### F1 — Step 2 exists; the naming hides it — **RESOLVED** (ledger `2026-09-04-golf-occasion-and-housekeeping`)

**As found:** there was no `Step2*.dc.html`, which read as a missing step. Step 2 was
`ModalWhere.dc.html`, titled "Plan this moment → step 2 · Where"; steps 1/3/4 used `Step<N><Name>`
while steps 2 and 5 used `Modal<Name>`, and `canvas.json` lists artboards in **creation order, not
flow order**, so the sequence read scrambled on the canvas. It was left alone at the time because a
rename of a ratified artboard is a decision, not a tidy-up.

**Resolved:** the rename was ratified and done as one lane — `ModalWhere.dc.html` →
`Step2Where.dc.html`, `ModalEvents.dc.html` → `Step5Events.dc.html`, with their `canvas.json`
entries moved in the same commit and the canvas TITLES left exactly as ratified. Every step of the
plan modal is now `Step<N><Name>`. Briefs written before the rename cite the old names and were
left as written — they are dated records, not live pointers; `docs/DECISIONS.md` likewise, being
append-only. The flow order is still stated in §1, because `canvas.json` order is still creation
order.

### F2 — the four commerce surfaces have NO planning entry

`usePlanning().open(source)` (`client/src/contexts/PlanningContext.tsx`) is a real unified opener
with a typed `PlanningSource`. **Ten** surfaces use it: landing, moments-section, CityTickerTape,
how-it-works, about, features, pricing, dashboard, trip-details, itinerary-view.

**Marketplace, Experience, Experts and Services do not.** Verified by grep:

| Page | Imports from PlanningContext | Outbound CTA |
|---|---|---|
| `pages/experiences.tsx` | none | `/discover`, `/experts` |
| `pages/experts.tsx` | none | `/earn` |
| `pages/travel-experts.tsx` | none | `/earn`, `/expert-status` |
| `pages/expert-detail.tsx` | none | `/experts` |
| `pages/service-providers.tsx` | none | `/become-provider` |
| `pages/ready-made-detail.tsx` | none | `/ready-made` |
| `pages/service-detail.tsx` | `planningRouteForTrip` only — a ROUTE HELPER, not the opener | — |
| `pages/experience-template.tsx` | `planningRouteForTrip` only | — |

Every one of those CTAs is **supply-side** (recruit a provider, recruit an expert, browse more). A
traveler on any of those four pages has no way to start a plan. This is not a styling divergence
from a mock — it is a missing funnel, and it is why entry unification is sequenced **before** the
per-screen mock work in §1.

### F3 — "the surface exists" is not "the mock shipped"

13 of the 22 artboards are marked `surface exists — UNAUDITED` in the artboard index. A live surface
was found at that path by grep; **nobody has compared it to the artboard.** Treat those rows as
unknown, not as done.

### F4 — all three blockers are now cleared (the last two by lane A, migrations 281/282)

| Blocker | Blocks | State |
|---|---|---|
| ordered `trip_destinations` — table does not exist | `Mismatch` "add as a stop"; `TravelWhere` stop list | **CLEARED** — migration 281 (ledger `2026-09-04-stops-and-event-time`) |
| no time-of-day column on `user_experiences` | clock times on `WhichEvent`; `TravelEvents` tee times | **CLEARED** — migration 282 (same ledger row); both surfaces **BUILT** by ledger `2026-09-04-event-time-ui` |
| `experience_types.roles_needed` | `WhichEvent` role hint | **CLEARED** — migration 280 (#744) |

**Golf now has an occasion row of its own** (ledger `2026-09-04-golf-occasion-and-housekeeping`):
`golf-trip`, seeded with `schedule: true` and its own tee-time schedule presets (Round 1–4, Whisky
bar), and the landing Moment points at it instead of the generic `travel` occasion. That closes the
`wedding-travel-events.audit.md` headline finding — the step-5 chip step is now REACHABLE for a golf
trip, where before `travel`'s `schedule: false` switched the whole step off. It does **not** clear
row 9: the artboard's Event/Day/Time/Place table still needs the HELD time-of-day column, so the
chips exist and the per-event clock time does not.

---

## 1. Flow order (what the canvas does not show)

```
Landing              Before → Main → NavEntry → NavTuned
Plan modal           Step1Occasion → Step2Where (step 2) → Step3When / Step3Day (step 3)
                       → Step4Who / Step4Variants (step 4) → Step5Events (step 5)
Plan surfaces        StripLead → Slip → WhichEvent → Mismatch → Guests
Variants             OccasionRow, SlipProposal, Planner, TravelWhere, TravelWhen, TravelEvents
```

---

## 2. Build sequence

Ordered so that nothing is built twice and nothing is built on a floor that is about to move.
**Each phase gates the next.**

### Phase A — audit before building (do this first)

Rebuilding a screen that already matches its mock is the most expensive mistake available here, and
13 artboards are unaudited. Write one brief per artboard under `docs/design/mock-audits/`, following
that directory's `INDEX.md` rules of engagement — **report, don't repair**, and dead routes in this
app return **200 + HTML** from the Vite catch-all, never 404.

Audit in flow order (§1). Output per artboard: match / divergence / already-ruled, with
`file:line`. Phase A changes no product code.

### Phase B — entry unification (F2)

Before per-screen work, because it decides how every screen below is reached. One lane:

- every commerce surface opens the plan through the SAME `usePlanning().open(source)` — never a
  second modal, never a raw route push;
- `PlanningSource` already carries `city` / `destination` / `experienceType` / `momentKey` /
  `experienceSlug`, so each surface passes the context it holds and nothing is guessed (§13);
- a surface with no occasion passes none — it must not invent one.

Guarded by §3 below, or it regresses the first time someone adds a page.

### Phase C — close the two open surfaces

1. **`WhichEvent` role hint** — unblocked today by migration 280. Reads `roles_needed` and marks
   matching rows. **Reads the server's list; never restates it client-side** (the derivation-drift
   class §18 rule 1 names). Nothing is pre-selected — rule 3 of `which-event.ts` stands.
2. **`Guests` column-per-event** — **BUILT** (ledger `2026-09-04-guests-per-event`). The blocker
   ("a plan can hold many events and 'the plan's guest list' does not say which one it means") was
   dissolved rather than answered: the roster is **DERIVED**, one row per person deduplicated by
   normalised email with one column per event, so no single event owns it and nothing new is
   stored. `GET /api/trips/:tripId/guests` (owner tier) →
   `server/services/plan-guest-roster.service.ts` → `client/src/pages/plan-guests.tsx`.

### Phase D — whatever Phase A found

Sized once the audits exist. Anything Phase A reports as a divergence becomes a lane here, in flow
order. Do not pre-size this phase — that is guessing.

### Phase E — unblocked; the stop half is built

`Mismatch` "add as a stop" and the `TravelWhere` stop list are **built** (ledger
`2026-09-04-plan-stops-ui`) on the `trip_destinations` table lane A landed. `TravelEvents` tee
times and any clock time have their column (migration 282) and are **still to build**.
**A schema decision is the decision-maker's** (CLAUDE.md Coordination Prevention) — both were
ratified before either lane started.

**Both blockers are now CLEARED and the clock half is BUILT.** Migration 281/282 landed the two
columns (ledger `2026-09-04-stops-and-event-time`, Locked Decisions 34/35), and ledger
`2026-09-04-event-time-ui` built the clock surfaces on top of them: step 5's Day · Time · Place
table, the `WhichEvent` clock line and the `TravelEvents` tee times. The stop-list half (rows 7–8)
is still todo. Note what did NOT change: `TravelEvents` draws a GOLF trip, and whether that
occasion has a schedule step at all is still `experience_types.default_schedule` on whatever row
golf resolves to — the audit's sharpest finding, and a seeding question, not a clock one.

---

## 3. How we ensure a surface actually surfaces

The repo already proves routes **render**: `app-routes-gate`, `navbar-links-gate`
(`navbar-links-smoke` + `hardcoded-links-check`), `auth-routes-gate`, `footer-links-gate`. Between
them a route that 404s or renders blank fails CI.

**None of them proves a surface is reachable from the entry its mock specifies.** That is the actual
question, and it is what let F2 sit unnoticed: every page in that table renders perfectly and every
link resolves — the planning entry simply is not on them.

The gap closes with an **entry-point guard** in the shape this repo already uses for guards
(`scripts/check-*.cjs`, committed `--self-test` fixtures per §18d, a stated negative space, wired as
its own CI job):

- **Predicate:** every page in a named ENTRY_SURFACES list imports `usePlanning` from
  `@/contexts/PlanningContext` and calls `.open(`. Importing `planningRouteForTrip` does **not**
  count — it is a route helper, and mistaking the two is exactly what made these surfaces look wired
  when they are not.
- **Fails when** a listed surface loses its opener, or a new commerce page is added without one.
- **Negative space, stated honestly:** it proves the opener is *wired*, never that the modal opens
  with the right `PlanningSource`, and never that any screen matches its artboard. Those are an e2e
  and an audit respectively. Green here means green within those bounds.

Ordering matters: the guard is written **with Phase B**, not after. A guard added later codifies
whatever shape the code happened to land in.

---

## 4. Tracking

States: `todo` · `in progress` · `audited` (Phase A brief exists) · `built` (merged + tests) ·
`ruled` (deliberate divergence, ledger row) · `blocked` (needs ratification).

| # | Artboard / lane | Phase | State | Blocker |
|---|---|---|---|---|
| 1 | Audit briefs ×13 unaudited artboards | A | todo | — |
| 2 | Entry unification, 4 surfaces | B | todo | — |
| 3 | `check-planning-entry.cjs` + CI job | B | todo | — |
| 4 | `WhichEvent` role hint | C | todo | — (cleared by #744) |
| 5 | `Guests` column-per-event | C | built | — (ratified `2026-09-04-guests-per-event`: the roster is DERIVED, so no event "owns" it) |
| 6 | Phase A findings | D | todo | Phase A |
| 7 | `Mismatch` "add as a stop" | E | built | — (ledger `2026-09-04-plan-stops-ui`) |
| 8 | `TravelWhere` stop list | E | built | — (ledger `2026-09-04-plan-stops-ui`) |
| 9 | `TravelEvents` tee times | E | built | — (ledger `2026-09-04-event-time-ui`; the occasion's own `default_schedule` still gates the step) |
| 10 | Artboard rename (F1) | — | built | — (ratified and done: ledger `2026-09-04-golf-occasion-and-housekeeping`) |
| 11 | Planner third door + nav Wedding CTA | D | built | — |
| 12 | Landing Wedding moment + "Planning your own?" callout | D | built | renders only once Kyoto has an attributed real photo (photo gate) |
| 13 | Five-step plan modal (option 1: one modal, many doors) | D | built | ordered stops built by row 8; Step4Variants fields not built |
| 14 | `trip_destinations` + `user_experiences.start_time` (schema + rails) | E | built | UI in follow-up lanes |
| 15 | Step 5 Day/Time/Place table, `WhichEvent` clock, `TravelEvents` tee times | E | built | ledger `2026-09-04-event-time-ui`; no `.ics` export of events (none exists — see the ledger row) |

Already `built`: `Step5Events`, `StripLead`, `Slip`, `WhichEvent` (minus the hint), `Mismatch`,
`Step2Where`, `TravelWhere`, `OccasionRow`. Already `ruled`: `SlipProposal`.

Decisions needed before their lanes can start: **which event owns a plan's guest list** (row 5,
ratified `2026-09-04-guests-per-event`). Ordered stops (rows 7–8) and the time-of-day column
(row 9) were ratified by `2026-09-04-stops-and-event-time` and are built (ledgers
`2026-09-04-plan-stops-ui` and `2026-09-04-event-time-ui`); the artboard rename (row 10) was
ratified and is done.
