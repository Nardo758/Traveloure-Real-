# Traveloure — Expert Offerings & Economics

**Piece 1 of 4** (Expert itinerary-building services). **Type:** internal product spec, *reconcile* job.
**Source of truth:** code @ `main` `68d588e` (2026-06-02). Refs are `file:line`.
**Canonical decision (assumed, flip if wrong):** the **shipped offerings in code** are canonical; the Business Plan's 5-tier model is mapped onto them and treated as marketing framing, not spec (§4).

---

## 0. The headline

Two findings, one of them serious:

1. **There are two offering systems in the code, not one** — six hardcoded frontend "templates" and a DB-backed offerings catalog — and they don't reference each other (§1–2).
2. **The commission decision exposes a magic-number landmine.** The literal `0.30` appears in **at least eight places** with **two opposite meanings** — sometimes "platform's cut," sometimes "expert's share" — and they already contradict each other by 40 points. Your 0.75 decision is therefore **not a find-replace**; a blind one would make the platform take 75%. This is the single most important thing in this doc (§3).

---

## 1. What an "offering" is in code

The data model has three layers plus a parallel hardcoded set:

- **`expert_service_categories`** (`shared/schema.ts:894`) — category buckets.
- **`expert_service_offerings`** (`:902`) — the platform catalog: `categoryId`, `name`, `price`, `isDefault`, `sortOrder`. These are platform-defined offering definitions.
- **Expert ↔ offering link** (`:~914`) — `expertId`, `serviceOfferingId`, `customPrice` (expert may override price), `isActive`. This is how an expert *adopts* a catalog offering and prices it.
- **`revenueShareRate`** (`:512`) — decimal, **default `0.30`** — the expert's cut (see §3).

> **Reconcile-within-code (flag A):** the six "templates" experts actually pick from (§2) are **hardcoded in the frontend** (`service-templates.tsx`), not rows in `expert_service_offerings`. So the catalog the DB models and the catalog the UI offers are two different lists. Decide which is canonical before either doc or marketing quotes "our services."

---

## 2. The six shipped templates (frontend canonical today)

From `client/src/pages/expert/service-templates.tsx`; created via `POST /api/expert/services/from-template/:templateId` (`routes.ts:4415`):

| Template | Price | serviceType | What's included |
|---|---|---|---|
| Quick Consultation | $29 | consultation | 15-min video call, personalized advice, follow-up summary |
| Cart Review & Optimization | $49 | review | Written recs, alternatives, savings estimate |
| Destination Deep Dive | $79 | custom | PDF guide, local recs, maps, insider tips, safety |
| Group Trip Coordinator | $349 | planning | Group logistics, shared itinerary, booking coordination |
| Full Trip Planning | $249 | planning | Full itinerary, booking links, reservations, daily schedule, packing list |
| Honeymoon Planning Package | $399 | planning | Custom itinerary, romantic experiences, special arrangements |

Taxonomy in code is `consultation | review | planning | custom` — four serviceTypes, not five tiers.

### Free-form builder
Experts can also build a custom service via the **ServiceWizard** (`service-wizard.tsx`), a 5-step flow: Basics → Details (description + delivery format, incl. "Document Delivery") → Pricing (price > 0 required) → Requirements → Review/publish. New services start `status: "draft"`.

**Lifecycle:** `draft` → active via `PATCH /api/expert/services/:id/status` (`routes.ts:4381`); plus `duplicate` (`:4400`). Pricing is a flat one-time price per service; experts can set `customPrice` on adopted catalog offerings.

---

## 3. Economics — the 0.30 landmine (read before changing anything)

Your decision: **fallback expert share = 0.75** (floor of 75–85%). Implementing it safely requires understanding that `0.30` currently means two opposite things.

**Sites where `0.30` = the expert's share** (expert gets 30%, should become **0.75**):

| Ref | Code | Meaning |
|---|---|---|
| `schema.ts:512` | `revenueShareRate ... default("0.30")` | DB column default — expert's cut |
| `routes.ts:583` | `shareRate = Number(service.revenueShareRate ?? 0.30)` | expert-share fallback |
| `routes.ts:3420` | `: 0.30` | rate fallback |
| `routes.ts:5574` | `serviceRate = parseFloat(... ?? "0.30")` | expert-share fallback |
| `routes.ts:17673/17677` | `DEFAULT_RATE = 0.30` / reduce `?? "0.30"` | commission fallback (Workspace doc §5.6) |

**Sites where `0.30` = the platform's cut** (platform takes 30% → expert already gets 70%; for a 75% expert share these must become **0.25**, NOT 0.75):

| Ref | Code | Meaning |
|---|---|---|
| `routes.ts:3289` | `platformFee = price * 0.30` (comment: "platform takes 30%") | platform's cut on a template purchase |
| `routes.ts:5439` | `platformFee = subtotal * 0.30` | platform's cut at checkout |
| `routes.ts:5565` | `platformFee = subtotal * 0.30` | platform's cut at checkout |

