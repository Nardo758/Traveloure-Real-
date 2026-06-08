# Traveloure — Experience Template Per-Template Audit (UPDATED June 4, 2026)

**Scope:** every seeded experience type, scored on complexity profile vs. actual structure (tabs / steps / logistics presets).

**Note on prior audit (file `073a9432-EXPERIENCE_TEMPLATE_PER_TEMPLATE_AUDIT.md`):** That audit reflected an earlier state of the codebase where most templates were thin/empty. The codebase has been substantially built out since then. This document reflects current state with **22 of 23 templates now having real structure**.

---

## Current state: Tab counts per template

Verified by counting top-level `TabDef` objects in `server/seeds/experience-template-tabs.seed.ts`:

| Slug | Type | Tabs | Complexity Match? |
|---|---|---|---|
| **bachelor-bachelorette** | HIGH | **7** | ✅ Strong |
| **anniversary-trip** | MEDIUM | **7** | ✅ Over-built (good) |
| **travel** | MEDIUM | **6** | ✅ Strong |
| **wedding** | VERY HIGH | **6** | 🟡 Reasonable (but complex needs more) |
| **birthday** | LOW | **6** | 🟡 Over-built for complexity |
| **corporate-events** | EXTREME | **6** | 🟡 Reasonable (extreme needs more) |
| **retreats** | HIGH | **6** | ✅ Strong |
| **sports-event** | (orphan) | **6** | ❌ Tabs but no core type! |
| **date-night** | LOW | **5** | 🟡 Over-built |
| **wedding-anniversaries** | MEDIUM | **5** | ✅ OK |
| **boys-trip** | HIGH | **5** | 🟡 Slightly thin |
| **girls-trip** | HIGH | **5** | 🟡 Slightly thin |
| **reunions** | MEDIUM | **5** | ✅ OK |
| **holiday-party** | LOW | **5** | 🟡 Over-built |
| **proposal** | LOW (critical) | **4** | ✅ Appropriate |
| **baby-shower** | LOW | **4** | 🟡 Slightly over-built |
| **graduation-party** | LOW | **4** | 🟡 Slightly over-built |
| **engagement-party** | LOW | **4** | 🟡 Slightly over-built |
| **housewarming-party** | LOW | **4** | 🟡 OK |
| **retirement-party** | LOW | **4** | 🟡 OK |
| **farewell-party** | LOW | **4** | 🟡 OK |
| **career-achievement-party** | LOW | **3** | 🟡 OK |
| **corporate** | EXTREME | **0** | ❌ EMPTY (duplicate of corporate-events) |
| **romance** | LOW | **0** | ❌ EMPTY (overlap with date-night) |

**Total:** 24 types, 22 with tabs (2 empty, 1 orphan tabs without core type)

---

## Real issues found (current state)

### A. Three core/tabs slug mismatches (REAL BUGS)

1. **`corporate` has no tabs** — Core type defined in `seed-experience-types.ts:91-104` (sortOrder 6) but **no `corporateTabs` matches it**. The tab seed only registers `corporate-events`. Users picking "Corporate" land in an empty shell while "Corporate Events" works.

2. **`romance` has no tabs** — Core type defined at `seed-experience-types.ts:58-72` (sortOrder 4) but no `romanceTabs` exists. The intended overlap with `date-night` (also LOW complexity, joint payment) was apparently meant to be filled by date-night patterns, but the type was never wired.

3. **`sports-event` is an orphan** — Tabs defined (6 tabs!) but **no core type entry** in `seed-experience-types.ts`. Users won't see it as a pickable type even though the tab structure exists.

### B. Anniversary duplication (REAL DUPLICATE)

- **`anniversary-trip`** — 7 tabs (couples-focused, romantic getaway)
- **`wedding-anniversaries`** — 5 tabs (party-focused)
- Original audit mentioned a third "orphaned `anniversary` tab" — but no such third type currently exists. Just 2 anniversary variants.

Both are legitimate (trip vs. party), but the names are confusing. Consider:
- `anniversary-trip` → "Anniversary Trip" (current)
- `wedding-anniversaries` → "Anniversary Party" (rename) for clarity

