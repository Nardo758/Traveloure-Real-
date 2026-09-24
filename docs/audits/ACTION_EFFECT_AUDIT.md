# Action → Effect Graph Audit: traveler surfaces (index)

**Mode:** read-only. **No application code, schema or migration was changed.** Everything here is docs plus a
reproducible harness. **Base audited:** `main` @ `858d28f`. **Branch:** `claude/lucid-galileo-hu7vgw`, which the
decision-maker accepted for this lane.

**Rulings applied:**
- R-1: Trip is canonical.
- R-2: "Add to my plan" targets the trip currently being built.
- R-3: code is ground truth; spec divergence is recorded, not resolved.
- R-4: grep is not proof; behavioural claims cite a journey step.

## Deliverables

| # | Deliverable | File |
|---|---|---|
| 0 | Phase 0 inventory (surfaces, trigger counts, state stores) | [`ACTION_EFFECT_PHASE0_INVENTORY.md`](ACTION_EFFECT_PHASE0_INVENTORY.md) |
| — | Phase 1 notes: A1 catch-all check, A2 Tier-1 count | [`ACTION_EFFECT_PHASE1_NOTES.md`](ACTION_EFFECT_PHASE1_NOTES.md) |
| 1 | **Matrix**: 825 triggers, 321 Tier-1 traced in full (7 rows added at closeout for SELECTION_CONTROL_MODEL_SPEC_v2) | [`ACTION_EFFECT_MATRIX.md`](ACTION_EFFECT_MATRIX.md) |
| 2 | **Machine-readable** (schema v1, stable, CI-gate input) | [`action-effect.json`](action-effect.json), [`action-effect.schema.json`](action-effect.schema.json) |
| 3 | **Journeys J1–J6**: a Mermaid flowchart each, broken edges red and dashed; screenshots, network log and DB diff per step | [`journeys/J1`](journeys/J1/README.md) · [`J2`](journeys/J2/README.md) · [`J3`](journeys/J3/README.md) · [`J4`](journeys/J4/README.md) · [`J5`](journeys/J5/README.md) · [`J6`](journeys/J6/README.md) |
| 4 | **Gap register**, sorted by severity and grouped by root cause (**frozen baseline:** 179 open, 31 P1, 12 root causes) | [`GAP_REGISTER.md`](GAP_REGISTER.md) |
| 5 | **NOT PROVEN** | §NOT PROVEN below |
| 6 | **Intent → component map** | [`INTENT_COMPONENT_MAP.md`](INTENT_COMPONENT_MAP.md) |
| A4 | H7: query-key fragmentation | [`H7_TRIP_QUERY_KEYS.md`](H7_TRIP_QUERY_KEYS.md) |
| A4 | H8: active-trip resolution | [`H8_ACTIVE_TRIP_RESOLUTION.md`](H8_ACTIVE_TRIP_RESOLUTION.md) |
| A5 | Booking-rail reachability | [`A5_BOOKING_RAIL_REACHABILITY.md`](A5_BOOKING_RAIL_REACHABILITY.md) |
| A6 | Money signal (3DS confirm-payment) | `FOLLOWUPS.md` → FU-AE-1 (plus FU-AE-2 to FU-AE-5) |

**Harness** (`journeys/harness/`):
- `j1.mjs`, `j2.mjs`, `j3j4.mjs`, `j5j6.mjs`, `j4-send-probe.mjs`: the journeys.
- `lib.mjs`: shared helpers.
- `render-evidence.mjs`: builds each journey's `EVIDENCE.md`.
- `build-matrix.mjs` and `build-gap-register.mjs`: rebuild the matrix, the JSON, the intent map and the register from the four tracing passes' row files.
- The harness is **not wired into CI**. It needs a local production build and a migrated Postgres; see the J1 header.

## Hypothesis verdicts (J1 plus A4)

