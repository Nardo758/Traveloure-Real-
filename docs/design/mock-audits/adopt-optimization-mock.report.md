# Audit report — Adopt the Optimization

**Execution date:** 2026-08-30

## Authority and scope

The brief is partially shipped. Its “Shipped — audit now” rulings and later R-B/R-C rulings govern. Per-stop adopt ticks/tray and pending server mechanisms are explicitly deferred or pending and must not be reported as missing. The mock's “saved as its own trip” footer is superseded by proposal/in-place-apply rulings. The named `anchor-format.ts` client deliverable is checked separately.

## Checks performed

- Inspected nullable schema fields, live monolith generate route, pin parsing/resolution/fallback, and anchor persistence.
- Checked for the shadowed router generate route.
- Inspected Build-around candidate/Generate UI, dynamic V3 board, anchor-line formatting, omission helpers, and Apply-only ProposalColumn behavior.
- Checked whether `client/src/lib/anchor-format.ts` exists.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Anchor columns are additive nullable fields; the live handler accepts the allowlisted pin and the server resolves/falls back honestly. | `shared/schema.ts:1660-1664`; `server/routes.ts:8919-8923`; `server/services/anchor-candidates-map.ts:44-76`; `server/services/anchor-candidates.ts:74-96,119-140` |
| MATCH | Pinned anchors are used across three generation slots and persisted with anchor metadata. | `server/itinerary-optimizer.ts:942-962,1585-1590` |
| MATCH | Build-around candidate selection and Generate UI are mounted from SlipView; dynamic V3 board and anchor line are present. | `client/src/components/plancard/SlipView.tsx:791-803`; `client/src/components/plancard/BuildAroundDialog.tsx:153-174,245-373`; `client/src/pages/itinerary-comparison.tsx:2084-2087,2124,617` |
| MATCH | Deltas are omitted when unknown and ProposalColumn exposes whole-plan Apply only. | `client/src/lib/slip-proposal-preview.ts:118-161`; `client/src/components/plancard/ProposalColumn.tsx:12,188-196` |
| ALREADY-RULED | No per-stop adopt tick/tray or pending R-A mechanism is reported; those items are explicitly deferred/pending. The saved-as-new mock footer is superseded. | Brief behaviors 10–17 and Known divergences; `client/src/components/plancard/ProposalColumn.tsx:12` |
| DIVERGENCE | The spec-named pure formatter module is absent, even though equivalent formatting is currently exported from `slip-proposal-preview.ts`. | Command: `test -f client/src/lib/anchor-format.ts && echo "anchor-format.ts exists" || echo "anchor-format.ts MISSING"` → `anchor-format.ts MISSING`; current formatter `client/src/lib/slip-proposal-preview.ts:99-116` |

## Follow-up candidates

- If the specified module boundary remains required, extract/restore `client/src/lib/anchor-format.ts` while preserving current formatter output. Do not implement deferred R-A behavior.
