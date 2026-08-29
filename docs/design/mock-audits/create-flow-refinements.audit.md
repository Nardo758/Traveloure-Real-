# Audit brief — Create-flow refinements (one-card Basics, ideas rail, post-publish nudge)

**Mock:** `docs/design/create-flow-refinements/mockup.html` (open in a browser; four tabs: 1 ·
One-card Basics, 1a · Before an offering is picked, 2 · Workstation ideas rail, 3 · Post-publish
nudge). `mockup-*.png` are the four states as static captures
(`mockup-1-one-card-basics.png`, `mockup-1a-picker-state.png`, `mockup-2-ideas-rail.png`,
`mockup-3-post-publish-nudge.png`). Live-verification screenshots at build time were
`final-*.png` in `docs/testing/assets/provider-batch-run2/` — reference those as evidence of the
built state rather than re-capturing.
**Ledger:** `docs/DECISIONS.md` ledger row 114 (this mock, "supersedes artifact d1c16852's
two-card Basics"), row 113 (Workstation vs Catalog — inspiration lives on the creation area), row
112 (Q4 autosave — the rider on offering-type deep-link beating a stale checkpoint)
**Status:** Ratified and implemented same session as ratification (Aug 14, 2026) — not a
proposal awaiting a build.
**Live surfaces:**
- `client/src/pages/provider/workstation.tsx` (ideas rail, `?offeringTypeKey=` deep-link)
- `client/src/components/ServiceForm.tsx` (one-card Basics header, "See ideas on Workstation"
  post-publish nudge copy)
- `client/src/pages/provider/service-form.tsx`, `client/src/pages/expert/service-form.tsx`
- `client/src/lib/earn-roles.ts` (taglines sourced from the /earn catalog rows)

## Behaviors the mock ratifies

1. **One-card Basics:** once an offering is picked, its identity (name, category chip, tagline)
   becomes the Basics card's HEADER with a single "Change" button — the separate "What are you
   offering?" card, the "Create New Service" heading, and the locked Category pseudo-input are
   retired as separate elements.
2. **Verification/review banners move to a top-of-step notice stack**, never inserted between
   form fields — same posture as the account-verification banner pattern used elsewhere.
3. **The pre-pick full-catalog picker is deliberately UNCHANGED** — it stays the "moment of
   maximum receptivity" browsing surface; picking a offering collapses it into the header from
   behavior 1, and "Change" brings the full picker back.
4. **"Ideas for your business" rail lives on Workstation** (ruling 113 — inspiration belongs on
   the creation area, not Catalog). Suggestions are sourced ONLY from the categories the provider
   REGISTERED for and has NOT yet listed, max 6, round-robined across categories, taglines pulled
   verbatim from the /earn catalog rows (§13 — nothing invented copy-wise).
5. **The rail hides entirely when there is nothing honest to suggest** — no filler tiles, no
   "explore more" fallback once every registered category is listed.
6. **Each idea tile deep-links `?offeringTypeKey=` into a pre-seeded create flow** — clicking an
   idea does not just navigate to a blank Basics screen, it starts the flow with that offering
   already selected.
7. **An explicit `?offeringTypeKey=`/`?category=` entry BEATS a stale autosave checkpoint** — the
   checkpoint is SKIPPED for that entry, not deleted, so a provider who abandons the deep-linked
   draft and returns normally still finds their autosave intact.
8. **Post-publish nudge is ONE LINE, not a catalog.** While a listing is `In review`, Listing Home
   shows a single nudge line naming up to two catalog siblings and pointing back at the
   Workstation rail — it never interrupts or duplicates the checklist above it.

## Visual grammar

- `.explain` boxes at the top of each tab describe "what changed" in the mock's own words — these
  are the ratified-behavior statements to check against, not incidental captions.
- The picker view (tab 1a) is explicitly labeled unchanged; do not audit it for regressions
  introduced by this mock — only confirm it still exists and still reaches the one-card Basics
  header on selection.

## How to audit

1. `grep -n "offeringTypeKey" client/src/pages/provider/workstation.tsx client/src/components/ServiceForm.tsx`
   — confirm the query param is read on both ends (rail emits it, form consumes it to pre-seed).
2. Open Workstation as a provider with at least one registered-but-unlisted category — confirm
   the "Ideas for your business" rail renders tiles only from that gap, capped at 6, and that a
   provider who has listed every registered category sees no rail at all (not an empty-state
   card).
3. `grep -rn "earn-roles\|/earn" client/src/pages/provider/workstation.tsx` — confirm idea tile
   taglines are sourced from the shared /earn catalog data, not a separate hardcoded string list
   (this is the §13 "nothing invented" check).
4. Start a service via an idea tile, abandon it mid-flow, then start ANOTHER draft normally
   (no query param) — confirm the normal draft's autosave checkpoint is intact (ledger row 112's
   rider: the deep-link skips the checkpoint for itself, it does not clear it globally).
5. Open the Basics step with an offering already selected — confirm the card header shows name +
   category chip + tagline + one "Change" control, and that clicking Change returns to the full
   picker rather than a partial/inline edit.
6. Submit a listing for review and open Listing Home — confirm exactly one nudge line appears
   (not a list/grid) naming category siblings, and that it disappears once the listing leaves
   `In review`.

## Known divergences / notes

None recorded.
