# Audit report — grounding-affiliates-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The ratified affiliate ledgers govern over mock pixels. This report covers waterfall order, registry-first/live-feed reconciliation, eligibility, per-market activation, opaque booking rail, coordinates, and schema allowlisting. The mock’s reuse-vs-new table is explicitly a spec-authoring convention and is not audited as shipped UI. Browser inventory scenarios and seeded unclassified-row execution were not performed.

## Checks performed

- Inspected affiliate market loader and resolver insertion point.
- Inspected reconcile timeout/error handling and materialization comments.
- Inspected booking-type CTA guard and raw-outbound search.
- Inspected FK and insert-schema omission.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Waterfall insertion is Catalog → Affiliate → DMO, with first confident match stopping the pass. | `server/services/slip-grounding.service.ts:92-130` |
| MATCH | Active market registry rows are loaded and live reconcile is bounded, best-effort, and registry-materializing. | `server/services/affiliate-grounding.service.ts:46-89,92-105,109-130` |
| MATCH | CTA requires `affiliate_bookable` and a real token, and posts to the opaque-token booking rail; no raw outbound call exists. | `client/src/components/plancard/affiliate-booking.ts:34-45`; `client/src/components/plancard/AffiliateBookButton.tsx:31,40`; `grep -rn "window.open" client/src/components/plancard/affiliate-booking.ts server/services/affiliate-grounding.service.ts` produced no matches |
| MATCH | Affiliate product FK is nullable/set-null and server-owned by insert-schema omission. | `shared/schema.ts:4158,4566` |
| DIVERGENCE | Loader and resolver do not exclude unclassified booking types before linking; the client guard only suppresses the CTA after an affiliate link has already been created. | `server/services/affiliate-grounding.service.ts:65-86`; `server/services/slip-grounding.service.ts:117-124`; `client/src/components/plancard/affiliate-booking.ts:40-45` |

## Follow-up candidates

Add an eligibility gate before affiliate linking for `affiliate_bookable` and `in_platform_bookable`; unclassified rows must fall through to DMO/honest suggestion.
