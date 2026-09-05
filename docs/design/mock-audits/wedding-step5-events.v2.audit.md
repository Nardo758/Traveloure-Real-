# `Step5Events.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step5Events.dc.html` (Plan modal · step 5 · What's happening — chips + the Event/Day/Time/Place table)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 5; `client/src/lib/plan-events.ts`; `shared/plan-events.ts`; `server/services/logistics-presets.service.ts`; `server/services/pending-events.service.ts`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledgers `2026-09-03-switch-readers`, `2026-09-04-plan-mint`, `2026-09-04-one-modal-many-doors`, `2026-09-04-event-time-ui`; CLAUDE.md **Locked Decisions 29 / 30 / 33 / 35**.
**v1 brief:** none (this artboard was `ModalEvents.dc.html`; the family brief covered it).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your Kyoto wedding · Oct 2 to 4" | `plan-modal.tsx:849`–`860` | MATCH | |
| 2 | Title "What's happening **over the weekend**?" | `plan-modal.tsx:874` | **DIVERGENCE — copy** | Live: "What's happening?" — unconditional. "over the weekend" is a derived phrase the live title does not attempt; a fixed literal would be false for a 10-day plan. |
| 3 | Intro "Tick what applies. Each becomes its own event on the plan, with its own time, place and guest list." | `plan-modal.tsx:1356`–`1359` | **MATCH (verbatim)** | See `wedding-travel-events.v2.audit.md` #4 — the "and guest list" clause is wrong for a `guests:false` occasion. |
| 4 | Chips: Welcome drinks, Rehearsal dinner, Hair & makeup, Ceremony, Reception, Farewell brunch, Photographer arrival | `plan-modal.tsx:1360`–`1379`; `logistics-presets.service.ts:34`–`112` (`WEDDING_PRESETS`) | **DIVERGENCE — the live set is the SERVER's five** | `WEDDING_PRESETS` labels are **Rehearsal Dinner, Hair & Makeup, Photographer Arrival, Ceremony, Reception**. The artboard adds **"Welcome drinks"** and **"Farewell brunch"** (both named in the ratified `Main.dc.html` moment copy and in `Slip.dc.html`) which no preset carries. Chips are read from `GET /api/logistics/presets/:slug` and are never restated client-side (ruled) — so the fix, if wanted, is two anchors in the preset set, not a client list. |
| 5 | "Something else" drawn as an **8th chip** | `plan-modal.tsx:1386`–`1400` (`input-etp-custom-event`) | **DIVERGENCE — it is a text input, not a chip** | Confirmed text becomes a full row with the same Day/Time/Place cells (`:1380`–`1385` comment). Behaviourally richer than the artboard; visually different. |
| 6 | Table header **Event · Day · Time · Place** (4 columns) | `plan-modal.tsx:1411`–`1419` (`etp-step5-rows`) | **DIVERGENCE — 3 columns** | Live header is `Event` / `Day & time` / `Place`; day and time share one cell (`:1428`–`1474`). Ledger `2026-09-04-event-time-ui` treats them as one fact (WHEN), matching `eventMetaLine`. |
| 7 | Day cells pre-filled ("Fri, Oct 2", "Sat, Oct 3"…) and Place cells pre-filled ("Nanzen-ji, Kyoto", "Same as ceremony") | `plan-modal.tsx:1401`–`1410`, `:1437`–`1455`, `:1476`–`1486` | **ALREADY-RULED — deliberate §13 divergence** | Live shows the plan's day as the select's first option labelled "(default)" and the plan's destination as the Place **placeholder**; neither is written until chosen. Inherited at create through the ONE shared `planEventRowValues` (`shared/plan-events.ts`), which the pre-trip pen drain also uses. The README records this as the lane's one intentional departure. |
| 8 | Day cell is a free calendar | `plan-modal.tsx:1437`–`1442` | **ALREADY-RULED** | It is a `<select>` of the plan's own days (`planDayOptions`): an event inside a plan cannot fall outside it. With no readable range the cell is **omitted**, not shown empty (§13). |
| 9 | Time cell | `plan-modal.tsx:1456`–`1474` (`input-etp-event-time-*`) | MATCH | `type="time"`, **no default at all** — a plan carries no hour and midnight is not "no time given" (Locked Decision 35). Writes `user_experiences.start_time` (migration 282). |
| 10 | Footnote "Days and times default to your plan. Change any of them now or later from the slip." | `plan-modal.tsx:1487`–`1490` | **DIVERGENCE — corrected, deliberately** | Live: "Days and **places** default to your plan. Change any of them now or later from the slip. **A time is only ever the one you set.**" The artboard's sentence is false of the built behaviour and the live one says so. Correct as is. |
| 11 | "Guests are per event. Brunch can be family only." | — | **DIVERGENCE — not built** | No such line on this step. The claim survives on the Guests page footer (`plan-guests.tsx:305`–`308`). |
| 12 | Single CTA "**Create plan · 4 events**" | `plan-modal.tsx:1499`–`1563`, `:1571`–`1578` | **ALREADY-RULED** | The finish is the three ways to build (Build it myself / Plan with AI / Get a local expert) on the last visible step — Locked Decision 33: *"THE CHOOSER'S THREE WAYS TO BUILD ARE THE FINISH of the last visible step, not a sixth step and not a first one."* The count survives as the note "4 events will be created on your plan." (`:1575`–`1577`), shown only when a schedule step exists. |
| 13 | Step 5 exists at all | `plan-steps.ts:124`–`127` (`showsSchedule`) | MATCH | Visible only when the occasion's `default_schedule` is true. NULL ⇒ not shown (plain-plan shape). |
| 14 | Chips ticked before a plan exists | `plan-modal.tsx:359`–`362`; `server/services/pending-events.service.ts` | MATCH | Read through the ONE `readPendingEvents`, which handles both pen spellings (legacy `pendingEventTitles` and the rich `pendingEvents`), and drained at mint (Locked Decision 30b). |

## Classification

- **(A) contained:**
  - **#4** — add `Welcome Drinks` and `Farewell Brunch` anchors to `WEDDING_PRESETS` in `server/services/logistics-presets.service.ts:34`–`112` (each needs its **own** `anchorType`; `generatePresetsForTrip` de-duplicates by type). **Server-side only** — never a client list.
  - **#6** — split the `Day & time` header/cell into two columns in `client/src/components/trip/plan-modal.tsx:1411`–`1419` + `:1428`–`1474`, if the artboard's 4-column grid is wanted.
  - **#5** — render the free-text entry as a chip-shaped affordance in `client/src/components/trip/plan-modal.tsx:1386`–`1400` (cosmetic only; the behaviour is already better than drawn).
  - **#2** — no change recommended; a derived "over the weekend" would be a claim about the range.
  - **#11** — one `<p>` under `etp-step5-rows` in `client/src/components/trip/plan-modal.tsx:1487`, gated on `guestListSetting(selectedOccasion) === true` so it is not shown for a guests-off occasion.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #7 (defaults shown, not written), #8 (select of plan days), #10 (the corrected footnote), #12 (three-branch finish), #13.

**Not verifiable without a running server:** that `GET /api/logistics/presets/wedding` returns exactly the five labels to the client, and that the created `user_experiences` rows carry the chosen day/time/place.
