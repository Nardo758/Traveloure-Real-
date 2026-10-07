# Step 8c — Phase 0 re-check (Track A, read-only)

> Written 2026-10-06 by Track A for `docs/planning/briefs/step-8-brief.md` revision 3.1, section "8c — Retirements" (items
> 22–23 and the 8c fixture gates).
>
> **Base:** `main` `8dd5f747afca63ac87f44cb3c86f3583f612729c` (`bash scripts/check-lane-base.sh 8dd5f74` → OK). It includes
> 8a (R346), 8b-1 (R348), 8b-2 (R352) and Events through R351.
>
> **Nothing was built:** no product code, no migration, no commit, no branch. `file:line` refers to that base.
>
> Where the code and the brief disagree, the code is right; each case is marked **Brief ≠ code**. The Events session's
> concierge-pool PR takes the next number ahead of 8c.

**Migrations:** none. 8c is deletions plus client and test edits.

**tsc:** none of the files 8c deletes carries a TypeScript error at this base (checked against the full `tsc --noEmit`
error list), so the baseline stays at 117. The ratchet in `build.yml:249–264` fails if the count drops below the
baseline, and it will not drop.

---

## A. The template page is unreachable (FU-8B2-1)

- **Nothing imports `client/src/pages/experience-template.tsx` (3,412 lines)** anywhere in `client/`, `shared/`, `server/`
  or `scripts/`. There are no static, relative or lazy imports. `ExperienceTemplatePage` appears only at its own
  definition (`:757`).
- 8b-2 re-routed `/experiences/:slug` (`App.tsx:614`) and `/:slug/new` (`:617`) to `ExperiencesPage`.
- **FU-8B2-1 (`FOLLOWUPS.md`)** records exactly this and names 8c as the lane that deletes the page. 8c closes it.
- **What still names the page without importing it:**
  - **The surface key `experience-template`** in `shared/content-surface-map.ts:82–87` (path `/experiences/:slug/new`),
    plus `:102` and `:110`. Also an icon in `client/src/pages/admin/content-mapping.tsx:39`, and the analytics literal
    `searchContext: "experience-template"` (`client/src/lib/analytics.ts:15`; server `routes.ts:6427`). These are runtime
    vocabulary, not file reads. Server placement rules may key on them. (decision 5)
  - **Comments only** in `PlanningContext.tsx`, `trip-context.ts`, `trip-slip.ts`, `create-comparison.ts`, `cart.tsx`,
    `shared/service-filter.ts` and `shared/selection-controls.ts`. Their wording goes stale; nothing fails.

## B. The delete closure — Brief ≠ code: 21 files, ~11,400 lines, not two

The brief names the page's planning features, its dead Sheets and dialogs, its scripted expert chat, its cart UI,
`experience-map.tsx`, and the two "View in Trip Planner" links. Because the page is now unrouted, deleting the
**whole page** removes all of those. With the page gone, the modules below are imported by nothing else.

| file | lines | only importer |
|---|---|---|
| `pages/experience-template.tsx` | 3412 | none (A) |
| `components/experience-map.tsx` | 677 | template `:79`; the last `<ExperienceMap` mount is `:3019` ✓ |
| `components/experience/itinerary-preview-panel.tsx` | 177 | template `:80` |
| `components/expert-chat-widget.tsx` | 373 | template `:81` (the scripted chat) |
| `components/compact-filter-bar.tsx` | 210 | template `:87` |
| `components/add-custom-venue-modal.tsx` | 250 | template `:88` |
| `components/travelpayouts/FlightPriceGrid.tsx` | 332 | template `:89` (and the barrel) |
| `components/travelpayouts/FlightCard.tsx` | 95 | FlightPriceGrid `:36` (and the barrel) |
| `components/travelpayouts/HotelCard.tsx` | 76 | template `:98` (and the barrel) |
| `components/travelpayouts/ActivityCard.tsx` | 113 | template `:97` (and the barrel) |
| `components/hotel-search.tsx` | 969 | template `:90` |
| `components/service-browser.tsx` | 327 | template `:91` |
| `components/activity-search.tsx` | 749 | template `:92` |
| `components/ai-itinerary-builder.tsx` | 1130 | template `:93` |
| `components/trip-transport-planner.tsx` | 1083 | template `:94` |
| `components/fever-events-section.tsx` | 406 | template `:95` |
| `components/venue-search-panel.tsx` | 411 | template `:96` |
| `components/venue-card.tsx` | 151 | venue-search-panel `:3` |
| `components/destination-transfers-section.tsx` | 245 | template `:119` |
| `lib/template-pen.ts` | 53 | template `:109` (and one test) |
| `lib/template-external-add.ts` | 166 | template `:120–124` (and one test) |