| H | Verdict | Key evidence |
|---|---|---|
| H1 (completion only writes client state; no trip-create) | **PROVEN** for "Plan with AI", Save and dismissal. **DISPROVEN** for "Build it myself" when signed in. | J1 R3 vs R4, R7, R8 |
| H2 (the trip-create fires but fails or is swallowed) | **DISPROVEN** | Every `POST /api/trips` returned 201 |
| H3 (My Plans reads another source, or its key is not invalidated) | **PROVEN** (not invalidated; same source) | J1 R5 step 13 |
| H4 (the guest path skips trip creation) | **PROVEN** (a sign-in modal is shown, the answers are wiped, there is no return) | J1 R1 |
| H5 (Discover writes with a null `tripId`) | **PROVEN** when no pen trip | J1 R4; J2 R1, R2, R4 |
| H6 (completion and dismissal share one path) | **DISPROVEN** (three distinct paths; dismissal drops the answers) | J1 R3, R7, R8; J6 |
| H7 (key fragmentation, at least 3 shapes) | **PROVEN**: 4 fragmentation groups, 11 shapes, 3 phantom keys | H7 doc, J1 R5 |
| H8 (active-trip resolvers disagree) | **PROVEN**: 10 resolvers, 6 disagreements, 5 of them behavioural | J2 R2, R2b, R3, R4, R4b |

**The seed bug, in one sentence:**
- The landing modal's primary finish, "Plan with AI", creates no Trip unless an AI generation succeeds.
- Discover's "Add to Plan" then files a trip-less cart line and says "Added to cart!".
- My Plans is truthfully empty.
- Even a real "Build it myself" plan stays hidden on My Plans if that list was loaded earlier in the session.

## NOT PROVEN

Every claim below was **not** confirmed in the browser. Each entry says what would confirm it.

**Environment limits (these affect whole classes of rows)**

1. **Successful AI generation.** xAI's base URL is hardcoded (`server/services/grok.service.ts:35`) and the keys
   were stubs, so every success-path AI claim is static:
   - trip minted at `content.routes.ts:4957`;
   - no pen binding afterwards;
   - My Plans stale;
   - chat and draft extraction.

   *Needs:* a staging run with a real key, or an overridable base URL plus a mock (FU-AE-4).
2. **Stripe.** A stub key, so no PaymentIntent, no 3DS and no charge path was exercised. The money rows
   (10 console, 15 entry) are static by ruling. *Needs:* a Stripe test key plus test cards (FU-AE-1).
3. **Partner feeds** (Travelpayouts, Booking.com, 12go, Fever) and **Google geocoding**: all empty or 404 locally.
   A5 reachability and J4-F5 are static. *Needs:* partner sandbox keys.
4. **Replit OAuth** (`/api/login`) is unavailable off-Replit. *Needs:* a Replit deploy run.
5. **Mobile viewport** was not run. Several controls render only on mobile (e.g. `UpNextHero`, `sm:hidden`).

**Specific claims**

6. **"Get a local expert" finish** (it mints when signed in, per `plan-steps.ts:77`). *Needs:* a harness branch `local`.
7. **H7 §C staleness rows other than modal-mint → My Plans:** all static. They cover dates PATCH → slip,
   comparison auto-apply, curated add → slip items, and DELETE → Trip Card. *Needs:* one journey step each
   (write → SPA-navigate to the reader → DOM vs DB).
8. **H8 D5** (the three pickers use different eligibility rules) and **R-i** (server `resolve-trip` precedence): static.
9. **A5 agent-booking submission:** no row was diffed. *Needs:* a seeded `affiliate_bookable` product on a plan item,
   then Finalize → "Booking agent".
10. **EscalationCTA writing a concierge lead on every Trip Card mount** (FU-AE-3): static. *Needs:* mount `/trip/:id`
    twice and diff `concierge_requests`.
11. **RC-6 #972 merges** (IntakePanel "Plan with AI" and AI-assistant extraction onto a bound `tripId`): static.
12. **RC-8 concierge guest Send** and **`/signup` return-to**: static.
13. **RC-9 external template cart lines lost on tab close**, and **RC-10 profile photo not saved**: static.
14. **Most matrix rows are `static`** (794 of the original 818, 292 of them Tier 1; the closeout added behavioural evidence to 6 of its 7 new rows and to the re-run row). Their `chain` fields are code readings at `file:line`, one hop deep.
    Downstream DB columns written through `storage.*` helpers are sometimes named from the helper, as each tracing
    pass noted. The two delegated placeholders (`TripLogisticsDashboard`, the slip anchor managers) were not traced.
15. **WIREFRAME_DIVERGENCE rows** compare against WIREFRAMES_COMPLETE_v2 and COMMERCE_WIREFRAMES_v4 as written in
    `attached_assets/`. **SELECTION_CONTROL_MODEL_SPEC_v2** was added to `attached_assets/` at closeout, and the rows it
    governs are audited against it (§Closeout, U1). Its Custom set has no template to render on, so that row is static.
