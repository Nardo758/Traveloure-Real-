# Wedding / occasion flow — ratified mock artboards

24 files: 22 `.dc.html` artboards, the `canvas.json` that lays them out, and the original
`wedding-on-the-landing-page.html`. Committed 2026-09-04.

## Why these are here

**They existed only in a session scratchpad and had never been committed anywhere.** Several are
cited as ratified authority by CLAUDE.md Locked Decisions 28–31 and by the `2026-09-0*` ledger rows
("the ratified mock draws…"), and the remote session container that held them is reclaimed after
inactivity. Rulings that cite a mock nobody can open are unfalsifiable. This commit is preservation
only — no code changes, no ruling changed, nothing built.

## Status — read this before treating the table as truth

The **live-surface** column below was resolved by grep and by the lanes merged on 2026-09-04. The
**fidelity** column is honest about what has actually been checked:

- **`ruled`** — the divergence is deliberate and a ledger row says so. Do not "fix" it.
- **`built`** — the lane that implements this artboard merged, and its own tests pin the behaviour.
- **`surface exists — UNAUDITED`** — a live surface was found at that path, but **nobody has
  compared it to this artboard**. It may match, may diverge, may be a different design entirely.
  Do not read this as "done".

An `UNAUDITED` row is not a claim of conformance. To turn one into a finding, write a brief under
`docs/design/mock-audits/` following that directory's `INDEX.md` rules of engagement — in
particular *report, don't repair*, and the note that dead routes here return **200 + HTML** from the
Vite catch-all rather than 404.

## Flow order — the canvas does not show it

`canvas.json` lists artboards in **creation order, not flow order**, and the step naming is
inconsistent: steps 1/3/4 are `Step<N><Name>` while **step 2 is `ModalWhere.dc.html`** and step 5 is
`ModalEvents.dc.html`. There is no `Step2*` file, which reads as a missing step — it is not missing.
The real order:

```
Landing        Before → Main → NavEntry → NavTuned
Plan modal     Step1Occasion → ModalWhere (2) → Step3When / Step3Day (3)
                 → Step4Who / Step4Variants (4) → ModalEvents (5)
Plan surfaces  StripLead → Slip → WhichEvent → Mismatch → Guests
Variants       OccasionRow, SlipProposal, Planner, TravelWhere, TravelWhen, TravelEvents
```

Renaming the two odd files is a **decision, not a tidy-up** — these are ratified artboards — so it is
tracked as a lane in `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md` rather than done here.

## The artboards

### Page 1 — Landing

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Before.dc.html` | Moments section today | `client/src/components/landing/moments-section.tsx` | surface exists — UNAUDITED |
| `Main.dc.html` | Landing page with Wedding | `client/src/pages/landing.tsx`, `landing/moments-slot.tsx` | surface exists — UNAUDITED |
| `NavEntry.dc.html` | Nav · Experiences dropdown today | `client/src/lib/nav-config.ts` (`navGroupsConfig`) | surface exists — UNAUDITED |
| `NavTuned.dc.html` | Nav · tuned by class (proposal) | `client/src/lib/nav-config.ts` | surface exists — UNAUDITED |

### Page 2 — Full flow

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Step1Occasion.dc.html` | Step 1 · Occasion | plan modal, step 1 | surface exists — UNAUDITED |
| `ModalWhere.dc.html` | Step 2 · Where | plan modal, step 2 | surface exists — UNAUDITED |
| `Step3When.dc.html` | Step 3 · When (event class) | plan modal, step 3 | surface exists — UNAUDITED |
| `Step3Day.dc.html` | Step 3 · a day, not a range | plan modal, step 3 (`default_duration`) | surface exists — UNAUDITED |
| `Step4Who.dc.html` | Step 4 · Who | plan modal, step 4 (`vocabulary`) | surface exists — UNAUDITED |
| `Step4Variants.dc.html` | Four occasions, one control | plan modal, step 4 | surface exists — UNAUDITED |
| `ModalEvents.dc.html` | Step 5 · What's happening | the chips; pen drained at mint by `pending-events.service.ts` | **built** — ledger `2026-09-03-switch-readers`, `2026-09-04-plan-mint` |
| `StripLead.dc.html` | Trip Strip · one new chip | `client/src/components/trip/trip-strip.tsx` | **built** — `trip-strip-lead.test.tsx` 17/17 |
| `Slip.dc.html` | The slip · day → event → items | `client/src/lib/slip-events.ts` + plancard | **built** — ledger `2026-09-04-slip-events`, 17/17 |
| `WhichEvent.dc.html` | Add to Plan · which event? | `client/src/lib/which-event.ts`, `service-detail.tsx` | **built** — ledger `2026-09-04-which-event-picker`. **Two ruled omissions:** no clock time (`event_date` is a DATE with no time column), and the "suggested for florists" hint was left blank pending `experience_types.roles_needed` — **that column now exists** (migration 280, ledger `2026-09-04-roles-needed`), so the hint is buildable and is the one open piece of this artboard. |
| `Mismatch.dc.html` | Location mismatch | `client/src/lib/location-mismatch.ts` | **built** — ledger `2026-09-04-location-mismatch`, 54/54. **One ruled omission:** the "add as a stop" action needs ordered `trip_destinations`, which does not exist; HELD pending ratification. |
| `Guests.dc.html` | One list, a column per event | `client/src/components/logistics/participant-travel-tracker.tsx` | surface exists — **UNAUDITED, and the column-per-event layout is the least likely to be built.** The 2026-09-04 guest lane (`2026-09-04-guest-list-reconciliation`) fixed a dead participant write and diagnosed two divergent lists; it did **not** build this layout. |
| `SlipProposal.dc.html` | The slip · a private proposal | plancard under `default_visibility: hidden` | **ruled** — hidden occasions have no guest surface (`SlipLogisticsSection`, Locked Decision 28) |
| `OccasionRow.dc.html` | An occasion is a row, not a class | `experience_types` switch columns | **built** — migration 276, Locked Decision 28 |

### Page 3 — Other experiences

| Artboard | Title | Live surface | Fidelity |
|---|---|---|---|
| `Planner.dc.html` | `/start/events` · three doors | `client/src/pages/start-events.tsx` | surface exists — UNAUDITED |
| `TravelWhere.dc.html` | Golf trip · Where (stops) | plan modal, step 2 under `default_stops: many` | surface exists — UNAUDITED. Ordered stops have **no `trip_destinations` table**; HELD. |
| `TravelWhen.dc.html` | Golf trip · When (range only) | plan modal, step 3 under `default_duration: range` | surface exists — UNAUDITED |
| `TravelEvents.dc.html` | Golf trip · step 5 (tee times) | the chips under `default_schedule` | surface exists — UNAUDITED. Note **tee times are clock times**, and `user_experiences` has no time-of-day column — the same constraint that kept clock times off `WhichEvent`. Rendering them would need a schema decision. |

## Known blockers, carried from the ledger

| Blocker | Blocks |
|---|---|
| `trip_destinations` (ordered stops) — does not exist, HELD | `Mismatch` "add as a stop"; `TravelWhere` stop list |
| no time-of-day column on `user_experiences` | clock times on `WhichEvent`; `TravelEvents` tee times |
| `experience_types.roles_needed` — **RESOLVED** (migration 280) | `WhichEvent` role hint is now buildable |
