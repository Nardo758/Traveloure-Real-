# Footer pages: before and after

The fix for the footer-page audit, on branch `claude/inspiring-ride-rplz7t`, under ledger `2026-09-28-footer-pages-one-layout` (R184).
- **Rulings:** these are the decision-maker's Sep 28, 2026 rulings on [`footer-pages-audit.md`](footer-pages-audit.md).
- **Before:** `main` at `b0462730d` plus #1142, the build that was audited.
- **After:** that branch, built locally.
- **Capture:** everything was taken signed out in Chromium, at 1440×900 (desktop) and 390×844 (mobile).
- **Thumbnails:** each one shows the first screen; click it for the full-page screenshot.

**What is the same on every page now:**
- **Chrome:** the shared header and footer, on the cream ground (#FAFAF8, the `--earn-ground` token).
- **Width:** one of the two width tokens. `content` is 1280 and `reading` is 720.
- **Headings:** a Fraunces 42 H1 (34 on phones) from the shared `PageTitle`.
- **Actions and links:** coral filled primary, navy outline secondary, navy text links with a coral hover.
- **Colour:** no hardcoded hex in any footer page file (lint: `scripts/check-page-hex.cjs`).
- **Measured on the rebuilt pages:** no horizontal overflow at 390 px. No body text uses a colour outside the token set, except the photo scrims noted below.

## Per page

| Page | Before · desktop | After · desktop | Before · mobile | After · mobile | What changed |
|---|---|---|---|---|---|
| `/` | <a href="footer-pages-audit/landing.desktop.jpg"><img src="footer-pages-audit/landing.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/landing.desktop.jpg"><img src="footer-pages-after/landing.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/landing.mobile.jpg"><img src="footer-pages-audit/landing.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/landing.mobile.jpg"><img src="footer-pages-after/landing.mobile.top.jpg" width="110"></a> | Reference, not changed (#1142 owns this file). The one visible difference is the coral primary and the cream ground, both now site-wide tokens. |
| `/experiences` | <a href="footer-pages-audit/experiences.desktop.jpg"><img src="footer-pages-audit/experiences.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/experiences.desktop.jpg"><img src="footer-pages-after/experiences.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/experiences.mobile.jpg"><img src="footer-pages-audit/experiences.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/experiences.mobile.jpg"><img src="footer-pages-after/experiences.mobile.top.jpg" width="110"></a> | **Public layout for everyone.** It was the console `DashboardLayout` for guests too; now the shared header and footer. H1 is Fraunces 42. The occasion cards use one coral accent, not a colour per occasion. Actions use the shared buttons. Width is the content token. |
| `/destinations` | <a href="footer-pages-audit/destinations.desktop.jpg"><img src="footer-pages-audit/destinations.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/destinations.desktop.jpg"><img src="footer-pages-after/destinations.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/destinations.mobile.jpg"><img src="footer-pages-audit/destinations.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/destinations.mobile.jpg"><img src="footer-pages-after/destinations.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42 (was 26). All containers use the content width (was 1152 / 1400). Coral replaces #FF3859. City cards **omit** trending, gems, pulse and price when not a positive number (was "0 trending", "0 gems"). The header lights **Marketplace**. |
| `/how-it-works` | <a href="footer-pages-audit/how-it-works.desktop.jpg"><img src="footer-pages-audit/how-it-works.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/how-it-works.desktop.jpg"><img src="footer-pages-after/how-it-works.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/how-it-works.mobile.jpg"><img src="footer-pages-audit/how-it-works.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/how-it-works.mobile.jpg"><img src="footer-pages-after/how-it-works.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42 (was Inter 48 bold). The orange/pink gradient hero and the blue icon tile are gone. Step icons are coral on coral-bg. Buttons are the shared primary and secondary. |
| `/pricing` | <a href="footer-pages-audit/pricing.desktop.jpg"><img src="footer-pages-audit/pricing.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/pricing.desktop.jpg"><img src="footer-pages-after/pricing.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/pricing.mobile.jpg"><img src="footer-pages-audit/pricing.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/pricing.mobile.jpg"><img src="footer-pages-after/pricing.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42 (was 30). Content width. Ladder buttons are the shared pair; the gold border and banner are tokens. **Loading:** a skeleton held at the loaded page's measured heights, within about 1px at 390–1440 (see the loading row). |
| `/experts` | <a href="footer-pages-audit/experts.desktop.jpg"><img src="footer-pages-audit/experts.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/experts.desktop.jpg"><img src="footer-pages-after/experts.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/experts.mobile.jpg"><img src="footer-pages-audit/experts.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/experts.mobile.jpg"><img src="footer-pages-after/experts.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42. Content width. #FB3B63, the blue link and the greys are gone. Cards **omit** "from $X" and the price fact when the listing has no price (was "from $0"). The mobile filter row no longer runs past the card. The header lights **Experts**. |
| `/providers` | <a href="footer-pages-audit/providers.desktop.jpg"><img src="footer-pages-audit/providers.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/providers.desktop.jpg"><img src="footer-pages-after/providers.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/providers.mobile.jpg"><img src="footer-pages-audit/providers.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/providers.mobile.jpg"><img src="footer-pages-after/providers.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42. Content width. The card buttons are coral filled and navy outline. A missing service count is omitted (was `|| 0`). The header lights **Experts**. |
| `/earn?role=local_expert` | <a href="footer-pages-audit/earn-local_expert.desktop.jpg"><img src="footer-pages-audit/earn-local_expert.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/earn-local_expert.desktop.jpg"><img src="footer-pages-after/earn-local_expert.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/earn-local_expert.mobile.jpg"><img src="footer-pages-audit/earn-local_expert.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/earn-local_expert.mobile.jpg"><img src="footer-pages-after/earn-local_expert.mobile.top.jpg" width="110"></a> | H1 is Fraunces 42 (was Inter 26). 61 hex literals are now tokens, and #0F6E56 green is replaced with teal-ink. Bands became cards inside the content width. **On mobile the page scrolls the selected track into view** (it was 4th in the list, below the fold). |
| `/earn?role=trip_planner` | <a href="footer-pages-audit/earn-trip_planner.desktop.jpg"><img src="footer-pages-audit/earn-trip_planner.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/earn-trip_planner.desktop.jpg"><img src="footer-pages-after/earn-trip_planner.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/earn-trip_planner.mobile.jpg"><img src="footer-pages-audit/earn-trip_planner.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/earn-trip_planner.mobile.jpg"><img src="footer-pages-after/earn-trip_planner.mobile.top.jpg" width="110"></a> | As above; the trip-planner card is scrolled into view on mobile. |
| `/earn?role=event_planner` | <a href="footer-pages-audit/earn-event_planner.desktop.jpg"><img src="footer-pages-audit/earn-event_planner.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/earn-event_planner.desktop.jpg"><img src="footer-pages-after/earn-event_planner.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/earn-event_planner.mobile.jpg"><img src="footer-pages-audit/earn-event_planner.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/earn-event_planner.mobile.jpg"><img src="footer-pages-after/earn-event_planner.mobile.top.jpg" width="110"></a> | As above (the card was already in view). |
| `/earn?role=service_provider` | <a href="footer-pages-audit/earn-service_provider.desktop.jpg"><img src="footer-pages-audit/earn-service_provider.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/earn-service_provider.desktop.jpg"><img src="footer-pages-after/earn-service_provider.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/earn-service_provider.mobile.jpg"><img src="footer-pages-audit/earn-service_provider.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/earn-service_provider.mobile.jpg"><img src="footer-pages-after/earn-service_provider.mobile.top.jpg" width="110"></a> | As above (the first card). |
| `/about` | <a href="footer-pages-audit/about.desktop.jpg"><img src="footer-pages-audit/about.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/about.desktop.jpg"><img src="footer-pages-after/about.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/about.mobile.jpg"><img src="footer-pages-audit/about.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/about.mobile.jpg"><img src="footer-pages-after/about.mobile.top.jpg" width="110"></a> | The "Start a plan" button is shared coral (was shadcn #FF3859). Links are navy with a coral hover. Reading width token (720). |
| `/press` | <a href="footer-pages-audit/press.desktop.jpg"><img src="footer-pages-audit/press.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/press.desktop.jpg"><img src="footer-pages-after/press.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/press.mobile.jpg"><img src="footer-pages-audit/press.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/press.mobile.jpg"><img src="footer-pages-after/press.mobile.top.jpg" width="110"></a> | Links are navy with a coral hover. Reading width token. |
| `/careers` | <a href="footer-pages-audit/careers.desktop.jpg"><img src="footer-pages-audit/careers.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/careers.desktop.jpg"><img src="footer-pages-after/careers.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/careers.mobile.jpg"><img src="footer-pages-audit/careers.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/careers.mobile.jpg"><img src="footer-pages-after/careers.mobile.top.jpg" width="110"></a> | Links are navy with a coral hover. Reading width token. |
| `/help` | <a href="footer-pages-audit/help.desktop.jpg"><img src="footer-pages-audit/help.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/help.desktop.jpg"><img src="footer-pages-after/help.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/help.mobile.jpg"><img src="footer-pages-audit/help.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/help.mobile.jpg"><img src="footer-pages-after/help.mobile.top.jpg" width="110"></a> | Borders are the earn border token. Links are navy. Reading width token. |
| `/help/:slug` | <a href="footer-pages-audit/help-article.desktop.jpg"><img src="footer-pages-audit/help-article.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/help-article.desktop.jpg"><img src="footer-pages-after/help-article.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/help-article.mobile.jpg"><img src="footer-pages-audit/help-article.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/help-article.mobile.jpg"><img src="footer-pages-after/help-article.mobile.top.jpg" width="110"></a> | Links and cross-references are navy with a coral hover. Reading width token. |
| `/faq → /help` | <a href="footer-pages-audit/faq-redirect.desktop.jpg"><img src="footer-pages-audit/faq-redirect.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/faq-redirect.desktop.jpg"><img src="footer-pages-after/faq-redirect.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/faq-redirect.mobile.jpg"><img src="footer-pages-audit/faq-redirect.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/faq-redirect.mobile.jpg"><img src="footer-pages-after/faq-redirect.mobile.top.jpg" width="110"></a> | Still redirects to the help index. |
| `/contact` | <a href="footer-pages-audit/contact.desktop.jpg"><img src="footer-pages-audit/contact.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/contact.desktop.jpg"><img src="footer-pages-after/contact.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/contact.mobile.jpg"><img src="footer-pages-audit/contact.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/contact.mobile.jpg"><img src="footer-pages-after/contact.mobile.top.jpg" width="110"></a> | The dark gradient hero is gone. H1 is Fraunces 42. **The address is Admin@traveloure.com** (was hello@). Send is the shared primary. Content width. |
| `/visa-help` | <a href="footer-pages-audit/visa-help.desktop.jpg"><img src="footer-pages-audit/visa-help.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/visa-help.desktop.jpg"><img src="footer-pages-after/visa-help.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/visa-help.mobile.jpg"><img src="footer-pages-audit/visa-help.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/visa-help.mobile.jpg"><img src="footer-pages-after/visa-help.mobile.top.jpg" width="110"></a> | The pink/orange/blue gradient hero is gone. H1 is Fraunces 42. The badges and disclaimer box use tokens. Buttons are the shared pair. The header lights **Tools**. |
| `/privacy` | <a href="footer-pages-audit/privacy.desktop.jpg"><img src="footer-pages-audit/privacy.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/privacy.desktop.jpg"><img src="footer-pages-after/privacy.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/privacy.mobile.jpg"><img src="footer-pages-audit/privacy.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/privacy.mobile.jpg"><img src="footer-pages-after/privacy.mobile.top.jpg" width="110"></a> | **Shared header and footer** (it had its own "Back to Home" bar). H1 is Fraunces 42, section headings Fraunces. Reading width. The address reads the one constant. |
| `/terms` | <a href="footer-pages-audit/terms.desktop.jpg"><img src="footer-pages-audit/terms.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/terms.desktop.jpg"><img src="footer-pages-after/terms.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/terms.mobile.jpg"><img src="footer-pages-audit/terms.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/terms.mobile.jpg"><img src="footer-pages-after/terms.mobile.top.jpg" width="110"></a> | As `/privacy`. |

## Loading states

Each row was captured 1.5 s after load, with `GET /api/pricing` held for 4 s.

| Page | Before · desktop | After · desktop | Before · mobile | After · mobile | What changed |
|---|---|---|---|---|---|
| `/pricing (loading)` | <a href="footer-pages-audit/pricing-loading.desktop.jpg"><img src="footer-pages-audit/pricing-loading.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/pricing-loading.desktop.jpg"><img src="footer-pages-after/pricing-loading.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/pricing-loading.mobile.jpg"><img src="footer-pages-audit/pricing-loading.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/pricing-loading.mobile.jpg"><img src="footer-pages-after/pricing-loading.mobile.top.jpg" width="110"></a> | **Before:** the page was blank until prices arrived, then jumped to full height. **After:** the page header renders at once, over a skeleton held at the loaded height. Measured `<main>` height, skeleton vs loaded: 1568 vs 1568 at 1440, and 3458 vs 3459 at 390. No number is drawn before the prices arrive. |
| `/help/trip-pass-and-fees (loading)` | <a href="footer-pages-audit/help-article-loading.desktop.jpg"><img src="footer-pages-audit/help-article-loading.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/help-article-loading.desktop.jpg"><img src="footer-pages-after/help-article-loading.desktop.top.jpg" width="260"></a> | <a href="footer-pages-audit/help-article-loading.mobile.jpg"><img src="footer-pages-audit/help-article-loading.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/help-article-loading.mobile.jpg"><img src="footer-pages-after/help-article-loading.mobile.top.jpg" width="110"></a> | Unchanged by ruling. The price sentences are omitted and the article says prices are on the Pricing page; it grows when prices arrive (844→1023 px on mobile). Only `/pricing` was ruled to get a skeleton. |

## Measured on the rebuilt pages

| Check | Before | After |
|---|---|---|
| Shared header and footer, signed out | 18 of 21 destinations. `/experiences` showed the console sidebar; `/privacy` and `/terms` had their own bar. | **21 of 21.** The new Playwright check passes 18/18 on this build and fails exactly 4 on the old one: `/experiences`, `/privacy`, `/terms`, and `/contact` for the hello@ address. |
| Page background | #F9FAFB (cool grey) under every page | **#FAFAF8** on every page |
| H1 | Inter 26–48 on 10 of the 21 captures; Fraunces at 26, 30 or 42 on the rest | **Fraunces 42/600** (34 on phones) on every footer page; the landing hero stays 54 |
| Content width | 768, 1024, 1152, 1280, 1400, or none | **1280 (content)** or **720 (reading)** |
| Header highlight | Only Pricing and Earn | Plus **Marketplace** (`/destinations`), **Experts** (`/experts`, `/providers`), **Experiences** (`/experiences`) and **Tools** (`/visa-help`) |
| Zeros from missing values | "0 trending", "0 gems", "from $0" | Omitted |
| @traveloure.com addresses | hello@ (contact), support@ (4 signed-in pages), admin@ (legal) | **Admin@traveloure.com only**, from one constant |

**Left as is, named:**
- **Photo scrims.** `/destinations` city photos and `/pricing` occasion tiles keep a dark overlay, so white text stays readable on a photograph. They are the only gradients left on footer pages.
- **Landing page.** Fixed in a follow-up (R197): the four #111827 values were the "How it works" step titles, which inherited the global heading grey. They are now navy, like every other landing heading, and `/` paints no #111827 at either width ([section after](footer-pages-after/landing-how-it-works.desktop.jpg)).
- **Pro price.** "$0 / month during beta" on `/pricing` is Pro's real beta price, not a missing value.
- **Broken photo.** The Kyoto card on `/destinations` shows a broken image, because the seeded photo does not load locally. That is data, not layout.

## Consoles after the token change (fixed build, light theme, 1440)

The public `:root` tokens are also read by the consoles. Inside `.console-scope` (the traveler and
expert consoles) most are overridden. The admin shell has no scope, so it reads them directly. The
only measured change there is body text going from #111827 to #1F2733. No button lost contrast.
`--secondary` and the `.dark` theme keep main's values.

| Traveler `/dashboard` | Expert `/expert/today` | Admin `/admin/dashboard` |
|---|---|---|
| <a href="footer-pages-after/consoles/traveler.light.jpg"><img src="footer-pages-after/consoles/traveler.light.jpg" width="300"></a> | <a href="footer-pages-after/consoles/expert.light.jpg"><img src="footer-pages-after/consoles/expert.light.jpg" width="300"></a> | <a href="footer-pages-after/consoles/admin.light.jpg"><img src="footer-pages-after/consoles/admin.light.jpg" width="300"></a> |

## Landing reorder (ledger `2026-09-28-landing-reorder`, `2026-09-28-city-events`)

Before is main at `aad336648`; after is this branch. Both are signed-out production builds against the
same local database. Click a thumbnail for the full page.

| | Before · 1440 | After · 1440 | Before · 390 | After · 390 |
|---|---|---|---|---|
| `/` | <a href="footer-pages-after/landing-reorder/before.desktop.jpg"><img src="footer-pages-after/landing-reorder/before.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/landing-reorder/after.desktop.jpg"><img src="footer-pages-after/landing-reorder/after.desktop.top.jpg" width="260"></a> | <a href="footer-pages-after/landing-reorder/before.mobile.jpg"><img src="footer-pages-after/landing-reorder/before.mobile.top.jpg" width="110"></a> | <a href="footer-pages-after/landing-reorder/after.mobile.jpg"><img src="footer-pages-after/landing-reorder/after.mobile.top.jpg" width="110"></a> |

**Sections, measured on the rendered page:**

| | Order | Page height (1440 / 390) |
|---|---|---|
| Before | hero → Some trips are one evening → how it works (four columns with prices) → eight entry tiles → Cities with momentum → Useful numbers → Know a city well → closing CTA | 3448 / 7558 px |
| After | hero with pills → how-it-works strip → Some trips are one evening → *(Coming up in our cities — absent: the seed is empty)* → Cities with momentum → Know a city well → closing CTA | 2694 / 6050 px |

- **Hero.** Same layout. The billboard tiles are curated, each says "Representative photo · Kyoto" and carries its photo credit from `ATTRIBUTION.json`. No expert name, price or avatar. The pills sit under the two buttons; a wrapped pill stays aligned with its row.
- **Painted #111827:** 0 at 1440 and 0 at 390. No hex literal was added to the landing components.

**Coming up in our cities.** The table ships empty, so the strip is absent on both builds. These
captures used three local fixture rows (inserted for the capture, then deleted) to show what it
looks like at the threshold. The Medellín card has no fallback photo, so it has no image box.

| | 1440 | 390 |
|---|---|---|
| Landing strip | <img src="footer-pages-after/landing-reorder/events-strip.desktop.jpg" width="420"> | <img src="footer-pages-after/landing-reorder/events-strip.mobile.jpg" width="150"> |
| `/events` "Coming up" | <img src="footer-pages-after/landing-reorder/events-page-coming-up.desktop.jpg" width="420"> | <img src="footer-pages-after/landing-reorder/events-page-coming-up.mobile.jpg" width="150"> |

## Billboard slot types (ledger `2026-09-28-billboard-slot-types`)

One frame, three slots, real or curated. Production build of this branch, signed out. The **real** row
serves a fixture dispatch to `GET /api/landing/billboard-experts` through Playwright: expert `@aiko`,
gem score 87, listing $145, none with its own photo, so each keeps its market's credited photo and says
so. The **curated** row is the local database as it is, where no expert passes the byline gate.

| | 1440 | 390 |
|---|---|---|
| Real (fixture): LOCAL EXPERT · KYOTO / HIDDEN GEM / BOOK ON TRAVELOURE | <img src="footer-pages-after/billboard-slot-types/real.desktop.jpg" width="420"> | <img src="footer-pages-after/billboard-slot-types/real.mobile.jpg" width="150"> |
| Curated fallback | <img src="footer-pages-after/billboard-slot-types/curated.desktop.jpg" width="420"> | <img src="footer-pages-after/billboard-slot-types/curated.mobile.jpg" width="150"> |

- **Real expert:** "Plan with @aiko · $120" (price from the storefront's own derivation) and "View listing". No badge.
- **Real gem:** score 87 top right; "Plan around this gem".
- **Real listing:** $145 top right; "Book now" to `/services/:id`.
- **Curated:** "Start this plan" only. No handle, price, score or second action.
- **At 390 px** the representative label wraps short of a top-right badge. Before this change they collided.
- **Hex:** `client/src/components/landing` holds none, and `check-page-hex` now enforces that.
