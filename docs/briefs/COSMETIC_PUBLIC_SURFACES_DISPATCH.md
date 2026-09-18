# COSMETIC_PUBLIC_SURFACES_DISPATCH

**Target location:** `docs/briefs/COSMETIC_PUBLIC_SURFACES_DISPATCH.md`
**Companion spec:** `playwright/tests/cosmetic-public-surfaces.spec.ts` (15 tests; all 15 fail on `32b0d6e` for the reasons recorded below — verified against production)
**Audited:** 2026-09-18, production `https://www.traveloure.com`, logged out, read-only. Source mapped against `main @ 32b0d6e`.
**Method:** headless Chromium, production fonts (Fraunces / Inter / Geist Mono) served locally so text metrics match, 54 public routes × 1440px and 390px, DOM measurement + screenshot review.
**Money paths touched:** none. No fee, ledger, booking or Stripe code is in scope. If a fix appears to require touching one, HARD STOP.

---

## 0. Rulings (locked — do not relitigate)

**R1 — No "More info" text link is added to gem / event / service / recommendation cards.**
The absence is by design, not a regression. `city-feed-card.tsx:979` documents the family grammar: *"No 'More info' text link — the CARD is the link (it opens the details sheet)"*; the same rule is restated in `city-feed-card-recommendation.tsx:130`, `city-feed-card-expert.tsx:29`, `feed/ready-made-card.tsx:6`. The (i) glyph is `CompactInfoCue` (`city-feed-card.tsx:276`), deliberately `pointer-events-none` + `aria-hidden` — a passive cue, the click lands on the card. What reads as "More info is missing" is the *destination* being poor (C3, C4 below). Fix the sheet; leave the grammar.
*Owner note for Leon: this was your open question. If you want a visible text affordance anyway, that is a new ruling in `docs/DECISIONS.md` reversing the family grammar across four card files — not part of this dispatch.*

**R2 — Header: shorten three labels, force single-line, move the desktop-nav breakpoint `lg` → `xl`.**
Trialled live by CSS/text injection before writing this:
- `white-space: nowrap` alone does **not** fit at any width ≤1440 — "Pricing" collides with "Join as Partner" even at 1440. The row is over budget, not just wrapping.
- Short labels (`Experts & Services`→`Experts`, `Planning Tools`→`Tools`, `Ways to Earn`→`Earn`) + nowrap: clean at 1180 / 1280 / 1440; still collides at 1024 and 1100.
- Therefore the hamburger must own everything below 1280. Dropdown section headings and the mobile menu keep the long names; only the top-level trigger text shortens.

**R3 — Mobile planner: no new layout. Un-break the existing one.**
A stacked mobile layout with a Map toggle already exists (`experience-template.tsx:3096`, `:3329`). It is being pushed below a 1,203px-tall desktop split that should be hidden. See B1.

**R4 — Desktop details sheet becomes a right-side panel (≤ 480px); stays a bottom sheet below `lg`.**

---

## 1. Phase 0 findings

Severity: **S1** blocks use · **S2** visibly broken · **S3** polish. Confidence: **H** measured + source line read · **M** measured, cause inferred · **L** observed once.

### Lane A — header / navigation (`lane/cosmetic-a-header`)

