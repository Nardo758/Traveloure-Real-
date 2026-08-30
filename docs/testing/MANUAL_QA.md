# Kyoto Persona Marketplace — Manual QA Checklist

Use this checklist after the automated persona pass. Spend about ten minutes per
persona, checking the preview on desktop and again on a real phone at its native
width (the narrow target is approximately 390px). Use only the development
preview and the fixed accounts in `PERSONA_JOURNEYS.md`; never open production,
send a live payment, or send a `@traveloure.test` message to a real inbox.

For every row, record **PASS**, **FAIL**, or **UNSUPPORTED** with the route and
one screenshot. A PASS requires the visible state to match the expected state;
do not infer success from a database row alone.

| Persona / surface | Manual checks |
|---|---|
| **Guest** — Kyoto discover and cart | Browse the Kyoto feed. Confirm expert, service, ready-made, prices, and browse chrome are coherent. Add a service, open the cart sign-in prompt, dismiss it, and confirm browsing remains usable. Check no private console or trip data appears. |
| **Free traveler** — checkout and My Plans | Confirm Kyoto trip selection, service details, fee/currency copy, checkout summary, confirmation state, and the resulting My Plans card. Confirm narrow layout does not clip the total, CTA, or confirmation content. |
| **Trip Pass traveler** — entitlement boundary | Confirm the product either shows the supported Trip Pass purchase state or clearly explains the unsupported state. Confirm it does not claim reusable membership access or silently grant an entitlement. |
| **Plus member** — occasions | Confirm active Plus state, Kyoto home city, occasion editor, 14-day date handling, and draft/notification copy. Repeat the same occasion check and confirm no duplicate is presented. |
| **Gion local expert** — console and public profile | Confirm Gion/Kyoto profile copy, locality chips, service descriptions, rate display, photos or honest fallback, approval status, and public card hierarchy. Verify an unapproved/unverified listing is not presented as live. |
| **Kyoto trip planner** — ready-made detail | Confirm listing title, price, cover attribution, day order, itinerary content, approval state, and public detail route. Check mobile detail scrolling and that no private draft fields leak. |
| **Kyoto event planner** — role-specific workspace | Confirm proposal/celebration copy, event fields, role-specific navigation, and saved workspace state. Ensure the account is not treated as a travel expert and private draft fields stay private. |
| **Kyoto provider** — console, availability, Money | Confirm business identity, service duration/price, availability calendar, Pro affordances, approval state, public service cards, and storefront links. Check Money shows the honest empty/earned state and no clipped controls. |

## Evidence and reporting

- Use the journey report shape from `PERSONA_LANE_B_HANDOFF.md` for automated
  results; attach manual screenshots to the corresponding checkpoint.
- File unexpected behavior as a matrix candidate:
  `persona · surface · what happened · expected`.
- Do not fix code during this pass. Keep money-path files read-only.