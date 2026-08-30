# Five-Role UX Walkthrough — Jul 29, 2026

Behavioral walkthrough of the app at merged-main `c43b09b2` (post-#330), run locally with one real
session per role (traveler / travel_expert / service_provider / executive_assistant / admin), each
console used the way a first-time user would — following the nav, completing the primary workflows,
judging whether the next step is ever obvious. Findings are behaviorally verified (clicked, screenshotted,
and where flagged, confirmed against the API response or the source). Screenshot sets live in the session
scratchpad (`ux-traveler/`, `ux-expert/`, `ux-provider/`, `ux-ea/`, `ux-admin/`); key frames are referenced
by filename in the per-role sections.

**The goal of this audit (decision-maker directive): make using the site and its features easy to
understand.** The verdict in one line: **navigation and information architecture are in good shape —
what breaks new users' understanding is that the UI lies about state at exactly the moments that matter
(money, publish status, booking status), and several primary buttons are dead or wrong-wired.**

---

## What works (verified, keep)

- **The NINE-module console IA is legible on both earner consoles.** First-time auditors correctly
  inferred what every sidebar module was for on the expert and provider consoles within a minute.
- **Honest empty states are the platform's strongest UX pattern** — praised independently by all five
  auditors ("unusually well-written across the board"). The §13 discipline shows.
- **The core workflows work end-to-end:** expert Workstation build → add items → ship to store;
  provider creation ladder (service → bundle → property → rooms → night availability); admin supply
  approval (reject-requires-reason, honest toasts — called "the strongest page in the console");
  traveler discover → service detail → property room date-pick → cart; concierge tier intake.
- **Money ledgers are honest** (expert/provider Money, admin Revenue, traveler pricing tiers in the DOM).
- **Customers pages carry the right clarifier** ("booked value … is not your earnings").

---

## Cross-cutting theme 1 — the UI lies about state (the trust-killer class)

The single most damaging pattern, appearing independently in all five roles. Each instance makes a
user believe something false about money, publication, or status:

| # | Role | Lie | Evidence | Sev |
|---|------|-----|----------|-----|
| L1 | Traveler | **Cart shows a room stay as "1 × $120" with no dates** while the server (correctly) charges nights × rate ($240). Quantity stepper shown for a date-range product. "Add your travel dates" banner despite dates just entered. | `ux-traveler/16-cart-page.png`; server booking row $240 correct | **P1** |
| L2 | Provider | **Save Draft shows "Service published! Your service is now live"** for a row that is actually `draft`/`submitted` and missing required fields. Success copy is hardcoded regardless of action. | `ux-provider/27`; API shows `status:"draft"` | **P1** |
| L3 | Traveler | **Unknown booking status renders as a "Pending" badge** (`statusConfig[booking.status] \|\| statusConfig.pending`) while the Pending tab filters on the literal string — so "All (2)" shows two "Pending" bookings and "Pending (0)" shows none. | `my-bookings.tsx:575`; `ux-traveler/20,21` | **P1** |
| L4 | Admin | **Server 500s render as healthy empty states.** Payouts (`GET /api/admin/payouts` 500) shows "No payout requests found"; expert Offering Types (500) shows "(0)"; Neighborhood Backfill (404) shows "All services have neighborhoods assigned." A broken money queue is indistinguishable from an empty one. | `ux-admin/22,12,29` | **P1** |
| L5 | Admin | **Platform API Providers page shows invented-looking numbers** (Claude 42,180 req/$284.40, "$12,270 affiliate revenue MTD") that contradict the honest $0/"Not connected" on Revenue and AI Costs one click away. | `ux-admin/30` | **P1** (§13 class) |
| L6 | EA | **Reports page is 100% hardcoded fiction** (24 events, 45 AI tasks, 9.3/10 quality — literals in `reports.tsx`, zero fetches) while every other page in the same session shows honest zeros. | `ux-ea/10-reports.png` | **P1** (§13 class) |
| L7 | EA | **AI Assist fabricates a "90% Confidence" score and an "AI: Active" badge** — the create path is a plain DB insert with a hardcoded confidence default; no AI call exists. | route + schema read | **P1/P2** (§13) |
| L8 | Expert | **Workstation day-count disagrees with itself** ("3 days" vs "2 items · 2 days" in the header; social caption "3-day" vs story slide "2 DAYS") and the phantom empty day **silently blocks Store submit** with no pointer to the cause. | `ux-expert/17,19,20,21` | **P1/P2** |
| L9 | Admin | **AI Costs "100% success rate" sits directly above an all-failed calls table**; the notification bell shows a permanent red dot over "0 unread." | `ux-admin/25,26` | P2 |
| L10 | Provider | Cross-page counts disagree (Customers "2 bookings" vs Today/Inbox/Performance "1"; Inbox stat tiles don't sum to Total). Catalog cards show a "planning" badge/category chip instead of real approval status. | `ux-provider/70,06,31` | P2 |
| L11 | EA | "Show All **8** Executives" hardcoded literal directly under an honest "No executives yet" empty state; link dead. | `ux-ea/25` | P2 |

## Cross-cutting theme 2 — dead or wrong-wired primary actions

| # | Role | Finding | Root cause (where confirmed) | Sev |
|---|------|---------|------------------------------|-----|
| A1 | EA | **Nearly every primary action in 8 of 9 sections is an unwired button** (Events "Create New Event", Travel, Venues, Gifts, Communications incl. Send, Calendar's 3 actions, AI Delegate, Profile/Settings Save) — no onClick at all, no toast, nothing. | source grep across `client/src/pages/ea/*.tsx` | **P1** |
| A2 | EA | **Clients — the one wired create — 500s end-to-end**: 5 handlers in `ea.routes.ts` read `(req.user).id` without the `.claims?.sub` fallback every other EA handler has, so email/password sessions get `undefined` userId (list is silently always empty too). | `ea.routes.ts:40/74/109/136/152` | **P1** (5-line fix) |
| A3 | Expert | **Catalog "New Service" hard-detours into the 6-step Trip Planner application wizard** (with social-login buttons) for an account that already has console access — `application-status` returns `pending, form:null` because no `local_expert_forms` row exists for this role-holder. Blocks the most obvious first action. | gating on `local_expert_forms` presence | **P1** |
| A4 | Provider | **"Messages" (Inbox tab button AND bare /chat) lands on the traveler-facing "Expert Chat — connect with local experts for your trips" directory** — the wrong product surface for a provider seeking client threads. | `/chat` is traveler-scoped | **P1** |
| A5 | Expert | **Settings→Profile's ~40-row "Service Menu" Manage links all dead-end** (redirect to generic Catalog, offering-type context dropped) — pre-consolidation leftover bloating the page. | legacy `?offeringTypeKey=` redirect | P2 |
| A6 | Admin | **Users page can't show or filter Provider/EA roles** — blank role badges; "Provider"/"EA" filter tabs return 0 despite 9 real providers existing. | role-vocabulary mismatch (likely the §"always-false provider comparison" class) | **P1** |
| A7 | Traveler | `/pricing` Pay-Per-Use fee cards present in DOM but **render as a blank gap**; "Most Popular" plan CTA disabled ("Coming soon"). | CSS/render bug | P2 |
| A8 | Traveler | `/experts` **defaults to the empty "Local Experts (0)" tab** with "No experts found" while Trip Planners (2) has data one click away. | default-tab choice | P2 |

## Cross-cutting theme 3 — discoverability & comprehension gaps

- **D1 (Expert, P2):** Workstation Add-panel's 7 source pills sit in an overflow container with **no
  scroll affordance** — at 1440px only 3 are visible; My services/Custom/Transport are effectively
  undiscoverable (`scrollWidth` 731 vs `clientWidth` 379).
- **D2 (Traveler, P2):** Room booking has **no visual calendar of open nights** — pure trial-and-error
  against two date inputs ("Try different dates", six attempts before a hit). The data exists
  (month-availability endpoint); the room page just doesn't render it as a calendar.
- **D3 (Traveler, P2):** Trip-wizard Dining tab shows "No Venues Found … Try Again" stacked directly
  above a real result ("Showing 1 provider in Kyoto"); Activities tab blames the destination ("try a
  different destination") for what is an unconfigured integration — in the flagship market.
- **D4 (Admin, P2):** Disputes have no nav entry (buried in "Reconciliation" under SYSTEM, not MONEY);
  "Ready Made Trips" opens on the unrelated internal service-template catalog by default; the QA
  checklist (raw dev tool) sits among business queues; long sidebar with no below-fold cue.
- **D5 (Cross-role, P2/P3):** Unexplained scores/jargon shown to first-timers: "Heat Score 0" badges
  (rating×20, no legend), "Plan score 15/100", "$Contact" (concat bug on expert profiles), "per service"
  label on a per-night room rate, "Below Average"/"Needs Work" judgments rendered against accounts with
  zero data (should read "no data yet").
- **D6 (Expert, P2):** New empty build opens on the **Distribute** tab, before Add — undercutting the
  ratified "build first, distribute later" mental model. Calendar chips mix channels and event lanes
  with no grouping; no Social chip despite Social existing in Distribute.
- **D7 (EA, P2):** EA Settings shows earner copy ("Payout Account … receive earnings directly") —
  copy-pasted from the seller settings; EAs aren't marketplace sellers.
- **D8 (Traveler, P3):** Beta banner advertises 8 cities while 7 have no inventory (§12 one-wedge-Kyoto
  says surfaces should reflect Kyoto depth); account menu labeled "K Kyoto" reads as a city switcher.

## Environment-scoped notes (not app bugs)

- All Stripe-stage failures were the local dummy key; flows behaved correctly up to Stripe. The bare
  two-word "Checkout failed" toast IS an app gap (no reason/retry guidance) — folded into L1's fix lane.
- Expert accept-assignment/message-thread paths untested (no seeded data); admin Knowledge-Score
  advisory untested (no pending expert applications in the dataset); concierge coordinator picker
  untested (empty queue).
- A benign `404 /api/trips/:id/my-assignment` fires on every self-created build load (noise, filed P3).
- "Full / Done-for-you" concierge tier honestly reports "No packages configured … Not available" for
  every event type in Kyoto — honest, but the flagship tier dead-ends until packages are configured
  (an ops/config task, not code).

---

## Proposed fix lanes (in order)

**Lane 1 — "the UI never lies" (highest trust-per-line):** L1 cart renders stays as dates + nights ×
rate (no quantity stepper for rooms) + a real checkout-failure message; L2 ServiceForm success copy
varies by action; L3 honest unknown-status badge + consistent tab counts; L4 error banners on admin
fetch failures (plus fixing the two underlying 500s); L5 Platform-API-Providers → real data or honest
empty; L6/L7 EA Reports + AI-confidence de-fabrication; L8 Workstation day-count reconciliation +
"which day is empty" pointer; L9–L11 count/badge consistency.

**Lane 2 — wrong-wired actions:** A2 (5-line ea.routes fix), A4 provider Messages target, A6 admin
Users role filter, A3 expert New-Service gating (needs a small decision: auto-provision the form row
for role-holders vs. fix the redirect), A5 dead Manage links removal, A7 pricing render, A8 experts
default tab.

**Lane 3 — comprehension:** D1 pill-row scroll affordance, D2 room-page night calendar, D3 wizard
contradictory states, D4 admin nav regrouping, D5 jargon/legend sweep, D6 default-to-Add + calendar
chip grouping, D7 EA settings copy, D8 Kyoto-first banner.

**Decision-maker calls needed (do not build without ratification):**
1. **EA console (A1):** wire the dead sections for real (a large build) vs. honestly gate the shell
   (the Fix-#5 pattern: visible "coming soon" states, dead buttons removed) until the EA lane is
   prioritized. Recommendation: **gate honestly now** — the console currently damages trust more than
   it delivers value, and the true build is its own program.
2. **Expert self-serve service creation (A3):** whether a `travel_expert` role-holder without a
   `local_expert_forms` row should be auto-provisioned into ServiceForm or must complete the
   application. Recommendation: role-holders with console access skip the wizard (the role IS the gate).
