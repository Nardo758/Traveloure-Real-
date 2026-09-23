# Dispatch: Provider variant of the unified storefront

**Base:** the `main` HEAD after Task #1783 merges. Put that SHA in the brief and run `scripts/check-lane-base.sh`.
**Standing clauses:** LANE_PROTOCOL §3 applies. Commit early, never push, no `npm install`, zero new `tsc` errors or unit failures, and report before/after counts.
**Sequencing:** run this after #1783 and the directory-card task. It edits the same `storefront.tsx`.

## Problem

Providers and experts share `/s/:handle` (`storefront.tsx`). The page is written for a person who plans trips, so a business storefront reads wrong:

1. **Wrong identity.** The page title is the owner's personal name ("Marta Costa"), taken from `users.firstName/lastName`. The business name and logo exist on `service_provider_forms` (`businessName`, `businessLogo`, `businessType`) but `loadStorefront` never reads them.
2. **"Verified business" overclaims.** For providers the badge says "Verified business", but it's driven by `isOwnerIdentityVerified`. That checks the person's Stripe Identity check, not `businessVerificationStatus` or `businessRegistrationNumber`.
3. **Expert-only framing on a business page:**
   - The heading says "Plans shaped around {location}".
   - The Start a plan / "Plan it for me" panel frames the provider as a trip planner.
   - The "2 ways to plan" note, the Gems shared tile and the Ready-Made Trips lane all appear, but providers don't author those.
4. **The facts that decide a booking are hidden.** `provider_services` has these fields, and the storefront card shows none of them:
   - `durationMinutes`
   - `partySizeMin/Max`
   - `meetingPoint`, `pickupAvailable` / `serviceRadius`
   - `deliveryLanguages`
   - `leadTimeHours`
   - `cancellationPolicyType`
   - `whatToBring`
   - Instant vs. request booking (`instantBooking` / `bookingMode`)
5. **No trust signals a business would normally have:** insurance (`hasInsurance`) and instant confirmation.

## Target: provider variant (same component, branched on `isProviderRole`)

1. **Hero**
   - H1 = `businessName`, falling back to the person's name.
   - Avatar = `businessLogo`, falling back to the profile image, then initials.
   - A secondary line: "Run by {first name}".
   - Pill: `businessType` or the primary service category.
   - Location.
   - Actions: Message @handle, Share. Drop Start a plan from the provider hero.
2. **Badges**, each shown only when true:
   - "Verified business": only when `businessVerificationStatus === 'verified'`.
   - "ID verified": when the identity check passed.
   - "Insured": when `hasInsurance`.
   - "Instant booking": when `instantBooking`.
   - Never show "Verified business" based on identity alone.
3. **Fact strip**
   - Services
   - Reviews (the rating plus a count)
   - Languages (the union of `deliveryLanguages`)
   - Service area: meeting point, or "Pickup within N km"
   - On Traveloure since
   - Hide Gems shared and the "2 ways to plan" note.
4. **About** (the single section from #1783): the business description, what they offer (`serviceOffers`), and the service area.
5. **Services**
   - Heading: "Book {businessName} directly".
   - Hide the Ready-Made tab when the lane is empty. It always is for providers today.
   - Cards add chips for:
     - Duration
     - Group size ("2–8 guests")
     - Instant confirm, or Request
     - Pickup available
     - Cancellation label (`CANCELLATION_POLICY_TYPE_LABELS`)
6. **Booking panel** (replaces "Plan it for me" for providers)
   - "From $X": the minimum live price.
   - Primary button: "Check availability", which goes to the lowest-priced service's detail/date picker.
   - Secondary: "Ask a question" (message).
   - A tertiary "Add to my trip plan" link only if the planning entry supports a service source.
   - Response time.
7. **Practical info** (new, provider only): meeting point or pickup coverage, what to bring, lead time ("Book at least 24h ahead"), and the cancellation policy summary. Every item is honest-omit.
8. **Trust strip:** the same escrow-accurate copy as #1783.
9. **No outbound contact.** Don't render `website`, `mobile`, `whatsapp`, `instagramLink`, `bookingLink` or the address. This follows CLAUDE.md: contact happens only through platform channels (handle, service or booking).

## Server (`loadStorefront`)

- For provider owners, join `service_provider_forms` and return:
  - `businessName`, `businessLogo`, `businessType`, `serviceOffers`, `description`
  - `businessVerified` (derived from `businessVerificationStatus`)
  - `hasInsurance`, `instantBooking`
- Per service, return: `durationMinutes`, `partySizeMin`, `partySizeMax`, `meetingPoint`, `pickupAvailable`, `serviceRadius`, `deliveryLanguages`, `leadTimeHours`, `cancellationPolicyType`, `whatToBring`.
- Also update the OG and `<title>` builder to use `businessName` for providers.

## Data (dev fixtures)

Give the 9 seeded providers:
- Distinct business names and business types
- Real `durationMinutes` and party sizes on their services
- Mixed cancellation policies
- At least one instant-booking provider and one insured provider

Remove the shared bio template and the identical 4.7 (12) rating.

## Verify

- Playwright at 375px and 1280px on `/s/porto-provider`, `/s/kansai-bizlang` and `/s/kyoto-local` (the expert control).
- On provider pages:
  - The H1 is the business name.
  - No Start a plan, Gems or Ready-Made on the page.
  - "Verified business" appears only for a business-verified fixture.
  - Cards show duration, group size and cancellation.
  - "Check availability" lands on a date picker.
  - No outbound contact link anywhere.
- On the expert page: the #1783 layout is unchanged.
- Screenshots of all of the above.

## Out of scope

- Checkout and booking rails.
- The `sellerAway` / `BuyRefusalReason` gap.
- Provider onboarding forms.