- **`components/travelpayouts/index.ts`** (a barrel with no importer) re-exports four of these. It also re-exports
  `CarRentalCard`, `ESimCard`, `TransferCard`, `GroundTransportCard`, `InsuranceCard`, `LuggageStorageCard`,
  `NomadRouteCard` and `BookWithExpertButton`, which are used elsewhere and stay. (decision 4)
- **Kept, because something else uses them:**
  - all of `components/ui/*`;
  - `ESimCard` (`pages/itinerary.tsx`);
  - `curated-content-section` (`discover.tsx`, `spontaneous-discovery.tsx`);
  - `BookWithExpertButton`;
  - `useAgentBooking` / `use-content-agent-booking`;
  - `@shared/cart-content-line` (`cart.tsx` and the server);
  - `shared/service-filter.ts`, `selection-control-seed.ts` and `selection-controls.ts` (the seed and
    `scripts/verify-selection-controls.ts`).
- **Brief items, located inside the page** (all removed with it):
  - **"The three that can never open"** ✓, and the code says why:
    1. Cart Sheet `:2265`: only `setCartOpen(false)` is ever called (`:1468, :2325, :2357`).
    2. AI Optimization Sheet `:3243`: nothing sets `aiOptimizeOpen` true.
    3. AI Itinerary Builder Dialog `:3321`: `openAiItineraryBuilder` (`:1627`) is never called.
  - **Brief ≠ code:** not every dialog is dead. The destination prompt (`:3377`) and `AddCustomVenueModal` (`:3301`, button
    `:2783`) can open. They go with the page anyway.
  - **Scripted chat:** `<ExpertChatWidget>` at `:3262` with `onRequestExpert={() => {}}`. It gives a canned reply via
    `setTimeout` and an invented "Sarah … 2–3 minutes" (`expert-chat-widget.tsx:68, :84`).
  - **"View in Trip Planner":** `:2136`, label at `:2143` ✓. **Brief ≠ code:** the link at `:3078` reads "View Trip →".
  - **Planning features:**
    - `AIOptimizationTab` (`:559`);
    - six `openPlanModal` doors;
    - `createComparison` (`:1416`);
    - `<TripTransportPlanner>` (`:2377`);
    - the `writeTemplatePen` calls.

## C. The cart (item 23) — Brief ≠ code: six trip-less writers, not four

**No client caller ever sends a `tripId` to `POST /api/cart` or `POST /api/cart/items`.** Every write site is trip-less.
The server route `server/routes.ts:9692` (and `/api/cart/items`, `:7295`) accepts `tripId` as optional.

| call site | surface | in the brief? | 8c |
|---|---|---|---|
| `experience-template.tsx:1684` | Experiences, partner pick (via `template-external-add.ts`) | the template's partner path ✓ | **deleted** |
| `experience-template.tsx:1760` | Experiences, signed-in service/custom-venue | `:1730` ✓ | **deleted** |
| `cart.tsx:733` | Discover guest-pending migration | ✓ #1 | held |
| `cart.tsx:1059` | cart upsell | ✓ #2 | held |
| `visa-help.tsx:144` | visa help | ✓ #3 | held |
| `itinerary-comparison.tsx:1112` (`/api/cart/items`) | comparison upsell | ✓ #4 | held |
| **`service-detail.tsx:687`** | service add when no `targetTripId` | **not named** | decision 2 |
| **`service-detail.tsx:877`** | room add when no `targetTripId` | **not named** | decision 2 |

- **The template's "guest fallback" comment (`:1729–1730`) is wrong**, as the brief says. `addToCart` returns early for a
  signed-out user (`:1645–1655`), so only a signed-in member with no plan ever reaches the cart write.
  - **Brief ≠ code:** a custom venue **always** goes to the cart, even with a plan in hand (`:1735`).
  - The page also PATCHes and DELETEs cart rows from its own cart UI (`:1681, :1716, :1784, :1797`). All of that goes with
    the page.
- **The "Discover guest-pending migration" posts from `cart.tsx:733`**, reading `traveloure_guest_cart_pending`.
  Discover itself only writes localStorage (`discover.tsx:1314–1323`).
- **The two `service-detail.tsx` sites look unreachable but are in the source.**
  - `beginAdd` sends a guest to sign-in (`:1097–1100`) and a member with no plan to the plan picker (`:1103–1106`).
  - So `targetTripId` should be set by the time the mutation runs, but nothing makes the cart branch impossible by
    construction.
  - A static guard sees them either way.
- **A seventh, flag-off writer:** `POST /api/itinerary-comparisons/:id/apply-to-cart` (`itinerary-comparison.tsx:1084` →
  `routes.ts:10791`) replaces a user's cart with a variant's items. It answers 410 while its flag is off, and its button is
  hidden unconditionally (`:2504–2510`). It writes `cart_items` and is trip-less. (decision 2)