### C. Romance vs Date Night overlap (UNRESOLVED)

Both are: LOW complexity, joint payment, low timing, flexible contingency, 2 people.
- `romance` has 7 template steps (in core seeder) but **0 tabs**
- `date-night` has 5 template steps + 5 tabs

**Recommendation:** Remove `romance` from core types and let date-night cover the use case. Or keep romance, fix it with tabs, and differentiate (date-night = single evening; romance = romantic weekend/getaway).

### D. Logistics presets — STILL nearly absent

This audit finding is still TRUE. Searching for logistics presets/anchors:
- Only `proposal` has anchor preset patterns
- Only `date-night` has anchor/day-boundary presets
- 22 other types have **no logistics hub presets** — directly undercuts the "experience template = DIY logistics hub" vision

### E. "Empty party shells" claim — RESOLVED

The original audit claimed 7 party types were "empty skeletons with 0 tabs." All have been built out:
- graduation-party: 4 tabs ✅
- engagement-party: 4 tabs ✅
- housewarming-party: 4 tabs ✅
- career-achievement-party: 3 tabs ✅
- retirement-party: 4 tabs ✅
- farewell-party: 4 tabs ✅
- holiday-party: 5 tabs ✅

**The 7 empty shells from the prior audit no longer apply** — they were filled in subsequent commits.

---

## Updated priority order

### High priority (real bugs)

1. **Fix `corporate` empty type** — Two options:
   - A: Remove `corporate` from core types (it duplicates `corporate-events`)
   - B: Add `corporateTabs` definition (apply 6 tabs from corporate-events)
   - **Recommended:** Remove `corporate`, keep `corporate-events` as the canonical name

2. **Wire `sports-event` core type** — The 6 tabs exist but no users can pick it.
   - Add `{ slug: "sports-event", name: "Sports Event", ... }` to `coreExperienceTypes` array
   - Or remove the orphan tabs if not intended

3. **Resolve romance vs date-night** — Decide:
   - Remove `romance` (it duplicates date-night)
   - Or add romance tabs and differentiate (single date vs weekend)

### Medium priority (improve complexity-match)

4. **Add logistics presets** — Build anchor/sequencing/contingency presets for:
   - **Wedding** — ceremony anchor + vendor sequencing + weather contingency
   - **Corporate-events** — session anchor + approval gates + budget tracking
   - **Bachelor/bachelorette** — group coordination + payment splits + transportation
   - **Wedding-anniversaries** — milestone celebration tracking

5. **Beef up wedding** — Currently 6 tabs is reasonable, but for VERY HIGH complexity, consider adding:
   - "Ceremony" (separate from Venues to anchor timing)
   - "Day-Of Coordination" (timeline + contingency)
   - "Guest Experience" (separate from accommodations: welcome bags, schedule, gifts)

6. **Beef up corporate-events** — For EXTREME complexity, add:
   - "Approval/Budget" tab (multi-stakeholder corporate flow)
   - "Speaker/Session" (timing anchor)
   - "Sponsor Coordination" if applicable

### Low priority (refinements)

7. **Trim over-built party types** — Some LOW-complexity party types have 4-5 tabs which is more than needed. But this is a "nice to have" — over-built is better than under-built.

---

## Summary

The codebase has evolved significantly past the prior audit:
- **Old state:** 24 types · ~3 complete · ~9 thin · ~9 empty/duplicate
- **New state:** 24 types · 22 with tabs · 1 empty (`corporate`) · 1 empty (`romance`) · 1 orphan (`sports-event` has tabs but no type)

**Real remaining issues (not the original 7):**
1. `corporate` empty (duplicates corporate-events) — fix or remove
2. `romance` empty (duplicates date-night) — fix or remove
3. `sports-event` orphan (tabs without type) — wire it or remove tabs
4. Logistics presets still missing for 22 of 24 types
5. Wedding + corporate-events could use richer anchor/contingency structure for their EXTREME complexity

**Not the original "invert the effort" problem anymore.** The work to fill out thin templates has been done; the remaining gaps are duplicates, orphans, and logistics-preset depth — not complexity inversion.
