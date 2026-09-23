# Storefront Handoff and Review Facts

## Scope

Amend the unified public storefront without widening its server scope beyond:

- `server/routes/storefront.routes.ts`
- gated seed and fixture files

All other implementation changes are client-side or test-only. No schema, migration, payment, booking, verification, or production-data mutation is included.

## Trip handoff

The storefront reads `tripId` from the current URL. When present:

- Every service-detail link carries the same `tripId` as `/services/:id?tripId=...`.
- Client redirects from legacy expert detail to `/s/:handle` retain the query string.
- Server redirects from `/experts/:id` and `/local-experts/:id` to `/s/:handle` retain the query string.
- The planning panel shows **Back to your plan**, linking to `/plans/:tripId`.
- The panel does not show **Start a plan**.
- The storefront does not call `/api/expert-booking-requests`, add the first service to cart, or create a booking.

“Share my plan with {name}” remains a separate follow-up lane.

## ID-based compatibility

`GET /api/storefront/by-id/:id` remains the compatibility read needed to render approved handle-less legacy experts. It is part of the existing `/experts/:id` public-ID exemption under LD 40, not a new general-purpose public user lookup.

The endpoint:

- Reuses role-specific public eligibility rules.
- Rejects provider IDs and ineligible experts.
- Never returns `users.id`.
- Is explicitly annotated in the public-user-ID audit so the exemption is visible and testable.

## Review facts

The storefront presents two independent facts and never sums them:

- **Expert reviews:** count of approved expert-review rows.
- **Service reviews:** count of approved `service_reviews` rows attached to the earner’s approved live services.

Both counts come from actual rows. Stored `provider_services.average_rating` and `provider_services.review_count` values are not review-count authorities for storefronts or cards. If a count is zero, its fact is omitted.

The same row-backed rule applies to all three storefront/card dispatches affected by the unified presentation.

## Trust copy

Before changing the trust strip, implementation must verify `docs/MONEY_MAP.md` and the recorded completion-mint ruling. Service-booking earnings mint at completion and their availability window is anchored to completion declaration. Existing completion-oriented copy stays unless the money map shows a concrete contradiction.

No copy may claim a release timing that differs from the actual completion, hold, and dispute rails.

## Seed boundaries

Sofia’s handle, pending verification state, and demo review presentation are managed only through gated seed or fixture files.

- No direct database writes.
- No real verification call or webhook rail.
- No synthetic review rows created merely to reach a displayed count.
- Row-backed review facts remain absent when no approved rows exist.

## Verification

Automated coverage must prove:

1. `/experts?tripId=X` to a handled expert preserves `tripId` through the expert link and redirect.
2. A service link on the resulting storefront carries `tripId=X`.
3. The planning panel links to `/plans/X`, does not show Start a plan, and makes no expert-booking-request or booking mutation.
4. Client and server handle redirects preserve query parameters.
5. The by-ID compatibility payload exposes no user ID and its audit exemption is explicit.
6. Expert and service review counts are independently row-backed, omitted at zero, and never read from denormalized service counters.

## Deferred

- “Share my plan with {name}”
- Storefront layout work not required for handoff preservation
- Ranking or sorting
- New review migration or aggregate-repair work