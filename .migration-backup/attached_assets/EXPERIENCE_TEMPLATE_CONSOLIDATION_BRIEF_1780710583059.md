# Experience-Template Input Consolidation — Execution Brief

**Goal:** collapse the three diverging input-control regions (hero-card fields, filters, tabs) onto a **single per-template DB definition**, and retire the hardcoded generic layer. This kills, in one architecture: the two-input-controls doubling, the wrong field framing (Adults/Kids), the irrelevant Origin City on local events, the generic filters, the tab-slug mismatches, and the silent wedding fallback.

**Status:** launch-*quality*, runs in **parallel** — own branch, does not touch concierge / launch-blocker code, does not gate the concierge go-live. Floor: 140. Schema phases are single-session.

**Root cause (from the audit):** two sources of truth. `experienceConfigs` (hardcoded, `experience-template.tsx:650-952`) drives rendered tabs + the hero card + the generic Region-2 filters. `experience_template_tabs` (DB seed, `server/seeds/experience-template-tabs.seed.ts`) drives the Region-3 `TemplateFiltersPanel` — wired for only 2 templates. They've diverged. The DB already holds tabs + filters for all templates; the hardcoded layer is the divergent, incomplete one.

---

## HOW TO USE — READ FULLY FIRST
Phases 0 → 5 in order. Each ends with a grep + `tsc` gate (≤140) and a commit (`feat(EXP-TPL.Pn): …`). Schema phases (2) single-session. The engine is built once (Phases 2–3); template correctness rolls out incrementally (Phase 4) so it can ship template-by-template, not big-bang. File:line refs may have drifted — confirm by reading.

## GLOBAL "WHAT NOT TO DO"
- **One source of truth.** Do not leave any input region (hero fields, filters, tabs) reading from a hardcoded per-template map once the engine is live. If tabs come from the DB and hero fields from TS, you've just rebuilt the divergence.
- **Region 3 replaces Region 2 — they must not coexist.** The doubling you see is both filter panels rendering; the generic Region-2 panel is retired, not aligned.
- Do not touch concierge / launch-blocker code or routes. Do not add to `server/routes.ts`.
- Do not exceed the 140 floor.

---

## PHASE 0 — Pre-flight (no code)
Map exactly what exists vs what must be authored:
1. Read `experience-template.tsx`: the hardcoded `experienceConfigs` (:650-952), the fallback (`:1262` `experienceConfigs[slug] || experienceConfigs.wedding`), the `hasTemplateTabs` gate (`:1336`), the Region-2 generic Filters & Sort variants (flights/hotels/generic), the Region-3 `TemplateFiltersPanel` mount, and `VENUE_TYPE_CONFIG` / `TAB_FALLBACK_CONFIG`.
2. Read the DB side: `experience-template-tabs.seed.ts` + the `experience_template_tabs` table schema. Confirm **tabs + filters are already seeded for all live templates** (they are, per audit) and that **hero-card field definitions are NOT in the DB** (Region 1 is the only data to author).
3. Confirm the doubling: which templates render both Region 2 and Region 3 today (expected: bachelor-bachelorette, anniversary-trip).
4. Capture the live template list from the nav menu and bucket it:
   - **Local-event** (Origin City irrelevant, "Adults/Kids" wrong): Date Night, Birthday, Wedding*, Proposal, Engagement Party, Baby Shower, Anniversary, Corporate Events
   - **Trip** (travelers + Origin City genuinely apply, mostly fine): Travel Planning, Romantic Getaways, Retreats, Boys Trip, Girls Trip, Reunions, Corporate Retreats
   - *Wedding = Origin City *optional* (destination weddings), not hidden.

**Gate:** state-map written: what's in the DB, what must be authored (hero fields), the doubling templates, and the bucketed live list. No code.

---

## PHASE 1 — Immediate safety: loud fallback + hide-unready (cheap, ship first)
**Objective:** stop the silent wedding-serve for any template without a config, independent of the engine.

**Steps**
1. Replace the silent `|| experienceConfigs.wedding` fallback (`:1262`) with a **loud** path: a slug with no definition errors / redirects / renders a clear "not available" state — never silently serves the Wedding layout.
2. Hide/disable any template not in the live nav menu (e.g. `sports-event`) so it isn't reachable by direct URL either.

**Acceptance:** navigating to an unconfigured slug does not render the Wedding template; unready templates aren't reachable.

**Gate:** `grep -n "experienceConfigs.wedding\|sports-event" client/src/pages/experience-template.tsx` ; `tsc --noEmit` ≤140.
Commit: `fix(EXP-TPL.P1): loud fallback for unconfigured templates, hide unready`

---

## PHASE 2 — Schema: per-template input definition (single-session)
**Objective:** one DB definition per template that covers all three regions.

**Steps**
1. Extend the existing template model (the `experience_template_tabs` / `experienceTypes` schema) to add the **hero-field layer** (Region 1): per-template field config — which fields show, their labels, and any context fields. e.g. `headcountLabel` ("# of guests" / "Party size" / "# of attendees"), `showOriginCity` (hide / optional / required), `showKids` (bool), and a `contextFields[]` list (e.g. birthday→"Who's it for?"+age; bachelor→"Guest of honor?"; baby-shower→"Due date?"+theme; corporate→"Company/team name?"+format).
2. Tabs + filters already live in `experience_template_tabs` — confirm, don't duplicate.
3. Migration. Single source: the engine reads tabs, filters, AND hero fields from this one definition.

