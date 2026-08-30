# Audit report — create-flow-refinements.audit.md

**Execution date:** 2026-08-30

## Authority and scope

Authority is the ratified `docs/design/create-flow-refinements/mockup.html`, ledger rows
112–114, and the live surfaces named by the brief. The pre-pick catalog picker is explicitly
unchanged and is not audited as a regression. Autosave behavior is audited only for the
explicit deep-link precedence contract; no proposal beyond the brief is included.

## Checks performed

- Inspected Workstation ideas derivation, category registration filtering, round-robin cap,
  empty hiding, `/earn` data, and deep links.
- Inspected ServiceForm autosave precedence and selected-offering Basics rendering.
- Inspected post-publish nudge source, count, and visibility gate.

## Findings

| Category | Brief finding | Exact evidence |
|---|---|---|
| MATCH | Ideas are limited to registered, unlisted offerings and round-robin to six. | `client/src/pages/provider/workstation.tsx:613-641` |
| MATCH | Ideas rail hides entirely when empty and uses catalog taglines. | `client/src/pages/provider/workstation.tsx:1136-1175` |
| MATCH | Idea tiles deep-link with `offeringTypeKey`. | `client/src/pages/provider/workstation.tsx:1151-1162` |
| MATCH | Explicit offering/category intent beats autosave without deleting the checkpoint. | `client/src/components/ServiceForm.tsx:821-835` |
| DIVERGENCE | The brief requires selected offering name, category chip, and tagline in the Basics card header with one Change control. Current code has a generic Create new service header and compact offering/name fields; selected offering shows only its name, with category as help text and no header tagline/Change control. | `client/src/components/ServiceForm.tsx:2890-2901`; `:2903-2943` |
| MATCH | Post-publish nudge is one line, uses up to two catalog-derived siblings, and is gated to the frozen/in-review state. | `client/src/components/ServiceForm.tsx:2359-2393` |

## Follow-up candidates

Align only the selected-offering Basics presentation with the ratified header contract:
retain the existing picker, deep-link, and autosave behavior, while rendering name/category/
tagline in the card header with one Change action. Do not alter the explicitly unchanged
pre-pick picker.