- **Not writers:**
  - `/api/cart/migrate` (`App.tsx:1340`, `SignInModal.tsx:65`) re-owns existing guest rows.
  - `/resolve-trip` and `/convert-to-itinerary` attach or convert lines.
- **No guard enumerates cart writers today.** The closest is `rc2-add-to-plan.test.ts` S1/S4/S5 (`:89–120`), which are
  per-file negatives. `artifacts/traveloure/**` is a stale mirror with its own copies, so any guard must be scoped to
  `client/src`.
- **The 8c fixture "the trip-less callers are exactly the four … a fixed list that can only shrink":** a source scan over
  `client/src/**/*.{ts,tsx}` (excluding `__tests__`) for POSTs to `/api/cart` and `/api/cart/items`, keyed by **file +
  enclosing mutation/function name** (never line numbers), against a frozen allowlist where a file's count may fall but
  never rise.
  - **Negative space:**
    - It cannot see a URL built in a variable or a new helper wrapping `apiRequest`. A companion assertion pins that
      the literal `"/api/cart"` appears only in allowlisted files and in read/invalidate sites.
    - It ignores GETs, query keys, PATCH, DELETE, `/migrate`, `/resolve-trip`, `/convert-to-itinerary`, `/fee-preview`,
      comments and `artifacts/**`.

## D. Every test, guard and workflow that reads a deleted file as text

**Whole test files that exist only for the template** (delete as a unit):
1. `client/src/lib/__tests__/map-no-city-center-fallback.test.ts`:
   - It does `await import` of `experience-map` (`:35`; C1–C5 `:47–96`).
   - It reads the template, the map (`:40–41`) and `venue-search-panel` (`:135`) as text (S1–S5 `:101–170`).
   - `resolveMapCenter` has no other user.
2. `client/src/lib/__tests__/template-plan-door.test.ts`: module-level `read(...)` of the template (`:58`); C1–C3, L1–L2,
   D1–D3, R1–R4, S1 (`:73–193`).
   - **One case outlives the page:** L2 (`:114`) checks that `/plans/:tripId` is a registered route. It is already covered by
     `cart-checkout-redirect.spec.ts` C (`:101–111`). (decision 3)
3. `client/src/lib/__tests__/template-external-add.test.ts`: imports the deleted module (`:33`); C1–C4, T1/T2, P1/P2, K1,
   I1, L1, G1–G7.

**Scoped edits — only the template's cases or lines go:**

| file | what reads a deleted file | edit |
|---|---|---|
| `client/src/lib/__tests__/occasion-read-only.test.ts` | static import of `template-pen` (`:58`), which fails the whole file at load; `read` of the template in C6 (`:160`) | drop the import; delete `describe("G5 — reading a template page…")` (`:97–139`: C3, C4, C4b); remove C6's page lines (`:160–163`), keep its plan-modal/PlanningContext pins |
| `client/src/lib/__tests__/plan-entry-source-fields.test.ts` | `TEMPLATE` read at describe-collection time (`:47, :68`) | delete `describe("S1/S2 — the experience template's doors are ONE door")` (`:67–100`, 3 cases) and the constant |
| `client/src/lib/__tests__/expert-request-review.test.ts` | W4 reads the template (`:201`) | remove W4's template half (`:198–205`), keep the concierge half |
| `client/src/lib/__tests__/rc12-party-size.test.ts` | S7 reads the template (`:170`); **S8 reads `ai-itinerary-builder.tsx` (`:181`)** | delete S7 and S8 |
| `client/src/lib/__tests__/rc7-new-plan-visible.test.ts` | R4 lists `ai-itinerary-builder.tsx` among doors that refresh plan lists (`:58`) | remove that one entry |
| `shared/__tests__/occasions.test.ts` | O6's `files` array includes the template (`:201`) | remove the entry, keep `content.routes.ts` |

**Guards:**
- **`scripts/check-planning-entry.cjs`:**
  - `REQUIRED_SOURCE_FIELDS` entry for the template (`:147–151`, requires `experienceSlug`) fails "listed … but does not
    exist" (`:330`). **Remove it.**
  - Its self-test uses the template path as a fixture key: D13 cases `:587/:588` (`TEMPLATE` `:552`). Once the entry is
    gone, `:588` turns red (no error is produced). **Re-point both to a surviving `require` surface, or drop them**
    (decision 3).
  - Afterwards the live `experienceSlug` requirement rests on `/experiences` (which requires `experienceSlug`, `city` and
    `country`) and the concierge door.
- **`scripts/page-hex-baseline.json:26`** (`"experience-template.tsx": 3`): **does not fail**, because `check-page-hex`
  only iterates files that exist (`:121`). Remove it for hygiene.

