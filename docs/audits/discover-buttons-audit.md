# Discover-Surface Action-Button Audit

**Scope:** Every action button / clickable CTA on the Discover surface — what it does, where it leads, and whether that destination exists. Read-only; no application code touched.

**Method:** Full read of all 7 Discover-surface files (~6,300 lines). Every button's `onClick` / `Link` / prop-callback traced to a concrete destination, then each destination verified against the client route table (`client/src/App.tsx`, ~180 routes) and the mounted server endpoints (`server/`). "Missing" = the string-literal route/endpoint the button targets has **no** matching `<Route>` or `app.*`/`router.*` registration.

**Surfaces covered:**
| File | Route(s) | Role |
|---|---|---|
| `client/src/pages/discover.tsx` | `/discover` | Main Discover page (the one flagged) |
| `client/src/pages/discover-location.tsx` | `/discover/location/:city`, `/city/:slug` | Per-city feed |
| `client/src/components/city-feed-card.tsx` | (rendered in feed) | Gem / Event / Supply / VendorService cards |
| `client/src/components/city-feed-card-expert.tsx` | (rendered in feed) | Expert card |
| `client/src/components/city-feed-card-recommendation.tsx` | (rendered in feed) | Recommendation card |
| `client/src/pages/spontaneous-discovery.tsx` | `/spontaneous` | Last-minute opportunities |
| `client/src/pages/experience-discovery.tsx` | `/discover-experiences` | Experience search |

---

## TL;DR — the expected model vs. reality

You expect Discover to offer **Book / Ask-Expert / Add-to-Cart**, with separate buttons to **Apply-to-Earn**. Here's how each surface actually scores:

| Surface | Book | Ask-Expert | Add-to-Cart | Apply-to-Earn |
|---|---|---|---|---|
| **`/discover` (main)** | ✗ none reachable¹ | ⚠ partial² | ✅ works | ✗ unreachable³ |
| **`/discover/location/:city`** | ⚠ works, 3 broken paths⁴ | ✅ (non-contextual)⁵ | ✅ works | ✅ works |
| **`/spontaneous`** | ✅ works | ✗ absent | ✗ absent | ✗ absent |
| **`/discover-experiences`** | ⚠ external-only | ✗ absent | ✗ absent (→ wizard) | ✗ absent |

¹ The only Book/purchase CTA lives in an **unreachable tab** and points at a **missing route**.
² "Talk to an Expert"→`/experts` works; **"Connect"→`/expert/:id` is a missing route (broken)**; "AI Suggestions" works.
³ "Become an expert" / "Create your first template" sit in the hidden `packages` tab (`VISIBLE_TABS` excludes it).
⁴ Gem "Book"→`#`, supply "Book" silent no-op, matched-supply "request"→404 (all detailed below).
⁵ "💬 Ask" always goes to the static `/local-experts` directory — no context about the item/expert is passed.

**Headline:** the main `/discover` page — the one you named — is the weakest. It has a working **Add-to-Cart** but **no reachable Book**, a **broken Ask-Expert ("Connect")**, and **no reachable Apply-to-Earn** (both earn CTAs are buried in a hidden tab).

---

## A. BROKEN destinations (button points at something that does not exist)

These are the "missing" cases — the button renders and fires, but the target route/endpoint isn't registered, so it 404s / dead-ends.