16. **`deals:book` INVISIBLE_RESULT (P2)**, moved here at closeout. `GET /api/deals` returns `{"deals":[],"total":0}` locally,
    so there is no deal card to press, and the claim that the request is not tied to a trip and not visible after reload
    stays a static reading of `client/src/pages/deals.tsx:269`. *Needs:* partner deal feeds.
17. **RC-12 (b), the AI-success mint with `numberOfTravelers: 2`** (`server/routes/content.routes.ts:4965`): static, for
    the same reason as #1. The client half (the request body carries `travelers: 2`) is behavioural.

## Addendum 2: UI sync pass (read-only)

| Item | Status | Where |
|---|---|---|
| **U1**: re-audit `plan-modal:*` against SELECTION_CONTROL_MODEL_SPEC_v2 | **Done at closeout (see below).** Originally BLOCKED: the spec was not in the repository. I checked `attached_assets/`, `origin/main` (which advanced to `da1abc7` during the lane) and all 1,486 remote branches with `git ls-tree`, and searched the entire history with `git log --all --name-only`. The only matches are the code-side `shared/selection-control-seed.ts`, `shared/selection-controls.ts` and the gate files. No SPEC_DIVERGENCE row cites the document, because citing text I haven't read would be invented. The `{{BASE}}` placeholder in `GAP_REGISTER.md` **is fixed**. | this section |
| **U2**: screenshot every P1/P2 UI-class row | **Done.** 31 gap entries: **26 CONFIRMED, 2 REFUTED, 3 BLOCKED** (environment, each with a screenshot of the absence), plus **1 new P1** found while probing (RC-11, first chat message 404s). No P1/P2 UI row is static-only. | [`ui/U2_RESULTS.md`](ui/U2_RESULTS.md), `ui/<row-id>/` |
| **U3**: empty UI fields | Before: **592 of 818** rows had at least one empty field, **88 of them Tier 1**. After: **0 of 314 Tier-1 rows**. The 504 Tier-2 rows are one-liners by A2's definition and carry no UI contract fields. | `action-effect.json` (`ui.*`); patches in `journeys/harness/matrix-src/patches.json` |
| **U4**: traveler-path contact sheet | **Done.** 21 frames covering landing → each modal step and each exit → Discover → add → `/my-trips` → the slip, each annotated with the gap row ids visible in it | [`ui/CONTACT_SHEET.md`](ui/CONTACT_SHEET.md) |

**The matrix is now reproducible from the repo:**
- `node docs/audits/journeys/harness/build-matrix.mjs docs/audits/journeys/harness/matrix-src docs/audits/journeys/harness/matrix-src/patches.json 858d28f`
- then `node docs/audits/journeys/harness/build-gap-register.mjs`

## Audit closeout (read-only), and the frozen baseline

**Tag:** `audit/action-effect-baseline`. It freezes the register, the matrix, the JSON and the evidence as the audit baseline.
- **Base audited:** `858d28f`.
- **Nothing was fixed.**
- Probes: `journeys/harness/u2d-closeout-probes.mjs`. Results: `ui/closeout-results.json`.

### U1: `plan-modal:*` against SELECTION_CONTROL_MODEL_SPEC_v2 (`attached_assets/`)

**The spec's scope.** The spec governs the template page's **refine selection controls**: `getSelectionControls` feeding the #462 query, over the working keys `category`, `searchQuery`, `priceRange`, `minRating` and `tags`. The plan modal asks for a plan's identity and renders no selection control.

**The plan-modal rows.** Every `plan-modal:*` row now carries a `specRefs` entry in `action-effect.json`:
- **41 are `not_governed`.**
- **2 are `upstream`:** `option-occasion` and the occasion pill. The tile picks the `experience_types` slug that later keys `SELECTION_CONTROL_SEED[templateSlug]` (`experience-template.tsx:495`).
- **1 gap added:** `plan-modal:option-occasion` gets SPEC_DIVERGENCE P3. The modal offers **27** occasions, the spec defines sets for **7**, and the seed keys **3** (travel, wedding, corporate-events). Picking any of the other 24 leads to a template page with no refine controls.

**Seven rows added:** `experience-template:selection-controls:<set>`, one per spec starter set. Each compares the spec with what renders (screenshots under `ui/u1-controls__<slug>__<tab>/`). Together they carry 13 SPEC_DIVERGENCE gaps, all P3.

