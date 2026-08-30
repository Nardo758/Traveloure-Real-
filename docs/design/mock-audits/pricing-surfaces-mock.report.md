# Audit report — pricing-surfaces-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Audited `/pricing`, its navigation entry, pricing API/data sources, and Trip Pass routing. `PRICING_PAGE_SPEC.md` and `PRICING_AND_FEATURE_MAP.md` govern scope/data; the mock governs appearance. The PR #621 Trip Pass routing is a ratified post-mock divergence. The local-expert column intentionally has no numeric price. No application, test, migration, mock, or report files were changed.

## Checks performed

- Inspected `pricing.tsx`, `nav-config.ts`, dashboard routing references, pricing routes, and optimization-fee service.
- Grepped for price literals, API bundle reads, retired plan/table names, nav placement, Trip Pass routing, and optimization-fee sourcing.

## Findings

| Category | Finding | Evidence |
|---|---|---|
| MATCH | Pricing page reads its bundle from `/api/pricing`; ladder, Plus, and Pro values are bundle-derived. | `client/src/pages/pricing.tsx:78-80,106-180,317-347,407-465` |
| MATCH | Pricing is a plain main-nav leaf; retired Power Pass/Enterprise/comparison-table names are absent. | `client/src/lib/nav-config.ts:172-175`; command: `grep -nE 'Power Pass|Enterprise|comparisonTable' client/src/pages/pricing.tsx` returned no matches |
| MATCH | AI fee sourcing uses `getFee` and `optimization_fees`, not an incorrectly substituted fee-band row. | `server/services/optimization-fee.service.ts:6-7,58-150` |
| MATCH | Trip Pass CTA routes guests to sign-in and authenticated users to `/dashboard` with a pick-a-trip toast, without a purchase call from this page. | `client/src/pages/pricing.tsx:155-162` |
| DIVERGENCE | Pro’s beta display is hardcoded as `$0`, despite the contract requiring a live-row-derived display rather than a price literal. | `client/src/pages/pricing.tsx:435-440`; command: `grep -n '\\$[0-9]' client/src/pages/pricing.tsx` |
| ALREADY-RULED | Trip Pass routing is an accepted PR #621 divergence, not a defect; “set by each expert” is intentionally nonnumeric. | `client/src/pages/pricing.tsx:166-180`; brief “Known divergences / notes” |

## Follow-up candidates

1. Derive the Pro beta display from the `/api/pricing` Pro row/flag while preserving the existing beta presentation.