| # | Button | File:line | Targets | Why it's broken | Fix |
|---|---|---|---|---|---|
| **B1** | **"Connect"** (matched-expert, Ask-Expert) | discover.tsx:1164 | `setLocation("/expert/${expert.id}?…")` → `/expert/:id` | **No `/expert/:id` route.** Router has `/experts/:id` (plural) and the `/expert/*` console pages, but nothing matches `/expert/<uuid>` → NotFound. | Change literal to `/experts/${expert.id}` (the plural route exists and is the expert profile page). One-char-family typo. |
| **B2** | **"View & Purchase"** (template) | discover.tsx:1700 | `<Link href="/expert-templates/${template.id}">` → `/expert-templates/:id` | **No `/expert-templates/:id` route** (only `/admin/expert-templates` and `/expert/templates`). Also inside the unreachable `packages` tab (see C1). | Add the route + a template detail/purchase page, or repoint to the real template view. Decide alongside C1. |
| **B3** | **"request"** action (matched-supply variant) | city-feed-card.tsx:131 | `fetch("POST /api/services/request", …)` | **Endpoint exists nowhere in `server/`** (0 registrations). Button posts → 404, caught and toasted as failure. | Implement the endpoint, or remove/repoint the request action. |
| **B4** | **"Book / Reserve"** (gem card) | city-feed-card.tsx:651–668 | anchor `href={suggestion?.href ?? "#"}`; `suggestion` from `GET /api/gems/:id/matched-service` | **That endpoint exists nowhere in `server/`** → query never resolves → `suggestion` stays null → the visible Book/Reserve button navigates to **`"#"`** (scroll-to-top no-op). The affiliate-track `fetch` still fires, so it *looks* tracked. | Implement `GET /api/gems/:id/matched-service`, or hide the Book button when `suggestion` is absent (don't render a live-looking dead CTA). |

**Verified-good (not broken), for contrast:** `POST /api/affiliates/track` → **exists** at `server/routes/content.routes.ts:7263`, router mounted at `server/routes.ts:479`. All four affiliate-track call sites are fine. `POST /api/discover/recommendations` (AI Suggestions) → exists at `server/routes.ts:5416`. `POST /api/cart` (Add to Cart) → exists at `server/routes.ts:6895`. `POST /api/spontaneous/:id/book` → exists at `server/routes.ts:12942`.

---

## B. DEAD / no-op buttons (renders, but the handler does nothing)

No server dependency — these are inert at the client level.

| # | Button | File:line | Problem |
|---|---|---|---|
| **D1** | "View All N Templates" | discover.tsx:1715 | `<Button>` with **no `onClick`** and no `<Link>` wrapper. Pure no-op. (Also in the unreachable `packages` tab.) |
| **D2** | "View All Creators" | discover.tsx:2027 | `<Button>` with **no `onClick`**. Pure no-op. (In the unreachable `articles` tab.) |
| **D3** | "Add to {month} {day}" | discover-location.tsx:996–1003 | `<Button>` in `DateHighlightStrip` with **no `onClick` / no `asChild` / no `href`**. Completely inert. Its sibling "Tickets" button works — so this looks live but does nothing. |
| **D4** | Result `<Card>` whole-card click | experience-discovery.tsx:377–380 | Styled `cursor-pointer group hover-elevate` (with hover-scale image) but **no `onClick` / no wrapping `Link`**. Misleading affordance — only the inner "Plan Trip" and external-book buttons act. |
| **D5** | "Book" (supply card) | city-feed-card.tsx:1220–1235 | `bookUrl = item.bookingLink \|\| item.externalUrl \|\| item.url`; `window.open` guarded by `if (bookUrl)`. When all three are absent the button **silently does nothing** (only tracking fires) — yet the card always shows `BookingBadge level="native"` implying it's bookable. No user feedback. |

---

## C. STRUCTURAL — reachability & context problems (not per-button bugs, but why buttons "aren't there")

| # | Finding | Detail |
|---|---|---|
| **C1** | **`/discover` `packages` + `articles` tabs are unreachable** | `VISIBLE_TABS = {"travelpulse","events","services"}` (discover.tsx:637); there are **no `TabsTrigger`s** for `packages`/`articles` (hidden in "Phase 1a" per code comments), and the URL sanitizer blocks forcing `activeTab` to them. Everything in those two `TabsContent` blocks is dead-in-practice — **including the only Book/purchase CTA (B2) and the only Apply-to-Earn CTAs** ("Become an expert" → `/expert-status`, "Create your first template" → `/expert/templates`, both of which are *valid routes*, just unreachable). The `articles` tab also renders nothing because `influencerContent` is a hardcoded empty array (discover.tsx:913). |
| **C2** | **Main `/discover` Services tab has no Book action** | Live service cards offer only **Add to Cart** (→ `POST /api/cart`) and a title link to `/services/:id`. There is no "Book now" path from the card. If Book is expected here, it needs to be added (or Book is intentionally cart-mediated — confirm the intended model). |
| **C3** | **"💬 Ask" is non-contextual everywhere** | All Ask buttons on feed cards (gem/event/supply/recommendation) are `<a href="/local-experts">` — they navigate to the **static experts directory** with no gem/event/service/city context passed. Functionally a NAVIGATE, not "ask about *this* item." Likely not the intended Ask-Expert UX. |
| **C4** | **Feed cards full-page-reload instead of SPA nav** | `CityFeedCardExpert` (line 74→`/local-experts/:id`) and `CityFeedCardVendorService` "Inquire" (line 1035→`/services/:id`) use `window.location.href` rather than wouter — a hard reload on every click. Cosmetic/perf, not broken. |
| **C5** | **Orphaned comparison flow in discover.tsx** | `createComparison` (835–876) + `POST /api/itinerary-comparisons` + nav to `/itinerary-comparison/:id` are fully defined but **no rendered button calls them** — dead code. |

---

## D. What works (so the fixes don't regress it)

- **Add-to-Cart** on `/discover` (ServiceCard, discover.tsx:460): `POST /api/cart` with guest-localStorage fallback — *this is the cart-race path fixed in PR #138.* ✅
- **`/discover/location/:city`** is the most complete surface: Book (recommendation "Book" → `/discover?categoryKey=…`, "Tickets" → `/experiences/events`, companion "Book", affiliate add-ons), Add ("Add"/"Add to {date}" → `AddToExperienceDialog`), Ask (→ `/local-experts`), and **two working Apply-to-Earn CTAs** ("Apply" and "Start earning in {city}" → `/become-expert?city=…`). ✅ (subject to B3/B4/D3 on individual cards)
- **`/spontaneous`** Book: affiliate-URL open or `POST /api/spontaneous/:id/book`. ✅
- **AI Suggestions** (discover.tsx:981) → `POST /api/discover/recommendations`. ✅
- All `POST /api/affiliates/track` call sites resolve. ✅

---

## E. Recommended fix order (for a follow-up work item — not done here)

1. **B1 (`/expert/:id`→`/experts/:id`)** — trivial, high-impact: it's the primary "Connect to expert" CTA on the main page and it's a plural/singular typo.
2. **C1 decision** — decide whether `packages`/`articles` tabs come back. This gates whether the main page gets a reachable **Book** and **Apply-to-Earn**. If they stay hidden, the earn CTAs need a home on a *visible* tab (they're the "apply to earn money" buttons you asked about, and they currently can't be reached from `/discover`).
3. **B4 / B3 (`matched-service`, `services/request`)** — implement or remove; today they render live-looking Book/request buttons that dead-end.
4. **D1–D4** — wire or remove the four inert buttons.
5. **C2 / C3** — product decisions: does `/discover` need a card-level Book, and should "Ask" carry item context?

---

## Appendix — full string-literal reference index (for regression checking)

**Client routes referenced by Discover buttons** (✅ exists / ❌ missing, verified against App.tsx):
`/services/:id` ✅ · `/experiences` ✅ · `/experiences/:slug` ✅ (covers `/experiences/events`, `/experiences/photo`, `/experiences/gear`) · `/experiences/:slug/new` ✅ · `/experts` ✅ · `/experts/:id` ✅ · `/local-experts` ✅ · `/local-experts/:id` ✅ · `/expert-status` ✅ · `/expert/templates` ✅ · `/become-expert` ✅ · `/discover` ✅ · **`/expert/:id` ❌ (B1)** · **`/expert-templates/:id` ❌ (B2)**

**Server endpoints referenced** (✅ exists / ❌ missing, verified against `server/`):
`POST /api/cart` ✅ · `POST /api/discover/recommendations` ✅ · `POST /api/affiliates/track` ✅ · `POST /api/spontaneous/:id/book` ✅ · `POST /api/feed/impression` (not verified here — not a button) · **`POST /api/services/request` ❌ (B3)** · **`GET /api/gems/:id/matched-service` ❌ (B4)**

---

*Read-only audit. No fixes applied. B1 (the `/expert/:id`→`/experts/:id` typo) is the cheapest, highest-value fix and can be done independently; the rest are grouped for a follow-up work item pending the C1 tab-reachability decision.*
