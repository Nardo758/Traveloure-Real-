# Audit report — service-creation-audit.audit.md

**Execution date:** 2026-08-30

## Authority and scope

This is a historical audit artifact, superseded by the named fixes and ledger rulings. It
is used only as a re-verification checklist, not as a design target. The office-location
prefill item is explicitly closed/out of scope. Old wording about role vocabulary, exact
dead controls, and step names is not treated as current without live evidence.

## Checks performed

- Re-verified the seven prescribed historical-fix checks against current source.
- Inspected method-first branching, one-door navigation, Distribute access, delete/archive,
  Listing Home checklist, and submit behavior.
- Searched for the historical Published/Draft dead-switch identifiers.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Method-first branching landed. | `client/src/lib/service-form-steps.ts:87-108`; `client/src/components/ServiceForm.tsx:3091-3170` |
| MATCH | Catalog’s Add New Service routes to Workstation, and Workstation routes to the service form. | `client/src/pages/provider/services.tsx:1706-1713`; `client/src/pages/provider/workstation.tsx:1005-1028` |
| MATCH | No rendered Published/Draft dead switch was found. | Command: `rg -n 'Published/Draft|published-draft-switch' client/src` → only historical comment `client/src/components/ServiceForm.tsx:177` |
| MATCH | Distribute handoff exists from Catalog. | `client/src/pages/provider/services.tsx:1319-1327` |
| MATCH | Delete is confirmed and booking refusal offers archive. | `client/src/pages/provider/services.tsx:1534-1565`; `:1568-1581` |
| MATCH | Listing Home has a derived checklist and separate Submit for review action. | `client/src/pages/provider/listing-home.tsx:547-610`; `:613-647` |
| ALREADY-RULED | The office-location prefill issue is explicitly closed and excluded from fresh re-litigation. | `docs/design/mock-audits/service-creation-audit.audit.md:68-73` |

## Follow-up candidates

None. Historical findings that are not reproduced by these checks are not automatically
current gaps, and the explicitly closed item is not a repair target.