# `OccasionRow.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/OccasionRow.dc.html` ("An occasion is a row, not a class" — the six switch columns for eight occasions)
**Live surface:** `server/seeds/experience-template-tabs.seed.ts` (the ONE author of the switch columns), `shared/schema.ts` (`experience_types`), `client/src/lib/occasion-switches.ts` (the readers)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** CLAUDE.md **Locked Decision 28** (migration 276) > the artboard. README fidelity: **built**.
**v1 brief:** none.

## Findings — the table, row by row

Artboard columns: Stops · Duration · Schedule · Guests · Vocabulary · Visibility. Live values read from `server/seeds/experience-template-tabs.seed.ts`.

| # | Occasion (artboard) | Live row `file:line` | Verdict | Mock → Live |
|---|---|---|---|---|
| 1 | **Wedding** — one / a range / ON "wedding presets" / ON / guests / shown | `:4799`–`4801` | **MATCH (all six)** | `stops:"one", duration:"range", schedule:true, guests:true, vocabulary:"guests", visibility:"shown"`. Presets exist (`logistics-presets.service.ts:34` `WEDDING_PRESETS`). |
| 2 | **Golf trip** — many / a range / ON "rounds" / OFF / travelers / shown | `:4906`–`4907` | **MATCH (all six)** | `many, range, schedule:true, guests:false, travelers, shown`. Presets exist (`logistics-presets.service.ts:945` `GOLF_TRIP_PRESETS`, five anchors). This row is the one `2026-09-04-golf-occasion-and-housekeeping` created. |
| 3 | **Girls' trip** — many / a range / ON "the big night" / ON / **guests** / shown | `:4827`–`4828` | **DIVERGENCE — one column** | Live `girls-trip` is `many, range, schedule:true, guests:true, vocabulary:"**travelers**", visibility:"shown"`. Five of six match; the **vocabulary** column disagrees. Consequence: `partyNoun` yields "Travelers", so step 4 asks "Who is traveling with you?" where the artboard specifies the guests wording. |
| 4 | **Date night** — one / a day / ON "the evening" / OFF / — / shown | `:4802`–`4803` | **MATCH** | Live stores `vocabulary:"travelers"` while the artboard shows "—". Not a divergence: `partyNoun` honours `default_guests:false` by refusing guest wording outright, so the stored noun is inert. The artboard's dash means "the Guests switch is off", which is exactly the live state. |
| 5 | **Proposal** — one / a day / ON "the moment" / OFF / — / **hidden** | `:4821`–`4822` | **MATCH (all six)** | The row `SlipProposal.dc.html` depends on. |
| 6 | **Corporate event** — one / **a day** / ON "run of show" / ON / attendees / shown | `:4808`–`4809` | **DIVERGENCE — one column** | Live `corporate-events` is `one, **range**, schedule:true, guests:true, attendees, shown`. Five of six match; the **duration** column disagrees. Consequence: step 3 shows "First day / Last day" where the artboard specifies a single date + time. (Note the seeder also holds a separate `corporate` = "Corporate Retreats" row at `:4868`–`4869` — `many, range` — which is a different product and is not what this artboard row depicts.) |
| 7 | **Honeymoon** — many / a range / OFF / OFF / travelers / shown | `:4889`–`4890` | **MATCH (all six)** | |
| 8 | **Travel planning** — many / a range / OFF / OFF / travelers / shown | `:4796`–`4797` | **MATCH (all six)** | |

## Findings — the mechanism

| # | Mock claim | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 9 | "The five-step shell never changes. These six values decide what each step shows." | `client/src/lib/plan-steps.ts:119`–`134`; `client/src/lib/occasion-switches.ts:52,64,75,88,113`; `plan-modal.tsx:408`–`414` | **MATCH — this is the built architecture** | Each reader is called **once** in the modal and its §13 fallback is stated where it is defined. `stopsShape` (the sixth) landed with `2026-09-04-plan-stops-ui`. |
| 10 | Every switch is a **default the traveler can flip inside the plan**, never a lock | `plan-modal.tsx:967` (rail is clickable), `:1063` | Partly | Steps re-shape when a different occasion is chosen on step 1 (`plan-modal.tsx:455`–`466`), but there is **no per-plan override control** for an individual switch — e.g. a wedding cannot be given a second stop from inside the plan, because step 2's list is gated on the occasion's `default_stops`. Recorded as state: Locked Decision 28's "the traveler can flip any switch inside the plan" is not yet a built affordance. |
| 11 | The extra hint text in the Vocabulary cell ("Ceremony & Venues", "Agenda & AV") | `experience-template-tabs.seed.ts:2153` (`weddingTabs`) | Not represented as such | These are tab names, not switch values; the artboard uses them as an aside. No divergence. |

## Classification

- **(A) contained:**
  - **#3** — change `girls-trip`'s `vocabulary` from `"travelers"` to `"guests"` in `server/seeds/experience-template-tabs.seed.ts:4828`, **or** amend the artboard. This is a seeded-data change with a live consequence (the step-4 title and the Trip Strip party noun), so it should be confirmed rather than assumed.
  - **#6** — change `corporate-events`'s `duration` from `"range"` to `"day"` in `server/seeds/experience-template-tabs.seed.ts:4809`, **or** amend the artboard. Same caveat, larger blast radius: it changes which date fields a corporate plan is asked for.
- **(B) needs a ruling:** **#10** — is a per-plan switch override (the artboard's "the user can flip any switch inside the plan") in scope? Nothing stores a per-trip override today; adding one is a schema decision (Coordination Prevention).
- **(C) ruled omission / correct as is:** #4 (the "—" vocabulary dash), #11.

**Not verifiable without a running server:** that the seeded values are what production actually holds — the seeder writes by UPDATE keyed on `slug`, stale-only, so a hand-edited row would not be corrected.
