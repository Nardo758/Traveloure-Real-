# Rulings — handoff pack 2026-09-27 (section A)

> Source: handoff pack, 2026-09-27 (decision-maker). Rulings here are final.

## A. Immediate rulings

### A1. #1132 (help center and company pages)
- Article-text confirmation: do it yourself. Compare the ten article bodies in `shared/help-articles.ts` with `docs/planning/briefs/lane-b-pages-copy.md` (section D below, commit it). The only permitted differences: (1) article 8 carries the FAQ's payment-methods paragraph moved word for word (LD 43(e)); (2) article 5's Plus line reads "Coming soon" while `plusSalesEnabled` is false; (3) numbers are rendered from `/api/pricing` and the shared cancellation schedule, never typed; (4) article 1's occasion count is rendered from the seed. Any other difference: report, don't merge.
- Articles 3 and 4 stay held behind `SHIPPED_TRACK_A_STEPS` (`compare-options`, `three-versions-delta`).
- Then bring main in, wait for green on the new head, merge.

### A2. #1134 (property cancellation tier)
- Ruling: KEEP change 3. A room with no cancellation tier of its own takes its property's tier at booking time, for new bookings only. It matches what providers were told and what Terms §8 promises; the silent Flexible default was the defect. Ledger row records that the silent field drop (tier, check-in/out, house rules, amenities, minimum stay) was the defect and this is the fix.
- Merge after #1132 (it carries the shared schedule); bring main in, wait for green, merge. Renumber ledger rows on the branch if they collide with R171.

### A3. New small lane (after A2)
A test that every field a form submits is either in its route's allowlist or explicitly rejected. Precedents: the occasion write (R-slug `2026-09-27` occasion fix) and the property-create form (#1134). Failing-on-main test.

