# Audit brief — Optimized Slip Review

**Mock:** `docs/design/optimized-slip-review-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-slip-optimize-bulk`, `2026-08-22-slip-optimize-review-first`, `2026-08-22-slip-review-copy`, `2026-08-23-optimizer-three-variants` (variant-count ratification)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `client/src/pages/itinerary-comparison.tsx` (exists — confirmed to render baseline + up to 3 AI variants dynamically via `aiVariants.map(...)`, with skeleton placeholders for `3 - aiVariants.length` pending slots while generating — i.e. the client is already wired for THREE AI variants, not two)
- `client/src/components/plancard/SlipView.tsx` (per ledger `2026-08-22-slip-optimize-review-first`; not independently existence-checked in this pass — confirm during audit)
- `client/src/lib/slip-proposal-preview.ts` (per ledger; confirm during audit)
- `client/src/lib/optimization-gate.ts` (per ledger `2026-08-22-slip-optimize-bulk`; confirm during audit)

## Behaviors the mock ratifies

1. The slip's own action row (Step 1) carries "Optimize this plan" — owner-only, greyed out with a reason when there is nothing to optimize (0 optimizable items or missing destination/dates, §13). It does NOT auto-apply — tapping it only builds proposals and lands the traveler on the review page (review-first, not auto-apply, per `slip-optimize-review-first`).
2. "Add all to checkout (N)" exists in the same toolbar as a separate action from Optimize — a client loop over the existing per-item routing endpoint, filtered to `in_planning` items only.
3. Review board shows **exactly baseline + 3 AI proposals** (ratified THREE by `2026-08-23-optimizer-three-variants`) — not two. A generating state shows skeleton placeholders for the still-pending AI slots.
4. Each AI proposal shows a preview chip strip ABOVE the card: money-saved (green "save" chip) or cost-more (amber "caution" chip, said plainly — never hidden), and/or shorter-drive-time (green chip, time only, never distance headlined per §21 L3).
5. §13 omission rule: a chip is shown ONLY when there is a real baseline to compare — no baseline total ⇒ no money claim; not-both-variants-located ⇒ no drive-time claim. The baseline/current-plan column itself shows NO chips at all (comparing itself to itself is not a claim).
6. "Riverside Focus" (V2 in the mock) shows a money chip but no drive-time chip, illustrating the §13 omission in practice — a stop wasn't located, so the delta is honestly left off rather than guessed at.
7. A cost-increasing proposal ("Fewer Hops"/V3) shows "Costs $40 more" plainly beside its time-saving chip — direction is always honest, a pricier proposal is never dressed up as a win.
8. Trending/seasonal context strip (`slip-optimize-preview-context`, `preview-trending-now`, `preview-seasonal`) sits above the board, sourced from live TravelPulse queries; each line disappears when there's nothing real to show (§13).
9. Applying a proposal requires a confirm dialog ("Apply <proposal> to your plan?") stating: this replaces items still in planning, the other proposals are discarded, purchased items stay pinned, nothing is purchased by applying. No proposal auto-applies on click alone.
10. Footer copy states plainly: "Applying a variant updates the slip in place — the other two are discarded. Nothing is purchased by applying." (Note: with 3 AI variants, "the other two" refers to the two NOT chosen among the three, not a fixed count of 2 total.)
11. Purchased items are pinned/retained across all proposals (2 in the mock's exclusions line); items held by an expert (`with_expert`) are excluded from optimization entirely.
12. Applying rides the existing `apply-to-trip` mutation (`POST /api/itinerary-comparisons/:id/select`), a single deliberate click, atomic apply.

## Visual grammar

- Chip semantics: `--save-fg/-bg` (money/time saved, green), `--caution-fg/-bg` (costs more, amber) — a two-color honesty vocabulary distinct from the four-rung provenance-pill system used on the grounded-plan-card/affiliate mocks; do not conflate the two palettes.
- `.card.recommended` gets an accent border + lifted shadow — one proposal may be visually promoted as "Recommended," others are plain cards; the baseline/current-plan card is visually de-emphasized (dashed border, muted surface-2 background, `.card.current`).
- Bricolage Grotesque + Public Sans + IBM Plex Mono — same type system as `optimizer-catalog-mock.html` (both are part of the optimizer-family mocks).
- The confirm dialog is a modal `alertdialog` with explicit focus trap and Escape-to-close — accessibility pattern worth confirming exists in the shipped confirm-to-apply flow (not just visually, but as a real focus-managed dialog).

## How to audit

1. Confirm the client renders three AI variants, not two:
   `grep -n "aiVariants.length < 3\|3 - aiVariants.length\|aiVariants.map" client/src/pages/itinerary-comparison.tsx` — expect evidence of a 3-slot board (already spot-checked: lines ~2067–2107 show a 3-slot skeleton/map pattern). If this instead caps at 2, that is a live divergence from the ratified `2026-08-23-optimizer-three-variants` ruling — flag it.
2. Confirm review-first (no auto-apply from the slip's Optimize button):
   `grep -n "autoApply" client/src/pages/itinerary-comparison.tsx client/src/components/plancard/SlipView.tsx` — expect `SlipView`'s `runComparison` to NOT append `?autoApply=1` (cart's path may still use it — that's an explicit, ratified scope boundary, not a bug).
3. Confirm the §13 omission logic for chips:
   `grep -n "proposal-preview-money\|proposal-preview-drivetime" client/src/pages/itinerary-comparison.tsx` and inspect the surrounding conditional (already spot-checked: lines ~662–690) — confirm the money/drivetime spans render only under a real-baseline / both-located guard, referencing `client/src/lib/slip-proposal-preview.ts`.
4. Confirm the trending/seasonal context testids exist and are conditionally rendered:
   `grep -n "slip-optimize-preview-context\|preview-trending-now\|preview-seasonal" client/src/pages/itinerary-comparison.tsx` (already confirmed present at lines ~1751–1765).
5. Confirm the footer honesty copy:
   `grep -n "compare-footer\|Nothing is purchased by applying" client/src/pages/itinerary-comparison.tsx` (already confirmed present at line ~1827).
6. Confirm the confirm-to-apply dialog exists and gates the actual mutation (not applied on first click):
   search for the apply mutation (`POST /api/itinerary-comparisons/:id/select`) and confirm it's called only from a confirm-dialog action handler, not directly from the "Apply <name>" button's onClick.
7. Confirm slip-aware exit copy per `2026-08-22-slip-review-copy` (trip-backed vs cart-originated):
   `grep -n "Back to your plan\|Back to Cart\|button-back-to-cart\|backExit" client/src/pages/itinerary-comparison.tsx`
8. In the running app: run "Optimize this plan" from a slip with a mix of purchased, in_planning, and (if available) expert-held items — confirm the review board shows baseline + up to 3 AI proposals, purchased items pinned in all, expert-held items absent from every column, and confirm applying opens the confirm dialog before mutating.

## Known divergences / notes

- The mock's own `data-testid` values (`proposal-column-baseline`, `proposal-column-v1/v2/v3`) are illustrative naming in the mock file and do NOT literally appear in the shipped code — the actual component uses a dynamic pattern (`proposal-preview-${variantId}`, with `boardId` computed as `"baseline"` or `` `v${index+1}` `` per variant). Do not grep for the mock's literal testid strings; grep for the dynamic pattern instead (see check #1 and #3 above).
- Ledger `2026-08-23-optimizer-three-variants` states "PR #563 (Optimized Slip Review) built baseline + V1 + V2 only — flagged to add V3 to match" as an open item at ledger-authoring time. A direct read of `itinerary-comparison.tsx` in this pass shows client-side scaffolding already present for a 3-AI-variant board (3-slot skeleton loop, dynamic `aiVariants.map`). **This is a live discrepancy the auditor must resolve**: confirm whether V3 rendering is now fully wired end-to-end (server persists 3 variants per `optimizer-catalog-mock.audit.md` check #4, AND client renders all 3 without truncation) — do not assume the ledger's "flagged" note is still accurate; verify against current code.
