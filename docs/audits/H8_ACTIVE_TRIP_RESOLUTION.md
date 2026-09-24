# H8: Active-trip resolution

**Verdict: PROVEN.** The client has no single notion of "the current trip". Different places answer the question
from different sources with different rules. Under the same user state they disagree, and the disagreement was
reproduced in the browser (J2 R2, R2b, R3, R4, R4b; J1 R3–R8).

## 1. Every resolver of "the current trip"

| # | Resolver | Precedence it uses | Where |
|---|---|---|---|
| R-a | **`resolveTargetTripId`**, the add target for the `/services` grid, service detail, the city-feed/wishlist dialog and the experience template | 1) URL `?tripId=`; 2) the pen's `tripId`; 3) `""`, which callers turn into **the cart** (`cart_items`, `trip_id NULL`) | `client/src/lib/trip-target.ts:42-47`; callers `pages/discover.tsx:1298`, `pages/service-detail.tsx:492`, `components/add-to-experience-dialog.tsx:73`, `pages/experience-template.tsx:1738` |
| R-b | **The pen** (`experienceContext[:u:<id>]` in **sessionStorage**, mirrored to `trip_contexts`) | Whatever the last writer put there. **Hydration in a new session reads the LEGACY row (`trip_id IS NULL`)** unless the local pen already holds a `tripId` | `client/src/lib/trip-context.ts:175-197` (keys), `:506-534` (hydrate), `:401-402` (scoping); server `server/routes/trip-context.routes.ts:225-239` |
| R-c | **Who writes the pen's `tripId`**: plan-modal `commitPlan` (`switchTripContext`, `plan-modal.tsx:883`), concierge mint (`concierge/index.tsx:263`), experience-template mint (`experience-template.tsx:1626`), cart resolve (`cart.tsx:1476`) | Last write wins | — |
| R-d | **Who does NOT write it**, even though they create or open a plan: **IntakePanel "Create"** (`useCreateTrip`, `hooks/use-trips.ts:50-87`); the ready-made clone; saved-trip convert; CityGrid "select trip" (`CityGrid.tsx:140-165`); opening a slip (`/plans/:id`), a Trip Card (`/trip/:id`), My Plans or Home. None of these import a pen writer. `syncActiveTripToContext` (`lib/trip-selection.ts:15`) exists for exactly this job and has **zero callers**. | — | grep: no pen writer in `components/plancard/*`, `pages/slip-view.tsx`, `pages/trip-details.tsx`, `pages/my-trips.tsx`, `pages/dashboard.tsx` |
| R-e | **Plan modal "Continue {trip}"** | pen `tripId` | `contexts/PlanningContext.tsx:368-372` |
| R-f | **Plan modal mint gate**: mints only when the pen has **no** `tripId` | The pen's `tripId` blocks a new mint. If the destination changed, `commitPlan` **clears** the `tripId` and returns nothing | `components/trip/plan-modal.tsx:1179-1185`, `:851-852`; `lib/trip-context.ts:380-388` |
| R-g | **Trip strip** ("YOUR TRIP · … · Continue planning") | pen fields (destination and dates), whether or not a `tripId` exists | `components/trip/trip-strip.tsx` |
| R-h | **Explicit pickers**, three different eligibility rules: curated "Add to plan" = trips with `endDate ≥ now`; city-feed dialog secondary picker = `!endDate \|\| endDate ≥ now`; CityGrid "Take me Here" = **all trips** | Pickers ignore the pen and the URL | `curated-content-section.tsx:126`, `add-to-experience-dialog.tsx:200`, `travelpulse/CityGrid.tsx:126` |
| R-i | **Server `POST /api/cart/resolve-trip`** | A cart line's `tripId`, then the client's remembered `tripId` (body, ownership-checked), then a fresh mint | `server/routes.ts:8951-9010` |
| R-j | **`GuestTripContext`** (`localStorage.guestTrips`, tripId → shareToken) | Used only to add `?token=` to trip GETs. It is inert: the server refuses every anonymous mint (`server/routes.ts:1401-1406`), so nothing can populate it. **ORPHAN_READ.** | `contexts/GuestTripContext.tsx`, `hooks/use-trips.ts:24,54,101` |

## 2. Disagreements under one user state (behavioural)