**Acceptance:** schema can express, per template, the hero-field set + labels + relevance + context fields, alongside the existing tabs/filters. Migration generated.

**Gate:** `grep -rn "headcountLabel\|showOriginCity\|contextFields" shared/` ; `tsc --noEmit` ≤140.
Commit: `feat(EXP-TPL.P2): per-template hero-field config on the template definition`

---

## PHASE 3 — Engine: render all three regions from the definition
**Objective:** the UI reads the per-template definition for every region; the hardcoded/generic layer stops driving anything.

**Steps**
1. **Hero card (Region 1):** render fields from the definition — headcount label, show/hide/optional Origin City, kids field, and the context fields. No hardcoded "Adults/Kids".
2. **Tabs:** render from the DB tab definition. Stop reading the tab list from `experienceConfigs`.
3. **Filters (Region 2 → 3):** render `TemplateFiltersPanel` (Region 3, DB-driven) for **all** templates — **remove the `hasTemplateTabs` gate** (`:1336`) and make it dynamic (render when the template has DB tab/filter defs, i.e. always). **Retire the generic Region-2 Filters & Sort** so there is exactly one filter UI — no doubling.
4. **Venue search:** resolve `VENUE_TYPE_CONFIG` / `TAB_FALLBACK_CONFIG` from the DB tab defs so no tab slug returns undefined.

**Acceptance:** for any live template, hero fields, tabs, and filters all render from the DB definition; exactly one filter panel renders (doubling gone); no `experienceConfigs` tab/field/filter reads remain in the render path.

**Gate:** `grep -n "hasTemplateTabs\|experienceConfigs\[" client/src/pages/experience-template.tsx` (expect the render path no longer depends on them) ; `tsc --noEmit` ≤140.
Commit: `feat(EXP-TPL.P3): render hero/tabs/filters from the single template definition`

---

## PHASE 4 — Incremental rollout: author per-template configs (ordered by visible brokenness)
**Objective:** flip each live template from generic to correct by seeding its definition. Tabs/filters already exist; this is mostly authoring the hero-field config.

**Order**
1. **Local-event templates first** (the visibly-broken ones): hide Origin City (Wedding = optional), set headcount label to "# of guests", drop the kids field where it makes no sense, add the context fields. Date Night, Birthday, Wedding, Proposal, Engagement, Baby Shower, Anniversary, Corporate Events.
2. **Trip templates next:** keep Origin City, relabel headcount where useful ("Party size" for Boys/Girls Trip, "# of attendees" for Corporate Retreats), otherwise minimal.
3. **Filter enrichment:** confirm each template's DB filters (group-size capacity, alcohol-friendly, dress code, reservation-required, etc.) now surface via the unified panel; align any tab-slug mismatches (bachelor `transportation`, anniversary `itinerary-builder`) so the rendered tabs match the definition.

**Acceptance:** each live template shows correct hero fields, contextual filters, and aligned tabs. Spot-check a local event (Origin City gone, "# of guests", context field present) and a trip (Origin City present, party-size label).

**Gate:** per-template visual/spot check + `tsc --noEmit` ≤140. Commit per batch: `feat(EXP-TPL.P4): seed <batch> template input configs`

---

## PHASE 5 — Retire the hardcoded layer (separate cleanup commit)
**Objective:** remove the now-dead source of truth so it can't re-diverge.

**Steps**
1. Once all live templates render from the DB, delete the `experienceConfigs` tab/field/filter definitions and the generic Region-2 filter variants. Keep the loud fallback from Phase 1.
2. Separate commit from feature work.

**Acceptance:** no hardcoded per-template input definitions remain; the engine + DB are the only source.

**Gate:** `grep -rn "experienceConfigs" client/src/` (expect only the loud-fallback default, if any) ; `tsc --noEmit` ≤140.
Commit: `chore(EXP-TPL.P5): remove hardcoded experienceConfigs layer (single source)`

---

## FINAL CHECKLIST
- [ ] Unconfigured slug → loud, never silent Wedding.
- [ ] Hero fields, tabs, filters all render from ONE per-template DB definition.
- [ ] Exactly one filter panel renders — the doubling is gone.
- [ ] Local-event templates: no Origin City, correct headcount label, context fields present.
- [ ] Trip templates: Origin City kept, sensible headcount label.
- [ ] Hardcoded `experienceConfigs` input layer deleted.
- [ ] `tsc --noEmit` ≤140 after every phase. No concierge/launch-blocker code touched.

## NOTES
- This is parallel/launch-quality — none of it blocks the concierge go-live. But land Phase 1 (loud fallback) and the local-event batch of Phase 4 before driving real traffic to the event templates, since Origin City on a baby shower reads as broken.
- New templates added later auto-inherit the engine — define their DB config and they render correctly, no code change. That's the payoff for consolidating now at 15 live templates rather than hardcoding each.
