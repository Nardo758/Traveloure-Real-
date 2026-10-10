# Slip Conformance — Phase 0 (read-only)

**Lane:** Slip Conformance. **Owner:** the Logistics session, from Oct 8, 2026. Track A ceded
`client/src/components/plancard/SlipView.tsx`, `client/src/components/plancard/SlipRail.tsx` and
`client/src/components/plan/*` to this lane; the transfer is recorded in ledger row
`2026-10-08-conformance-slip-phase0`. Out of lane: PlanEntry, home and nav.

**Boards:** the Trip Slip Redesign canvas, https://claude.ai/artifact/JTcj1r66h2rSAJZ2tNtTCu. Rev 15 is
pending today. This brief was read against the published version `1791419718-0c51`: 11 boards and notes
s1–s10. If rev 15 changes a board, the rows below that cite it need a re-read.

**Code:** `main` at `f413edab1` (the tree this brief was read on; F1 #1336 touched only `GettingAroundSheet.tsx` and `getting-around.ts`). Line numbers are that tree's; the tokens PR that carries this brief adds two import lines to `SlipView.tsx`.

**No code, no test edits, no migration.** None is expected, and none turned up in this read.

---

## 0. The boards, and where each one lives in the app

| # | Board | Size | Route it describes | In this lane's files? |
|---|---|---|---|---|
| 1 | Empty — anchor question | 390×1000 | `/plans/:id`, empty plan | yes: SlipView, AnchorPanel |
| 2 | Main — drafted (tools tray, days, expert note, where to stay) | 390×2380 | `/plans/:id`, drafted | yes: SlipView, SlipRail, plan/* |
| 3 | Compare — places to stay, plan-fit | 390×1240 | `/plans/:id/compare/:setId` (`pages/plan-compare.tsx`, App.tsx:715) | **no**: page + `plancard/SlipOptionSets.tsx` |
| 4a | Optimized — choose a version | 390×1400 | `/itinerary-comparison/:id` (`pages/plan-versions.tsx`, App.tsx:183/697) | **no**: `plancard/VersionsBoard.tsx` |
| 4b | Versions — day by day | 390×1100 | same | **no** |
| 4c | VersionsDesktop — A/B/C/Your plan | 1280×980 | same | **no** |
| — | Template — Experiences entry | 390×1240 | `/experiences` (App.tsx:610) | **no** (plan entry: out of lane by the dispatch) |
| — | Moment — same slip as a Moment | 390×1240 | `/plans/:id`, Moment group | yes |
| — | Map — one day, version toggle, Browse layer | 390×1180 | `/plans/:id?view=map` | yes, plus `plancard/MapControlCenter.tsx` (not transferred) |
| — | TripCard — finalized + live overlay | 390×1480 | `/trip/:id` (App.tsx:684) | **no**: `plancard/TripCardDays.tsx`, `TripCardRail.tsx`, `PlanCard.tsx` |
| 5 | Handoff — pen handed off | 390×1500 | `/plans/:id`, expert has the plan | yes: SlipView, `plan/HandoffBanner.tsx` |

Only Empty, Main, Moment, Map and Handoff draw `/plans/:id`. The other six draw neighbouring pages, whose
files were not ceded to this lane. Each of them is marked "**ruling needed: owner**" in §6.

**Board-side findings, reported here and not acted on:**
- Main's finding badges put white text on `#E85D55`. That breaks LD 45 (7) as amended on Oct 5: a fill
  behind white text is `#C8443D`.
- Main's day-5 flag line uses `#B85C50`, which isn't one of the three coral tokens.
- s1 says "No travel minutes are printed anywhere". Steps 9a/9c print routed and unrouted legs between
  stops, on qualifying plans and on any plan with a stored minute. The two conflict; see §5 R6.

---

## 1. Component inventory of `/plans/:id` today

**Page chain:**
- `App.tsx:727`: `<Route path="/plans/:tripId">` → `PlanPageShell` (`components/plan-page-shell.tsx:9`).
- The shell renders `DashboardLayout` (or `EALayout` for an EA). `DashboardLayout` sets
  `.console-scope` at `dashboard-layout.tsx:24` with a 220px sidebar.
- That wraps `pages/slip-view.tsx`, whose wrapper is `p-4 sm:p-6 space-y-4`.

Board region legend: **E** Empty · **M** Main · **Mo** Moment · **H** Handoff · **Map** · "—" means no board
equivalent.

### 1a. Page level (`pages/slip-view.tsx`)

| Component | file:line | Board region |
|---|---|---|
| `ConciergeCard` (ready-made clone only) | slip-view.tsx:73 | — |
| `SlipView` | slip-view.tsx:79 | everything below |
| `renderLegBetween.sheet` → `LegSheet` | slip-view.tsx:80, plan/useSlipLegs.tsx, plan/LegSheet.tsx:46 | — (no board draws a leg sheet) |
| Load / rate-limit / unavailable states | slip-view.tsx:39–68 | — |

### 1b. `SlipView` render tree (`plancard/SlipView.tsx`)

The root at :2044 is `max-w-6xl mx-auto space-y-5`.

| Component | file:line | Board region |
|---|---|---|
| `TripCardPrimaryBanner` | :2052 (def :1295) | — |
| `SavePaymentMethodPrompt` (LD 43(d) mount 2, owner + primary + bookable) | :2060 | — (LD 43 requires the mount; board silent) |
| Delegate note + `SlipAddItemControl` (EA delegate) | :2076, :2082 | — |
| `PlanApprovalBanner` | :2094 | H "When [Expert] is done" card (approval) — partially; see HandoffBanner |
| `HandoffChooserHost` | :2098 | E/M "Hand it to a local" target (chooser itself undrawn) |
| `SlipHeader` (def :329; title h1 :489; `SlipHeaderMeta` :498) | :2103 | E/M/Mo/H header (title, dates · days · travelers) — board also has a top bar (back · eyebrow "Your plan · Trip" · ⋯ plan menu) we don't, and an "AI starting sketch / 24 stops · facts checked on 9" line we don't |
| `AddLocalExpertButton` (header control) | :2106 | M optimizer-lead "Local expert" button (different placement) |
| Two-column wrapper | :2142 | — (boards have no columns at 390; VersionsDesktop has no rail) |
| `ToolsTray` (owner) | :2148 (plan/ToolsTray.tsx) | M/Mo **tools tray** — match in function |
| ↳ where-to-stay content: `AnchorPanel`/`SlipAnchorCompareButton` | :2156–2160 | M "Where to stay" |
| Optimizer slot (rail portals `OptimizerLead` here) | :2173 | M/Mo **optimizer lead** — match in placement |
| View bar: `SlipStatusStrip` (def :572) + List/Map toggle + "N of M located" | :2197–2238 | M view switch "Days · Map · 24 of 24 · Expand all" — board has no status strip (s2: status pills removed) and has "Expand all" we don't |
| `TripExpertNote` (list view) | :2264 | — (board puts expert notes under the item only) |
| **Map view** `slip-map-view`: map band (`SlipDraftAiRow`, `FinishCard`) | :2272–2288 | Map — board has neither the AI row nor Finish here |
| ↳ `MapControlCenter` (`layout="split"`) | :2289 | **Map** (day chips, version toggle, anchor, shading, Browse layer, legend) |
| ↳ unlocated line | :2310 | — |
| `HandoffBanner` (owner/expert) | :2318 (plan/HandoffBanner.tsx:103) | **H handoff banner** + "Accept all" (:167) + approve (:191) |
| `ExpertDoorCard` | :2320 (plancard/ExpertDoor.tsx:217) | E "Hand it to a Kyoto local" / M "Local expert" |
| `AnchorPanel` drafted / empty | :2334 (plan/AnchorPanel.tsx:433) | E "Where are you staying?" (empty) · M "Where to stay" ranked list (drafted) |
| `SlipOptionSetCard` list | :2343 (plancard/SlipOptionSets.tsx:348) | Compare board content, inline on the slip — board puts it on its own page |
| Day list `Card` (one card, `divide-y`) | :2349 | M — **board draws one card PER DAY** |
| Empty / loading states | :2365, :2370 | E (board shows the anchor + draft cards instead of an empty list) |
| `DayBlock` per slot | :2419 (plan/DayBlock.tsx) | M day card header — board: Fraunces 20px day title, stats, collapse; ours: 11px uppercase muted heading |
| ↳ `PlacePhoto` day photo | :2431 | M day photo + attribution (s10) — match |
| ↳ `TravelAnchorPlaceholder` arrival/departure | :2446, :2566 (plan/AnchorRow.tsx:147) | M flight anchor row ("lands at Kansai") |
| ↳ `AnchorConflictLine` | :2453, :2526–2527, :2573 | — |
| ↳ `renderLegBetween` between rows (routed `LegRow` / unrouted) | :2460–2461 | — (s1: no minutes on drafts) — see R6 |
| ↳ `SlipDayItem` (def :645) → `ItemRow` | :2464 → :783 (plan/ItemRow.tsx:125) | M/H/Mo timeline row — board: 52px time · dot rail · content · 44px ⋯ grid; ours: flex row, time inline |
| ↳↳ `ItemBookingActionLink` | :815, :837 | H "Booked · confirmation" pill (partial) |
| ↳↳ `SuggestionStrip` | :821 (plan/HandoffBanner.tsx:79) | **H suggestion under the item** — match |
| ↳↳ `ItemSheet` | :823 | — (board taps a photo into "the stop's detail sheet", s10) |
| ↳↳ `ItemComments` | :869 | M "Ask a follow-up" under expert note (partial) |
| ↳↳ `ItemAskLocalPanel` | :889 | — |
| ↳↳ (in ItemRow) `ExpertNote`, `AnchorRow`, facts line, find-host menu item (ItemRow.tsx:286) | plan/ItemRow.tsx | M expert note under item · H "Find a host" (board: inline teal strip; ours: ⋯ menu item) |
| ↳ airport `LegRow` (view model) | :1760 | **M airport → where you stay leg** ("Book") — match in function |
| ↳ `SlipEventGroupBlock` (def :1171) with `EventTimeAffordance` :1237, `EventBudgetAffordance` :1241, `EventAdvisorStanding` :1247, `EventRoleChips` :1248 | :2534 | — (Celebration/Hosted not drawn; s4 lists their tools only) |
| ↳ `SlipAddItemControl` per day | :2584 (plancard/SlipItemTools.tsx:143) | M "+ Add to this day · Swap a stop" |
| `ExpertSuggestionsPanel` (bottom) | :2616 | — (board: suggestions inline only) |
| `SlipSavedPlaces` (owner) | :2621 | — |
| `SlipRail` column (`lg:w-80`), hidden in map view | :2640–2662 | see §3 |

**Board has it, we don't:**
- **Top bar** (all phone boards): back, eyebrow, ⋯ plan menu.
- **Sticky bottom bar** "Share · Finalize plan" (Main).
- "Expand all" (M).
- "AI starting sketch" status line (M/Mo).
- Expert-recommended upsell under a stop ("A Higashiyama local recommends … Add", M).
- Inline "Find a host" strip (H).
- "with [Expert]" pen mark per row, and the day stat "3 with [Expert] · 2 yours" (H).
- Handoff fee pill and "N booked" count in the banner (H). This is unverified against `HandoffBanner`'s
  working state.
- Moment "anchor card" for the reservation, plus the evening-as-one-card shape (Mo).
- The footer provenance sentence (E/M).

**We have it, no board equivalent:** TripCardPrimaryBanner, SavePaymentMethodPrompt, delegate note,
ConciergeCard, TripExpertNote, SlipStatusStrip, AnchorConflictLine, event group blocks, ExpertSuggestionsPanel
(bottom copy), SlipSavedPlaces, ItemAskLocalPanel, ItemComments, LegSheet, and every rail card in §3 that
maps to "—".

---

## 2. Token inventory

### 2a. What the boards use

Counted across all 11 `.dc.html`.

| Token | Boards | Notes |
|---|---|---|
| Display font | **Fraunces** 500/600 (Google Fonts), titles 26–30px, card titles 20–24px, day titles 20px | |
| Body font | **Inter** 400/500/600; body 13–15px, eyebrows 12px/600/0.08em uppercase | |
| Ground | `#F6F4EF` | |
| Ink | `#0D2137` (headings), `#1E3A5F` (primary fill, links, 165 uses) | |
| Muted text | `#5B6B7A` (142), faint `#8A97A3` (46) | |
| Lines | `#E3E6E8` (card border, 76), `#C9D1D8` (button border, 73) | |
| Teal | `#2E8B8B` (52) + ink `#1F6F6F`, wash `#E6F2F2` | |
| Gold | `#E8B339` (26) + ink `#8A6A1E`, wash `#FFF6DF` / `#FFF9EA` | AI-draft CTA fill, expert pen mark |
| Coral | `#C8443D` **0 uses**; `#E85D55` 1 (Main badge, white text — the defect noted in §0) | the boards' primary fill is NAVY, not coral |
| Others | `#EEF0F2`, `#E9EEF2` washes; `#B8860B` (moved-stop gold on Map/Versions); `#FAFAF8` (Main, VersionsDesktop) | |
| Radii | cards **18px** (29), buttons **12px** (56), chips **999px** (79); also 10/8/6/4px | |
| Card | white, 1px `#E3E6E8`, 16px side margin at 390, 16–18px padding | |
| Touch targets | 44px icon buttons, 46–52px primary buttons | |

### 2b. What the slip uses today

Scanned files: SlipView, SlipRail, SlipHeaderMeta and plan/*.

- **Fonts.** Fraunces is loaded (`client/src/index.css:1`, `@import`), but no token resolves to it.
  `--font-display`, `--font-body` and `--font-sans` are all **Inter** (index.css:84–86).
  `SLIP_TITLE_FONT_CLASS = "font-display"` (`plancard/slip-tokens.ts`, used at SlipView.tsx:489), so the
  slip title renders in **Inter** at `text-2xl font-bold`. The only Fraunces tokens in CSS are
  `--review-display` (index.css:445, another surface) and a local `SERIF` constant in
  `components/trip/plan-modal.tsx:295`. Rail eyebrows use `font-mono` (Geist Mono, SlipRail.tsx:157).
- **Sizes.** `text-xs` 88, `text-sm` 59, `text-[11px]` 27, `text-[10px]` 16, `text-xl`/`text-2xl` 1 each.
  The board's 13–15px body sits a step above our 12–14px.
- **Colors.** The slip uses theme classes almost entirely (`text-muted-foreground`, `border-border`,
  `bg-card`). Inside `.console-scope` those resolve to warm neutrals: `--console-ground #FAFAF8`, ink
  `#1A1A18`, mid `#7A7A72`, line `#E8E8E2` (index.css:151–167). `--primary` is coral `#C8443D`
  (index.css:20, :132). Arbitrary values appear 3 times (`--earn-*` on the Trip Pass label, SlipRail.tsx).
  Status tints are `#2E8B8B`, `#E8B339` and `#5DCAA5` in `slip-tokens.ts` (inline style).
- **Radii.** `rounded` 30, `rounded-md` 20 (= 6px, tailwind.config.ts:15), `rounded-lg` 12 (= 9px),
  `rounded-full` 5, `rounded-xl` 1. `Card` is `rounded-2xl` = 16px (`components/ui/card.tsx:14`).
  `Button` is `rounded-md` = 6px (`components/ui/button.tsx:8`).

### 2c. Gap, value by value

| Board | Existing token | Gap |
|---|---|---|
| Fraunces display | none (Inter `--font-display`) | **new** slip display token needed |
| `#F6F4EF` ground | `--console-ground #FAFAF8` | **differs** |
| `#0D2137` ink | none (`--console-ink #1A1A18`) | **new** |
| `#1E3A5F` navy | `--earn-navy` (index.css:105) | exists, not used by the slip |
| `#2E8B8B` teal | `--earn-teal` (:93), slip-tokens TEAL | exists |
| `#E8B339` gold | `--earn-gold` (:96), slip-tokens GOLD | exists |
| `#C8443D` | `--coral-fill` (:16) = `--primary` | exists — but the boards don't fill with it (see R5) |
| `#5B6B7A` muted, `#E3E6E8`/`#C9D1D8` lines | none (`--console-mid`, `--console-line`) | **differ** |
| 18px card | Card 16px | differs |
| 12px button | Button 6px | differs |
| 999px chip | `rounded-full` | exists |

**Is there a shared token file?** Partly.
- `client/src/components/plancard/slip-tokens.ts` is the slip's one token module. It holds only the
  status tints and the title font class.
- The CSS custom properties live in `client/src/index.css`: `:root` coral (:16–20), `--earn-*` (:89–109)
  and `.console-scope` `--console-*` (:125–167). Both are global.
- There is no slip-scoped CSS token set (no `.slip-scope`), so restyling `Card`/`Button` globally would
  change every console page (R1).

---

## 3. The rail: what `SlipRail` renders, and where each piece lands on the boards

**The rail:** `SlipRail` (SlipRail.tsx:1299). Its grid at :1370 is `grid gap-3 sm:grid-cols-2 lg:grid-cols-1`,
mounted in a 320px column at SlipView.tsx:2647 and not rendered in map view. The cards come in this order.

| Rail card / row | file:line | Lands on the boards |
|---|---|---|
| **ExpertCard**: name, standing line, "View storefront", other-advisors line | :701, :729–767 | H **handoff banner** (photo, "[Expert] has your plan", Message) when an expert has the pen; otherwise nothing (E/M offer "Hand it to a local" instead) |
| **CoordinationCard** (only with an engagement): fee / engagement row | :806, :834 | — no board equivalent |
| **BuildCard** "Build" | :358, :552 | dissolves: |
| ↳ "Browse services for this trip" | :554 | E "Browse Kyoto and add stops yourself"; Map Browse layer; H inline "Find a host / See hosts" |
| ↳ `SlipDraftAiRow` "Draft it with AI" (empty plan) | :302/:341, :565 | E **draft card** (navy card, gold "Draft it with AI · free") |
| ↳ "Hand off to a local expert" | :578 | E "Hand it to a Kyoto local"; M/Mo optimizer lead "Local expert" button |
| ↳ "Message [expert]" | :587 | H banner "Message [Expert]" |
| ↳ `OptimizerLead` (portaled to the slot, :570) + `FeedbackTap` :538 + Trip-Pass-covered label | :520–548 | M/Mo **optimizer lead** (already inline); FeedbackTap and the covered label have no board equivalent |
| ↳ `TripPassCard` | :619–620 | — no board equivalent (boards name only the $5.99 run) |
| ↳ `BuildAroundDialog`, pay-optimization dialog | :624, :637 | — (dialogs; Compare's "Optimize keeps all three" is the nearest) |
| **AskAiDrawer** (own card) | :1389 (plancard/AskAiDrawer.tsx:116) | — **no board equivalent** (LD 45 (3) paid drawer; ruling needed on where it goes) |
| **PlanCard** "Plan": "Stops & timezone" | :864, :905 | E header chip "Edit dates or travelers" (stops via the plan modal) |
| ↳ `SlipOrganizeEventsRow` | :919 | tools tray, Celebration/Hosted manifests (s4) |
| ↳ budget line | :925 | tools tray "budget" (Celebration, s4) |
| **ShareCard** "Share": Share link · PDF · Add to calendar | :947, :1003–1025 | M sticky bottom bar **"Share"**; PDF/calendar → the top bar's ⋯ plan menu (board button, contents undrawn) |
| **FinishCard** "Finish": Finalize / Make it final again · Go to checkout · traveler fee preview | :1111, :1241–1279 | M sticky bottom bar **"Finalize plan"**; checkout reached from Finalize (LD 45 (4)) |
| ↳ Finished variant: Make it final again · View as Trip card · Back to planning | :1201–1235 | TripCard board "Reopen" (on `/trip/:id`) |

On the boards, the rail does not exist at any width: there is no rail at 390, and VersionsDesktop
(1280) draws four plan columns and no rail. **Five rail items have no landing spot:** CoordinationCard,
TripPassCard, AskAiDrawer, FeedbackTap and the Trip-Pass-covered label. Each needs a ruling before the
rail can be deleted.

---

## 4. Breakpoint reality today

These are computed from the classes, not from screenshots. `DashboardLayout` sidebar: 220px fixed at
`md` (≥768, sidebar.tsx:232 `hidden … md:flex`), off-canvas below it. Page padding is 16px, or 24px at
`sm` (≥640).

| Width | What renders |
|---|---|
| **390** | No sidebar (trigger in the 52px header). Content 358px wide. One column. **Trip** plans (`tripsAnchor`): list first, rail below (`order-2`, SlipView.tsx:2647; A1 ruling). **Every other group**: rail **above** the list (`order-1`), so the four rail cards come before the plan. Rail is one column (below `sm`). The tools tray, optimizer slot and view bar sit at the top of the list column. No sticky bottom bar. |
| **768** | Sidebar visible, 220px. Content ≈ 768 − 220 − 48 = **500px**. Still one column (`lg` not reached). The rail becomes **two-up** (`sm:grid-cols-2`, SlipRail.tsx:1370), two ≈244px cards side by side, with the same order rule as 390. |
| **1280** | Sidebar 220px. Content ≈ 1280 − 220 − 48 = **1012px** (under `max-w-6xl` 1152). Two columns (`lg:flex-row`, SlipView.tsx:2142): list ≈ 1012 − 320 − 32 = **660px**, rail **320px**, one card per row. Map view: the rail is hidden and `MapControlCenter layout="split"` takes the full width. |

**Against the boards:** all phone boards are 390 with no rail and a bottom bar. Only VersionsDesktop
draws 1280, as a full-bleed four-column board with no sidebar shown. No board draws 768.

---

## 5. Risks: components a restyle would change elsewhere

| Component | Also mounted by | Risk |
|---|---|---|
| **R1** `components/ui/card.tsx`, `ui/button.tsx`, `index.css` tokens, `.console-scope` | every page | Board radii and colours applied globally would restyle the whole console. **Conformance must use a slip-scoped token layer**, either a new `.slip-scope` block or an extension of `plancard/slip-tokens.ts`, never the shared primitives. |
| **R2** `plan/ItemRow.tsx` | `plancard/TripCardDays.tsx:332` (Trip Card), `plan/WorkstationDays.tsx:168` (Workstation) | The board's timeline grid (time column, dot rail, 44px ⋯) changes the Trip Card's and the Workstation's rows too. s6 and s9 *want* the same ItemRow on all three ("Workstation mounts these same rows with role = expert"), so this is a shared change to be made deliberately, with the Trip Card and Workstation owners told. |
| **R3** `plan/DayBlock.tsx` | TripCardDays.tsx:295, WorkstationDays.tsx:124 | The board's Fraunces day title and one-card-per-day layout change both other surfaces. |
| **R4** `plancard/MapControlCenter.tsx` (not transferred) | `pages/guest-plan-map.tsx:140` (**`/plans/new?view=map`**), `pages/expert/workspace.tsx:1219`, `PlanCard.tsx:1137`, `VersionsBoard.tsx:156/220`, `pages/itinerary-view.tsx:737` | The Map board restyle reaches the guest map, the Workstation map, the Trip Card map and the versions board. s5 says they all collapse into this component, so it's one change with six mounts. |
| **R5** Primary colour | `--primary` = coral fill (LD 45 (7), R337) | The boards fill primary actions with **navy `#1E3A5F`** and the AI CTA with **gold**. Following the boards inside `.console-scope` contradicts LD 45 (7) "coral primary". **Ruling needed:** navy primary on the slip (a scoped override) or the board's navy read as coral. |
| **R6** Between-stops legs | `plan/LegRow.tsx` (also `WorkstationDays.tsx:144`, `LegReviewDrawer`, `pages/ready-made-preview.tsx`, `pages/expert/workspace.tsx`) | s1 ("no travel minutes printed anywhere") vs 9a/9c/F1, which print routed legs on qualifying plans and unrouted minutes where stored. Restyling is safe; **removing** them needs a ruling against LD 63. |
| **R7** `plan/PlacePhoto.tsx` | TripCardDays, ItemRow, ItemSheet, AnchorPanel | Styling only; low. |
| **R8** `plan/FeedbackTap.tsx` | TripCardDays, HandoffBanner | Low. |
| **R9** `plan/OptimizerLead.tsx` | `pages/plan-versions.tsx:117` | The Main optimizer-lead restyle also changes the versions page header card. |
| **R10** `plancard/TripExpertNote`, `ExpertSuggestionsPanel`, `PlanApprovalBanner`, `ActivitiesSection` | PlanCard / TripCardRail (Trip Card) | Only if restyled at the component; mounting changes on the slip don't affect them. |
| **R11** `SlipView` type exports (`SlipData`, `SlipTrip`) | PlanSlipStrip, my-trips, itinerary-comparison, plan-versions, SlipRail | Types only; a component split mustn't move them without updating these importers. |
| **R12** Required mounts | LD 43(d) save-payment mount 2; LD 42 D9 bookings on the slip; LD 45 (3) Ask-AI drawer; Trip Pass "the ONE purchase rail" | Deleting the rail must re-home each of these somewhere ruled, not drop it. |
| **R13** Playwright specs keyed on rail testids | `slip-rail-actions` (A1–A13 on the blocking gate), others reading `slip-rail`, `slip-action-*` | Moving controls keeps their testids where the control survives; a removed control removes its assertion in the same PR. These are test edits, so they happen in build PRs, not here. |

None of this touches `/plans/new?view=map` unless MapControlCenter is restyled (R4). `pages/guest-plan-map.tsx`
mounts no slip, rail or `plan/*` component other than MapControlCenter. That was checked by import.

---

## 6. Proposed PR split: one per board, smallest first

PR-0 below is the one deviation from "one per board": a token layer every board PR needs. Main is split
in two because it's the largest diff by far. Both can be folded back if ruled.

| PR | Board | Files | Depends on | Size |
|---|---|---|---|---|
| **PR-0** | (tokens) slip-scoped layer: Fraunces display, `#F6F4EF`, `#0D2137`, navy, muted, lines, 18/12/999 radii | `plancard/slip-tokens.ts` + a scoped CSS block (index.css is shared — **ruling needed** on whether the block may live there) | R5 ruling | S |
| **PR-1** | **Empty** | SlipView header + empty state, `plan/AnchorPanel.tsx` (empty mode), draft card (`SlipDraftAiRow` re-home), "other ways in" rows | PR-0 | S |
| **PR-2** | **Moment** | ToolsTray manifest (exists), reservation anchor card (AnchorRow), evening card | PR-0, PR-4 row shape | S–M |
| **PR-3** | **Handoff** | `plan/HandoffBanner.tsx` (banner, fee pill, counts), pen mark on ItemRow, inline Find-a-host | PR-4 | M |
| **PR-4** | **Main (a)**: day cards + timeline ItemRow + DayBlock title + Expand all + top bar | SlipView day list, `plan/ItemRow.tsx`, `plan/DayBlock.tsx` | PR-0; **R2/R3**: Trip Card and Workstation change with it | M–L |
| **PR-5** | **Main (b)**: rail dissolution, sticky bottom bar (Share · Finalize), ⋯ plan menu (PDF, calendar), where-to-stay card | SlipView, SlipRail | rulings on the five unlanded rail items (§3) + R12 | L |
| **PR-6** | **Map** | `MapControlCenter` (not transferred) + SlipView map view | **owner ruling** (R4: six mounts incl. `/plans/new?view=map`) | M |
| **PR-7** | **Compare** | `pages/plan-compare.tsx`, `plancard/SlipOptionSets.tsx` | **owner ruling** | M |
| **PR-8** | **Optimized** | `pages/plan-versions.tsx`, `VersionsBoard.tsx`, `OptimizerLead` (R9) | **owner ruling** | M |
| **PR-9** | **Versions** | `VersionsBoard.tsx` | PR-8 | M |
| **PR-10** | **VersionsDesktop** | `VersionsBoard.tsx` (drag days; s7) | PR-9; drag-and-drop is new behaviour, not restyle | L |
| **PR-11** | **TripCard** | `TripCardDays.tsx`, `TripCardRail.tsx`, `PlanCard.tsx` | **owner ruling**; inherits PR-4 | M–L |
| — | **Template** | `/experiences` | **out of lane** (plan entry); not scheduled here | — |

PR-1 and PR-2 are the smallest and stay inside the transferred files. PR-6 to PR-11 need an owner ruling
first, because their files weren't ceded.

**Migrations:** none expected. Every board region maps onto existing data: plancard DTO, manifest,
option sets, versions board, handoff. The one possible exception is s7's "the day re-times itself" in
PR-10, which is behaviour rather than a restyle; if it needed a column, it would stop there.

## Rulings (decision-maker, Oct 8, 2026): all answered, build may start

The questions this brief closed on, with their answers. Where an answer differs from a proposal above,
the answer wins.

1. **Ownership.** This lane owns every slip-surface file for the duration, including Compare, Optimized,
   Versions, VersionsDesktop, TripCard and `MapControlCenter`. Any PR that touches `ItemRow`, the day
   header or `MapControlCenter` lists every other mount point (§5 R2–R4) and checks each one, with a
   Playwright or Chrome capture in the PR.
2. **Primary action colour** is coral `#C8443D` with white text (LD 45 (7)). Navy is structural only, and
   gold is not a button fill. Rev 15 corrects the boards. This closes R5.
3. **Rail pieces.**
   - Coordination card: removed.
   - Timezone: moves to the header subline and the Travel party sheet.
   - Trip Pass: offered on the Optimize lead after the first paid run, and in the Versions header. The copy
     says "5 runs", never "unlimited". Today's card says "unlimited optimizer runs", so it changes when it
     moves.
   - Ask AI: secondary action in the bottom bar.
   - Finalize: primary action in the bottom bar.
   - Share: the ⋯ menu.
   - Feedback: the ⋯ menu.
   - "Included in your Trip Pass": becomes a button state, "Optimize · included · N runs left".
4. **Legs.** Note s1 is superseded for legs. Minutes appear on LegRows and in Getting around only, never on
   item rows, plan-fit or Compare. This closes R6.
5. **Tokens.** A new `client/src/styles/slip-tokens.css`, scoped under one root class and imported from
   `SlipView` only. `index.css` stays untouched. The title font is fixed so Fraunces renders.
6. **Main is two PRs:** rows, then rail.
7. **Desktop ≥1024:** one centered column with a max-width of 680, the tray stays a row, and there is no
   rail. Map view is unchanged. VersionsDesktop is the only wide board. This replaces §4's two-column
   layout as the target.

**PR order (ruled):** tokens → Empty → Moment → Main-rows → Main-rail → Map → Handoff → Compare → Optimized
→ Versions + VersionsDesktop → TripCard.
- The tokens PR goes against rev 14. Everything from Empty on waits for rev 15, and all boards and notes get
  re-read when it lands.
- Each PR carries:
  - the Phase 0 excerpt for its board;
  - before/after captures at 390 and 1280;
  - checks on every shared-component mount;
  - no test edits beyond snapshot updates, listed by file and test id.
- No migrations are expected; if one appears, stop.

## Held items after the batch ruling (decision-maker, Oct 9, 2026)

The eleven board PRs listed 32 items as "Held — needs data or ruling". The batch ruling:

- **Built in held-batch-1:** 1 (Browse subtitle reads "Places and hosts near your stops"), 9 ("Compare →"
  on the map's versions sheet), 17 (Compare reads "Which one fits your days?" and the shorter intro),
  22 ("Recommended" on the strict winner by S1's tiebreak — none when two versions tie), 23 (the run's
  paid line, owner only) and 28 (the navy cover hero with "Trip Card · final vN" on both cards).
- **Dropped:** 19 (Compare "+"), 20 ("Can't decide? Optimize keeps all three"), 24 ("Your optimized plans"
  history), 27 ("Show on map"), 30 ("Show all 5 stops"), 31 ("Your bookings" card), 32 ("Reopen" beside
  provenance).
- **Kept as is:** 2 ("Skip for now" stays under the two answers).
- **Resolved earlier:** 7 (pricing copy), 15 (FU-S1-2), and 16 on the stay card (R394).

**Still held, each with the lane that owns it.** None is built by this lane; a lane that adds the data
or the rail also draws the board's piece.

| # | Item | Needs | Owning lane |
|---|---|---|---|
| 3 | "Reservation in your name" | whose name a booking is in | Booking agent (LD 44) |
| 4 | Day "Day options" ⋯ and "Swap a stop" | a day-level action rail | Versions board (surface step 5, R-ac) |
| 5, 10 | "<name> · <ward> local"; expert's neighbourhood on the handoff banner | an expert's recorded locality | Field knowledge / neighbourhood claims (LD 27) |
| 6, 26 | "all within Gion on foot"; day verdicts ("ends 17:30") | measured walk times and day ends | Routing engine 9a-ii (OSRM walk) |
| 8, 21, 25 | per-stop and per-day reasons | why the optimizer moved a stop | Optimizer (step 9b findings) |
| 11, 12 | a suggestion's reason; "Reply" on a suggestion | a reason column and a reply rail | Handoff (step 7b, LD 62) |
| 13 | "Accept & book" on a swap | a one-step accept-and-book rail | Booking on behalf (LD 52 (A)/(B)) |
| 14, 29 | "Find a host" strip with a count; inline host card with Message host | a served host count and a host note on an item | Expert door / host supply (LD 42 D5 amendment) |
| 16 (rest) | "Close to N of M days" on Compare's three option cards; the far-day sentence | per-day closeness for considered places, and which day is far | S1 one stay (FU-S1) |
| 18 | hotel photos and street address on Compare options | photo and address facts for a considered place | Content sourcing (LD 57, A6) |
