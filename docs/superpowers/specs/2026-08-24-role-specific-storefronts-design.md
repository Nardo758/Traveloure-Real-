# Role-specific storefronts

## Goal

Separate the public marketplace into two storefront types that match their
inventory and owner roles:

- Expert and local-expert storefronts at `/s/:handle`
- Service-provider storefronts at `/providers/:handle`

The legacy `/p/:handle` path remains supported and resolves to the appropriate
canonical path.

## Experience

Service cards identify their provider and link to that provider's storefront.
The provider storefront presents only approved, active services with the
provider's real profile, trust information, search, filtering, message, and
share actions.

Expert storefronts remain the home for expert-led planning inventory, including
templates and ready-made trips. Existing real checkout, booking, cart,
messaging, reviews, availability, maps, and accounting behavior remains
unchanged.

## Data and safety

The server enforces the storefront role for each public endpoint. It never
creates a URL from a missing handle, and it returns no expert inventory from a
provider storefront or provider inventory from an expert-only storefront.

The existing `users.role` and `users.handle` fields are sufficient; no schema
change is required. Providers without a claimed handle have no public
storefront link until they claim one through the established account flow.

## Verification

Verify expert and provider canonical URLs, the legacy route redirect, service
card-to-provider navigation, role isolation, and responsive rendering.