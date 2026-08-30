# Audit report — catalog-preview-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Authority is the brief, its cited Catalog preview ledger rulings, and current code. The
List-view captures are visual evidence of the built result. The mock’s editable Map toolkit
is explicitly superseded by ruling 93 and is not a target. Demand/coverage Business layers
are proposed/open and are not treated as defects merely for remaining on Catalog.

## Checks performed

- Inspected Manage/Preview and List/Map state controls and the preview predicate/banner.
- Inspected per-card Card shows controls, PATCH payloads, and traveler-card consumption.
- Inspected map read-only posture, one-door navigation, and Distribute Promote handoff.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Manage/Preview are peer modes on the same list, independent of List/Map. | `client/src/pages/provider/services.tsx:1415-1419`; `:1747-1763` |
| MATCH | Preview applies approved + active visibility and states the hidden-listing rule. | `client/src/pages/provider/services.tsx:1642-1646`; `:1769-1782` |
| MATCH | Card shows independently controls price visibility and Instant/Request/Hidden booking mode. | `client/src/pages/provider/services.tsx:814-875`; mutation `:1521-1532`; preview card `:1012-1031` |
| MATCH | Add New Service routes to Workstation. | `client/src/pages/provider/services.tsx:1706-1713` |
| MATCH | Promote hands off to Distribute rather than creating a second Catalog surface. | `client/src/pages/provider/services.tsx:1319-1327` |
| MATCH | Current map documents honest located/unlocated behavior and no guessed pins. | `client/src/components/provider/catalog-map-view.tsx:21-28` |
| ALREADY-RULED | The mock’s editable Catalog pin/route/radius/pickup/surcharge toolkit is stale and superseded; current map is read-only. | `client/src/components/provider/catalog-map-view.tsx:1-19`; `client/src/pages/provider/services.tsx:1817-1839`; brief Known divergences `:87-99` |

## Follow-up candidates

None. Do not restore the superseded Map authoring toolkit; authoring belongs in the create
flow’s Logistics step.