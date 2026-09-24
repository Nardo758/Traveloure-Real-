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
| 1 | **Matrix**: 818 triggers, 314 Tier-1 traced in full | [`ACTION_EFFECT_MATRIX.md`](ACTION_EFFECT_MATRIX.md) |
| 2 | **Machine-readable** (schema v1, stable, CI-gate input) | [`action-effect.json`](action-effect.json), [`action-effect.schema.json`](action-effect.schema.json) |
| 3 | **Journeys J1–J6**: a Mermaid flowchart each, broken edges red and dashed; screenshots, network log and DB diff per step | [`journeys/J1`](journeys/J1/README.md) · [`J2`](journeys/J2/README.md) · [`J3`](journeys/J3/README.md) · [`J4`](journeys/J4/README.md) · [`J5`](journeys/J5/README.md) · [`J6`](journeys/J6/README.md) |
| 4 | **Gap register**, sorted by severity and grouped by root cause (Addendum 2: 163 open, 31 P1 across 11 root causes) | [`GAP_REGISTER.md`](GAP_REGISTER.md) |
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
14. **794 of 818 matrix rows are marked `static`, 292 of them Tier 1.** Their `chain` fields are code readings at `file:line`, one hop deep.
    Downstream DB columns written through `storage.*` helpers are sometimes named from the helper, as each tracing
    pass noted. The two delegated placeholders (`TripLogisticsDashboard`, the slip anchor managers) were not traced.
15. **WIREFRAME_DIVERGENCE rows** compare against WIREFRAMES_COMPLETE_v2 and COMMERCE_WIREFRAMES_v4 as written in
    `attached_assets/`. **SELECTION_CONTROL_MODEL_SPEC_v2 was not in the repo**, at the base or on `origin/main`
    when checked. The rows that should cite it (experience-template selection controls) need a re-check once it lands.

## Addendum 2: UI sync pass (read-only)

| Item | Status | Where |
|---|---|---|
| **U1**: re-audit `plan-modal:*` against SELECTION_CONTROL_MODEL_SPEC_v2 | **BLOCKED: the spec is not in the repository.** I checked `attached_assets/`, `origin/main` (which advanced to `da1abc7` during the lane) and all 1,486 remote branches with `git ls-tree`, and searched the entire history with `git log --all --name-only`. The only matches are the code-side `shared/selection-control-seed.ts`, `shared/selection-controls.ts` and the gate files. No SPEC_DIVERGENCE row cites the document, because citing text I haven't read would be invented. The `{{BASE}}` placeholder in `GAP_REGISTER.md` **is fixed**. | this section |
| **U2**: screenshot every P1/P2 UI-class row | **Done.** 31 gap entries: **26 CONFIRMED, 2 REFUTED, 3 BLOCKED** (environment, each with a screenshot of the absence), plus **1 new P1** found while probing (RC-11, first chat message 404s). No P1/P2 UI row is static-only. | [`ui/U2_RESULTS.md`](ui/U2_RESULTS.md), `ui/<row-id>/` |
| **U3**: empty UI fields | Before: **592 of 818** rows had at least one empty field, **88 of them Tier 1**. After: **0 of 314 Tier-1 rows**. The 504 Tier-2 rows are one-liners by A2's definition and carry no UI contract fields. | `action-effect.json` (`ui.*`); patches in `journeys/harness/matrix-src/patches.json` |
| **U4**: traveler-path contact sheet | **Done.** 21 frames covering landing → each modal step and each exit → Discover → add → `/my-trips` → the slip, each annotated with the gap row ids visible in it | [`ui/CONTACT_SHEET.md`](ui/CONTACT_SHEET.md) |

**The matrix is now reproducible from the repo:**
- `node docs/audits/journeys/harness/build-matrix.mjs docs/audits/journeys/harness/matrix-src docs/audits/journeys/harness/matrix-src/patches.json 858d28f`
- then `node docs/audits/journeys/harness/build-gap-register.mjs`

## Out of scope, filed

Expert, provider and EA surfaces are pass two (FU-AE-2). Money-path fixes are observe-only (FU-AE-1). Nothing was fixed,
including the J1 seed bug. A fix lane should be armed per root cause in [`GAP_REGISTER.md`](GAP_REGISTER.md) §A.
