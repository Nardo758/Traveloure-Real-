# Unified plan entry — audit and proposal

> **Status — 2026-11-15.** Written before the work shipped. Since then, on `main`: **E1**, **E2**, **E4/E5**, **E6**, **LL-1** as listed in `plan-entry-click-paths.md`; **E7** `resolvePlanFlow` (#2021) merged and **deliberately unwired**, so the tap savings this file proposes are not yet delivered; the string **"Built around {name}"** is still **pending Leon's wording approval** and nothing depends on it yet.

Status: **read-only audit + proposal.** No code changed, no PR, not committed.
Base: `origin/main` @ `54373801d`. Every `file:line` below was read in this pass unless the row says
**unread** — those are named as doors that exist but whose internals were not opened, so nothing is
asserted about their order or their date component.

---

## 0. The finding that motivates the unification

The plan editor's When step **does not block a backwards range — it silently repairs it**:

```ts
// client/src/components/trip/plan-modal.tsx:858-860
} else if (start && end && new Date(end) < new Date(start)) {
  end = start;
}
```

A traveler who types First day 12/09, Last day 12/08 saves a **one-day plan** and is told nothing. The
shared calendar blocks the same input and says why (`PlanDatesCalendar.tsx:135` disables Save on
`validity !== "ok"`, `:124-126` shows `LEAVE_BEFORE_ARRIVE_MESSAGE` = *"Leave date can't be before your
arrive date."*, `client/src/lib/plan-dates-range.ts:23`).

So the two date paths disagree in the worst way: one refuses, one rewrites the traveler's answer. The
server now refuses both rails (`tripDateRangeRefusal` on `PATCH /api/trips/:id` and on
`PATCH /api/guest-plans/current`), which means today the modal's rewrite is the *only* path that
silently changes dates — and it does so before the server ever sees them.

---

## 1. Inventory of entry points

Legend — **Blocks?** = does the surface refuse a backwards range *in the UI* before saving.

### 1a. The two roots

| # | Door | file:line | Audience | Asks, in order | Date component | Endpoint | Blocks? |
|---|---|---|---|---|---|---|---|
| R1 | **Start-a-plan modal** ("Plan around…") | `client/src/components/plan/PlanEntry.tsx:245` (`PlanEntry`), `:256` (`PlanEntryPanel`); around options `:160-162` | guest + signed-in | around (A place · A date · An event) → occasion → *(dates + party only when an experience and a city are already known — `:7-10`)* → Start a plan | none on the around step; `plan-entry-step-details` on the conditional step | mint via `onStart` callback (`:138`, `:393`) into `PlanningContext` — **mint endpoint unread** | **unread** (no calendar in `PlanEntry.tsx`) |
| R2 | **Plan editor** (`PlanModal`) — Where · When · Who · What's happening | `client/src/components/trip/plan-modal.tsx` (2205 lines); step labels `client/src/lib/plan-steps.ts:206-211`; order `resolvePlanSteps` `:226-231`, `nextPlanStep` `:234` | signed-in (guest uses its own rail) | **Where → When → Who →** What's happening (last step only when the occasion has a schedule, `plan-steps.ts:228`) | **its own** `startDate`/`endDate` state (`:343-344`), **not** `PlanDatesCalendar` | `PATCH /api/trips/:tripId` `:1025`; `PATCH …/occasion` `:1001`; `POST …/anchors` `:830`; `POST /api/user-experiences` `:1087` | **NO** — `:858-860` shrinks to one day |

### 1b. The one shared dates panel (all of these DO block)

`InlineDatesPanel` (`client/src/components/plan/SlipAnchorPanels.tsx:61`) draws `PlanDatesCalendar`
(`PlanDatesCalendar.tsx`), whose title is `PLAN_DATES_CALENDAR_TITLE` = **"When are you going?"**
(`:37`), whose Save label is **"Save dates"** (`:40`), whose Save is `disabled={validity !== "ok" ||
saving}` (`:135`), and which shows `LEAVE_BEFORE_ARRIVE_MESSAGE` on `leave_before_arrive` (`:124-126`).
Its `save()` also refuses at the handler level (`SlipAnchorPanels.tsx:92-93`) and writes **either**
`PATCH /api/trips/${tripId}` (signed-in, `:99-104`) **or** the caller's `submit` (guest).

| # | Door | file:line | Audience | Asks | Endpoint | Blocks? |
|---|---|---|---|---|---|---|
| D1 | Header chip "Add dates" popover | `client/src/components/HeaderDatesPopover.tsx:36` | both | When (range) | signed-in → panel's `PATCH /api/trips/:id`; guest → `submit: updateGuestPlan` → `PATCH /api/guest-plans/current` | **yes** |
| D2 | Slip header panel | `client/src/components/plancard/SlipView.tsx:633`, `:2517` | signed-in (slip) | When | panel default → `PATCH /api/trips/:id` | **yes** |
| D3 | Leg sheet | `client/src/components/plan/LegSheet.tsx:94` | signed-in | When (for the leg's day) | panel default | **yes** |
| D4 | Free draft (slip) | `client/src/components/plan/useSlipFreeDraft.tsx:125` | signed-in | When | panel default | **yes** |
| D5 | **"When are you going?" first-add pop-up** | `client/src/components/plan/PlanAddFeedbackHost.tsx:248` | both | When, immediately after the first add | guest: `runGuestAdd`; signed-in: ref add (host) | **yes** |
| D6 | "Set your dates" chip | `client/src/components/plancard/SetPlanDates.tsx:75-82` → `onSetDates` → D2 | signed-in owner only (`D16`) | opens D2 | — | **yes** (via D2) |
| D7 | Slip "Who's coming?" party panel | `SlipAnchorPanels.tsx:266` area, Save `:314` | both | Who only (Adults/Kids or Attendees/Guests per `plan-steps.ts:437-443`) | — | n/a |

### 1c. Guest rail

| # | Door | file:line | Asks | Endpoint | Blocks? |
|---|---|---|---|---|---|
| G1 | Guest plan read | `client/src/lib/waitlist-guest-plan.ts:115`, `useGuestPlan` `:133` | — | `GET /api/guest-plans/current` | — |
| G2 | Guest plan create | `:145` | nothing (get-or-create) | `POST /api/guest-plans` | — |
| G3 | Guest plan update (dates/party) | `:156` | When/Who | `PATCH /api/guest-plans/current` | **yes** — schema refine (`guest-plan.service.ts` `b.endDate >= b.startDate`) **and** the new route guard |
| G4 | Guest claim | `:352` | — | `POST /api/guest-plans/claim` | — |
| G5 | Guest rail gate | `server/routes/guest-plans.routes.ts:111` (`waitlist` mode only, else 404), `:112` (`409 signed_in`) | — | — | — |

`/plans/new` (`App.tsx:918`) and the cart header are **unread** in this pass; both are named doors.

### 1d. Content-first doors (pick content, then build/attach a plan)

All of these go through `SaveToPlanButton` (`client/src/components/plan/SaveToPlanButton.tsx:10`, which
uses `useBrowseSaveToPlan` at `:25`); its default action toasts `WAITLIST_COPY.savedToPlan` (`:30`).

| # | Door | file:line | What it asks | Endpoint |
|---|---|---|---|---|
| C1 | City feed card (gem / event / experience cards) | `components/city-feed-card.tsx:1030`, `:1408`, `:1739`, `:2054` | **nothing** — one press saves | guest rail `POST /api/guest-plans/current/items` or the signed-in ref add |
| C2 | Catalogue search results | `components/catalogue-search-results.tsx:55` | nothing | as C1 |
| C3 | Discover location page | `pages/discover-location.tsx:1486` | nothing | as C1 |
| C4 | Places page | `pages/places.tsx:33` | nothing | as C1 |
| C5 | "Add to your plan" dialog | `components/add-to-experience-dialog.tsx:238` | a plan choice | **unread** |
| C6 | Multiple-plans picker | `client/src/components/plan/plan-picker.tsx:116` (radiogroup, aria-label **"Choose a plan"**) | which plan | — |

Expert pages, vendor pages, hotel/ready-made pages, event pages and the cart header all route through
C1/C5-shaped doors; their individual files were **not read** in this pass.

---

## 2. Moving pieces

| Piece | Where it lives today | State |
|---|---|---|
| **Plan anchor type** | place / date / event — `PlanEntry.tsx:160-162` ("A place" · "A date" · "An event") | exists, but only the Start modal knows it; `PlanModal` never asks |
| **Dates source** | user-picked (`PlanDatesCalendar`) **or** fixed by an event (occasion `default_duration` "day" ⇒ one date, `plan-modal.tsx:114-115`, `:852-857`) | exists, but the event case is expressed as a *shape*, not as a locked range with ± days |
| **Party ("Who")** | `plan-steps.ts:437-443` `partyFields(occasion)` → Adults/Kids or Attendees/Guests; `partyTotal` + `travelersForSave` (`plan-modal.tsx:31-32`) | one rule already; the slip asks it in its own panel (`SlipAnchorPanels.tsx:~266`) |
| **Guest → signed-in claim** | `waitlist-guest-plan.ts:352` → `POST /api/guest-plans/claim` | exists; not represented in any flow decision |
| **Waitlist mode (Kyoto only)** | client `useSignupMode` (`client/src/lib/signup-mode.ts`); server `guest-plans.routes.ts:111` | gates the whole guest rail; nothing else reads it |
| **Multiple plans** | `plan-picker.tsx:116` | exists; A8's duplicate rows are still unexplained (report pending) |
| **Server date guards** | `server/routes.ts:1637` (`PATCH /api/trips/:id`, merged window, `400 { code: "end_before_start" }`) and `server/routes/guest-plans.routes.ts:153` (same rule, merged over the stored plan) | **both live**; same-day allowed; message is the approved `LEAVE_BEFORE_ARRIVE_MESSAGE` text |

**The gap in one sentence:** the *server* has one date rule, the *calendar* has one date rule, and the
*plan editor* has a third behaviour (silent repair) that neither of them shares.

---

## 3. Proposed unified flow

One decision function, `resolvePlanFlow(input)`, returning the ordered fields still to ask. It replaces
`resolvePlanSteps`'s "always start at Where" with "start at the first thing we do NOT already know".

### 3.1 Decision table

Inputs: `root` ∈ {`content`, `start`}; `anchor` ∈ {`place`, `date`, `event`, `none`}; `known` ⊆
{`city`, `dates`, `eventDates`, `party`}.

| root | anchor | already known | Ask #1 | Ask #2 | Ask #3 | Finish |
|---|---|---|---|---|---|---|
| start | place | — | **Where** | **When** | **Who** | Start a plan |
| start | place | city | — | **When** | **Who** | Start a plan |
| start | date | — | **When** | **Where** | **Who** | Start a plan |
| start | date | dates | — | **Where** | **Who** | Start a plan |
| start | event | event (dates fixed) | **Which event day(s)** — only ± days before/after | **Where** (prefilled from the event's city; edit only if absent) | **Who** | Start a plan |
| start | none (plain "Start a plan" from a door) | city, dates, party all known | — | — | — | Start a plan |
| content | gem / place / experience / hotel / vendor | city (from the content) | *(the add itself)* | **When** | **Who** | Add + attach |
| content | gem / place | city **and** an active plan with a day | *(the add)* | — | — | Add to Day {n} (no ask) |
| content | event | eventDates | *(the add)* | **Who** | — | Add + attach (dates from the event) |
| content | expert / vendor | city | *(the add)* | **When** | **Who** | Add + attach |

### 3.2 The rules this table encodes

1. **A place plan asks Where first, then When, then Who.** (rows 1-2)
2. **A date plan leads with When.** (rows 3-4)
3. **An event plan takes its dates from the event** and only offers days before/after — never a free
   range. `default_duration = "day"` stays valid, but the *range* is anchored to the event's own dates
   instead of being shrunk silently. (row 5)
4. **Content-first infers what the content gives** (city, or event dates) and asks only the rest.
5. **Same-day is allowed; backwards ranges are blocked in every door** with the approved
   *"Leave date can't be before your arrive date."* — which means `plan-modal.tsx:858-860` must be
   replaced by the same refusal the calendar uses, not by a repair.
6. **One dates component.** `PlanDatesCalendar` is the only range input; the modal's bespoke
   `startDate`/`endDate` state (`plan-modal.tsx:343-344`) is deleted and replaced by it.
7. **Only ask what is missing.** A door that already knows the city never shows Where.

### 3.3 Strings

| Use | String | Status |
|---|---|---|
| range picker title | **"When are you going?"** | approved (`PlanDatesCalendar.tsx:37`) |
| range picker confirm | **"Save dates"** | approved (`:40`) |
| range refusal | **"Leave date can't be before your arrive date."** | approved (`plan-dates-range.ts:23`) |
| skip the dates step | **"Skip for now"** | approved (first-add panel) |
| root chooser | **"Plan around…"** · **"A place"** · **"A date"** · **"An event"** | approved (`PlanEntry.tsx:160-162`) |
| party ask | **"Who's coming?"** | approved (party panel) |
| step labels | Where / When / Who / What's happening | approved (`plan-steps.ts:206-211`) |
| event window helper | "Days before or after the event" | **PENDING Leon wording** |
| event window bounds | "How many days before?" / "How many days after?" | **PENDING Leon wording** |
| anchor line on a plan built from content | "Built around {name}" | **PENDING Leon wording** |

No new string is required to fix the defect itself — the refusal sentence already exists.

---

## 4. Migration path — small PRs, each off `main`

| PR | Scope | Files | Deletes / merges | Risk | Tests to add |
|---|---|---|---|---|---|
| **P1** | **Kill the silent repair**: replace `plan-modal.tsx:858-860` with the same refusal the calendar uses; Save disabled + `LEAVE_BEFORE_ARRIVE_MESSAGE` shown on the When step | `client/src/components/trip/plan-modal.tsx` | nothing deleted | Low. Behaviour change is the fix; same-day still allowed | modal-level test: 12/09 → 12/08 blocks and shows the sentence; 12/03 → 12/03 saves |
| **P2** | **One dates component in the editor**: When step renders `PlanDatesCalendar` instead of its own `startDate`/`endDate` state + month grid | `plan-modal.tsx`, `client/src/lib/plan-steps.ts` (step contract), `PlanDatesCalendar.tsx` (props only) | the modal's bespoke date state and grid | Medium: the editor seeds from an edit window (`penSeed`, `:470-471`, `:635-636`) and must keep that prefill | prefill parity test; "day" shape still one date; range shape same-day |
| **P3** | **`resolvePlanFlow`**: extract the decision table into one pure function with the existing `resolvePlanSteps` as a caller, so every door asks only what is missing | new `client/src/lib/plan-flow.ts`, `plan-steps.ts`, `PlanEntry.tsx` | `resolvePlanSteps` becomes a thin wrapper | Medium: touches both roots in one file each; table tests make it safe | table tests over (root × anchor × known) — at least the eleven rows above |
| **P4** | **Content-first attaches instead of toasting**: a card press with no active plan opens the When step (reusing D5 `PlanAddFeedbackHost`), not a toast | `client/src/components/plan/SaveToPlanButton.tsx`, `components/city-feed-card.tsx`, `components/catalogue-search-results.tsx`, `pages/discover-location.tsx`, `pages/places.tsx` | the `WAITLIST_COPY.savedToPlan` no-op toast on the no-plan path | **Highest** — five surfaces, and the guest/waitlist path must not gain a priced control | per-surface: press with no plan opens When; press with an active plan and a day adds without asking |
| **P5** | **Event anchor**: an event-sourced plan locks its range to the event and offers only ± days | `client/src/lib/plan-steps.ts` (new anchor input), `plan-modal.tsx`, `client/src/lib/occasion-switches.ts` (read only) | the free range on the event path | Medium: occasion `default_duration` must keep working | event anchor test: dates prefilled and read-only; ± window clamps; no free range |
| **P6** | **One party ask**: the slip's "Who's coming?" panel and the editor's Who step read the same `partyFields` labels and the same save | `SlipAnchorPanels.tsx` (~226-320), `plan-modal.tsx` | a duplicated party save if one exists after P2 | Low | label parity (Adults/Kids vs Attendees/Guests); one `PATCH` per save |

**No schema change and no migration in any of the six.** The server guards already exist and already
agree (`server/routes.ts:1637`, `guest-plans.routes.ts:153`); nothing here needs a column. The one
unavoidable question is product, not schema: whether an event-sourced plan should store its ± window as
two fields or derive it from the event (P5 can derive it; storing it would be a migration and is **not**
proposed).

### Risks worth naming

1. **P4 is the only PR that changes what a press does** on five surfaces at once. If it slips, the
   guest/waitlist path could start asking for dates where it currently just saves — which would be a
   regression against the "no priced controls on the guest path" rule. It should land last of the
   client PRs, or behind its own review.
2. **P2 deletes the editor's date grid.** The edit window prefill (`penSeed`) is the subtle part; a
   "same day" regression there would look like a save bug.
3. **A8's duplicate plans** are still unexplained. Until that report lands, P3's "attach to which plan"
   question cannot be finished honestly.
4. The modal's `shape === "day"` branch (`:852-857`) is *correct* and must not be swept away with
   `:858-860` — a one-day occasion is not a reversed range.

---

## 5. What this audit did not read

`/plans/new`, the cart header, the slip's "Edit stops", pending-gem recovery in `PlanningContext.tsx`,
and the expert / vendor / hotel / event page internals were named but not opened. They are the same two
shapes (content-first or editor), so the decision table should cover them, but their ask order and
endpoints are **asserted nowhere above**.
