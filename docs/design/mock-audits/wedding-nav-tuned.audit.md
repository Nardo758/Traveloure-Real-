# Audit brief — NavTuned (Nav · tuned by class, proposal)

**Mock:** `docs/design/wedding-flow/NavTuned.dc.html`. A re-grouped Experiences dropdown, 4
columns with NO description subtext: **Trips** (Travel Planning, Retreats, Honeymoon, Reunions),
**Celebrations** (**Wedding** — highlighted with a "Start a plan →" hover affordance, Engagement
Party, Wedding Anniversary, Baby Shower, Birthday Party, Proposal), **Nights out & getaways** (Date
Night, Romantic Getaway, Anniversary Trip, Girls Trip, Boys Trip), **Work** (Corporate Events,
Corporate Retreats). Footer: "Browse all occasions" link + "Grouped by what you're doing. Each
occasion's switches live on its row, not in the menu."
**Status:** Labelled "proposal" in the mock, but **this proposal has already shipped on `main`** —
see Findings. Treat this as a MATCH audit, not a pending-build one.
**Live surfaces:**
- `client/src/lib/nav-config.ts:102-162` — `navGroupsConfig["Experiences"]`
- `client/src/components/layout.tsx:280-395` — dropdown render logic

## What the mock ratifies

1. Four columns grouped by **activity**, not internal class: Trips / Celebrations / Nights out &
   getaways / Work.
2. No description subtext (compact rows, icon + label only).
3. Wedding is visually featured within Celebrations with a distinct hover CTA ("Start a plan →").
4. Footer states the grouping principle and explicitly disclaims switch behavior living in the
   menu ("each occasion's switches live on its row, not in the menu").

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Four sections: Trips / Celebrations / Nights out & getaways / Work | `nav-config.ts:118-160` | **MATCH — already built** | Live section titles are `TRIPS`, `CELEBRATIONS`, `NIGHTS OUT & GETAWAYS`, `WORK` — verbatim (case aside) match to the mock, landed by ledger `2026-09-03-occasion-hygiene`. |
| Trips: Travel Planning, Retreats, Honeymoon, Reunions | `nav-config.ts:118-127` | MATCH | All four present in that order. |
| Celebrations: Wedding, Engagement Party, Wedding Anniversary, Baby Shower, Birthday Party, Proposal | `nav-config.ts:128-139` | MATCH | All six present; live order is Wedding, Engagement Party, Wedding Anniversary, Baby Shower, Birthday Party, Proposal — identical to the mock. |
| Nights out & getaways: Date Night, Romantic Getaway, Anniversary Trip, Girls Trip, Boys Trip | `nav-config.ts:140-152` | MATCH | All five present (live label is "Romantic Getaways" plural vs. mock's "Romantic Getaway" singular — trivial wording, not a structural divergence). |
| Work: Corporate Events, Corporate Retreats | `nav-config.ts:153-160` | MATCH | Both present. |
| No description subtext in a 4-section grid | `layout.tsx:328-345` (`child.description && sections.length <= 2`) | MATCH | With 4 sections the guard is false, so descriptions never render — exactly the mock's compact look. |
| "Grouped by what you're doing… switches live on its row, not in the menu" | `nav-config.ts:106-117` (code comment) + CLAUDE.md Locked Decision 28 | ALREADY-RULED / MATCH | The comment states this exact principle almost verbatim, and the underlying fact (occasion behavior lives on `experience_types`' six switch columns, migration 276) is Locked Decision 28. |
| Wedding row highlighted with a "Start a plan →" hover CTA | `layout.tsx:280-395` (full dropdown render block) | **DIVERGENCE** | No per-item highlight or hover-CTA exists anywhere in the render logic — every `child` in a `section.items` array renders through the same `sharedClass`/`inner` template (`layout.tsx:328-374`) with no special case for any single item, Wedding included. |

## Already ruled

- The 4-section activity grouping is **built and ratified** (`2026-09-03-occasion-hygiene`) — not merely matching the mock, it *is* the mock's shipped form. Do not treat this brief's MATCH rows as pending work.
- "Switches live on the row, not the menu" is Locked Decision 28 (migration 276) — the nav intentionally carries no per-occasion behavior logic.

## Not built

- The Wedding-row featured treatment ("Start a plan →" hover affordance) is the one piece of this mock not reflected in code. It is cosmetic/UX polish, not a data or routing gap — nav-config.ts already has everything a highlight would need (the Wedding row is a normal, fully-linked entry at `/experiences/wedding`).
