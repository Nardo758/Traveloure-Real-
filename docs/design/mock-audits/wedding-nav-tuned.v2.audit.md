# `NavTuned.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/NavTuned.dc.html` (Nav · tuned by activity + a featured Wedding row)
**Live surface:** `client/src/lib/nav-config.ts`, `client/src/components/layout.tsx`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-03-occasion-hygiene` (the regroup) + `2026-09-04-wedding-entry-doors` (the featured CTA).
**v1 brief:** `wedding-nav-tuned.audit.md` (already shipped; the CTA landed as a generic `featured` flag).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Section **Trips**: Travel Planning, Retreats, Honeymoon, Reunions | `nav-config.ts:148`–`157` | **MATCH — same four, same order** | |
| 2 | Section **Celebrations**: Wedding, Engagement Party, Wedding Anniversary, Baby Shower, Birthday Party, Proposal | `nav-config.ts:159`–`182` | **MATCH — same six, same order** | |
| 3 | Section **Nights out & getaways**: Date Night, Romantic Getaway, Anniversary Trip, Girls Trip, Boys Trip | `nav-config.ts:184`–`195` | MATCH (order + membership) | Live label is "Romantic Getaway**s**" (plural). Paraphrase; meaning unchanged. |
| 4 | Section **Work**: Corporate Events, Corporate Retreats | `nav-config.ts:197`–`204` | MATCH | |
| 5 | Wedding row carries a **"Start a plan →"** hover/focus CTA | `nav-config.ts:169`–`176`; `layout.tsx:385`–`406` | **MATCH** | `featured: { source: { experienceType:"wedding", experienceSlug:"wedding" } }`. Label is `featured.cta ?? START_PLAN_LABEL` = **"Start a plan"** (`plan-vocabulary.ts:74`), with an `ArrowRight` — the artboard's words and its arrow. `data-testid="button-nav-featured-wedding"`. |
| 6 | The CTA is a *second* control beside the link, not a replacement | `layout.tsx:376`–`404` | MATCH | The `<Link>` still routes to `/experiences/wedding`; the button is a sibling that calls `planning.open(featured.source)` and closes the menu first. |
| 7 | The CTA appears on hover/focus only | `layout.tsx:391`–`393` | MATCH — and **correctly not `hidden`** | `opacity-0 … group-hover/featured:opacity-100 focus:opacity-100 focus-visible:opacity-100`, with the stated reason (`layout.tsx:368`–`371`): `display:none` would take it from assistive tech. This is the ruled posture applied precisely. |
| 8 | The featured door lands on **step 2** with an occasion pill | `plan-steps.ts:119`–`134`; `plan-modal.tsx:390`–`403`, `936`–`949` | MATCH | Both `experienceType` and `experienceSlug` are passed, both resolve against the seeded row, so `resolvePlanSteps` returns `startStep:"where"` and the pill renders "Wedding · change". |
| 9 | Footer link **"Browse all occasions"** under the dropdown | — (no such element in `nav-config.ts` / `layout.tsx`) | **DIVERGENCE** | The dropdown has no all-occasions footer link. The equivalent exists on the landing Moments section only (`moments-section.tsx:126`, "All occasions →"). |
| 10 | Footnote "Grouped by what you're doing. Each occasion's switches live on its row, not in the menu." | `nav-config.ts:136`–`147` | MATCH (as intent) | Stated verbatim as the section's rationale comment; it is annotation, not UI. |

## Classification

- **(A) contained:** #9 — add a "Browse all occasions" footer item to the `Experiences` group in `client/src/lib/nav-config.ts` (one leaf, `href: "/experiences/travel"`, matching `moments-section.tsx:126`), or a group-level footer slot in `client/src/components/layout.tsx`.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #3 (plural label), #10 (annotation).

**Not verifiable without a running server:** the hover reveal and keyboard focus order of the featured CTA.
