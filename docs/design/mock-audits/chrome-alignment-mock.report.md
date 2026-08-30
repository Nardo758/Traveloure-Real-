# Audit report — Chrome Alignment Variant A

**Execution date:** 2026-08-30

## Authority and scope

Merged code from PRs #616/#617 is authoritative because it preceded this reconstruction mock. This report checks only the ledger constraints: ground/card surfaces, coral budget, hairlines, typography, logo variants, strip grammar, and reskin-only preservation. Exact pixel differences and the mock's absent dark-mode block are excluded. Variant B is intentionally rejected and excluded. Static inspection cannot establish complete runtime visual parity.

## Checks performed

- Searched layout and trip-strip tokens/backgrounds, coral touches, typography, underlines, logo wiring, testids, and strip height.
- Checked mono logo asset existence.
- Inspected the responsive readability-floor assertion.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Header/strip use `--earn-ground` with hairlines; dropdown/footer use card surfaces; header logo is 26px and footer requests mono logo. | `client/src/components/layout.tsx:521-534,804-810`; `client/src/components/trip/trip-strip.tsx:129-138` |
| MATCH | Coral semantic touches are BETA plus desktop/mobile Sign In; strip uses the coral eyebrow. | `client/src/components/layout.tsx:538-545,607-609,777-782`; `client/src/components/trip/trip-strip.tsx:138` |
| MATCH | Nav links use Geist Mono, 12.5px, `.05em`, and teal hover/active underlines; caret/other faint tokens are present. | `client/src/components/layout.tsx:155-158,249-253,278-282` |
| MATCH | Strip chips/cart use mono earn tokens; mono logo asset is present; readability floor is amended to >=12px. | `client/src/components/trip/trip-strip.tsx:161-194`; command `test -f client/public/traveloure-logo-mono.svg && echo "mono logo asset present"` → `mono logo asset present`; `playwright/tests/navbar-responsive.spec.ts:126-140` |
| MATCH | Known nav testids remain present, supporting reskin-only scope. | `client/src/components/layout.tsx:609` (`button-sign-in`); nav testid construction at `:249-253` |
| ALREADY-RULED | Variant B absence and mock dark-mode/pixel differences are explicitly not gaps. | Brief Known divergences; static search found no Fraunces chrome usage |
| INCONCLUSIVE | Static checks do not prove full light/dark visual parity, focus trap behavior, or identity of every handler/href/testid. | No browser/runtime checks performed |

## Follow-up candidates

None.
