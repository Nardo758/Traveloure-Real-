# Discover IA audit — duplicate surfaces & "multiple headers"

> **superseded (2026-08-23, ledger `2026-08-23-marketplace-ungroup`):** after Option 1's first
> slices landed, the decision-maker clarified the actual intent — **Option 2**: each Marketplace
> surface is its own page (no tabbed shell, no grouped header), reached straight from the nav
> dropdown; `/discover` survives only as a redirect. The inventory below remains accurate as-of
> its SHA; the *recommendation* is superseded.

**As-of:** `1a7c2886` (main, 2026-08-23). Read-only audit; no code changed. Requested by the
decision-maker after observing that "we grouped all the discover pages instead of letting each be
its own page, so there are multiple headers."

## The finding in one line

The same content categories have **two homes at once** — a **header-less tab under `/discover`**
(rendered beneath the one Discover masthead) **and** a **standalone route with its own full
masthead**. Moving between nav links / CTAs lands the user on two differently-headered versions of
the same surface. The doubling is **architectural (two routes)**, not two mastheads stacked inside a
single tab.

## `/discover` today (the tabbed shell)

`client/src/pages/discover.tsx` — ONE masthead (`earn-card` band; `py-9`, being trimmed to `py-5`
in PR #571) over five tabs, each rendering a **header-less** component/section:

| Tab (`value=`) | Renders | Own masthead? |
|---|---|---|
| `services` | inline grid + quick-cat chips | no (shell masthead only) |
| `packages` | Ready-Made shelf (ledger 2026-08-22-ready-made-themes) | no |
| `articles` | curated content section | no |
| `events` | `components/travelpulse/GlobalCalendar` | no |
| `travelpulse` | `components/travelpulse/CityGrid` | no |

So *within* `/discover` there is exactly one header. Good.

## The duplicate standalone routes (each with its OWN masthead)

| Standalone route | Component | Own header | Duplicates the Discover… |
|---|---|---|---|
| `/global-calendar` | `pages/global-calendar.tsx` | gradient `py-12`, `<h1>Global Travel Calendar</h1>` | **Events** tab (same calendar) |
| `/discover/location/:city` | `pages/discover-location.tsx` | multiple `<h1>` (city marketplace, 9 sections) | **TravelPulse** tab (`CityGrid`) + `/city/*` |
| `/experiences` | `pages/experiences.tsx` | gradient `py-16/24`, large `<h1>` | experiences content on Discover |
| `/experts` | `pages/experts.tsx` | `earn-card` masthead `py-9` (→`py-5` in #571), `<h1>` | expert surfaces on Discover (AIMatchedExperts + "Talk to an Expert" CTA) |

`pages/global-calendar.tsx` vs `components/travelpulse/GlobalCalendar.tsx` are **two separate
implementations** of the calendar — the page has the masthead, the component does not. That is the
clearest instance of the reported problem: the *same feature*, two homes, one with an extra header.

## Nav entry points (what sends users where)

- `nav-config.ts`: **"By Location" → `/discover`**, **"Live Intel" → `/discover`**, **"Marketplace" → `/discover`** (three labels, one destination).
- `dashboard-sidebar.tsx`: **"Discover" → `/discover"`, "Experts" → `/experts`**.
- The standalone `/global-calendar` and `/experiences` are **not** in the primary nav found here —
  they are reached from in-page CTAs / deep links, which is exactly how a user ends up on the
  "other" header for content they also saw as a Discover tab.

## Consolidation precedent already in the tree

`/discover-experiences` is already `<Redirect to="/discover" />` (App.tsx:518), and `/city/:slug`
+ `/city/:city` are already `<Redirect>`s. So the "one home, redirect the duplicate" pattern is
**already established and accepted** in this codebase — it is not a new invention.

## The ratified constraint to weigh

`docs/ROADMAP.md` ratified **"Discover = one header band + tabs"** as the funnel model, and
funnel-PR1 deliberately merged the tab bar INTO the hero band. **Un-grouping the tabs into separate
top-level pages reverses that ratified decision** — it is a real IA/routing change (nav, deep-links,
the funnel), not cleanup. That is the trade-off behind the options below.

## Options

**Option 1 — One home per surface (keep the tabbed shell).** *Lower risk; preserves the ratified
funnel.* Make `/discover` the single home for its surfaces and **redirect the duplicate standalone
routes** into it — `/global-calendar → /discover?tab=events`, city routes → the TravelPulse/location
surface, `/experiences` → its Discover home (or keep as a genuine detail surface if it is one).
Retire the now-unreferenced standalone page components (or reduce them to the header-less shared
component the tab already uses). Mostly redirects + dead-code removal; extends the existing
`/discover-experiences` precedent. Each surface ends with exactly one header.

**Option 2 — Un-group into own pages (what the decision-maker described).** Give each surface its own
route + single header (TravelPulse, Events, Packages, Services, Articles as standalone pages) and
demote `/discover` to a light landing/nav. **Reverses the ratified tabbed-funnel model**; touches
nav-config, deep-links, the merged tab-in-hero hero, and every "add to cart → we assemble" funnel
assumption. Larger, and needs a ROADMAP amendment.

**Option 3 — Header-dedupe only (leave routing alone).** Keep both homes but ensure the standalone
pages and the tab render **one** header treatment (e.g. the standalone page reuses the same
header-less component the tab uses, wrapped in a single masthead). Smallest change; does **not**
resolve the two-homes/two-entry-points confusion, only the visual doubling.

## Recommendation

**Option 1.** It removes the duplicate headers *and* the duplicate entry points, keeps the ratified
Discover funnel intact, and follows a consolidation pattern (`/discover-experiences` redirect) that
is already in the codebase — so it is the lowest-risk path to "one surface, one header." Option 2 is
viable but should be a deliberate ROADMAP amendment, not a side effect of a header fix.

**Independent of the choice:** PR #571 (masthead `py-9 → py-5`) is a safe, standalone improvement to
whichever shell survives, and can merge on its own.

## Concrete next-step checklist (if Option 1 is chosen)

1. Redirect `/global-calendar → /discover?tab=events`; delete `pages/global-calendar.tsx` once no
   nav/CTA/deep-link references it (grep first).
2. Decide `/experiences`: fold into a Discover tab/surface, or keep only if it is a genuine distinct
   product (it currently reads as a duplicate landing).
3. Point the "By Location / Live Intel / Marketplace" nav labels at the specific `?tab=` deep-links
   so each label lands on the right surface under the one masthead.
4. Confirm `/discover/location/:city` stays as the deep city view (it is a detail surface, not a
   duplicate of the shell) — but ensure it carries exactly one masthead.
5. Guard: the route-coverage gates already assert every `<Route>` renders; add the new redirects to
   the redirect-check so a retired page can't silently 404.
