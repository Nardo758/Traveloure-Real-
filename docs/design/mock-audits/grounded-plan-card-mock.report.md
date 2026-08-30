# Audit report — grounded-plan-card-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The brief's authority ordering applies: the ratified ledger and merged behavior take precedence over mock pixels. This report covers the four-rung grounding resolver, provenance coordinates, affiliate CTA safety/presence semantics, and fail-closed behavior. Browser generation and visual confirmation of all four states were not performed. Phase-2 details are audited in the affiliate brief.

## Checks performed

- Inspected the match threshold and resolver control flow.
- Inspected affiliate CTA guards, sign-in flow, POST target, and raw-outbound search.
- Inspected schema/DTO ownership of affiliate grounding fields.
- Inspected the grounding failure wrapper.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Threshold is 0.82; Catalog → Affiliate → DMO → honest suggestion is mutually exclusive, with matched coordinates copied only when item coordinates are absent. | `server/services/slip-grounding-match.ts:10`; `server/services/slip-grounding.service.ts:77-86,92-149` |
| MATCH | Affiliate CTA is fail-closed, uses an opaque token and agent rail, opens sign-in first, and locks after success. | `client/src/components/plancard/affiliate-booking.ts:40-45`; `client/src/components/plancard/AffiliateBookButton.tsx:31,40,57-61,73`; `grep -rn "window.open" client/src/components/plancard/AffiliateBookButton.tsx client/src/components/plancard/affiliate-booking.ts` produced no matches |
| MATCH | Affiliate grounding is server-owned and omitted from the insert schema; DTO documentation limits presence to grounded agent-bookable items. | `shared/schema.ts:4158,4566`; `client/src/components/plancard/plancard-types.tsx:211-217` |
| DIVERGENCE | The affiliate rung links any confidently matched affiliate row, including unclassified rows, rather than requiring an eligible booking classifier before persistence. | `server/services/slip-grounding.service.ts:117-124`; `server/services/affiliate-grounding.service.ts:65-86` |
| MATCH | Source-load failure returns all items ungrounded instead of blocking the build. | `server/services/slip-grounding.service.ts:52-56,77-86` |

## Follow-up candidates

Restrict affiliate candidates or the resolver gate to ratified eligible booking types before persisting an affiliate link; unclassified items should fall through. This is the only genuine gap identified.
