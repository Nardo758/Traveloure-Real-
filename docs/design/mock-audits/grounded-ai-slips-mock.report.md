# Audit report — grounded-ai-slips-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The ratified `2026-08-23-item2-grounding` ledger governs over the pre-build mock framing. This report covers Phase-1 automatic grounding, catalog/DMO/honest states, schema and migration registration, real coordinates, and no-auto-cart behavior. The mock’s “Have vs New” authoring panel is explicitly excluded. Affiliate/registry Phase 2 is explicitly excluded and covered by the affiliate brief.

## Checks performed

- Inspected resolver source loading, threshold, rung order, and failure behavior.
- Inspected generate-itinerary invocation before persistence.
- Inspected migration registration and schema declarations.
- Inspected catalog-link/cart semantics.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Resolver loads catalog, affiliate/Phase-2 source, and DMO sources with a 0.82 gate; Phase-1 catalog/DMO/honest control flow remains fail-closed. | `server/services/slip-grounding.service.ts:20-22,77-86,92-149`; `server/services/slip-grounding-match.ts:10` |
| MATCH | Grounding runs automatically during itinerary generation before item inserts; catalog matches mark `providerServiceId` and do not auto-cart. | `server/routes.ts:1533-1563` |
| MATCH | DMO and affiliate grounding columns are additive and registered; insert schema omits server-owned grounding fields. | `server/migrations/migration-files.ts:1272-1278`; `shared/schema.ts:4150,4158,4566` |
| MATCH | Matched entities supply coordinates and unmatched items remain ungrounded rather than receiving a guessed pin. | `server/services/slip-grounding.service.ts:102-107,141-149` |
| STALE-MOCK | The footer saying “Nothing built yet” is stale pre-sign-off furniture; the resolver shipped under the ledger. | `docs/design/mock-audits/grounded-ai-slips-mock.audit.md:13,48-50` |
| ALREADY-RULED | Affiliate/registry rung is Phase 2 and outside this brief’s scope. | `docs/design/mock-audits/grounded-ai-slips-mock.audit.md:50-51` |

## Follow-up candidates

None.
