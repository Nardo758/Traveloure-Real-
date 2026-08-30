# Audit report — marketplace-experts-earn-grammar-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Audited the Marketplace and Experts & Services surfaces named by the brief. The HTML mock is authoritative for visual appearance; `MARKETPLACE_EXPERTS_EARN_GRAMMAR_SPEC.md` is authoritative for scope and behavior. City-feed geometry was evaluated against `BENTO_ASSEMBLY.md` and `lane4/BEHAVIOR_MATRIX.md`. The removed Ready-Made expert-template shelf is not a gap, `/services/:id` mono-label treatment is deferred, and moved testids are intentional. No application, test, migration, mock, or report files were changed during source inspection.

## Checks performed

- Inspected `layout.tsx`, `discover.tsx`, `experts.tsx`, `storefront.tsx`, `providers-directory.tsx`, and `CityCard.tsx`.
- Grepped for shared icon-map use, legacy tokens/hex literals, legacy Discover shell markers, CityCard pulse fields, source-link markers, and testids.

## Findings

| Category | Finding | Evidence |
|---|---|---|
| MATCH | One icon source feeds navigation and public mastheads; Marketplace rail, two-field search, and legacy-shell removal are present. | `client/src/components/layout.tsx:75-94,127-138`; `client/src/pages/experts.tsx:43,384`; `client/src/pages/providers-directory.tsx:32,163`; `client/src/pages/discover.tsx:588-596,624-639,1175-1242` |
| MATCH | Discover cards retain source-link resolution and provider source-link testids. | `client/src/pages/discover.tsx:374-479` |
| DIVERGENCE | The public Experts page still contains legacy hex literals, contrary to the no-hex/earn-token contract. | `client/src/pages/experts.tsx:482,512,525,544,556,580,587,597,604,748-772,792,889-910`; command: `grep -nE 'var\\(--(ink|paper|coral|line)\\)|#[0-9A-Fa-f]{3,8}' client/src/pages/experts.tsx` |
| DIVERGENCE | `CityCard` pulse still renders emoji count furniture, `isHot`-driven Hot/Trending badges, zero-filled trending/gem counts, and optional vibe/experience furniture that the pulse contract retires. | `client/src/components/travelpulse/CityCard.tsx:143-147,191-196,225-232,258-263,285-295` |
| ALREADY-RULED | Ready-Made shelf removal, deferred detail mono pass, route-shadow/testid re-homing, and superseded city-feed geometry are ruled state, not repair targets. | Brief “Known divergences / notes”; `client/src/pages/discover.tsx:1175-1179` |

## Follow-up candidates

1. Retoken the remaining public Experts surface without changing its behavior.
2. Align only `CityCard`’s pulse variant with the BENTO/behavior-matrix oracle; preserve the season variant.
