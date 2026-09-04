# Audit brief — NavEntry (Nav · Experiences dropdown today)

**Mock:** `docs/design/wedding-flow/NavEntry.dc.html`. The navbar's "Experiences ▾" mega-menu as a
4-column grid: **Travel & Getaways** (Travel Planning, Romantic Getaways, Date Night, Retreats),
**Celebrations** (Birthday Party), **Life Milestones** (Wedding — highlighted, Proposal,
Engagement Party, Baby Shower, Anniversary), **Group Events** (Corporate Events, Corporate
Retreats, Boys Trip, Girls Trip, Reunions). Every item shows an icon, a bold label, and a
description subtext line. Footer note: "Today each item opens a browse page. In the centralized
flow each item opens the plan with the occasion already set."
**Status:** Labelled "today" (a baseline snapshot), meant to set up NavTuned's proposed
re-grouping. **This baseline is stale relative to `main`** — see Known divergences.
**Live surfaces:**
- `client/src/lib/nav-config.ts` — the `navGroupsConfig` data, specifically the `"Experiences"` group (lines 102–162)
- `client/src/components/layout.tsx:280-395` — the dropdown's render logic

## What the mock ratifies (as a baseline)

1. A 4-column mega-menu grouped by internal class: Travel & Getaways / Celebrations / Life
   Milestones / Group Events.
2. Wedding sits under "Life Milestones", visually highlighted (teal wash background).
3. Every item shows icon + label + one-line description.
4. Clicking an item opens a browse page (not yet the centralized plan-opening flow).

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| 4-section grouping: Travel & Getaways / Celebrations / Life Milestones / Group Events | `nav-config.ts:102-162` | **DIVERGENCE — stale baseline, already superseded** | Current `navGroupsConfig["Experiences"]` groups by **TRIPS / CELEBRATIONS / NIGHTS OUT & GETAWAYS / WORK** (`nav-config.ts:118-160`), per ledger `2026-09-03-occasion-hygiene` — a ruling dated one day *before* this mock's Sep-4 commit. The mock's "today" grouping had already been replaced on `main` by the time this file was committed; it documents a state that predates the reorg, not the live one. |
| Wedding under "Life Milestones", highlighted | `nav-config.ts:128-139` | PARTIAL MATCH | Wedding is real (now under "CELEBRATIONS", not "Life Milestones") and is the first item in its section, but nothing in `layout.tsx` gives any single item special highlight styling (no per-row highlight/CTA logic exists at all — see the NavTuned brief). |
| Icon + label + description subtext per item | `layout.tsx:328-345` | CONDITIONAL MATCH | The code renders a description **only when `sections.length <= 2`** (`layout.tsx:345`, `child.description && sections.length <= 2`). Experiences now has 4 sections, so descriptions are suppressed live — the mock's 4-section-with-descriptions layout is not a state the current code path ever produces; only a ≤2-section group shows descriptions today. |
| "Today each item opens a browse page…" footer note | *(no live equivalent — a design-process annotation, not a UI element)* | N/A | This is meta-commentary in the mock itself (comparing to the planned "centralized flow"), not a UI element to audit for a match. |

## Already ruled

- The 4-section reorg is **ruled** — ledger `2026-09-03-occasion-hygiene` (cited in `nav-config.ts:106-117`), which explicitly replaced the exact grouping this mock draws ("Romantic Getaways" and "Date Night" filed beside "Travel Planning" under one heading, "Birthday Party" alone under Celebrations, Boys/Girls Trip under Group Events beside corporate work — the mock's own layout, named verbatim in the ruling's own before-description) with the activity-based TRIPS/CELEBRATIONS/NIGHTS OUT/WORK split NavTuned.dc.html draws. So this mock is not merely unaudited — it depicts a state the repo's own commit history says was intentionally replaced.

## Not built

- Per-item highlight/hover-CTA styling (e.g., a featured "Start a plan" affordance) does not exist anywhere in `layout.tsx`'s dropdown renderer — every item in a section renders identically. See the NavTuned brief, where the mock's proposed version of this same affordance is also unbuilt.
