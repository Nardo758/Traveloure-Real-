# Partner Demand — Presentation Brief (Phase 2.5)

**Ledger:** `2026-08-18-partner-demand-2b` (R18) · **Lane:** `lane/partner-demand-data` · **Base:** `main@c32180b2`
**Status:** RESEARCH ONLY — no code, no rendering. **Gate:** Leon approves this brief before any Phase 3 rendering
or Phase 4 one-pager generation begins.

> This brief answers four questions and nothing more: (1) how do the incumbents present forward-window unmet demand,
> stage funnels, honest empty states, and the sample-size N; (2) does the shipped visual target hold up against that,
> and what "requested-windows" element bridges its calendar and its map; (3) what is the one-pager's layout, drafted
> against Kyoto's real n=29; (4) does it survive mobile-first. It proposes; it does not build. Every figure it cites
> for Kyoto uses the **strict** framing (n=29) — the loose n=53 appears nowhere, per R16.

---

## 0. Honesty note on the visual target file (read first)

The dispatch refers to a **shipped `partner-demand-visual-target.html`**. As of the base SHA (`main@c32180b2`) and the
lane tip, **that file is not in the repository or its git history** (`git ls-files`, `git log --all` both clean). I have
therefore validated the target **as the dispatch describes its three components** — calendar ghost-slots, a catalog
funnel row, and Market Research map circles — rather than claiming to have opened a specific HTML file I cannot see
(§13: I do not assert a validation I did not perform). **Action for Leon:** if a concrete HTML target exists outside the
repo, drop it in the tree (suggest `docs/planning/partner-demand-visual-target.html`) and I will do a pixel-level
conformance pass as a fast follow. Everything below stands on its own regardless.

---

## 1. Incumbent-pattern research

Studied: **Lighthouse** (ex-OTA Insight), **AirDNA**, **STR / CoStar**, **PriceLabs**, **Placer.ai**, and **Stripe**
(Sigma / Radar dashboards) — the six that professionalize "forward demand you don't yet capture" for a supply-side
audience. Four questions, four answers.

### 1a. Forward-window unmet demand → the universal idiom is **"pickup"** on a forward calendar

Every hospitality-revenue incumbent (Lighthouse, AirDNA, STR, PriceLabs) renders forward demand as **pickup**: a
calendar/date-axis view where each future date carries a demand signal (searches, pace, market occupancy-on-the-books)
laid **against the supply the operator actually has**. The persuasive unit is never a raw demand number — it is the
**gap between demand on a date and the operator's own inventory on that date**. That is exactly our `unmet_demand_slip`:
open items on a market-local date with **no bookable slot window**. Design implications we should adopt:

- **Date axis, forward-only.** Demand is shown on the calendar of *upcoming* dates, not as a lump sum. A partner reads
  "these are the days people want you and you're not there."
