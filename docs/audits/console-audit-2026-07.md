# Console Audit — All 5 consoles + Trip Plan card (Jul 2026)

Method: adversarial code audit of every page in each console + design-token/aesthetic pass, cross-checked against a locally-booted app with real login + rendered screenshots (traveler full; other consoles partial — `networkidle` timed out on polling-heavy dashboards). Scope: Traveler (signed-in), Expert (27), Provider (12), EA (14), Admin (36) + `components/plancard/*`.

**Headline:** the *transactional cores* (checkout/escrow/bookings/earnings, admin money & approval pages, the server-sourced PlanCard path) are genuinely wired and honest. The rot is **cross-cutting and repeats per console** in the same shapes below — which is why it batches.

Severity of the whole: the single biggest theme is **§13 fabricated data rendered as real on live surfaces**, present in *every* console.

---

## BATCH A — §13 Fabricated data on live surfaces (dominant, most damaging)

| Console | Surface | What's faked |
|---|---|---|
| Traveler | `credits-billing.tsx` | balance `150`, "This Month 50", "Bonus 20", transaction list, saved cards (Visa •4242/MC •8888), invoices, billing address ("John Doe…"). Contradicts real balance (dashboard top card = "0 credits"). |
| Traveler | `discover.tsx:210-239` | `getProviderName()`/`getProviderAvatar()` invent seller names + stock avatars on real listings. |
| Provider | `dashboard.tsx` | "My Services" panel, "Upcoming 5 Days", "Expert Partners (12·$2,450·28%)", "3 bookings today", "72%" earnings bar, TravelPulse ticker, "94%". |
| Provider | `performance.tsx` / `analytics.tsx` | every "+12% vs last month" delta; `$280`/`$450` benchmark fallbacks; "Completion Rate 94%" literal. |
| Expert | `client-detail.tsx:56-85` | **100% mock** — `mockClient` "Yuki Matsuda", param `id` never used → every client opens the same fake person. |
| Expert | `contract-categories.tsx` | static array drives Total Contracts/Revenue/Avg-Rating cards + literal "4.9". |
| Expert | `content-studio.tsx` | `mockContent` grid + fake view/like sum stat cards (Knowledge Nuggets half is real). |
| Expert | `analytics.tsx:220` | hardcoded `earned:true` achievement badges ("4.9+ rating 6 months"). |
| EA | `reports.tsx` | **100% fabricated** analytics (24 events, 9.3/10 quality, +12% trends…). |
| EA | `events`/`gifts`/`communications` | fabricated stat cards ("28 Active Events", "$18.5k YTD", "24 Emails") crowning real *empty* lists. |
| EA | `profile.tsx` / `ai-assistant.tsx` | hardcoded "2FA **Enabled**" (false security claim) / "GPT-4 Active". |
| Admin | `system.tsx:230-278` | fabricated Security/Backup: "2FA Enabled", "SSL expires in 245 days", "Last audit Dec 15", "Last backup Today 3AM". **Dangerous — admins act on this.** |
| Trip card | `trip-details.tsx:30-58` → PlanCard | `synthesizeTransportLegs()` invents 15-min/~1km walking legs + `$8/$2/$6` alts, fed as **real** into headline "Transit legs/time" + per-leg "15 min" + a false "✓ Book on Traveloure" badge. Same component is honest on the dashboard (server path). |
| Trip card | `plancard-types.tsx:151` | "Energy" day badge (Relaxed/Balanced/Intense) invented from `activities.length`. |

**Fix approach (per item, decision needed):** either **(a) wire to the real endpoint** (bigger — needed where the data should exist, e.g. credits balance, EA reports) or **(b) derive from already-fetched data** (small — EA stat cards, provider deltas) or **(c) delete the fabricated card / gate "coming soon"** (smallest — system.tsx security, content-studio content tab). Trip card A1: stop synthesized legs reaching PlanCard as real (exclude from headline stats + booking badge).

---

## BATCH B — Dead / no-op action buttons (every console)

