# Expert-Template Marketplace — Full-Path Scoping (READ-ONLY)

**Question:** Is C1 ("revive the `packages` tab") a *fix* (route + unhide a tab) or a *build* (there's no store behind the storefront)? The tab sells expert-authored itineraries to travelers for money, so the real test is whether a working purchase path, create path, and approval gate exist.

**Answer up front: it's a feature BUILD.** The storefront and the accounting scaffolding exist, but the decisive piece — a real checkout — does not, the traveler-facing purchase page is absent, and there is no approval gate on content sold to travelers. → **C1 = relocate the earn CTAs only; file the marketplace as its own product brief.**

---

## Six-check inventory (`status` + `file:line`)

| # | Path | Verdict | Evidence |
|---|---|---|---|
| **1** | **Storefront** `GET /api/expert-templates` (+ `/:id`, `/:id/reviews`) | ✅ declared, mounted, works | `server/routes.ts:4316/4333/4499` (also dup in `server/routes/experts.routes.ts:971/989/1173` — first-wins shadow). Reads `expert_templates` table. **Not** empty-by-design — the create path (check 4) writes it; actual row count is env-dependent. |
| **2** | **Purchase route + page** `/expert-templates/:id` | ❌ **absent (frontend)** | No `<Route path="/expert-templates/:id">` in `client/src/App.tsx` (only `/admin/expert-templates`, :657). No page component maps to it — `experience-template.tsx` renders `/experiences/:slug` (App.tsx:351/352), *not* template purchase. So the "View & Purchase" button (discover.tsx:1700) dead-ends before any backend is reached. **This is audit finding B2.** |
| **3** | **Buy transaction** `POST /api/expert-templates/:id/purchase` | ⚠️ **exists + mounted, but is a ledger stub with no payment, and no frontend calls it** | `server/routes.ts:4418` (dup `experts.routes.ts:1079`). Fees resolve correctly through `resolveCommissionRates(template.category)` (`server/services/commission.ts:362`; `EXPERT_SHARE_RATE=0.75` / `PLATFORM_FEE_RATE=0.25` at commission.ts:47/48 — config-driven, **not** a literal, 75% floor honored). **But:** grep for `stripe\|paymentIntent\|charge\|connect\|transfer` in the handler → **nothing**. It writes `createTemplatePurchase({status:'completed'})` (4446) and `createExpertEarning({status:'available', availableAt:new Date()})` (4458) — money is credited with **zero actual charge**. And no client file calls `/purchase` or `/api/my-purchased-templates` (grep → 0 hits). |
| **4** | **Create side** author + publish | ✅ endpoints mounted + page exists, but self-publish & unvalidated | `POST /api/expert/templates` (routes.ts:4361) + `PATCH …/:id` (4376); page `client/src/pages/expert/templates.tsx` at `<Route path="/expert/templates">` (App.tsx:505). Create spreads `req.body` directly (no zod). `isPublished` is a settable column (schema.ts:3863, default false) — an expert flips it via PATCH themselves. So an expert *can* author and publish today, unreviewed. |
| **5** | **Approval gate** | ❌ **none** | `expert_templates` (schema.ts:3829–3871) has only `isPublished`/`isFeatured` — **no `approvalStatus`, no admin-review lifecycle**, unlike `provider_services.approval_status`. Content sold to travelers ships on the expert's own say-so. Ties to the Phase-4 admin-approval work / D1a — **flagged, not fixed.** |
| **6** | **"Trending Destinations" half** (discover.tsx:1739+) | ✅ severable, not marketplace | Driven by `trendingTrips` ← `trendingCitiesData` (discover.tsx:725/730) — trending **city** browse tiles; "View Details" deep-links to `/discover?tab=…` (audit row #35). Not templates, not purchasable. Reviving/relocating the marketplace doesn't touch it. |

---

## What's present vs. what's missing

**Present (scaffolding):** storefront read API, a create page + write endpoints, a `template_purchases` + `expert_earnings` ledger, and a *correct* fee split (75/25 via `fee_bands`/commission resolver).

**Missing / stubbed (the load-bearing four):**
1. **Real checkout** — no Stripe charge, no Connect transfer. The purchase endpoint records a sale and marks expert earnings "available" without any money moving. This is the decisive gap: **it's a storefront with a fake register.**
2. **Traveler purchase UI** — `/expert-templates/:id` route + page don't exist (B2); the buy path is unreachable from the client, and the purchase/`my-purchased-templates` endpoints have no caller.
3. **Approval gate** — none on content sold to travelers (self-publish).
4. **Input validation** — create/patch spread `req.body` unvalidated.

Three of those four are exactly the surfaces (payment, purchase UI, approval) that a marketplace can't ship without.

---

## Size verdict

**"Revive" is a feature build, not a fix.** The `packages` tab is a storefront with no working register: the buy endpoint charges nothing and is wired to no UI, the traveler purchase page doesn't exist, and there's no approval gate on paid expert content. Fixing "a route + a hidden tab" would expose "View & Purchase" buttons that either 404 (no page) or, if pages were added, record fake completed sales with real expert-earning liabilities and no traveler charge — worse than leaving it hidden.

**Therefore C1 = relocate only:**
- **Do now (safe-fixes lane, sanctioned by this verdict):** move the two `user.role`-gated Apply-to-Earn CTAs — "Create your first template" (→ `/expert/templates`) and "Become an expert" (→ `/expert-status`) — onto a **visible** tab so the earn funnel isn't stranded behind a dead tab. (The create side genuinely works, so this funnel is real.)
- **Leave** the `packages` tab dead and **do not** fix B2 or unhide the tab.
- **File** "Expert-Template Marketplace" as its own scoped feature brief — peer of the event fast-follow — speccing: Stripe Connect checkout, the traveler purchase page/route, an approval gate (with Phase-4 admin-approval), and create-side validation. Its own branch, deliberate payment + integrity design.

**Not touched:** the "Trending Destinations" tiles (severable, check 6).

---

*Read-only inventory. Nothing built, wired, or fixed — including B2, the checkout, and the tab. The CTA-relocation is the only piece eligible for the safe-fixes lane, and only because the verdict landed on "relocate." The approval gap (check 5) is reported for Phase 4, not fixed here.*
