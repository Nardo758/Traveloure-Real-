# Gap register: Action → Effect audit (traveler surfaces)

**Base:** `{{BASE}}`. **Frozen as the audit baseline** (git tag `audit/action-effect-baseline`); nothing after the tag amends it. **{{TOTAL}} open gaps** across {{ROWS}} matrix rows (REFUTED gaps are listed but not counted): **{{P1}} P1**, **{{P2}} P2**, **{{P3}} P3**.

**Severity**
- **P1:** the user loses work, or a canonical Trip is never created.
- **P2:** wrong or stale display.
- **P3:** cosmetic or redundant.

**Evidence**
- **Behavioural:** a journey step with its screenshot, network log and DB diff. These are cited in **bold**.
- **Static:** a `file:line` reading only. Static entries are claims, not findings, until a journey runs them.
  See the NOT PROVEN section of [`ACTION_EFFECT_AUDIT.md`](ACTION_EFFECT_AUDIT.md).

## A. The P1s grouped by ROOT CAUSE

Many matrix rows share one mechanism. A fix lane should be armed per root cause, not per row.
The IDs refer to the journey reports.

| # | Root cause | P1 symptoms (gap ids) | Evidence | Where |
|---|---|---|---|---|
| **RC-1** | **Only one exit from the planning modal creates a Trip.** "Build it myself", when signed in, is the only one. "Plan with AI" (the coral primary), Save, Escape/✕/backdrop, a guest finish, and the landing "Plan this moment" door, which offers AI only, all end without a `trips` row. The AI path creates a trip only after a successful model call. | J1-F1, J3-F1, the `landing:moment-cta` door | **J1 R4, R6, R7, R8; J3 R1** | `lib/plan-steps.ts:77,97`; `components/trip/plan-modal.tsx:1179-1215`; `contexts/PlanningContext.tsx:308-313, 383`; `server/routes/content.routes.ts:4949-4957` |
| **RC-2** | **"Add to Plan" silently becomes "add to cart".** With no trip in the pen, every Discover, city-feed and service-detail add writes `cart_items` with `trip_id NULL` (or guest localStorage) and says "Added to cart!" / "Saved!". | J1-F2, J2 R1, J4-F2 | **J1 R4 step 11; J2 R1, R2, R4** | `lib/trip-target.ts:42-47`; `pages/discover.tsx:1258, 1265-1270` |
| **RC-3** | **The "current trip" pen is not bound on console surfaces.** The only binder, `useTripContextSync`, is mounted only in the public `Layout`. A signed-in cold load of any console page reads the empty guest key. | J2-F1, J5-F4 | **J2 R4 step 5; J5 R1 step 8** | `components/layout.tsx:596`; `components/browse-shell.tsx:19-21`; `lib/trip-context.ts:543-551, 637` |
| **RC-4** | **A new session never recovers the active trip.** Hydration reads the legacy `trip_contexts` row (`trip_id NULL`), which a mint leaves empty. | J2-F2 | **J2 R2b** | `lib/trip-context.ts:506-534`; `server/routes/trip-context.routes.ts:225-239` |
| **RC-5** | **Creating or opening a plan does not make it the target.** IntakePanel "Create", ready-made clone, saved-trip convert, and opening a slip, Trip Card or My Plans never write the pen. `syncActiveTripToContext` has **zero callers**. Viewing plan B adds to plan A. | J2-F4, `intake-panel:button-intake-create` | **J2 R4b** | `hooks/use-trips.ts:50-87`; `lib/trip-selection.ts:15` |
| **RC-6** | **The pen can describe a plan that does not exist, and identity writes can desync.** A second "Build it myself" with a new city while a plan is bound creates nothing and leaves a "YOUR TRIP · Osaka" strip. Separately, `updateTripContext` merges destination and dates onto a bound `tripId` (the #972 class, which the code itself warns about) from IntakePanel "Plan with AI" and the AI-assistant extraction. | J2-F3; `intake-panel:button-intake-plan-with-ai`; `ai-assistant:trip-context-extraction-after-each-reply` | **J2 R3 step 4**; static for the #972 merges (`lib/trip-context.ts:253-280`) | `plan-modal.tsx:851-852, 1179-1185` |
| **RC-7** | **A new plan is invisible on My Plans once the list has loaded.** No trip mint except IntakePanel, ready-made and saved-trip invalidates `["/api/trips"]`, and `staleTime` is `Infinity`. | J1-F3, J3-F3 (static) | **J1 R5 step 13** | `lib/trip-slip.ts:151-176`; `lib/queryClient.ts:98`; H7 §C |
| **RC-8** | **Guest state is dropped on auth.** Guest "Build it myself" wipes the pen and opens sign-in without a return. A guest template add redirects to `/`. A guest concierge Send opens sign-in without a return. `/signup` ignores return-to, cart migration and concierge claim. | J1-F4, J4-F1, `concierge:review-sheet-send`, `signup:submit` | **J1 R1; J4 R2**; static for concierge and signup | `plan-modal.tsx:1201-1214`; `experience-template.tsx:1725-1727`; `pages/Signup.tsx:26-45` |
| **RC-9** | **Client-only state is lost on tab or device change.** External/affiliate template cart lines live only in `sessionStorage externalCart_<slug>`. | `experience-template:effect-external-cart-storage` | static | `experience-template.tsx:826-833` |
| **RC-10** | **The profile photo is never saved,** yet the toast says it was. | `profile:button-save-profile` | **U2 CONFIRMED** (`ui/profile__button-save-profile/`) | `pages/profile.tsx:211-231` |
| **RC-11** | **A traveler cannot send a first message to an earner.** Storefront "Message" opens `/chat` with an opaque id that the send rail can resolve only once the thread already has messages, so the first send is a 404. *New in Addendum 2.* | `chat:send-message` | **U2** (`ui/chat__first-message/`) | `server/services/messages.service.ts:378-389`; `server/routes.ts:2268-2276` |
| **RC-12** | **Invented party size.** Four surfaces put a traveler count on screen or on the wire that nobody stated (§13: untouched ⇒ not stated). **(a) Slip "1 traveler":** a plan minted with the Who step untouched stores `adults`, `kids` and `number_of_travelers` all NULL (correct), then the plancard DTO fills the held fallback `1` and the slip header renders it as the traveler's own count. **(b) AI modal:** it shows "2 travelers (not stated)" but sends `travelers: 2`; on a successful generation the server mints the trip with that 2. **(c) IntakePanel:** the Travelers field is pre-filled `2` and sent as `numberOfTravelers`. **(d) Experience template:** `adults` defaults to 2 and is written to the pen and Trip Strip as a stated total. *Registered at closeout. Symptoms are P2/P3; there is no P1.* | `plan-modal:planning-option-branch` (P2), `experience-template:effect-persist-settings` (J4-F3, P2), `intake-panel:button-intake-create` (J2-F6, P3), `planning-provider:run-branch-ai` (J1-F9, P3) | **closeout `ui/rc12__slip-party-untouched/`, `ui/rc12__ai-modal-body/`, `ui/rc12__intake-panel-default/`, `ui/u1-controls__date-night__dining/`**; the AI-success mint is static | (a) `server/services/trip-plan.service.ts:1137` (`plancardPartyCount(…, 1)`; ladder `shared/plan-vocabulary.ts:116-128`), rendered by `client/src/components/plancard/SlipView.tsx:1491-1497`. (b) `client/src/components/EnhancedPlanningModal.tsx:173-175` (fallback 2), `:288-290` (label), `:330` (body); `server/routes/content.routes.ts:4851-4852` (refuses a missing count), `:4965` (mint). (c) `client/src/components/intake-panel.tsx:133` `useState(2)`, `:179` (pen), `:202` (mint body). (d) `client/src/pages/experience-template.tsx:917`, `:1036`, then `:1146`, `:1407`, `:1482`, `:1549`, `:1759`, `:1828` |

**Money:** FU-AE-1 is the 3DS return that never calls confirm-payment. It is a **P1 candidate**, observe-only, and
currently unreachable because every platform PaymentIntent sets `allow_redirects:'never'`. It lives in
`FOLLOWUPS.md` and is not in this list.

**Consolidation candidates** (from [`INTENT_COMPONENT_MAP.md`](INTENT_COMPONENT_MAP.md)):
- `add_to_plan` is rendered by **13 components** with **15 labels** and **4 different target-resolution rules**:
  - the pen,
  - the curated picker (`endDate ≥ now`),
  - the city-feed secondary picker (`!endDate || ≥ now`),
  - CityGrid (all trips; it adds a *stop*, not an item).
- `create_plan` has **4 client components and at least 7 mint call sites** (H7 §C), and only 3 of them refresh My Plans.
- `open_planner` has **26 components**.
- `sign_in` has **13 components**, of which only some pass a `returnTo`.

**Wireframe divergences:**
- There are 22 WIREFRAME_DIVERGENCE rows. Most are P3 copy or structure differences against WIREFRAMES_v2 and COMMERCE_WIREFRAMES_v4.
- The two P2 rows are listed in §B.
- **SELECTION_CONTROL_MODEL_SPEC_v2** (`attached_assets/`, added at closeout) governs the template-page refine controls, not the plan modal:
  - Every `plan-modal:*` row carries a `specRefs` entry. 41 are `not_governed`; `option-occasion` and the occasion pill are `upstream`, because the tile picks the template whose controls apply.
  - Seven new rows, `experience-template:selection-controls:<set>`, compare each spec starter set with what renders. They carry 13 SPEC_DIVERGENCE (P3) gaps.
  - Only 3 of the 27 occasions reach any refine control.
  - Two code-side facts diverge from the spec's category-first sets, and are recorded, not resolved (R-3):
    - the seed deliberately ships no category control (`shared/selection-control-seed.ts:4-6`);
    - the page discards the resolver's `category` (`experience-template.tsx:1892-1904`), so a category control would have no effect.