- **Traveler:** contract-view **Sign Contract**/Print/Download (traveler can't sign!); my-trips "Show All"; credits 7 buttons; trip-details "Add a Booking".
- **Provider:** dashboard Quick Actions (4) + panel CTAs; calendar **Save Schedule**; all of `resources.tsx`; `profile.tsx` 7 edit buttons; bookings View/Message; earnings Download.
- **Expert:** contract-categories 3 buttons; services "Browse templates" → redirects to blank create form.
- **EA:** 10 of 14 pages; **ai-assistant Approve/Reject** (the page's whole purpose); communications **Send** (endpoint exists!); travel/venues create (endpoints exist!).
- **Admin:** system Refresh/Logs/Audit/Backup/Restore; analytics Export Data/Custom Report; tourism Export; revenue "Process Payouts" (next to working CSV/PDF exports).
- **Trip card:** "Export" is a mislabeled `<Link>` (navigates, doesn't export).

**Fix approach:** two sub-batches — **B-wire** (buttons whose endpoint already exists: EA ai-assistant/communications/travel/venues, provider Quick-Actions→routes) and **B-remove** (decorative buttons with no backend intent: resources, system backup/restore, duplicate "Process Payouts").

---

## BATCH C — Fee/commission literals in UI (§8 violations)

| Console | Location | Literal |
|---|---|---|
| Provider | `resources.tsx:86` | "We charge a **10% service fee**" (contradicts config-resolved rate) |
| Provider | `earnings.tsx:134/142` | `0.30` fallback split rendered as "70%/30%" at $0 |
| Expert | `booking-partners.tsx:321` | "Platform **30%** · You **70%**" (real split is config 75/25) |
| Admin | `services.tsx:217` | `0.75` fallback × `services[0].rate` applied to whole platform total (wrong number) |
| Traveler | `contract-view.tsx:256` | "Platform Fee (**20%**)" label |

**Fix approach:** resolve each from fee config (server-provided) or drop the literal label. Admin services.tsx also needs the server to return `platformRevenue` (config-resolved), not a client-derived guess.

---

## BATCH D — Brand-red fragmentation + token bypass (aesthetic, whole-app)

The design system (`--primary #FF385C`, warm `--earn-*` incl. `#E85D55`, and the `console.*` Tailwind scale) exists but is **bypassed everywhere** — pages hardcode hex equivalents.

- **Multiple reds in play:** `#FF385C` (page bodies), `#E85D55` (shells: expert/provider/EA/admin sidebars + `--earn-coral-ink`), `#E23350` + `#e03354` (EA hovers). EA alone uses **four**. The console shell red and the page-body red differ on every screen.
- **Token bypass volume (raw hex / `text-gray-*` instead of tokens):** traveler profile 35 / credits 35 / my-trips 30 / cart 26; expert service-wizard 54+19, workspace 142 inline; EA reports 28 / executives 24; provider ~30×; admin pages use `#FF385C`/`primary` instead of admin coral `#E85D55`.
- **Consequence:** dark mode is half-broken (hardcoded light hex doesn't invert) on the hex-heavy pages + the PlanCard summary/dialogs.

**Fix approach (one systematic pass):** (1) pick one brand red, expose as `--primary`, replace `bg-[#FF385C]`/`hover:bg-[#E23350]`/inline-style reds → `bg-primary`/`hover:bg-primary/90`, and the shells' `#E85D55` → the token (or formally scope `#E85D55` to `earn-*`/admin only); (2) sweep `text-[#111827]`→`text-foreground`, `text-[#6B7280]`/`text-gray-*`→`text-muted-foreground`, `border-[#E5E7EB]`→`border-border` (this also fixes most dark-mode breakage for free). Highest-ROI single change: Batch D-red.

---

## BATCH E — Shell / layout wrapper bugs

- **Traveler:** three shells for "one" console — dashboard/profile on console sidebar, but **discover/cart/vendors get the marketing navbar** and **discover-location has no wrapper**. `dashboard-layout.tsx:33` uses `#1A1A1A` where token is `#1A1A18`.
- **Admin:** 3 pages return a bare `<div>` on their **loading branch** → sidebar vanishes on every load: `neighborhoods.tsx:375`, `category-fees.tsx:291`, `fee-bands.tsx:253` (same class already fixed for 6 pages — these were missed).
- **Expert:** `workspace.tsx` renders **outside** ExpertLayout (bespoke full-screen + its own color system).

**Fix approach:** small, mechanical — wrap the 3 admin loading branches in `<AdminLayout>`; decide traveler shell unification (move discover/cart/vendors/discover-location onto one wrapper); leave workspace immersive but route its colors through tokens.

---

## BATCH F — Rendered-only / correctness bugs (screenshot- or read-confirmed)

- **`/my-trips` renders completely blank** despite 2 seeded trips (dashboard shows them) — **rendered-confirmed**, needs repro/fix.
- **credits-billing "Save Save 11%/20%/30%"** double-word on package badges (`Save ${label}` where label already starts with "Save") — rendered-confirmed.
- **`profile.tsx` "Save Changes" saves nothing** (traveler + provider + EA all fake success with setTimeout/no mutation).
- Trip card: `PlanCard.tsx:1023` `d.day` should be `d.dayNum` (expert-escalation payload sends `undefined`); no empty state for 0-activity trip; `selectedDay` not bounds-clamped.
- EA `gifts.tsx:207` `[...Array(gift.rating)]` → phantom 1 star when rating undefined.

---

## What's genuinely healthy (do not touch)

Cart→checkout, my-bookings (escrow confirm/dispute + visa timeline), ai-assistant, BookingConfirmation; provider services/bookings/earnings/settings (+ the 3 features just shipped: Duplicate, Request Payout, Background Verification); expert dashboard/earnings/analytics(data)/templates/dmo/services/bookings; EA clients/executives + the RBAC-scoped `/api/ea/*` layer; admin dashboard/revenue/analytics/approval pages + AdminTabNav; the server `/plancard` path + honest upsell slot + real escalation pricing.

---

## Recommended execution order (batches)

1. **A + F (data honesty)** — highest user-trust impact; start with the *delete/derive* subset (cheap, no new endpoints): system.tsx security cards, EA stat cards→derive, expert achievements, content-studio tab, credits balance reconcile, the my-trips blank + "Save Save" + fake profile saves. Defer the *wire-new-endpoint* subset (EA reports/trips, credits transactions) as its own project.
2. **B-wire** — connect buttons whose endpoints already exist (EA ai-assistant/communications/travel/venues; provider Quick Actions).
3. **C (fee literals)** — small, §8-mandated, grep-guided.
4. **E (shell wrappers)** — small mechanical (3 admin loading branches + traveler shell decision).
5. **D (brand-red + tokens)** — one big systematic aesthetic pass, best done last so it sweeps final markup.
6. **B-remove** — delete decorative dead buttons.
