# Audit report — optimizer-catalog-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The ratified optimizer ledgers govern over the mock’s historical findings; the mock is an audit artifact, not a UI screen. This report covers approved/active destination catalog honesty, three variants, coordinate provenance, booking price provenance, personalization, and the money boundary. The separate `itinerary_items.estimated_cost` branch and Grok cost-tracking note are explicitly excluded from defect findings.

## Checks performed

- Inspected shared catalog loader and both optimizer entry points.
- Inspected third-variant strategy, prompt count, and persistence cap.
- Inspected booking price re-derivation/refusal.
- Inspected variant coordinate resolution and first-run preference loading.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Catalog is active + approved and destination-scoped, with honest empty/no-destination semantics; both optimizer entry points use the shared loader. | `server/services/optimizer-baseline.service.ts:243-264`; `server/routes.ts:8760,9109` |
| MATCH | Optimizer requests and caps exactly three AI variants and selects a distinct third strategy. | `server/itinerary-optimizer.ts:476-482,1373-1377,1400-1405` |
| MATCH | Variant booking re-derives price from the linked catalog row and refuses unlinked or unavailable items. | `server/services/booking.service.ts:336-365,367-381` |
| MATCH | First-run preference/profile inputs are loaded and passed into generation. | `server/routes.ts:9113-9127` |
| DIVERGENCE | Still-unlocated AI variant activities can be geocoded from name/location/destination, contrary to the brief’s rule that an unlinked AI invention stays NULL/NULL and is never geocoded as a guess. | `server/itinerary-optimizer.ts:1431-1433,1512-1522`; `server/services/optimizer-activity-geocoder.service.ts:185-226` |
| ALREADY-RULED | The `itinerary_items.estimated_cost` path is outside the ledger fix and must not be treated as a gap. | `docs/design/mock-audits/optimizer-catalog-mock.audit.md:20,52` |

## Follow-up candidates

For this ratified lane, limit variant coordinate population to the item’s own, baseline, or linked catalog coordinates; do not geocode unlinked AI inventions. Do not change the explicitly excluded estimated-cost branch.