| # | User state | Resolver A says | Resolver B says | Evidence |
|---|---|---|---|---|
| **D1** | Owns 1 plan; **new session** (new tab or device) | My Plans (`["/api/trips"]`): **1 plan** | R-a add target: **none**, so the add went to `cart_items` with `trip_id NULL`. **Two independent causes, each shown separately.** (i) **D6 below:** the session opened on a console page, so the pen was never bound and it read the empty guest key (**J2 R2**, steps 2–4). (ii) The session opened on the public landing, so the pen **was** bound and hydrated, but hydration reads the **legacy** `trip_contexts` row, which holds no `tripId`. The pen stayed `{}` (**J2 R2b**, steps 1–3: `GET /api/trip-context` 200, then `POST /api/cart` 201). | J2 R2, J2 R2b |
| **D2** | Plan A is in the pen; plan B was created via **My Plans → Create New**; the user is **looking at B's slip** and goes to Discover from the sidebar | Screen: **plan B's slip** | R-a: **plan A**. The item was written to A (`POST /api/trips/<A>/itinerary-items` 201; `itinerary_items.trip_id = A`, B has none). The grid shows no banner naming the target, and the toast says only "Added to your plan". | **J2 R4b** steps 2–5 (client-side navigation throughout). **J2 R4** is the same flow with a full load of `/services`: the pen was unbound (D6), so the add went to the **cart** instead. The same user action gives a third outcome depending on how the page was reached. |
| **D3** | Has plan A in the pen; opens the modal and chooses **"Build it myself" for a different city** | UI: modal closes; trip strip shows **"YOUR TRIP · Osaka · Continue planning"** | DB: **no Osaka plan**; the pen's `tripId` is **cleared**; My Plans still shows only A | **J2 R3** step 4 (screenshot + `trip_contexts` diff). There is no navigation and no message. **DEAD_TRIGGER + FALSE_PROMISE (P1).** |
| **D4** | Any plan exists; the modal's AI, Save or Escape exit | Trip strip / pen: destination and dates present ("YOUR TRIP · Kyoto") | No plan row; the add goes to the cart | **J1 R4, R6, R8** |
| **D5** | 2+ plans, one ended | Curated picker hides it (`endDate ≥ now`) | CityGrid picker lists it | static (`curated-content-section.tsx:126` vs `CityGrid.tsx:126`) |
| **D6** | **Signed-in** user, any **cold load** (bookmark, new tab, reload) of a console-shelled page: `/services`, `/destinations`, `/plans/:id`, `/my-trips`, … | The pen in sessionStorage holds `tripId` A under `experienceContext:u:<id>` | The pen **reader** uses the **guest** key `experienceContext` (empty), because `activePrincipal` is still `null`. The add goes to the cart. | **J2 R4** step 5: storage shows `experienceContext:u:…` with `tripId` A, and the network shows `POST /api/cart` 201. **Cause:** `useTripContextSync` (the ONE binder, `lib/trip-context.ts:543-551` → `bindPenPrincipal` `:637`) is mounted **only** in the public `Layout` (`components/layout.tsx:596`). `BrowseShell` renders `DashboardLayout` for a signed-in user (`components/browse-shell.tsx:19-21`), so on those routes nothing ever binds. While auth is loading, `BrowseShell` briefly renders `Layout`, but the binder ignores that undefined state (`trip-context.ts:548`) and `Layout` unmounts before auth resolves. **P1: the add target depends on which page the session happened to start on.** |

## 3. Consequences for the rulings

- **R-2 ("Add to my plan" targets the trip currently being built):** there is no single "currently being built".
  D1–D4 show the add landing on the cart, or potentially on a trip the user is not viewing, while the UI implies
  otherwise. The class is **SPEC_DIVERGENCE** against UNIFIED_PLANNING_FLOW_SPEC_v2 §2.
- **R-1 (Trip is canonical):** the pen can describe a plan that has no row (D3, D4). The trip strip then renders it as
  "YOUR TRIP". That is a client-side shadow of the canonical object. **ORPHAN_WRITE** (the pen) with no canonical
  writer behind it.

## NOT PROVEN

- **D5** is static only.
- Server `resolve-trip` precedence (R-i) is static only. The cart optimize path was not exercised (it is on the money path).