- **Gap, not gross.** The visual weight goes on the *unmet* portion. Met demand recedes (it's already yours); the slip
  is the hero.
- **Money is the headline, count is the proof.** Where a $ value is computable it leads; the count is the credibility
  line beneath it. Our metric already carries both `amount` and `count` with `valuedCount`, and stays **count-only
  (amount = null) when no unmet item carried a price** — never a guessed $ (§13).

### 1b. Stage funnels → only **Stripe** ships a true named-stage funnel; everyone else shows conversion rates

Of the six, only **Stripe** presents a genuine **named-stage funnel** (its checkout/session funnel: *session loaded →
completion attempted → completed*, with the count and the drop-rate on each edge). The hospitality tools show
conversion **ratios** (look-to-book, search-to-reservation) but not a multi-stage named ladder. Our `slip_funnel`
(`in_planning → with_expert → ready_for_checkout → purchased`, with `item_removed` as an off-ladder exit) is closest to
the **Stripe** shape, and Stripe is the pattern to borrow:

- **Each stage shows its entry count; each edge shows its transition rate.** We compute both (`stageEntries`,
  `transitions`, `transitionRates`). Render the count on the bar, the rate on the arrow.
- **Name the exit, don't hide it.** Stripe surfaces "payments that never completed." Our `item_removed` count is the
  analogue — the demand that *left*. It is honest and it is persuasive (it quantifies what poor supply costs).
- **Dwell time is secondary.** Stripe puts time-to-complete in a subordinate position. Our `avgHoursInStage` belongs in
  a tooltip / secondary row, not the headline.

### 1c. Honest empty state → **name the floor and the reason**; suppress, never fabricate

The strongest incumbent pattern here is **Stripe's** and **STR's**:

- **Stripe** suppresses a metric below a **named minimum** and says why: e.g. a benchmark needs **≥ 5 payments** or it
  reads "not enough data yet" with the threshold stated. The number isn't blanked silently — the *reason* is shown.
- **STR** suppresses a competitive set below a **≥ 3 / ≥ 4 property** comp-set minimum to protect against noise and
  de-anonymization, and tells the user the comp set is too small rather than showing a shaky figure.

This is **exactly our floor design** (base 5 / market 10 / partner 25 in `demand-floors.config.ts`, enforced on the
**read path**, returning `status: "no_data"` with the row's `n` still visible). The brief's recommendation: when a cell
is suppressed, the surface must **say the floor and the reason** ("Fewer than 10 planned trips in this market — we don't
show a demand figure until the sample is large enough to be honest"), matching Stripe's named-floor empty state rather
than a blank tile. This is a §13 win we already have in the data layer; Phase 3 must not throw it away in the render.

### 1d. Show-the-N → the sample size rides **with** the figure, always

All six show the denominator. AirDNA and STR put the comp-set size next to every benchmark; Stripe shows the event
count under every rate. The credibility mechanic is identical: **the N is not a footnote, it is part of the figure.**
Our read responses already carry per-figure `n` (`source_row_count`) and a `cadence: "updated daily"` line. The brief's
recommendation: render the N inline ("**$X unmet demand** · based on **N** planned trips · updated daily"), never in a
separate methodology block the eye skips.

**Net:** our data-layer design (forward market-local dates, gap-not-gross, named-floor suppression with visible N,
Stripe-shape funnel with a named exit) is already aligned with the best of the incumbents. The Phase 3 render's whole
job is to **not lose** those properties. Nothing in the research asks us to change the metrics; it constrains how they
are drawn.

---

## 2. Validating the visual target + the "requested-windows" bridge

### 2a. The three described components vs. the research

| Target component (as described) | Incumbent analogue | Verdict | Constraint for Phase 3 |
|---|---|---|---|
| **Calendar ghost-slots** | Pickup calendar (§1a) — demand on forward dates vs. your inventory | **Keep.** This is the canonical, proven idiom. | The ghost slot must be an **unmet** date (an item's market-local date with no bookable slot). Ghosts are `unmet_demand_slip` cells, not raw demand. Below the market floor the calendar shows the **named-floor empty state**, not zero ghosts (which would read as "no demand"). |
| **Catalog funnel row** | Stripe named-stage funnel (§1b) | **Keep**, on Catalog (matches §22b — per-listing curation lives on the "what I sell" module). | Render `stageEntries` as bars, `transitionRates` on edges, and the `item_removed` count as the named exit. Read the stages from `SLIP_FUNNEL_STAGES`; never restate the ladder client-side (§18 rule 1 — derivation-drift). Suppress per-service funnels below the 25-floor. |
| **Market Research map circles** | Placer.ai / AirDNA market heat (§1a, spatial cut) | **Keep**, admin/internal. | Circle **area = source_row_count**, not a guessed density. The `__unmapped__` bucket (Q9a: 145 trips / 90 real — the largest pool) is **admin-only** and must **never** appear on a partner-facing map (R13). No city-center fallback for a market with no located demand (§13). |

**All three survive the research.** None needs to be dropped. The one structural gap is between them.

### 2b. The gap the target has today: the calendar and the map don't talk

The **calendar** answers *"on which dates is demand unmet?"* The **map** answers *"in which markets is demand
unmet?"* Neither answers the question a partner actually acts on: **"a specific window of demand I could go fill."** The
incumbents bridge this with a **pickup/opportunity list** — a ranked, textual list of the highest-value unmet windows,
each row deep-linking to both the date (calendar) and the place (map).

### 2c. Proposal — the **Requested-Windows list** (bridges calendar ↔ map)

A single ranked list, sitting between the calendar and the map, where each row **is** one `unmet_demand_slip` cell that
clears its floor:

```
Requested windows (unmet demand · updated daily)
┌─────────────────────────────────────────────────────────────────────────────┐
│  Kyoto · Fri Aug 21          $1,240 unmet    · 14 planned trips   [calendar↗] │  ← date + market both linked
│  Kyoto · Sat Aug 22          $980 unmet      · 11 planned trips   [map↗]      │
│  Kyoto · (no priced items)   —               · 12 planned trips   [calendar↗] │  ← count-only, amount honestly blank
│  Fewer than 10 planned trips in other markets — not shown yet (floor: 10).    │  ← named-floor empty state, §1c
└─────────────────────────────────────────────────────────────────────────────┘
```

Rules the list must obey (all inherited from the data layer — the render restates none of them):
- **Each row is a floor-clearing cell.** Sub-floor markets/dates collapse into the single named-floor line, never
  rendered as an empty or zero row.
- **Sort by `amount` desc, count-only rows after priced rows** (a count-only window is real demand but unvalued — it
  ranks below any priced window, never gets a fabricated $ to sort it up).
- **N on every row.** `source_row_count` inline, per §1d.
- **Each row links both ways:** the date opens the calendar at that ghost-slot; the market opens the map circle. This
  *is* the bridge — the list is the join key between the two existing views.
- **Partner surface excludes `__unmapped__`; admin surface includes it** (R13), reusing the two endpoints already
  shipped (`/api/me/demand-rollup`, `/api/admin/demand-rollup`).

The Requested-Windows list is **not a new metric and not new data** — it is a third *rendering* of `unmet_demand_slip`,
the same way §22d's "Route" share frame is a third format of an existing rail. It needs zero backend beyond what 2B
already ships.

---

## 3. One-pager layout (drafted against Kyoto, n=29 strict)

Single page. One hero figure. **≤ 3 supporting visuals.** Methodology on the page, not buried. Drafted with Kyoto's
real strict sample so the layout is proven against a real market, not a mock number.

```
┌───────────────────────────────────────────── one page ─────────────────────────────────────────────┐
│                                                                                                      │
│   KYOTO — unmet traveler demand                                          © OpenStreetMap contributors │
│                                                                                                      │
│   ┌──────────────────────────────── HERO ────────────────────────────────┐                          │
│   │   $XX,XXX  in unmet demand this season                                │  ← single $ figure,       │
│   │   based on 29 planned trips (strict count) · updated daily            │    methodology line under │
│   └───────────────────────────────────────────────────────────────────────┘    it, N always present  │
│                                                                                                      │
│   Supporting visual 1 — PICKUP CALENDAR          Supporting visual 2 — SLIP FUNNEL                    │
│   ┌───────────────────────────────┐              ┌───────────────────────────────┐                   │
│   │ forward dates, ghost-slots on  │              │ in_planning → with_expert →    │                  │
│   │ unmet days (the §1a gap view)  │              │ ready_for_checkout → purchased │                  │
│   └───────────────────────────────┘              │ + removed (named exit)         │                  │
│                                                   └───────────────────────────────┘                   │
│                                                                                                      │
│   Supporting visual 3 — REQUESTED WINDOWS (top 3 rows from §2c, $ desc)                               │
│   ┌──────────────────────────────────────────────────────────────────────────────┐                  │
│   │ Fri Aug 21   $1,240   · 14 trips     Sat Aug 22   $980   · 11 trips   …         │                  │
│   └──────────────────────────────────────────────────────────────────────────────┘                  │
│                                                                                                      │
│   Methodology: figures from 29 planned Kyoto trips (strict count — test and expert-authored trips     │
│   excluded). Demand shown only where the sample clears our honesty floor (≥10 trips per market).      │
│   Money shown only where planned items carried a price; count-only windows are marked. Updated daily. │
│                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Layout rules:
- **One hero $ figure**, the season's total unmet demand, with the methodology line (**"based on 29 planned trips,
  strict count"**) directly beneath — not in a footer. The N is part of the hero, per §1d.
- **Exactly three supporting visuals**, each a *rendering of a 2B metric we already compute*: the pickup calendar
  (`unmet_demand_slip` by date), the slip funnel (`slip_funnel`), and the top-3 Requested-Windows rows. No fourth
  visual; no invented chart.
- **The methodology block states all four honesty gates in plain language**: strict framing, the floor, count-only
  money, daily cadence. This is the page's credibility spine and Stripe's named-reason empty-state pattern applied to a
  whole page.
- **Actual numbers deferred.** The `$XX,XXX` hero and the calendar/funnel/window values are **placeholders until the
  real figures come off the DB on Replit** (see §hand-derivation doc, "Real-data addendum"). The layout is approved on
  its *structure*; the numbers drop in from `readAdminDemandRollup()` output, not from this file (§13 — no invented $).
- **ODbL attribution** ("© OpenStreetMap contributors") is present because the pickup calendar and any map derive from
  OSM-anchored inventory; required wherever it renders (per §20/§22c).

---

## 4. Mobile-first check

The one-pager and the three surfaces must survive a phone screen, because a partner reads a recruitment one-pager on
their phone far more often than on a desktop. Checks:

- **Hero stacks first, full-width.** The $ figure + methodology line is the entire first viewport on mobile. Everything
  else scrolls under it. (Incumbent recruitment pages — AirDNA "Rentalizer", PriceLabs onboarding — all lead with a
  single stacked hero on mobile.)
- **Three visuals stack vertically, never side-by-side on < 640px.** The calendar becomes a **scrollable week strip**
  (a full month grid is unreadable on a phone — pickup tools all degrade the calendar to a horizontal date strip on
  mobile). The funnel becomes a **vertical bar list** (stages top-to-bottom), which is *more* readable on a phone than
  a horizontal funnel. The Requested-Windows list is already a vertical list — it is the most mobile-native of the
  three and should arguably lead on mobile.
- **N and methodology never truncate.** The sample-size line and the honesty floor line must wrap, not clip — they are
  the credibility of the page and the one thing that must survive a small screen.
- **Map is desktop/admin-first, not on the mobile partner one-pager.** The map circles are an *admin* market-research
  cut (R13, includes the `__unmapped__` pool). The partner mobile one-pager leads with hero + calendar + funnel +
  windows; the map is a secondary, admin-side surface and does not need to be mobile-optimized for the recruitment
  page.
- **Touch targets on the Requested-Windows deep-links.** Each row's date↗ and map↗ links are the interactive heart of
  the bridge (§2c) — they must be full-row tap targets on mobile, not tiny inline icons.

---

## Approval checklist (for Leon)

- [ ] §1 research reflects the incumbents you want us anchored to (add any I missed).
- [ ] §2c **Requested-Windows list** is the right calendar↔map bridge (or name a different one).
- [ ] §3 one-pager layout — one hero $, three visuals, methodology-on-page — is approved **as structure** (numbers land
      from Replit).
- [ ] §0 — confirm whether a concrete `partner-demand-visual-target.html` exists to drop in the tree for a pixel pass.
- [ ] Green-light Phase 3 rendering / Phase 4 one-pager generation (currently **blocked** on this approval + the HARD
      STOP review).

**Nothing in this brief is built. It is the layout contract Phase 3 renders against.**
