# Kyoto Persona × Journey Matrix

Lane A companion document for the Kyoto persona-marketplace dispatch. The matrix
defines the real browser paths Lane B must automate after the manual supply pass
has stocked Kyoto. The seed script intentionally creates only development
accounts and supported user-level memberships; the journeys create marketplace
content through the product flows.

## Test accounts

All seeded accounts use the development-only password `TestPass123!`.

| Persona | Email | Role / state |
|---|---|---|
| Gion local expert | `persona-gion-expert@traveloure.test` | `local_expert` |
| Kyoto trip planner | `persona-kyoto-planner@traveloure.test` | `travel_expert` |
| Kyoto event planner | `persona-kyoto-event-planner@traveloure.test` | `event_planner` |
| Kyoto provider | `persona-kyoto-provider@traveloure.test` | `service_provider` + active manual `pro_monthly` membership |
| Free traveler | `persona-kyoto-free-traveler@traveloure.test` | `user`, no membership |
| Trip Pass traveler | `persona-kyoto-trip-pass@traveloure.test` | `user`; per-trip entitlement is not represented by the current schema |
| Plus member | `persona-kyoto-plus@traveloure.test` | `user` + Kyoto home city + active manual `plus_annual` membership |
| Guest | no account | signed-out browser context |

## Matrix

“Done means” is the completion assertion Lane B should report. The manual-check
column is deliberately retained for a human review after the automated pass; an
automated green result is not a substitute for checking the visible page and
captured evidence.

| Persona | Journey | Required steps | Done means | Manual check |
|---|---|---|---|---|
| Guest | `journey-guest.spec.ts` | Open Kyoto discover/feed → inspect local expert, service, and ready-made surfaces → attempt a protected action → open sign-in prompt → dismiss and continue browsing. | Kyoto content is visible to a signed-out user; protected action redirects/prompts without a server error; no authenticated-only control is exposed. | Confirm the browse chrome, cards, prices, and sign-in prompt are coherent at desktop and mobile widths. |
| Free traveler | `journey-traveler.spec.ts` | Log in → create/select a Kyoto trip → browse seeded local experts and provider services → add one service to cart → continue through checkout using Stripe test mode → confirm the resulting booking/plan state. | The trip is owned by the free traveler; selected service is in the cart/booking; checkout succeeds only with the Stripe test key; database row links buyer, service, and payment state. | Confirm the checkout summary, fee copy, currency, confirmation state, and My Plans card. |
| Trip Pass traveler | `journey-traveler.spec.ts` | Log in → use the same traveler journey against the Trip Pass branch → verify the UI handles the per-trip entitlement path honestly. | If the product exposes a supported Trip Pass checkout, its entitlement is attached to the same trip; otherwise the test records an explicit unsupported-state result and does not fabricate a row. | Confirm the product copy does not claim a reusable membership or silently grant access. |
| Plus member | `journey-traveler.spec.ts` | Log in → verify Plus/member surface and seeded Kyoto home city → add one occasion through the UI → verify the occasion appears and is eligible for the 14-day draft window. | `plan_memberships` is active/manual; `users.home_city` is Kyoto; the occasion is owned by the member and has the requested date; no duplicate appears on repeat. | Confirm the Plus state, occasion editor, date handling, and any draft/notification copy. |
| Gion local expert | `supply-expert.spec.ts` | Log in → complete local-expert onboarding for Kyoto/Gion → save profile and locality proof → add two services → submit/publish through the real approval path → open public expert/storefront view. | The application/profile is Kyoto-scoped; both services are owned by the expert; the public surface appears only after the product’s publish/approval gate; DB rows prove each mutation. | Confirm Gion neighborhood copy, service descriptions, rate display, photos, and public card hierarchy. |
| Kyoto trip planner | `supply-expert.spec.ts` | Log in → complete travel-expert onboarding → create one Kyoto ready-made itinerary → add itinerary content → submit/publish it → open public detail. | One published Kyoto ready-made listing is owned by the planner, has itinerary content, and is discoverable through the public route; no duplicate listing is created on retry. | Confirm itinerary day order, title, price, cover image, and mobile detail layout. |
| Kyoto event planner | `supply-expert.spec.ts` | Log in → complete event-planner onboarding → create one Kyoto event/proposal plan → save profile/plan → verify the role-specific workspace and public/eligible surface. | The event-planner role remains distinct; the saved plan is owned by the planner and appears in the intended workspace without leaking private draft fields. | Confirm proposal/celebration copy, event fields, and role-specific navigation. |
| Kyoto provider | `supply-provider.spec.ts` | Log in → complete provider profile/verification flow → create two Kyoto services → save availability → submit/publish through approval → open service detail/storefront. | Two active Kyoto services are owned by the provider; availability is persisted; Pro-gated behavior reads the active membership; public service cards appear only when approved. | Confirm business identity, service duration/price, availability calendar, Pro affordances, and storefront links. |

## Global completion assertions

Every mutation step must pair:

1. a visible UI assertion (route, heading, toast, card, or state change); and
2. a direct development-database assertion against the row changed.

Every suite must also assert:

- the authenticated user cannot see or mutate another persona’s private rows;
- a second run is safe and does not duplicate the persona’s authored content;
- all payment steps abort unless the active Stripe key is test mode;
- screenshots are captured for manual review at the stated checkpoints;
- no production URL or production database is used.
