# Prompt — Phase 3: LocationView completion + embed-swap + add-to-experience

**Read this entire brief before writing any code. Work in strict phase order (A → B → C). Do not skip the verification gates. Build against the attached `PHASE3_WIREFRAME_LocationView.md`.**

## Context
Decision #5 = **Replace**: LocationView becomes the single city page, replacing CityDetailView's 7 tabs. The corrected mapping is **5 sections, with Media and AI Insights as their OWN sections** (your earlier audit found 9 AI subcards + ~180 lines of media UI — folding them into the hero loses content). Kyoto has real Phase-1b neighborhood data — use it to test live, not Paris.

---

## ⛔ WHAT NOT TO DO
- **Do NOT delete or stop rendering CityDetailView** until Phase B's content-parity check passes. Retire by **redirect**, not deletion.
- **Do NOT fold Media or AI Insights into the hero.** They are their own sections (§7, §8 of the wireframe). Carry the full UI over.
- **Do NOT build Paris (or any new-market) neighborhood data** in this brief — that's a separate later task.
- **Do NOT** change the commission/fee code, the orchestrator, or the verify harness.

---

## Phase A — Make LocationView content-complete (before any swap)
1. Audit LocationView against the wireframe's sections §1–§9. Output a checklist: which exist, which are missing.
2. Build the missing sections. **Critical:** Media gallery (§7) and Insights (§8) as their own sections — carry over **all** of CityDetailView's media UI (~180 lines) and **all 9** AI insight subcards verbatim. Do not summarize or drop any.

**Verification gate (before Phase B):**
- `npm run check` → 0 new errors.
- Render LocationView for **Kyoto**. Produce a **content-parity table**: each of CityDetailView's 7 original tabs (Overview, Hidden Gems, Recommendations, Happening Now, Live Activity, Media, AI Insights) → the LocationView section that now carries it. **Every row must resolve to a non-empty section.** If any is missing/empty, fix before proceeding.

## Phase B — Embed-swap
3. Find where **CityGrid** and **GlobalCalendar** mount `CityDetailView`. Mount `LocationView` in those contexts instead.
4. Add a redirect `/city/:slug` → the LocationView route. **Leave `CityDetailView.tsx` in the codebase** — just stop routing to it and redirect. Old deep-links must resolve, not 404.

**Verification gate:**
- `npm run check` clean.
- CityGrid and GlobalCalendar render LocationView; `/city/:slug` redirects; an old deep-link resolves.

## Phase C — Add-to-experience action
5. Wire **"Add to experience"** on every supply and gem card. Extend the **existing** "Add to trip" dialog so it can target **experience templates** (wedding/proposal/etc.), not only raw trips. Write target: `user_experience_items.scheduled_date` within the experience's `start_date`/`end_date`.

**Verification gate:**
- From a Kyoto supply card, add an item to an experience template; confirm it persists and reads back on the template.

---

## Done = all true
- [ ] LocationView renders all wireframe sections, incl. **Media + Insights as their own sections** (full UI carried over).
- [ ] Content-parity table green — all 7 old tabs map to a non-empty section.
- [ ] CityGrid + GlobalCalendar embed LocationView; `/city/:slug` redirects; **CityDetailView.tsx retained** (not deleted).
- [ ] Add-to-experience persists from a live Kyoto card.
- [ ] `npm run check` clean.
- [ ] Paris fill NOT touched (separate task).