| ID | Sev | Finding | Repro | Evidence (measured) | Source | Conf |
|---|---|---|---|---|---|---|
| A1 | S2 | Nav items overlap between 1024–1100px: "Pricing" renders on top of the globe icon and "Join as Partner"; labels wrap to 3 lines and spill out of the 61px bar. | `/` at 1024 and 1100 wide | Bounding boxes intersect: `Pricing × Join as Partner`, `Pricing × [globe]`. Header height fixed 61px, label boxes > 44px. | Breakpoint: `client/src/components/layout.tsx:703`, `:734`, `:744`, `:800` (`hidden lg:flex` / `lg:block`), `:807`, `:841` (`lg:hidden`). | H |
| A2 | S2 | Three triggers wrap to two lines at every desktop width incl. 1440; chevrons detach from labels. | `/` at 1280, 1440 | `Experts & Services`, `Planning Tools`, `Ways to Earn` each > 44px tall. | Trigger classes have no `whitespace-nowrap`: `layout.tsx:289`, `:318`. Labels: `client/src/lib/nav-config.ts:130`, `:231`, `:255` + matching keys in `client/src/locales/en/nav.json` (and `ja`). | H |
| A3 | S3 | Experiences mega-menu truncates its own labels: "Wedding Anniver…", "Romantic Getaw…". | `/` → open Experiences at 1440 | `scrollWidth > clientWidth` on the label div. | `layout.tsx:401` (`truncate`). Note the comment at `:437` — a previous truncation bug was already fixed one block down; same class of bug. | H |
| A4 | S3 | "Join as Partner → Event Planner" is buyer copy in a supplier menu: description "Plan your event — weddings, proposals & group celebrations", href `/start/events`. | Open Join as Partner | DOM text + href. | `layout.tsx:766` (desktop), `:946` (mobile). `/start/events` is a two-sided chooser ("Which side of the event are you on?") so the href may be intended — the **description** is what's wrong. Copy fix only. | H |
| A5 | S3 | Label "AI Plan Planner". | Planning Tools menu | — | `nav-config.ts:238`, `locales/en/nav.json:72`, icon map key `layout.tsx:113` (key must change with the label or the icon silently drops — absence-vs-absence). | H |
| A6 | S3 | Mobile menu opens pre-scrolled; first heading "MARKETPLACE" hidden under the header. | `/` at 390 → tap hamburger | Container `scrollTop` = 72 on one run, 38 on another; expected 0. | Container: `layout.tsx:841`. Cause not read — likely focus-on-open scrolling the first link into view. | M |
| A7 | S3 | Mobile menu is a flat 1,979px list (≈2.5 screens); "Sign In" is the last item. | same | `scrollHeight` 1979 vs `clientHeight` 783. | `layout.tsx:841–960`. **Out of scope to restructure** — move Sign In to the top of the panel only. Accordion redesign → `FOLLOWUPS.md`. | H |

### Lane B — mobile experience planner (`lane/cosmetic-b-planner-mobile`)

| ID | Sev | Finding | Repro | Evidence | Source | Conf |
|---|---|---|---|---|---|---|
| B1 | **S1** | On all 17 `/experiences/:slug` pages at mobile width, the desktop 60/40 resizable split renders (229px + 8px handle + 153px), both panes clipped ("xpert Help", "our plan doesn't hav"). The real mobile layout sits underneath it, 1,203px down. | `/experiences/wedding` at 390 (dismiss the destination modal) | `[data-panel-group]` has class `h-screen hidden lg:flex` **and** inline `style="display:flex; flex-direction:row; height:100%; overflow:hidden; width:100%"`. Computed `display: flex`. Sibling `div.lg:hidden` (the mobile layout) also rendered. | `client/src/pages/experience-template.tsx:2191`. **Root cause:** `react-resizable-panels@^2.1.7` writes `display:flex` as an inline style on `PanelGroup`; inline beats Tailwind's `.hidden`. The `hidden lg:flex` on that element has never worked. Fix: wrap the `PanelGroup` (`:2191`–`:3093`) in `<div className="hidden lg:block h-screen">` and drop `hidden lg:flex` from the group. | H |
| B2 | S3 | Desktop tab strip cuts off the last tab ("Conting…") at the pane edge with no scroll cue. | `/experiences/wedding` at 1440 | Visual. | `experience-template.tsx:2299` (`TabsList`, no overflow handling). The mobile twin at `:3265`/`:3269` already has `overflow-x-auto` + `flex-nowrap` — copy that treatment. | M |

