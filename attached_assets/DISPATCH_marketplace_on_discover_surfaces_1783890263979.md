# DISPATCH — Do expert packages/templates surface on Discover by-date & by-location? (READ-ONLY)

**Why:** we're mapping the marketplace's real footprint. A prerequisite fact we don't currently know: can **expert-template / expert-package** content appear on the Discover **by-date** and **by-location** surfaces at all — or do those surfaces only ever show regular services/experiences? The answer determines whether the two payment paths (dedicated marketplace Stripe checkout vs. the general cart/booking flow) overlap for marketplace content. This is the narrow factual input for the larger commerce-graph trace.
**Type:** Read-only. Inventory + trace what renders. Change nothing, decide nothing.

---

## The question, precisely

On the Discover **by-date** view (the `GlobalCalendar` / "By Date" tab and the standalone `/global-calendar`) and the **by-location** view (`/discover/location/:city` and any by-location Discover surface): **does any tile, card, or CTA surface an expert template or expert package** — i.e. content from `expert_templates` / `expert_service_offerings` sold as a package — versus only regular services, experiences, and expert *match* cards?

Distinguish three things that are easy to conflate:
- **Expert *match* / "Ask an Expert"** (the `TimeRelevantMatch.experts` data) — a *request/match*, not a purchasable package. Note where it appears but classify it separately.
- **Regular services / experiences** — the normal catalog.
- **Expert *templates/packages*** — the marketplace product (`expert_templates`, "View & Purchase"). **This is the one we're hunting.**

---

## Checks

1. **By-date surfaces.** Read the `GlobalCalendar` component and the `/global-calendar` page. Enumerate every card/tile/CTA type they render and its data source (grep the queries). For each, classify: regular-service / expert-match / **expert-template-or-package** / browse-tile / other. `file:line` per surface.
2. **By-location surfaces.** Same for `/discover/location/:city` and any by-location Discover view. Enumerate render types + data sources + classification.
3. **Template/package specifically.** Grep both surface trees for any reference to `expert_templates`, `expert-templates`, template purchase, "View & Purchase", or the marketplace CTA. Present or absent? If present, what does the CTA do — link to a dedicated `/expert-templates/:id`, add to cart, or route to booking?
4. **Reachability.** For any template/package surfacing found, is it actually reachable (mounted route, live tile) or dead/orphaned code?

---

## Deliverable

A table per surface: `surface | render types | data source (file:line) | expert-template/package present? (Y/N) | if Y, what the CTA does`.

Then a one-line bottom line: **do expert templates/packages surface on by-date and/or by-location — and if so, do their CTAs go to the dedicated marketplace path, the cart, or booking?** That single answer feeds the commerce-graph trace (separate dispatch).

---

## What NOT to do

- Don't change code or docs. Read-only.
- Don't conflate expert *match* cards with expert *template/package* content — they're different (request vs. purchasable product). Classify separately.
- Don't infer from the marketplace scoping doc — trace what these two surfaces actually render, on current `main`.
- Don't follow the full payment path here — that's the commerce-graph trace. This dispatch answers only "does marketplace content appear on these two surfaces, and where does its CTA point."
