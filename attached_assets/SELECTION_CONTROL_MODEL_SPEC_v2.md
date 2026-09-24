# Selection-Control Model — Spec v2 (post-Phase-0 revision)

**Supersedes v1's starter sets.** Phase 0 revealed #462's real query is a scalar memo over four keys plus tags — the rich facet `Record` is inert. So the active selection controls must map only onto what actually filters today. The lean *interaction model* ships now; the rich per-template discrimination moves to the catalog-enrichment brief.

**Working keys (the only valid `filterMapping` targets for the active seed):**
`category` · `searchQuery` (keyword) · `priceRange` `[min,max]` · `minRating` · `tags` (the `selectedFilters[]` keyword-tags).

**Governing rule — forward-compatible model, working-seed-only surface.** The model and resolver (Phase 1, built) can express *any* dimension; foreign keys already degrade to `{}` no-op. So: author the model so it *can* hold rich controls, but only **seed and surface** controls that map to a working key. When enrichment lands the missing fields + engine support, the deferred controls light up by adding seed entries — no resolver change.

**Tag honesty.** A tag option is only valid if its value exists in the **live catalog tag vocabulary**. Do not invent dimension-flavored tags (`intensity:intense`). Verify each tag value against real catalog tags in Phase 2; if it isn't there, defer the control — don't fake it.

---

## Revised starter sets (working keys only — admin-editable)

Each set is 2–3 lean controls. Rich controls are listed as **[deferred]** with the condition under which they promote.

**Travel**
- "What are you in the mood for?" (multi) → Dining (`category:dining`) · Culture (`tags:[culture,history,art]`) · Outdoors (`tags:[outdoor,nature]`) · Nightlife (`tags:[nightlife]`) · Food experiences (`category:dining, tags:[food,culinary]`)
- "Budget?" (single) → `priceRange`: Budget `[0,50]` · Moderate `[0,150]` · Premium `[150,500]` · Splurge `[500,null]`
- "Quality bar?" (single) → `minRating`: Any · Highly rated `4` · Exceptional `4.5`
- **[deferred]** "How active?" (intensity) — no field; → enrichment.

**Wedding**
- "Which vendor?" (single) → `category`: planner · venue · photographer · videographer · florist · caterer · musician · cake · transport
- "Budget band?" (single, authored per category) → `priceRange` (e.g. photographer `[5000,50000]`)
- "Quality bar?" (single) → `minRating`: Any · `4` · `4.5`
- **[deferred]** "Style?" (classic/modern/rustic/luxe) — promote only if real style tags exist; else → enrichment.

**Corporate**
- "Service?" (single) → `category`: venue · AV/tech · catering · transport · accommodations *(facilitator/printing pending category seed → enrichment)*
- "Budget per head?" (single) → `priceRange`
- "Quality bar?" (single) → `minRating`
- **[deferred]** "Group size?" (capacity) — no field; this is corporate's priority enrichment.

**Date Night**
- "What's the plan?" (multi) → `category`: dinner · show/entertainment · drinks · activity
- "Budget?" (single) → `priceRange`
- **[deferred]** "Vibe?" — promote only if ambiance tags (romantic, etc.) exist; else → enrichment.

**Proposal**
- "Capture it?" (single) → `category`: photographer · videographer · none
- "Budget?" (single) → `priceRange`
- **[deferred]** "Setting?" (private/scenic/public) — no location key in the engine; promote via tags only if scenic/private tags exist; permit-coordinator category pending seed → enrichment.

**Birthday**
- "Service?" (single) → `category`: venue · catering · entertainment · décor · cake · photography
- "Budget?" (single) → `priceRange`
- **[deferred]** "Who's it for?" (age-suitability) — promote only if age tags (kids, etc.) exist; else → enrichment.

**Custom**
- "What are you looking for?" (single) → `category`
- "Budget?" (single) → `priceRange`

---

## Phase 2 — Seed the sets
Encode the working-key sets above. Before seeding any tag option, verify the tag value exists in the live catalog vocabulary; if absent, drop the control to deferred. Do not seed any `[deferred]` control into the active sets.
- **Gate:** every active option resolves to one of the five working keys; every seeded tag value exists in the real catalog vocab; zero true-dimension controls active; `resolveSelectionsToFilterQuery` emits a valid #462 query for each template; `tsc` clean.

## Phase 3 — UI swap
Replace the facet-wall UI with the selection controls from `getSelectionControls`. Same #462 engine underneath.
- **Gate:** selecting options narrows results via the #462 query; result parity with the equivalent old facet selection.

## Phase 4 — Verify reconcile integrity
- **Gate:** `git diff` shows #462's schema/migration/query memo untouched; selection is purely additive (config + resolver + UI); no hard-coded mappings.

## What NOT to do
- Do **not** seed controls that map to non-working keys — they go in the active set only after enrichment.
- Do **not** invent tags to back a control — tag values must exist in the live catalog vocab.
- Do **not** touch #462's query memo or schema — that's the enrichment brief's job, done deliberately.
- Do **not** drop the forward-compatible model capability — keep the resolver able to express rich dimensions for when enrichment lands.

> Deferred rich controls are scoped in `CATALOG_ENRICHMENT_BRIEF.md`. Do not start that work as part of this reconcile.