| Spec set | Spec (active controls) | Rendered at `858d28f` |
|---|---|---|
| Travel | mood (multi) · Budget, 4 bands · Quality bar | **Budget?** with 2 bands (Under $150, Premium ($150+)), beside the legacy Category and Distance selects |
| Wedding | Which vendor? (`category`, single) · Budget band · Quality bar | **Vendor focus?** (`tags` photography/floral/music, multi) |
| Corporate | Service? (`category`) · Budget per head · Quality bar | `corporate-events`: **Activity focus?** (zen/sake/craft, which the spec does not list). `corporate`: **none** |
| Date Night / Proposal / Birthday | `category` control + Budget? | **none** |
| Custom | `category` + Budget? | no `custom` template exists (static) |

**Two code facts diverge from the spec. Both are recorded, not resolved (R-3):**
- The seed deliberately ships **no category control** because "category navigation is served by the tab bar" (`shared/selection-control-seed.ts:4-6`). It also omits rating and non-travel budget bands for inventory reasons (`:14-21`).
- `applySelections` (`experience-template.tsx:1892-1904`) **discards the resolver's `category`**. A spec-conformant category control would therefore have no effect on this page.

### U3: empty UI contract fields in `action-effect.json`

"Empty" means null, an empty string, or an object whose values are all null. `visible_feedback` is `ui.feedback`.

| Field | All rows, before (818) | All rows, now (825) | Tier 1, before (314) | **Tier 1, now (321)** |
|---|---|---|---|---|
| `ui_promise` | 566 | 504 | 62 | **0** |
| `visible_feedback` | 504 | 504 | 0 | **0** |
| `result_location` | 585 | 504 | 81 | **0** |
| `wireframe_ref` | 504 | 504 | 0 | **0** |
| rows with any empty field | 592 | 504 | 88 | **0** |

Every Tier-1 row is filled. The 504 remaining are exactly the Tier-2 rows. A2 defines those as one-liners with no UI contract, and the closeout kept that ruling.

### The blocked rows, re-run
- **`services:unified-request-booking`: both gaps CONFIRMED.**
  - The re-run used `domcontentloaded` and a 90 s goto timeout.
  - The card came from a fixture feed response carrying a real vault token; the submit went to the real rail.
  - **SILENT_FAILURE_UI:** signed in, a forced 500 toasts "Sign in required".
  - **INVISIBLE_RESULT:** the POST returns 200 and the row has `trip_id` NULL. After reload the card still offers "Request booking" and shows no state.
- **`deals:book`: NOT PROVEN** (#16 above). There is no feed data.

### RC-12: invented party size (registered; see `GAP_REGISTER.md` §A)

This is one root cause: a count nobody stated is filled with a literal, then shown or sent as the traveler's own answer. The four sites:

1. **The slip reads "1 traveler".** This was behavioural at closeout.
   - A "Build it myself" mint with the Who step untouched stores `adults`, `kids` and `number_of_travelers` all NULL.
   - `GET /plancard` then returns `trip.travelers = 1` from `plancardPartyCount(…, 1)` (`server/services/trip-plan.service.ts:1137`).
   - `SlipView.tsx:1491-1497` renders it.
   - The code comment there calls the `1` "a held decision". The audit records it as the traced source and makes no ruling.
2. **The AI modal shows "2 travelers (not stated)".**
   - The `2` comes from the fallback at `EnhancedPlanningModal.tsx:173-175`, and the label is at `:288-290`.
   - The request body sends `travelers: 2` (`:330`), which is behavioural.
   - On success the server mints with that 2 (`content.routes.ts:4965`), which is static. The server refuses a missing count (`:4851-4852`).
3. **IntakePanel pre-fills `useState(2)`** (`intake-panel.tsx:133`).
   - It sends `numberOfTravelers: 2` on Create (`:202`) and puts 2 in the pen on "Plan with AI" (`:179`).
   - This was behavioural, and it traces J2-F6's previously untraced cause.
4. **The experience template defaults `adults` to 2** (`experience-template.tsx:917`, and the restore fallback at `:1036`).
   - It writes `travelers: adults + kids` as a stated total at `:1146`, `:1407`, `:1482`, `:1549`, `:1759` and `:1828`.
   - This was behavioural: the Trip Strip reads "Your Kyoto Date Night · 2 travelers" for a fresh account.

## Out of scope, filed

Expert, provider and EA surfaces are pass two (FU-AE-2). Money-path fixes are observe-only (FU-AE-1). Nothing was fixed,
including the J1 seed bug. A fix lane should be armed per root cause in [`GAP_REGISTER.md`](GAP_REGISTER.md) §A.
