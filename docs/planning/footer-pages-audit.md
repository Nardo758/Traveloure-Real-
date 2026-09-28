# Footer-page consistency audit

- **As of:** `main` at `b0462730d`, with #1142 (`fix/landing-hero-copy` at `a20f27ae2`) merged on top, built locally as commit `c9eb5c9`. The audit is read-only; nothing in `client/` or `server/` changed.
- **Method:**
  - Each footer destination was loaded by a signed-out visitor at 1440×900 (desktop) and 390×844 (mobile), in Chromium through Playwright.
  - Computed styles were read from the DOM: header and footer presence, `max-width`, background, H1 face/size/weight/colour, every text/background/border colour matched against the `--earn-*` tokens, gradients, button fill/border/radius/height, active nav item, horizontal overflow, and money zeros.
  - For the two pages that fetch prices, `/api/pricing` was delayed 4 s to capture the loading state.
- **Screenshots:** full-page JPEGs in [`footer-pages-audit/`](footer-pages-audit/), named `<page>.<desktop|mobile>.jpg`.
- **Reference:** the landing page (`client/src/pages/landing.tsx` inside `Layout`), measured in the same run:

  | Reference element | Measured value |
  |---|---|
  | Header | shared `Layout` nav |
  | Footer | shared `Layout` footer, white card on ground |
  | Content width | 1180 px |
  | H1 | Fraunces 54/600, `--earn-navy` #1E3A5F (40 px on mobile) |
  | Eyebrows | Geist Mono caps |
  | Body | Inter |
  | Primary button | `--earn-coral-ink` #E85D55 filled, radius 10 px, height 47 px |
  | Secondary button | white with a `--earn-border` #E7E4DD outline, radius 10 px, height 47 px |

  The slip is signed-in only and could not be loaded as a guest. Its grammar is the one LD 45 (7) ratified: coral `#E85D55`, the earn tokens, Fraunces headings, Geist Mono eyebrows.
- **Status key:**

  | Status | Meaning |
  |---|---|
  | PASS | Meets the check. |
  | FAIL | Deviates from the check. |
  | RULE | Consistent with something already in the code, but it conflicts with the check. It needs your call before the fix PR, and the global rulings G1–G5 below say which. |
  | N/A | The check does not apply to that page. |

## Global findings (they cause most per-page FAILs)

| # | Finding | Evidence | Responsible file | Needs |
|---|---|---|---|---|
| **G1** | **Two reds on the public site.** The landing hero, the header "Sign In" and the company-page accents use `--earn-coral-ink` #E85D55. Every shadcn `<Button>` with the default variant resolves `bg-primary` to `--primary: 350 100% 61%` = **#FF385C** (it renders as #FF3859). This happens on `/about` (my own Lane B button), `/how-it-works`, `/contact`, `/visa-help` and `/destinations`. `/experts` adds a third red, #FB3B63. | `client/src/index.css:11` (public `--primary` #FF385C). `:95-112` puts #E85D55 only inside `.console-scope`, with a comment saying the public site keeps #FF385C "by design". | `client/src/index.css` | **Ruling.** The comment says "two palettes by design", but your check says coral primary everywhere. Recommended: public `--primary` = #E85D55. |
| **G2** | **Body ground is not the token.** `body` paints `--background` = **#F9FAFB** (cool grey-50). The token is `--earn-ground` #FAFAF8. Pages that paint no ground of their own show #F9FAFB: `/visa-help`, `/privacy`, `/terms`, the band behind `/how-it-works`, and the lower half of `/contact`. | Every page: `bodyBg=#F9FAFB`. | `client/src/index.css` (`--background`) | Fix (tokens only). |
| **G3** | **The header only highlights top-level links.** `aria-current` is set by `isActive={item.href === location}` on single links (Pricing, Ways to Earn). A page that sits under a dropdown (Marketplace → Destinations, Experts → Local Experts / Service Providers, Tools → Visa Help) highlights nothing. | `client/src/components/layout.tsx:733`. | `client/src/components/layout.tsx` | Fix. |
| **G4** | **No shared content width.** `Layout` sets no `max-width`, so each page picks its own: landing 1180, pricing/experts/providers/contact 1152, how-it-works/experiences 1280, earn 1024, company and help pages 768, privacy/terms none. | The `maxw` column in every row below. | Each page | **Ruling:** one width, or a prose width (768) plus a wide width (1180)? |
| **G5** | **Three H1 scales in use.** Landing hero Fraunces 54/600. Company and help pages Fraunces 42/600 (34 mobile). Directory mastheads (`/destinations`, `/experts`, `/providers`) Fraunces 26/600 (24 mobile). Plus the Inter H1s listed per page. | Per-page rows. | `company-page.tsx`, `browse` mastheads, each page | **Ruling:** is a smaller page-H1 scale allowed beside the hero scale? |

