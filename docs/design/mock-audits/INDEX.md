# Mock audit briefs — live code vs ratified mocks

One brief per design mock under `docs/design/`, written 2026-08-29 (repo state: post-#621, `main`
≈ `6ed99a9f`'s merge). Each brief tells an auditing agent exactly what the mock ratifies, where the
live code lives, how to check it, and — critically — which divergences are **already ruled on** and
must be reported as state, never "fixed".

## Rules of engagement for the auditor

1. **Authority ordering varies per mock and is stated at the top of each brief.** For most mocks the
   ledger ruling text wins over both code and pixels. For `chrome-alignment` the merged code wins
   over the mock (post-merge reconstruction). Never assume; read the brief's Status line.
2. **Report, don't repair.** The deliverable is a findings list (mock section → live file:line →
   match / divergence / already-ruled). Do not change code, tests, or mocks during the audit.
3. **§13 honesty is a behavior, not styling**: several mocks ratify that sections are *omitted*
   when data is absent (never zero-filled, never guessed). Absence of a row can be correct.
4. **Stale mock furniture is flagged in the briefs** — several mocks carry "nothing built yet"
   footers or pre-supersession layouts from their sign-off date. The briefs name each one.
5. Dead routes in this app return **200 + HTML (Vite catch-all), not 404** — never use a 404 probe
   as a "route missing" signal.

## The briefs

| Brief | Mock | Family |
|---|---|---|
| `grounded-plan-card-mock.audit.md` | grounded itinerary card (Item 2) | Aug 22–23 merged |
| `grounded-ai-slips-mock.audit.md` | catalog + DMO grounding (Item 2 P1) | Aug 22–23 merged |
| `grounding-affiliates-mock.audit.md` | affiliate rung, §16-safe (Item 2 P2) | Aug 22–23 merged |
| `content-history-timeline-mock.audit.md` | admin content history (provenance Move 3) | Aug 22–23 merged |
| `optimizer-catalog-mock.audit.md` | optimizer approved-only + destination-scoped catalog | Aug 22–23 merged |
| `optimized-slip-review-mock.audit.md` | optimizer results / slip review | Aug 22–23 merged |
| `ready-made-by-theme-mock.audit.md` | Ready-Made centered on theme/experience | Aug 22–23 merged |
| `storefront-discovery-mock.audit.md` | storefront reachability + partner-card rule | Aug 22–23 merged |
| `concierge-revision-mock.audit.md` | Concierge revision flow (P1/P2 surfaces) | Concierge |
| `concierge-revision-p3-mock.audit.md` | admin dispute + no-self-serve-refund + listing promise | Concierge |
| `adopt-optimization-mock.audit.md` | build-around-a-location + adopt flow (**split: shipped vs pending**) | Optimizer |
| `chrome-alignment-mock.audit.md` | chrome earn-grammar reskin, Variant A | Chrome |
| `marketplace-experts-earn-grammar-mock.audit.md` | earn-grammar transcription (+ SPEC/BENTO oracles) | Marketplace |
| `landing-earn-mock.audit.md` | landing page earn grammar (+ LANDING_SPEC) | Landing |
| `pricing-surfaces-mock.audit.md` | pricing surfaces (+ Trip-Pass CTA re-point ratified) | Pricing |
| `provider-console-mockup.audit.md` | provider console: Catalog / Workstation / Distribute / create wizard | Console |
| `service-creation-mock.audit.md` | delivery-method-branched create wizard | Console |
| `service-creation-audit.audit.md` | the Aug 12 audit artifact, recast as re-verify checklist | Console |
| `create-flow-refinements.audit.md` | one-card Basics, ideas rail, post-publish nudge | Console |
| `catalog-preview-mock.audit.md` | Catalog Manage/Preview toggle + map preview | Console |

### Wedding / occasion flow (Phase A of `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md`, 2026-09-04)

The 13 `surface exists — UNAUDITED` rows in `docs/design/wedding-flow/README.md`'s Fidelity
column, audited in the README's own flow order. Unlike the briefs above, each of these merges
the "what to check" brief and its findings into ONE file (the task that produced them asked for
that shape) — there is no companion `.report.md`.

| Brief | Mock | Family |
|---|---|---|
| `wedding-before.audit.md` | Moments section today (7 keys, no wedding) | Wedding / Landing |
| `wedding-main.audit.md` | Landing page with Wedding added as an 8th moment | Wedding / Landing |
| `wedding-nav-entry.audit.md` | Nav · Experiences dropdown "today" (stale baseline) | Wedding / Landing |
| `wedding-nav-tuned.audit.md` | Nav · tuned-by-activity regroup (**already shipped**) | Wedding / Landing |
| `wedding-step1-occasion.audit.md` | Plan modal step 1 · Occasion | Wedding / Plan modal |
| `wedding-modal-where.audit.md` | Plan modal step 2 · Where (`ModalWhere.dc.html` — the naming hides that this IS step 2) | Wedding / Plan modal |
| `wedding-step3-when.audit.md` | Plan modal step 3 · When (event class) | Wedding / Plan modal |
| `wedding-step3-day.audit.md` | Plan modal step 3 · a day, not a range | Wedding / Plan modal |
| `wedding-step4-who.audit.md` | Plan modal step 4 · Who | Wedding / Plan modal |
| `wedding-step4-variants.audit.md` | Four occasions, one control (the `vocabulary` switch) | Wedding / Plan modal |
| `wedding-planner.audit.md` | `/start/events` · three doors | Wedding / Other |
| `wedding-travel-where.audit.md` | Golf trip · Where (ordered stops) | Wedding / Other |
| `wedding-travel-when.audit.md` | Golf trip · When (range only) | Wedding / Other |
| `wedding-travel-events.audit.md` | Golf trip · step 5 (tee times) | Wedding / Other |
| `wedding-guests.audit.md` | Guests · one list, a column per event | Wedding / Other |

