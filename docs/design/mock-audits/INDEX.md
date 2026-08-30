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