### Lane C — discover cards + details sheet (`lane/cosmetic-c-discover-cards`)

| ID | Sev | Finding | Repro | Evidence | Source | Conf |
|---|---|---|---|---|---|---|
| C1 | S2 | Compact-density action row overflows its card; "Ask an expert" is clipped at the right edge. | `/discover/location/Kyoto` at 1440, any 4-col row | Row `scrollWidth` 224 vs `clientWidth` 212; button's right inset 1px vs 13px left; card is `overflow-hidden`. Affects all 51 gem cards on Kyoto. | Row class `flex gap-1.5 pt-0.5 items-center mt-auto` — **four copies**: `client/src/components/city-feed-card.tsx:1129` (gem), `:1326` (event), `:1652` (vendor service), `:1981` (generic). The non-compact row at `:982` has `flex-wrap`; the compact ones don't. Fix all four or the bug survives on three card kinds. | H |
| C2 | S3 | Wanted-slot title truncates the only variable part: "Local City Itinerary wanted in A…". | same page | `truncate` on a ~200px card. | `client/src/components/feed/wanted-slot-card.tsx:60`. Use `line-clamp-2`. | H |
| C3 | S2 | Card click opens a full-width, 85vh bottom drawer on desktop — mostly empty. | Click any gem card at 1440 | Dialog box width 1440. | `city-feed-card.tsx:750` `<SheetContent side="bottom" className="h-[85vh] …">` — unconditional. Apply R4. | H |
| C4 | S3 | Sheet prints the same sentence under "About" and "Why locals love it". | Kyoto → Tofuku-ji Temple | Two identical `<p>`. | `city-feed-card.tsx:505–528`. The card face already handles this (`:851` `whyLocalsLoveIt || description`); the sheet renders both unconditionally. Render "About" only when `description !== whyLocalsLoveIt`. Do **not** edit gem rows. | H |
| C5 | S3 | Every "More info →" on the page (Wanted ×2, Earn ×1) goes to generic `/how-it-works`. | same | hrefs read from DOM. | `feed/wanted-slot-card.tsx:72`, `feed/earn-card.tsx:56`. `/earn` is the more specific target for both. Confirm before changing — copy/IA call. | M |

### Lane D — landing (`lane/cosmetic-d-landing`)

| ID | Sev | Finding | Repro | Evidence | Source | Conf |
|---|---|---|---|---|---|---|
| D1 | S3 | "Cities with momentum" ticker strip is static but hard-clipped: 3 of 8 city labels cut at 1440, 7 of 8 at 390. No animation, no scroll. | `/` | `overflow-hidden whitespace-nowrap`, `scrollWidth > clientWidth`, no running animations. | `client/src/components/landing/cities-rail.tsx:56`. Either bind it to the same `windowed` slice the cards use (`:84`) or make it `overflow-x-auto`. | H |
| D2 | S3 | "A wedding weekend in Kyoto" sits over a photo captioned "Goa at sunset"; the same photo is the image for the Goa gem "Tito's Lane" in the hero. | `/` | Visual. | Not mapped. Content/asset selection — **FOLLOWUPS**, not this lane. | L |

### Lane E — services card (`lane/cosmetic-e-services-card`)

| ID | Sev | Finding | Repro | Evidence | Source | Conf |
|---|---|---|---|---|---|---|
| E1 | S2 | "service type" shows raw enum tokens: `in_person`, `pdf`. | `/services` at 1440 | Body text matches `/\b(in_person\|pdf)\b/`. | `client/src/pages/discover.tsx:420` — `category?.name \|\| service.deliveryMethod \|\| "Service"`; category is null on seed rows so the enum leaks. Rendered at `:517`. Humanize the fallback; do not backfill categories. | H |
| E2 | S3 | Image-corner label ("IN_PERSON", "PDF") is white text with no visible backing on a pale placeholder. | same | Visual. | `discover.tsx:459` (and twin at `:222`): `bg-[var(--earn-ink)]/70`. Hypothesis: Tailwind's `/70` opacity modifier does not apply to an arbitrary `var()` colour, so no background is emitted. **Verify in built CSS before fixing.** | M |

