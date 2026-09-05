# `NavEntry.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/NavEntry.dc.html` (Nav · Experiences dropdown, "today")
**Live surface:** `client/src/lib/nav-config.ts` (`navGroupsConfig`), `client/src/components/layout.tsx`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-03-occasion-hygiene` > the artboard. This is a **dated "today" baseline** whose own pair (`NavTuned.dc.html`) is the target.
**v1 brief:** `wedding-nav-entry.audit.md` (1 divergence: this baseline is itself stale).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Four headings: **Travel & Getaways / Celebrations / Life Milestones / Group Events** | `client/src/lib/nav-config.ts:148,159,172,197` | **ALREADY-RULED — artboard superseded** | Live headings are `TRIPS` / `CELEBRATIONS` / `NIGHTS OUT & GETAWAYS` / `WORK`. The regroup landed by `2026-09-03-occasion-hygiene`, one day before this artboard was committed. Unchanged since the v1 brief. |
| 2 | "Travel Planning · Plan your perfect trip" under Travel & Getaways | `nav-config.ts:153` | MATCH (item), moved (section) | Same `name`/`href`/`description`; now under `TRIPS`. |
| 3 | Romantic Getaways / Date Night filed beside Travel Planning | `nav-config.ts:187`–`189` | ALREADY-RULED | Both moved to `NIGHTS OUT & GETAWAYS`; the ruling names this split as the specific thing it fixed. |
| 4 | "Birthday Party" alone under Celebrations; Wedding/Proposal/Engagement/Baby Shower/Anniversary under Life Milestones | `nav-config.ts:159`–`182` | ALREADY-RULED | All six now sit in one `CELEBRATIONS` section. Nothing was dropped. |
| 5 | Boys Trip / Girls Trip / Reunions under Group Events beside Corporate | `nav-config.ts:190`–`191`, `156` | ALREADY-RULED | Boys/Girls Trip → `NIGHTS OUT & GETAWAYS`; Reunions → `TRIPS`; only corporate work remains under `WORK`. |
| 6 | Footnote "Today each item opens a browse page. In the centralized flow each item opens the plan with the occasion already set." | `nav-config.ts:169`–`176`; `client/src/components/layout.tsx:385`–`405` | **PARTLY CLOSED, deliberately** | The Wedding row now carries a generic `featured` flag whose hover/focus button opens the plan (`layout.tsx:399`). The row's **link is untouched** — browsing is still what the item itself does. So the artboard's "each item opens the plan" is answered for exactly one leaf, by design (`2026-09-04-wedding-entry-doors`): a second featured row is a one-line data change, not a renderer change. |

## Classification

- **(A) contained:** none — this artboard is a superseded baseline; auditing toward it would *undo* a ratified reorg.
- **(B) needs a ruling:** none. (Whether a second nav leaf should be `featured` is a data decision the renderer already supports; not a divergence.)
- **(C) ruled omission / correct as is:** #1–#5 (superseded by `2026-09-03-occasion-hygiene`), #6 (one featured leaf by ruling).

**Not verifiable without a running server:** the hover/focus-only reveal of the featured CTA (opacity transition) — asserted by source, not exercised here.
