# Audit report — provider-console-mockup.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The canonical authority is `docs/design/provider-console-mockup/mockup.html`, read with
`docs/design/mock-audits/provider-console-mockup.audit.md`, its cited ledger rows, and the
current implementation. The extracted page files and screenshots are evidence only; the
canonical mock wins among mock exports. The Catalog map is audited against the later
read-only ruling, not the superseded Catalog authoring posture. The open demand-overlay and
Calendar-home proposals are excluded. S-1 (the absent edit-split explanation panel) is
already tracked and is not a new repair target; other `propchip` proposals are not defects.

## Checks performed

- Inspected step branching, Catalog, Workstation, map, traveler detail, Listing Home, and
  Distribute source.
- Inspected route-point validation/staging and the provider PATCH edit split.
- Searched for the S-1 panel text and the Catalog edit-review pill.
- Verified the one-door links and preview visibility predicate by source.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | The wizard has seven delivery methods and method-specific branch shapes. | `client/src/lib/service-form-steps.ts:87-108`; `:146-180` |
| MATCH | Catalog has separate Manage/Preview and List/Map axes; Preview hides non-public listings. | `client/src/pages/provider/services.tsx:1415-1419`; `:1747-1763`; `:1642-1646` |
| MATCH | Preview banner states that paused/unapproved listings are hidden. | `client/src/pages/provider/services.tsx:1769-1782` |
| MATCH | Catalog map is read-only, with authoring moved to the create flow. | `client/src/components/provider/catalog-map-view.tsx:1-19`; `client/src/pages/provider/services.tsx:1817-1839` |
| MATCH | Route stops are owner-gated, replace-list validated, server-ordered, and reject half coordinates; adding a route to an approved no-route listing is staged. | `server/routes.ts:2750-2795` |
| MATCH | Approved identity edits are staged in pending changes while the approved listing remains live; client insert schema omits privileged review fields. | `server/routes.ts:3722-3745`; `shared/schema.ts:2152` |
| MATCH | Catalog shows the `Edit in review` pill. | `client/src/pages/provider/services.tsx:895-904` |
| MATCH | Bring/Access are omitted when unanswered and carry the host-wording disclaimer when present. | `client/src/pages/service-detail.tsx:989-1000` |
| MATCH | Catalog and Workstation implement the one-door flow; Catalog handoff links to Workstation. | `client/src/pages/provider/services.tsx:1706-1713`; `client/src/pages/provider/workstation.tsx:1005-1028` |
| MATCH | Promote is handed to Distribute from the listing row. | `client/src/pages/provider/services.tsx:1319-1327` |
| ALREADY-RULED | The ratified two-column “Goes live immediately / Re-enters review” panel remains absent as tracked S-1. | Command: `rg -n 'Goes live immediately|Re-enters review' client/src/pages/provider/listing-home.tsx` → `no matches`; brief behavior 10 |

## Follow-up candidates

None. S-1 is explicitly already ruled/tracked, and open proposals are excluded.