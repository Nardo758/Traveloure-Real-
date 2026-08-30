# Audit report — landing-earn-mock.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Audited the landing page and its named live data surfaces. `LANDING_SPEC.md` governs scope and section order where it differs from the mock; Marketplace earn grammar governs visual grammar. The Experiences ticker is intentionally degraded because its rollup is absent. The missing historical Phase 0 audit artifact is not a check target. No application, test, migration, mock, or report files were changed.

## Checks performed

- Inspected `landing.tsx`, landing hero/Plus/Numbers/Cities/Experiences components, and `use-rotation.ts`.
- Grepped static typed-search titles, shared rotation use, live API reads, coral styles, handlers, and stat fallbacks.

## Findings

| Category | Finding | Evidence |
|---|---|---|
| MATCH | Ruled section order is implemented: hero, How It Works, Plus, entry, experiences, cities, numbers, earn, final CTA. | `client/src/pages/landing.tsx:29-49` |
| MATCH | Typed search is static/curated, uses shared rotation, stops on focus, and browses without writing trip context. | `client/src/components/landing/landing-hero.tsx:30-41,63-77`; `client/src/hooks/use-rotation.ts:1-47` |
| MATCH | Nullable hero legs collapse honestly; Numbers reads platform stats and uses an em dash for empty values. | `client/src/components/landing/landing-hero.tsx:6-9,80-85,209-218`; `client/src/components/landing/numbers-strip.tsx:22-35`; `server/routes/landing.routes.ts:98`; `server/routes/content.routes.ts:8379` |
| MATCH | Plus CTA uses the live pricing gate and is non-coral in the disabled state. | `client/src/components/landing/plus-occasions.tsx:5-8,29-34,50-73`; `server/routes/pricing.routes.ts:106` |
| DIVERGENCE | The hero has the coral Plan my trip CTA plus a second conditional coral anchor CTA, so a live anchor can exceed the exactly-three coral budget and the one-coral-per-section rule. | `client/src/components/landing/landing-hero.tsx:170-181,228-241`; command: `grep -RIn 'earn-coral-ink' client/src/components/landing` |
| ALREADY-RULED | Experiences is intentionally static/degraded; absent `experience_starts` ticker work is filed and must not be faked. Mock DOM ordering is superseded by the spec. | `client/src/components/landing/experiences-rail.tsx:2-10`; `client/src/pages/landing.tsx:35-41`; brief “Known divergences / notes” |

## Follow-up candidates

1. Make the conditional hero anchor action non-coral, retaining hero/earn/final as the three disabled-Plus coral CTAs.