---

## 2. Corrections to the chat report that preceded this dispatch

Recorded so nobody fixes a non-bug:

- **Footer "Talk to Experts" (`/chat`) and "Executive Assistant" (`/executive-assistant`) are not dead links.** `ProtectedRoute` (`client/src/App.tsx:225–234`) stores `returnTo`, opens the sign-in modal, then navigates to `/`. My crawler saw the home page and missed the modal. Working as designed. `nav-config.ts:304`, `:309` — no change.
- **The "Cities with momentum" card row is not clipped.** It is a deliberate 5-card rotating window with the last card at 0.55 opacity (`cities-rail.tsx:84–85`). Only the ticker strip above it (D1) is a defect.

## 3. Phases and gates

**Phase 0 (done — this document).** Agent's first act: `BASE_URL=<local> npx playwright test cosmetic-public-surfaces` and confirm **15 failed / 0 passed** on a clean checkout. If any test passes before you've changed anything, stop and report — the finding or the spec is stale.

**HARD STOP.** Post the 15/15 red run. Wait for go.

**Phase 1 — one lane per branch, draft PR each, Leon merges.** Suggested order by severity: B → A → C → E → D.

**Pass standard per lane** — the lane's tests green **and** a screenshot at the repro viewport attached to the PR **and** the changed `file:line` cited. Compile-green is not a pass. A test made green by changing the test is a fail.

| Lane | Tests that must flip |
|---|---|
| A | A1/A2 ×4 widths, A3, A6 (after R2 lands, change the width list to `[1280, 1440]` for the desktop assertions and add one assertion that `button-mobile-menu` is visible at 1024 and 1100 — that edit to the spec is authorised) |
| B | B1 ×3 slugs |
| C | C1, C3, C4 |
| D | D1 ×2 viewports |
| E | E1 |

## 4. What Not To Do

- Do not add a "More info" link to any card (R1).
- Do not edit, reseed or backfill data: "Admin User" provider names, the literal `Ladur\u00e9e` title, null service categories, missing service images, the Wanted cards appearing under the wrong neighbourhood heading. All → `FOLLOWUPS.md`. Null is honest; fabricated backfill is banned.
- Do not touch `/api/media/place-photo` rate limiting or the blank-on-429 state of `/discover/location/:city`. Real, but not cosmetic → `FOLLOWUPS.md`.
- Do not paginate `/deals` (49,852px desktop / 147,106px mobile). Real, needs a product decision → `FOLLOWUPS.md`.
- Do not prune the 28-family Google Fonts `<link>` at `client/index.html:29` in these lanes. Real, separate perf lane → `FOLLOWUPS.md`.
- Do not restructure the mobile menu beyond A6/A7 as scoped.
- Do not touch `ja` layout beyond keeping `nav.json` keys in sync for A2/A5.
- Do not fix anything you notice in `experience-template.tsx` beyond `:2191` and `:2299`. It is 3,630 lines; stay out.

## 5. Not proven

- Anything behind login (traveler, expert, provider, EA, admin surfaces).
- Mobile renders of `/services`, `/events`, `/destinations`, `/discover/location/*` — captured, not reviewed.
- `/earn`, `/pricing`, `/about`, `/features`, `/how-it-works`, `/visa-help` — automated overflow checks only (none overflowed); no visual review.
- Safari / iOS, hover and focus states, Japanese-locale text metrics.
- Whether gem cards lack photos in production, or only lacked them because my crawl tripped the 429 limiter.
- A6 root cause. E2 root cause.
- Whether `main @ 32b0d6e` is what production is serving. The test IDs and class strings matched 1:1, which is strong but circumstantial.