> **The trap:** these two groups already **disagree today** — the platform-cut lines pay experts **70%**, the revenue-share default pays experts **30%**. Different surfaces, 40-point gap. A naive "replace 0.30 with 0.75" would (a) correctly fix the share lines but (b) turn `platformFee = subtotal * 0.75` into the platform taking **75%** — the exact opposite of the intent. **Do not bulk-replace.** Change the share sites to `0.75` and the platform-cut sites to `0.25`, and ideally hoist both into a single named constant (`EXPERT_SHARE = 0.75`, `PLATFORM_FEE = 1 - EXPERT_SHARE`) so they can never drift again.
>
> Also apply `0.75` to the NaN coalesce from the Workspace doc (flag #5a) so a malformed rate degrades to 75%, not 30%.

### 3a. There is a THIRD commission system (found 2026-06-02, post-decision)
Beyond the share/platform-cut literals above, a **category fee-config** exists and is the most production-grade of the three:
- Table `platform_fees` (`shared/schema.ts:5016`): per-`category` `feePercentage`, fixed/min/max, `isActive`, `priority`.
- Admin CRUD: `POST /api/admin/fee-config` (`routes.ts:~17246`), defaults **platform 12% / expert 70%**.
- **Live consumer:** `GET /api/booking-fee-config?category=` (`routes.ts:~17288`) — already wired into the **itinerary page**, defaults `expert_share_percent: 70`.

So three surfaces answer "expert's cut" with **70% / 30% / 70%**. The 0.75 decision, applied only to the §3 literals, would **not** touch this system — the itinerary page would remain at 70%.

> **Revised recommendation (supersedes a literal flip):** make the **category fee-config canonical**. Set its expert-share default to the decided value (0.75, or per-category provider tiers), then have checkout (`5439/5565`), template purchase (`3289`), and the commission endpoint (`17655`) **read from `booking-fee-config`** instead of hardcoding `0.30`. Delete the per-service `revenueShareRate` default's role as a competing source (keep the column as an *override* only). This collapses all three into one source and is the only way the 0.75 decision holds on every surface. **Decision needed:** confirm category-fee-config is canonical, and whether the expert default is a flat 0.75 or per-category tiers.

---

## 4. Mapping to the Business Plan's 5 tiers (marketing ↔ shipped)

Business Plan §3.1 defines five tiers; the shipped templates map loosely and leave gaps:

| Plan tier (price) | Closest shipped template | Fit |
|---|---|---|
| T1 Basic Advisory ($25–75) | Quick Consultation $29, Cart Review $49 | good |
| T2 Custom Itineraries ($75–200) | Destination Deep Dive $79 | partial (it's a guide, not day-by-day) |
| T3 Comprehensive Planning ($200–500) | Full Trip Planning $249, Honeymoon $399, Group $349 | good |
| T4 Live Travel Support ($50–150/hr) | — none — | **gap** |
| T5 Specialized ($100–300/hr) | Group Coordinator (partial) | weak |

**Three structural mismatches to resolve before the plan and the product agree:**
1. **No live/in-trip support offering** (T4) ships at all — the entire real-time-during-travel tier is unbuilt.
2. **Pricing model differs:** plan tiers 4–5 are **hourly**; every shipped template is a **flat one-time price**. The product has no hourly billing path.
3. **Fixed vs range:** plan quotes ranges; templates quote single prices. Fine, but the marketing range should bracket the shipped prices, which it roughly does except T2.

---

## 5. Recommendations

1. **Pick one offering source of truth** (flag A): either promote the six frontend templates into `expert_service_offerings` rows, or drive the UI from the DB catalog. Two lists will drift.
2. **Fix the 0.30 economics as a *careful* change, not a replace** (§3): share sites → 0.75, platform-fee sites → 0.25, both behind one constant. This also closes Workspace flags #5/#5a and the Lead-Journey checkout drift in one stroke.
3. **Decide on Tier 4 (live support):** either build an hourly/in-trip offering or drop it from the marketed lineup so the plan stops promising something the product can't sell.
4. **Align the Business-Plan tier copy to the six shipped templates** (this doc's §2 table is the real lineup).

---

## 6. Cross-doc dependencies

- **Commission (0.75)** is shared with Piece 2 (Workflow §3) and Piece 4 (Workspace §5.6). Single source of truth; §3 here is the implementation map.
- **Checkout 30% platform fee** (Lead Journey doc) is one of the platform-cut sites in §3 — reconcile in the same pass.
- **What the offering actually *delivers*** (the itinerary) is Piece 3 (PlanCard) and the Workspace (Piece 4); this doc covers packaging and price, not the deliverable.

---

*`file:line` refs against `68d588e`. `server/routes.ts` ~18.5k lines; re-verify offsets after refactor. The 0.30 occurrence list in §3 was current at audit time — grep `0\.30` again before editing, as more may exist.*
