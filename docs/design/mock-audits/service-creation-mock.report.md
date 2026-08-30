# Audit report — service-creation-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

The canonical artifact is `docs/design/service-creation-mock.html`, not the differing
`docs/testing/mock/service-creation-mock.html`. Authority is the brief, the canonical mock,
and its cited ledger rows. The historical S-1 explanation-panel issue is cross-referenced
to the provider-console brief and is not re-litigated. The expectation of “usually within
2 business days” is not an SLA and is excluded as a defect.

## Checks performed

- Inspected the seven-method flow table and section placement authority.
- Inspected delivery-method rendering, schema defaults/omissions, autosave precedence,
  submit copy, checklist, and traveler Bring/Access rendering.
- Compared the canonical and testing-directory mock hashes.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Exactly seven delivery methods and the specified branch shapes are defined. | `client/src/lib/service-form-steps.ts:87-108`; `:246-254` |
| MATCH | Delivery method is asked in Basics before branch-dependent content and changes the flow. | `client/src/components/ServiceForm.tsx:2759`; `:3091-3170` |
| MATCH | Remote/artifact/async methods do not receive place-anchored sections. | `client/src/lib/service-form-steps.ts:168-180`; `client/src/components/ServiceForm.tsx:3558-3577` |
| MATCH | Provider services default to born-submitted and provider inserts cannot set approval/review fields. | `shared/schema.ts:1018`; `shared/schema.ts:2152` |
| MATCH | Save/submit copy distinguishes drafts from submission for review and approval. | `client/src/components/ServiceForm.tsx:1682-1698` |
| MATCH | Listing Home uses a derived navigable checklist rather than independent ticks or a permanently disabled final action. | `client/src/pages/provider/listing-home.tsx:547-610`; `:613-647` |
| MATCH | Explicit `offeringTypeKey`/`category` entry skips but does not delete autosave. | `client/src/components/ServiceForm.tsx:821-835` |
| MATCH | Unanswered Bring/Access fields are omitted from traveler output. | `client/src/pages/service-detail.tsx:943-1000` |
| STALE-MOCK | The testing-directory duplicate differs from the canonical design copy; this is mock-furniture drift, not an app gap. | Command: `sha256sum docs/design/service-creation-mock.html docs/testing/mock/service-creation-mock.html` → `5d7342...` vs `f44947...` |

## Follow-up candidates

None. Notify the testing-mock owner of the duplicate only; do not silently resync it here.