**Headline findings from this family** (see each brief for evidence):
- **No stepped wizard exists.** All six `Step*`/`ModalWhere` plan-modal artboards describe one
  multi-step modal (a persistent Occasion/Where/When/Who/What's-happening rail with "Next: X"
  progression) that is not built in any shape. The real live planning entry
  (`client/src/contexts/PlanningContext.tsx`) is a 2-tier chooser, and its "Plan with AI" branch
  (`EnhancedPlanningModal.tsx`) is one unstepped scrolling form with a hardcoded 5-value occasion
  list — unrelated to the real 22-row `experience_types` catalog. A SEPARATE, unstepped dialog
  (`client/src/components/trip/edit-trip-panel.tsx`, reached only from the Trip Strip/cart
  header/experience-template empty state — never the primary "Plan this moment" entry) DOES
  correctly implement the real occasion-switch logic (day-vs-range dates, the `vocabulary` noun
  switch, server-preset schedule chips) that several of these mocks draw — just not inside a
  step rail.
- **`Guests.dc.html`'s cited live surface was wrong.** `participant-travel-tracker.tsx` (the
  README's pointer) has zero consumers anywhere in the client — confirmed unmounted, matching the
  project's own prior diagnosis in `docs/DECISIONS.md` row `2026-09-04-guest-list-reconciliation`.
  The real, reachable guest surface is `client/src/components/GuestInviteManager.tsx`, a
  single-event invite list with no per-event columns at all. The same ledger row independently
  states the mock's "column per event" layout "cannot yet be drawn honestly" pending an
  unratified schema proposal — this is the family's biggest, and best-documented, gap.
- **`/start/events` still has only its old two supply-side doors.** `Planner.dc.html`'s own
  footer names the bug it exists to fix ("only (b) and (c) existed, so a couple… was sent to
  sell"); `start-events.tsx` still has exactly those two doors and no traveler/host option.
- **`NavTuned.dc.html`'s "proposal" already shipped.** The activity-grouped nav (Trips /
  Celebrations / Nights out & getaways / Work) is live on `main`, landed by ledger
  `2026-09-03-occasion-hygiene` — one day before this mock family was committed. `NavEntry.dc.html`
  ("today") is therefore the stale one of the pair.
- **Golf trips resolve to the generic `travel` occasion**, whose `default_schedule` switch is
  `false` — so `TravelEvents.dc.html`'s entire tee-times step is switched OFF for the occasion it
  depicts, even though the schedule-chip mechanism itself is built and correct.

## Cross-cutting cautions (surfaced while writing the briefs)

- **Stale "not built yet" footers**: `concierge-revision-p3-mock` and `grounded-ai-slips-mock` both
  say nothing is built — both lanes are fully merged. The footers date from sign-off.
- **`catalog-preview-mock`'s map view is superseded**: its on-Catalog authoring toolkit (pin/route/
  radius editing) was moved into the create flow's spatial step by a later ruling; Catalog's map is
  read-only preview. Do not audit toward the mock's toolkit.
- **CLAUDE.md §22 wording vs later ruling**: "Catalog is the map's authoring home" was amended —
  the briefs carry the current state; where §22 and the console brief disagree, the brief's cited
  ledger row governs. Likewise §24's "Logistics" step was renamed (Bring/Access now sits on the
  step currently labeled Scheduling); behavior unchanged.
- **`optimized-slip-review`**: the ledger's "V3 flagged outstanding" note may be stale — client
  scaffolding for 3 variants exists; verify end-to-end rather than trusting either source. Mock
  testids are illustrative; the real pattern is dynamic (`proposal-preview-${variantId}`).
- **`storefront-discovery`**: the mock's "More from @seller" row was ratified AGAINST at the time;
  a later ruling (`2026-08-25-card-source-link`) introduced the below-card source row that exists
  today — it arrived by a different lane. Also surface (don't resolve) the `/p/:handle` vs
  `/s/:handle` naming drift.
- **Duplicate mock copy**: `docs/testing/mock/service-creation-mock.html` differs from the
  `docs/design/` copy; the `docs/design/` one is the audited artifact.
- **`pricing-surfaces`**: the Trip-Pass CTA now routes authed users to `/dashboard` with a
  pick-a-trip toast (PR #621) — ratified divergence from the mock's stub, not a bug.
- **`adopt-optimization`**: audit only the "Shipped — audit now" list; the dispatched/pending items
  (V3 client completion, server R-A/B/C, `anchor-format.ts`) are known-absent by design today.
- **Ledger lag**: rows `2026-08-29-trip-pass` and `2026-08-28-single-planning-entry` are not yet in
  `docs/DECISIONS.md` (queued for the docs pass); their PR bodies (#621, #619) carry the text.