Two more findings that are not chrome:
- **Two contact addresses.** `/contact` gives **hello@traveloure.com** (`client/src/pages/contact.tsx:47`), while `/help` and `/about` give **Admin@traveloure.com** (`client/src/lib/company-facts.ts:18`). One of them is wrong. **This needs your ruling.**
- **Guests see the signed-in sidebar on `/experiences`.** The page wraps itself in `DashboardLayout`, so a visitor who is not signed in gets the console sidebar (My Plans, Bookings, Inbox, Profile, Logout) instead of the public header and footer (`client/src/pages/experiences.tsx:92`).

## Per page

The columns are the seven checks: **1** chrome, **2** type, **3** colour, **4** buttons and links, **5** nav, **6** mobile, **7** empty and loading states.

| Page | 1 Chrome | 2 Type | 3 Colour | 4 Buttons / links | 5 Nav | 6 Mobile | 7 Empty / loading | Screenshots | Responsible file |
|---|---|---|---|---|---|---|---|---|---|
| `/experiences` | **FAIL**: console `DashboardLayout` (sidebar, Login/Sign Up bar), no public header/footer; width 1280 | **FAIL**: H1 Inter 48/700 #1B1B18; no mono eyebrows | **FAIL**: console palette #1B1B18/#797972/#E9E9E2; icon tints #FF385C and #EC4899; gradient hero | **FAIL**: #E85C54 r6 h38–40; secondary outlined #1B1B18 | **FAIL**: no public header, so "Experiences" can't highlight | PASS: no overflow | PASS: no zeros | [d](footer-pages-audit/experiences.desktop.jpg) · [m](footer-pages-audit/experiences.mobile.jpg) | `client/src/pages/experiences.tsx`; route `App.tsx:586` |
| `/destinations` | PASS: shared header/footer (guest, via `BrowseShell`); width 1152 (G4) | RULE: masthead H1 Fraunces 26 (G5); mono eyebrows yes | **FAIL**: #FF3859 (G1); greys #111827/#6B7280/#E5E7EB; photo scrim gradients | **FAIL**: "Start a plan" #FF3859 r6 h38; "Take me Here" #FF3859 tint | **FAIL**: under Marketplace, nothing highlighted (G3) | PASS: chips wrap, no overflow (the city photo failed to load and shows alt text) | **FAIL**: city cards show "0 trending", "0 gems" | [d](footer-pages-audit/destinations.desktop.jpg) · [m](footer-pages-audit/destinations.mobile.jpg) | `client/src/pages/discover.tsx` (surface `travelpulse`); `client/src/components/browse-shell.tsx` |
| `/how-it-works` | PASS: shared chrome; width 1280 (G4); band on #F9FAFB (G2) | **FAIL**: H1 Inter 48/700 #111827; no mono | **FAIL**: #FF3859; blue icon tile (second accent); orange→pink gradient hero; greys | **FAIL**: "Get Started" #FF3859 r6 h40; "Create Your First Trip" grey #6B7280 filled | N/A: not in the header | PASS | N/A | [d](footer-pages-audit/how-it-works.desktop.jpg) · [m](footer-pages-audit/how-it-works.mobile.jpg) | `client/src/pages/how-it-works.tsx` |
| `/pricing` | PASS: shared chrome; width 1152 (G4); ground token | RULE: H1 Fraunces 30/600 (G5); mono eyebrows yes | **FAIL** (minor): #111827 text ×5, #F0DCA6 border; photo scrims | **FAIL** (minor): coral r9 h40, outline #E7E4DD r9 h42 (landing r10 h47); Pro button teal-filled | PASS: "Pricing" highlighted | PASS: no overflow, no table | **FAIL**: while `/api/pricing` loads, `<main>` is **empty**, then jumps to 1554 px (desktop) / 3435 px (mobile). No $0 while loading. "$0 / month during beta" on Pro is a real price, not an empty state. | [d](footer-pages-audit/pricing.desktop.jpg) · [m](footer-pages-audit/pricing.mobile.jpg) · loading [d](footer-pages-audit/pricing-loading.desktop.jpg) · [m](footer-pages-audit/pricing-loading.mobile.jpg) | `client/src/pages/pricing.tsx` |
| `/experts` | PASS: shared chrome (guest); width 1152 | RULE: masthead Fraunces 26 (G5); mono yes | **FAIL**: #FB3B63 (third red); blue link #185FA5; greys #111827/#667085/#344054/#E4E7EC | **FAIL**: "View profile" #FB3B63 r6 h28; "Message" outline #D0D5DD r6 h28 | **FAIL**: under Experts, nothing highlighted (G3) | **FAIL** (minor): mobile filter row, the "Recommended" select runs past the card edge | **FAIL**: platform "Destination Concierge" card reads **"from $0"** | [d](footer-pages-audit/experts.desktop.jpg) · [m](footer-pages-audit/experts.mobile.jpg) | `client/src/pages/experts.tsx` |
| `/providers` | PASS: shared chrome; width 1152 | RULE: masthead Fraunces 26 (G5); mono yes | **FAIL** (minor): #111827 text/border | **FAIL**: "Start a plan" outline #111827 r6 h38; "View storefront" coral r6 h42 | **FAIL**: under Experts → Service Providers, nothing highlighted (G3) | PASS | PASS | [d](footer-pages-audit/providers.desktop.jpg) · [m](footer-pages-audit/providers.mobile.jpg) | `client/src/pages/providers-directory.tsx` |
| `/earn?role=local_expert` | PASS: shared chrome; width 1024 (G4); chip-grey band | **FAIL**: H1 Inter 26/600 navy; no mono eyebrows | **FAIL**: green #0F6E56 text ×21 (not a token; nearest `--earn-green-ink` #2F7D63) | PASS: track cards r12, token borders | PASS desktop (card selected, in view at 275 px); **FAIL mobile**: card selected but 4th in the list at 900 px, page not scrolled to it | PASS | N/A | [d](footer-pages-audit/earn-local_expert.desktop.jpg) · [m](footer-pages-audit/earn-local_expert.mobile.jpg) | `client/src/pages/earn.tsx` |
| `/earn?role=trip_planner` | as above | **FAIL** (as above) | **FAIL**: #0F6E56 ×34 | PASS | PASS desktop; **FAIL mobile**: 3rd card, only partly in view, not scrolled | PASS | N/A | [d](footer-pages-audit/earn-trip_planner.desktop.jpg) · [m](footer-pages-audit/earn-trip_planner.mobile.jpg) | `client/src/pages/earn.tsx` |
| `/earn?role=event_planner` | as above | **FAIL** | **FAIL**: #0F6E56 ×47 | PASS | PASS: 2nd card, in view on both | PASS | N/A | [d](footer-pages-audit/earn-event_planner.desktop.jpg) · [m](footer-pages-audit/earn-event_planner.mobile.jpg) | `client/src/pages/earn.tsx` |
| `/earn?role=service_provider` | as above | **FAIL** | **FAIL**: #0F6E56 ×64 | PASS | PASS: 1st card | PASS | N/A | [d](footer-pages-audit/earn-service_provider.desktop.jpg) · [m](footer-pages-audit/earn-service_provider.mobile.jpg) | `client/src/pages/earn.tsx` |
| `/about` | PASS: shared chrome; 768 reading column (G4) | RULE: H1 Fraunces 42 (G5); mono eyebrow yes | **FAIL**: "Start a plan" #FF3859 (G1) | **FAIL**: that button is shadcn default r6 h38; body links ink #1F2733, not navy | N/A | PASS | N/A | [d](footer-pages-audit/about.desktop.jpg) · [m](footer-pages-audit/about.mobile.jpg) | `client/src/pages/about.tsx`, `client/src/components/company/company-page.tsx` |
| `/press` | PASS | RULE (G5) | PASS | **FAIL** (minor): links ink #1F2733, not navy | N/A | PASS | N/A | [d](footer-pages-audit/press.desktop.jpg) · [m](footer-pages-audit/press.mobile.jpg) | `client/src/pages/press.tsx` |
| `/careers` | PASS | RULE (G5) | PASS | **FAIL** (minor): links ink #1F2733 | N/A | PASS | N/A | [d](footer-pages-audit/careers.desktop.jpg) · [m](footer-pages-audit/careers.mobile.jpg) | `client/src/pages/careers.tsx` |
| `/help` | PASS | RULE (G5); mono eyebrow yes | **FAIL** (minor): list and search borders #E5E7EB (shadcn `border`, not `--earn-border`) | **FAIL** (minor): article links #111827 | N/A | PASS | N/A | [d](footer-pages-audit/help.desktop.jpg) · [m](footer-pages-audit/help.mobile.jpg) | `client/src/pages/help.tsx` |
| `/help/:slug` (`how-planning-works`) | PASS | RULE (G5) | **FAIL** (minor): links #111827 | **FAIL** (minor): links #111827 / #1F2733, not navy | PASS: "← All help articles" back link | PASS: no tables in any article | **FAIL** (minor): the pricing article loads with its price sentences omitted and "Current prices are on the Pricing page" (no $0), then grows 844→1008 px on mobile when prices arrive | [d](footer-pages-audit/help-article.desktop.jpg) · [m](footer-pages-audit/help-article.mobile.jpg) · loading [d](footer-pages-audit/help-article-loading.desktop.jpg) · [m](footer-pages-audit/help-article-loading.mobile.jpg) | `client/src/pages/help.tsx` |
| `/faq` | PASS: redirects to the `/help` index, not a blank | as `/help` | as `/help` | as `/help` | PASS | PASS | N/A | [d](footer-pages-audit/faq-redirect.desktop.jpg) · [m](footer-pages-audit/faq-redirect.mobile.jpg) | `client/src/App.tsx:553` |
| `/contact` | **FAIL**: shared chrome, but a dark #111827→#1F2937 gradient hero band; ground #F3F4F6 (G2) | **FAIL**: H1 Inter 48/700 white | **FAIL**: dark gradient; #FF3859; greys | **FAIL**: "Send Message" #FF3859 r6 h48 | N/A | PASS | N/A | [d](footer-pages-audit/contact.desktop.jpg) · [m](footer-pages-audit/contact.mobile.jpg) | `client/src/pages/contact.tsx` |
| `/visa-help` | **FAIL**: shared chrome, but ground #F9FAFB / white on mobile (G2) | **FAIL**: H1 Inter 36/700 #111827 | **FAIL**: pink→orange→blue gradient hero; #FF3859; greys | **FAIL**: #FF3859 r6 h38; outline #111827 | **FAIL**: under Tools, nothing highlighted (G3) | PASS | N/A | [d](footer-pages-audit/visa-help.desktop.jpg) · [m](footer-pages-audit/visa-help.mobile.jpg) | `client/src/pages/visa-help.tsx` |
| `/privacy` | **FAIL**: no shared header or footer; own white "Back to Home" bar; ground #F9FAFB | **FAIL**: H1 Inter 36/700 #111827 | **FAIL**: greys #6B7280/#111827 throughout | **FAIL**: outline #111827 r6 h38 | N/A | PASS | N/A | [d](footer-pages-audit/privacy.desktop.jpg) · [m](footer-pages-audit/privacy.mobile.jpg) | `client/src/pages/privacy.tsx`; route `App.tsx:577` (no `Layout`) |
| `/terms` | **FAIL**: as `/privacy` | **FAIL**: as `/privacy` | **FAIL**: as `/privacy` | **FAIL**: as `/privacy` | N/A | PASS | N/A (its "$0.30" is Stripe's fee, not a zero) | [d](footer-pages-audit/terms.desktop.jpg) · [m](footer-pages-audit/terms.mobile.jpg) | `client/src/pages/terms.tsx`; route `App.tsx:580` (no `Layout`) |

**Footer columns on mobile:** PASS on every page that renders the shared footer. They stack as Plan → Locals → Company → Support, the ruled order from ledger `2026-09-27-footer-ia`.

**The reference page itself has deviations**, which the fix should not copy: #111827 text ×9, a `#3C4652` text, and photo-scrim gradients (`rgba(0,0,0,.55)`).

## What the fix PR would do (subject to your ruling)

1. Put `/experiences`, `/privacy` and `/terms` inside the public `Layout`. Signed-in visitors would get `BrowseShell`, the one shell chooser; the choice between the two is yours.
2. Move the other footer pages onto the shared page layout the company pages introduced (`company-page.tsx`), widened per G4.
3. Replace hardcoded hexes and the shadcn defaults with `--earn-*` tokens: #111827/#6B7280/#E5E7EB/#FF3859/#FB3B63/#0F6E56/#1B1B18 and the gradients.
4. Fix G3 so a dropdown item highlights its parent group.
5. Scroll `/earn?role=` to the selected track.
6. Fix three data defects:
   - Reserve space on `/pricing` while it loads, instead of an empty `<main>`.
   - Omit "0 trending" and "0 gems" rather than print them.
   - Omit "from $0" rather than print it.
7. Add a Playwright check that every footer destination renders the shared header (`nav [data-testid=link-logo]`) and the shared footer (`footer [data-testid=text-footer-locale]`).

**Rulings needed before I build:**
- **G1:** public primary #E85D55, or keep #FF385C?
- **G4:** one width, or prose + wide?
- **G5:** is a smaller page-H1 scale allowed?
- **Contact address:** which is right, hello@ or Admin@?
- **`/experiences`:** should signed-in visitors keep the console shell (`BrowseShell`)?
