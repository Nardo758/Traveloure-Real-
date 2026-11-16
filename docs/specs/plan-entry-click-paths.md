# Plan-entry click paths, and where a smart surface fits

> **Status — 2026-11-15.** Written before the work shipped. Since then, on `main`: **E1** the plan editor refuses a backwards range (#2005); **E2** direct Add on event and ready-made pages (#2006); **E4/E5** one calendar in the plan editor (#2019); **E6** a save with no write no longer says "Saved", and an in-plan save opens Details (#2017, #2018); **E7** `resolvePlanFlow` merged but **wired to no door** (#2021); **LL-1** a plan row's Details opens the stop's in-app page (#2014, #2004). Read this as a spec **plus** its shipping state — not as "spec, not code".

Status: **read-only.** No code, no PR, not committed. Base `origin/main` @ `a70b426f2`.
Inputs: `docs/specs/unified-plan-entry.md` §1-4 (the inventory), `action-engine.md` rev 3 (read in full),
and a repo search for any "smart surface".

**What the repo actually has** (searched: `smart surface`, `SmartSurface`, `SurfaceContext`,
`surface-aware`, `surfaceAware`, `resolveActions`, `smart slip`, `smart card`): **zero matches.** The
action engine is a **spec, not code** — `resolveActions`, `ContentItem`, and `ActionContext` exist only
in `action-engine.md`. What does exist, and is the nearest thing to a smart surface:

| Module | What it is | Verdict |
|---|---|---|
| `client/src/lib/plan-actions.ts:160` `planActionsVisible`, `:179-186` `planActionsPrimary` (Book → Add → Hire → browse → moreInfo) | the CURRENT author of which control draws, per site + intent | the thing `resolveActions` would replace |
| `shared/content-cta.ts` `resolveContentCTA`, `shared/buy-action.ts` | content-type → buy/partner classification | the layer the engine extends |
| `shared/trip-primary-surface.ts` | date-derived rule for *whether the Trip Card is the primary surface* (finalized / T-48h / underway) | a **surface** rule, not an action rule |
| `shared/content-surface-map.ts` | content types ↔ platform surfaces ↔ routing | a map, not a brain |
| `client/src/lib/trip-capabilities.ts` | consumes `GET /api/trips/:id/capabilities`, fail-closed | the only ctx-like gate reader today |

So: **no smart surface exists yet; there is one CTA author (`plan-actions.ts`), one surface map, and a spec.**

---

## Summary table

Taps = distinct presses. **(a)** = content saved to a day/the plan. **(b)** = the page the traveler is on
shows the new state without a reload. Guest = waitlist mode (Kyoto today). "Unread" = door exists, internals
not opened in this or the prior pass.

| Door | Audience | Plan state | Taps to (a) today | Taps to (b) today | Taps after P1-P6 | Surface-aware |
|---|---|---|---|---|---|---|
| **R1** Start-a-plan (`PlanEntry`) | signed-in | none | 4-5 | 4-5 | **3** | yes (mint routes to the plan) |
| **R1** Start-a-plan | guest | none | 4-5 | 4-5 | **3** (+1 claim, unchanged) | yes (guest view written by the rail) |
| **R2** Plan editor (`PlanModal`) | signed-in | active + dates | 6-8 (edit dates: 5) | 6-8 | **4** | yes (invalidates on save) |
| **D1** Header "Add dates" popover | both | none or active | 4 | 4 | **4** | yes (`/api/trips` invalidated) |
| **D2** Slip header panel | signed-in | active | 4 | 4 | **4** | yes |
| **D3** Leg sheet | signed-in | active | 4 | 4 | **4** | yes |
| **D4** Free draft | signed-in | active (draft) | 4 | 4 | **4** | yes |
| **D5** First-add "When are you going?" | both | none→active | add (1) + 3 | same | **1 + 3** | yes |
| **D6** "Set your dates" chip | signed-in owner | active, no dates | 1 → D2 = 5 | 5 | **5** | yes |
| **D7** "Who's coming?" panel | both | active | 2 (open + Save) | 2 | **2** | yes (prefix invalidation) |
| **G1-G5** Guest rail | guest | none→active | 3-5 | 3-5 | **3** | yes (rail writes its own query data) |
| **C1** City feed / discover card, **active plan + day** | signed-in | active | **1** | **1** | **1** | yes (toast + invalidations) |
| **C1** same, **no plan** | signed-in | none | 1 | **partial** | **1 + 3** | **partial today** (toast only) |
| **C1** same, guest | guest | none | 1 | 1 | **1 + 3** | yes (guest rail) |
| **C2** Catalogue row | signed-in | either | 1 | partial | 1 + 3 | partial |
| **C3** Discover location | both | either | 1 | partial | 1 + 3 | partial |
| **C4** Places page | both | either | 1 | partial | 1 + 3 | partial |
| **C5** "Add to your plan" dialog | signed-in | multiple plans | 2 (open + pick) | 2 | **1** (picker only when >1 plan) | yes, **unread** |
| **C6** Plan picker | signed-in | multiple plans | 1 | 1 | 1 | yes |
| **`/plans/new`** (`PlansNewStart`) | both | none | **5-6** (city → occasion → start → end → Save dates → Who) | **5-6** | **4** | yes — a mint routes to the plan |
| **Cart header — "Edit trip"** | signed-in | active | **6-8** (it is R2: opens the one planning modal) | 6-8 | **4-5** | yes (modal invalidates) |
| **Slip "Edit stops"** | — | — | **does not exist** — no control by that name | — | — | n/a |
| **Pending-gem recovery** | both, post-sign-in | none or active | **1** (retry) **+3** if no plan | **1** | **1** | yes (add-runner invalidations) |
| **Expert page (traveler view = storefront)** | both | none or active | **1** Book/Hire (open) · **2** Add via sheet | **1-2** | **1-2** | yes (`PlanActions` + invalidations) |
| **Vendor page (= a storefront listing)** | both | none or active | **1** Book (open) · **2** Add via sheet | **1-2** | **1-2** | yes |
| **Event page** | both | none | **1** "Plan around it" → R1 (**5-6** to a plan) | 5-6 | **3-4** | yes (mint routes to plan) |
| **Hotel / ready-made page** | both | none | **1** "Plan around it" → R1 (**5-6** to a plan) | 5-6 | **3-4** | yes |

"Partial" = the state lands server-side and a toast says so, but nothing on the page re-reads the plan
(see C1-no-plan below).

---

## 1. Click paths, door by door

Evidence for the *awareness* column is one mechanism, so it is stated once: a signed-in add invalidates
three keys — `["/api/trips/:id/plancard"]`, `["/api/trips", tripId]`, `["/api/trips"]`
(`client/src/lib/plan-add-runner.ts:208-210`) — plus `refreshSavedRefs` (`:21`) for the "Added ✓" state.
A guest add writes the guest query data itself (`waitlist-guest-plan.ts:156`). **Awareness is
query-invalidation, and it exists only on paths that run that code.**

### R1 — Start a plan ("Plan around…")

`client/src/components/plan/PlanEntry.tsx:245`, panel `:256`, around options `:160-162`
("A place" · "A date" · "An event").

**Signed-in, no plan, "A place" — today: 5 taps to (a), 5 to (b)**
1. "Start a plan" (the door's own CTA; `PLAN_START_HREF` = `/?start=1`, `client/src/lib/plan-entry.ts:437`)
2. **Prompt: "Plan around…"** → "A place"
3. **Prompt: city** (typeahead or one of the eight market chips)
4. **Prompt: "What's the occasion?"** → occasion (or skip)
5. "Start a plan" → mint (via `onStart`, `:138`/`:393`, into `PlanningContext.tsx`) → lands on the plan

**(b)** is the same 5: the mint routes to the plan, so the surface *is* the plan. With an experience +
city already known, an extra **dates-and-party** step appears (`plan-entry-step-details`, `:7-10`) → 7-9
taps.

**Guest, no plan:** identical taps; the guest's Start writes the v2 sign-in record
(`PlanningContext.tsx:19`, local note) and later claims via `POST /api/guest-plans/claim`
(`waitlist-guest-plan.ts:352`) — the claim is a separate deliberate act, today 2 taps from a prompt.

### R2 — Plan editor (`PlanModal`)

`client/src/components/trip/plan-modal.tsx` (2205 lines). Step order `Where → When → Who → What's
happening` via `client/src/lib/plan-steps.ts:206-211`, `:226-231`, `nextPlanStep` `:234`.

**Signed-in, active plan, edit the dates — today: 5 taps to (a), 5 to (b)**
1. TripStrip "Edit" (prompt: the modal opens on **Where**, `resolvePlanSteps` always starts there `:230`)
2. "Next" → **When**
3. open the date fields, pick first day
4. pick last day
5. "Save" → `PATCH /api/trips/:tripId` (`:1025`)

**(b)** yes — the save invalidates the plan reads. **But the defect:** a backwards range is *not* refused.
`plan-modal.tsx:858-860` rewrites `end = start`, so step 4's 12/08 silently becomes 12/09 and the traveler
sees a one-day plan with no message. (Same-day is correct and stays: `:852-857`.)

Going through all four steps instead of jumping costs 8 taps.

### D1 — Header "Add dates" popover

`client/src/components/HeaderDatesPopover.tsx:36` → `InlineDatesPanel` → `PlanDatesCalendar`
(title **"When are you going?"** `:37`, Save **"Save dates"** `:40`, refused when inverted `:135`,
message `:124-126`).

**Both audiences, any plan state — 4 taps to (a), 4 to (b)**
1. "Add dates" chip → **popover opens the panel**
2. pick first day
3. pick last day
4. "Save dates" → signed-in `PATCH /api/trips/:id` (`SlipAnchorPanels.tsx:99-104`) / guest
   `updateGuestPlan` → `PATCH /api/guest-plans/current` (`waitlist-guest-plan.ts:156`)

A backwards range **cannot** get past step 4 — Save is disabled and the sentence is shown.

### D2-D6 — the other InlineDatesPanel surfaces

`SlipView.tsx:633`, `:2517`; `LegSheet.tsx:94`; `useSlipFreeDraft.tsx:125`; chip `SetPlanDates.tsx:75-82`;
first-add `PlanAddFeedbackHost.tsx:248`. All four taps, all refuse inversions, all invalidate on save.

**D5 first-add (both, no plan → active):** add from a card (1) → the panel opens itself → 3 taps
(2 start, 3 end, 4 "Save dates"). **(a)** 4; **(b)** 4. "Skip for now" is the 1-tap escape and leaves the
item on Day 1 (`PlanAddFeedbackHost.tsx` header note).

### D7 — "Who's coming?"

`SlipAnchorPanels.tsx` ~`:266` panel, Save `:314`.
**2 taps:** open the panel, Save → `PATCH /api/trips/:id/occasion` (party) — invalidates the trips family
(`SlipAnchorPanels.tsx:35-44`), so **(b)** is 2.

### G1-G5 — Guest rail

Read `waitlist-guest-plan.ts:115`, create `:145`, update `:156`, items `:210`, claim `:352`; gate
`server/routes/guest-plans.routes.ts:111-112` (waitlist only, else 404; signed-in gets 409).
**No plan → active, 3-5 taps** depending on the door: content press writes the item (`:210`) and the
first-add panel asks dates (3 more). **(b)** immediate: the rail writes its own query data.

### C1-C4 — content-first cards ("one press")

`SaveToPlanButton.tsx:10` (via `useBrowseSaveToPlan` `:25`) used by `city-feed-card.tsx:1030`, `:1408`,
`:1739`, `:2054`; `catalogue-search-results.tsx:55`; `discover-location.tsx:1486`; `places.tsx:33`.

**Active plan with a day — 1 tap to (a), 1 to (b).** Press → ref add → invalidations
(`plan-add-runner.ts:208-210`) → toast **"Added to Day {n}."** with Undo / Change day / View plan, and the
card's own state flips via `refreshSavedRefs`. This is the best path in the product.

**No plan — 1 tap to (a)-ish, and the surface stays unaware.** The default action is
`toast({ title: WAITLIST_COPY.savedToPlan })` (`SaveToPlanButton.tsx:30`): a message, no panel, and on the
signed-in path no `PATCH` of dates. The traveler is told something was saved but the page shows no dates,
no day, no plan link. This is the gap P4 would close by opening the D5 panel instead.

### C5-C6 — choosing among plans

`add-to-experience-dialog.tsx:238` "Add to your plan" (2 taps: open, choose); `plan-picker.tsx:116`
radiogroup aria-label **"Choose a plan"** (1 tap). **Both unread in detail**; the A8 duplicate-rows report
is still outstanding, and until it lands the picker cannot be trusted to list one row per plan.

### Unread doors

`/plans/new` (`PlansNewStart.tsx:13`, 1 export read), the cart header, the slip's "Edit stops", and
pending-gem recovery (`PlanningContext.tsx:45-51` shows it imports `PlanEntry` and the entry helpers, so it
is R1-shaped) are named, not measured. Expert / vendor / event / hotel pages are C1/C5-shaped doors.

---

## 2. The same map under P1-P6

| Door / scenario | Today | After | What removes the taps |
|---|---|---|---|
| R1 place, signed-in, no plan | 5 | **3** | P3: no Where when the door passed a city; no occasion step when the content names it |
| R1 date, no plan | 5 | **3** | P3: When leads, then Where, then Who — one screen each, nothing repeated |
| R1 event | 5-7 | **3** | P5: dates come from the event; only the ± window is asked |
| R2 edit dates, active plan | 5 | **4** | P2: one dates component opens straight at When, Save in place (no Next through Where) |
| R2 full edit | 8 | **5** | P3: Where is skipped when the plan already has a city |
| D1-D4 (all panel doors) | 4 | **4** | unchanged — already one component, already blocks |
| D5 first-add | 1 + 3 | **1 + 3** | unchanged; P4 reuses it as the no-plan follow-up |
| C1 no plan | 1 (+ toast) | **1 + 3** | P4: the press opens D5 instead of a toast — same total, but now it *finishes* |
| C1 active plan + day | 1 | **1** | unchanged |
| C5 picker | 2 | **1** | P3: only shown when more than one plan exists |

**Net:** the two roots lose 2 taps each, the editor loses 1-3, and the only path that *gains* taps (C1
no-plan: 1 → 4) gains them because it stops lying — today it ends in a toast with no dates.

---

## 3. Smart-surface fit

### Does the action engine already solve any of this?

**No — because it does not exist yet.** Rev 3 is a design. Nothing named `resolveActions`, `ContentItem`
or `ActionContext` is in the tree. What exists and overlaps:

| Question | Owner today | Owner after the engine lands |
|---|---|---|
| **Which button shows** | `plan-actions.ts:160/179-186` (Book → Add → Hire → browse → moreInfo), `ADD_COPY`, `resolveContentCTA` | `resolveActions` — one primary, ordered secondaries (`action-engine.md` §3) |
| **What to ask next** | `plan-steps.ts:226-241` (`resolvePlanSteps` + `nextPlanStep`) + `PlanEntry`'s own step machine | **nobody in the engine spec** — it is silent on plan-entry questions |
| **Does the surface know the plan state** | query invalidation in `plan-add-runner.ts:208-210`, `SlipAnchorPanels.tsx:35-44` | partly: `ctx.alreadyOnPlan`, `ctx.planCapabilities` (`action-engine.md` §2) give the engine the *facts*; the *refresh* is still invalidation |

So the engine owns **which button**, and it explicitly leaves start-plan CTAs to the caller
(`§3 "Start-plan CTAs stay caller-owned"`). It says nothing about **what to ask next** — that is exactly
the seam `resolvePlanFlow` fills.

### Should `resolvePlanFlow` live inside the engine?

**No — sibling, not child.** Reasons, from the spec's own shape:

1. `resolveActions(item, ctx)` is **per item**: its output is a primary + secondaries for one card/stop.
   `resolvePlanFlow(root, anchor, known)` is **per journey**: its output is an ordered list of *questions*.
   Different arity, different lifetime, different callers (one runs per tile, the other once per door).
2. The engine already has a queue of live work (§10 migration steps 1-6, LL-1 retarget, the 4+1 trim, the
   Ask chooser). Folding a flow machine into it would put the plan-entry rewrite behind that queue.
3. They share exactly **one** input — `ctx.signedIn` / `ctx.mode` / `ctx.knownDay` — which is better
   passed in than merged: `resolvePlanFlow(root, anchor, known, ctx)`.

**Proposed seam:** `resolvePlanFlow` returns `{ steps, primary }`, where `primary` is looked up from
`resolveActions` once the engine exists. Until then it reads `planActionsPrimary`. That is one call
site, and it is how P3 avoids authoring a second button vocabulary.

### What that removes from P3-P6

| PR | Without the engine | With the engine owning `primary` |
|---|---|---|
| **P1** (kill the silent repair) | unchanged | **unchanged — the engine cannot fix it.** `plan-modal.tsx:858-860` is a state-level rewrite *before* any save; no action table sees it. P1 is still required on its own. |
| **P2** (one dates component) | unchanged | unchanged — a component swap, no action decision |
| **P3** (`resolvePlanFlow`) | authors its own "what's next" table | **keeps** the table, but its **Finish** button's label/visibility comes from `resolveActions` instead of a third copy |
| **P4** (content-first attaches) | each surface decides whether to open D5 | **shrinks a lot**: "is there an Add primary for this item, and is it `alreadyOnPlan`?" is `resolveActions` output — P4 only maps `primary.key === "add"` + no plan → open D5 |
| **P5** (event anchor) | a new anchor input in `plan-steps.ts` | unchanged; the engine has no notion of an event window |
| **P6** (one party ask) | two panels read `partyFields` | unchanged; party is not an action |

### What it cannot solve

1. **The silent date repair (P1).** `plan-modal.tsx:858-860` rewrites the traveler's answer before any
   save. The engine decides *which control draws*; it never sees the modal's `startDate`/`endDate` state.
2. **The refresh.** `resolveActions` returns facts (`alreadyOnPlan`, `planCapabilities`), not
   invalidation. The C1-no-plan hole is a *refresh* hole — `SaveToPlanButton.tsx:30` toasts and stops.
3. **Stale dates on a surface** ("shows stale dates" in the brief) — that is the query cache, not the
   action table.
4. **A8's duplicate plans** — a data question, not an action question.

### One-line conclusion

The action engine decides **what a card offers**; `resolvePlanFlow` decides **what a journey asks**. They
meet at exactly one point — the Finish button — and merging them would put the flow rewrite behind the
engine's six-step rollout while fixing neither the date repair nor the refresh hole.