**Unaffected:**
- `server/__tests__/occasion-read-only.db.test.ts:151` and `hero-card-date-range.test.ts` (comments only).
- `hardcoded-links.spec.ts` (reads only `App.tsx`).
- `plan-comparison-ref.test.ts` / `map-scene.test.ts` (negative regexes still pass).
- `playwright/tests/content-system.spec.ts:172`, which names `fever-events-section.tsx`. Its raw-open check returns early
  when the file is missing (`:190–193`); its hook check would read a missing file. The spec is **not wired into any
  workflow**. (decision 3)
- `playwright/tests/paris-surfacing.spec.ts:37` mentions `service-browser` in a comment only.
- `docs/audits/action-effect.json` and the journey-harness JSON name `add-custom-venue-modal` / `compact-filter-bar` as
  audit snapshots. They are not run in CI.

**CI workflow lines that name deleted test files** (`.github/workflows/build.yml`):
- `walkthrough-pins` runs `map-no-city-center-fallback` at `:992`.
- `guard-batch` runs `template-plan-door` at `:3383`.
- Both files are also caught by the `unit-suite-client-lib` glob (`:2946`).
- Removing those two run lines is a workflow edit, not a test edit.
- The `plan-entry-source-fields` job comment (`:2332–2336`) mentions "three experience-template doors".

**Sanctioned-edit count this implies:**
- 3 whole test files deleted;
- 6 test files with scoped edits (9 test cases or blocks in all);
- 1 guard (`check-planning-entry.cjs`: the list entry and two self-test cases).

The decision-maker sanctions the exact list.

## E. Server routes left with no client caller (NOT deleted in 8c)

Once the closure goes, these handlers have no `client/src` caller:
- `/api/catalog/booking`, `/flights` and `/search` (`content.routes.ts:1631, 1402, 1276/1324`);
- `/api/amadeus/locations` (`:3361`);
- `/api/cache/hotels` and `/activities` (`:3562, 3594`);
- `/api/transport-packages/generate` (`:4098`);
- `/api/ai/generate-optimized-itineraries` and `/api/ai/itineraries/…` (`:5096, 5232, 5384`);
- `/api/venues/search` and `/wedding-vendors` (`:6605, 6638`).

Two more lose their client caller but are named by guards:
- `/api/custom-venues` (`:1079–1187`) is named in `check-query-userid-reads.cjs`.
- `/api/transport-options` (`transport-hub.routes.ts:500, 533`) is in the mutation-auth extractor test.

`GET /api/provider-services` is used by `e2e/supply-demand/s1-provider-publish.spec.ts` and stays. An orphan pass over
these is a separate lane (decision 6).

## Not proven

- The closure is a grep of `@/` and relative imports. A module reached only through a string (a dynamic
  `import(\`${x}\`)`) would not show up; none was seen.
- I did not run any test for this Phase 0.
- I did not verify the "unreachable" `service-detail.tsx` cart branches at runtime.

## Decisions the lane needs (not taken here)

1. **Scope of the delete.** The page is unrouted, so removing the brief's named features one by one would leave a dead page
   with the rest still in it.
   - **Recommend:** delete the whole page and the 21-file closure (B). That closes FU-8B2-1.
2. **The trip-less cart writers.** There are six live writers (the brief's four plus `service-detail.tsx:687, :877`) and the
   flag-off `apply-to-cart`.
   - **Recommend:**
     - Freeze the allowlist at the six as they stand, so the list can only shrink.
     - Record all six, plus `apply-to-cart`, in `FOLLOWUPS.md` against G2.
     - Leave the two `service-detail` branches **untouched** in 8c. Deleting them changes a booking path, which is not this
       lane's to rule.
3. **The test edits in D.** These are the 3 deleted files, the scoped edits in 6 files, and the `check-planning-entry`
   entry plus its two self-test cases.
   - **Recommend:** sanction exactly that list.
     - Re-point D13 `:587/:588` to the concierge surface (`destination` + `experienceSlug`) rather than dropping them.
     - Drop L2 (already covered).
     - Leave the unwired `content-system.spec.ts` as is, since its missing-file branch already passes.
4. **The `travelpayouts` barrel.** **Recommend:** remove its four dead exports and keep the barrel for the eight live
   cards.
5. **The `experience-template` surface key and analytics literal.**
   - **Recommend:** keep them in 8c. They are runtime vocabulary that server placement rules may read.
   - Add a FOLLOWUPS entry to retire them with a content-mapping check.
6. **The 13 server routes left with no client caller.**
   - **Recommend:** a FOLLOWUPS entry for an orphan pass, not 8c. 8c deletes client code only.
