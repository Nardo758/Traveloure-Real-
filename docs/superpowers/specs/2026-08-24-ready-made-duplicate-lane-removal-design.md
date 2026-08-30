# Ready-Made Trips duplicate lane removal

## Purpose

Remove the duplicate **Itinerary Templates** lane from the Ready-Made Trips marketplace surface. Travelers should see the Ready-Made Trips shelf once, without an empty secondary catalog panel beneath it.

## Scope

### Remove

- The `Itinerary Templates` heading, description, availability count, empty state, and its expert/public calls to action from the packages marketplace surface.
- Template cards and the “View all templates” control from that same surface.
- The local public-template query, loading state, and other component state or imports that become unused solely because of the removed lane.

### Preserve

- The approved Ready-Made Trips shelf, including its theme filters and cards.
- Existing `/expert-templates/:id` routes and all direct links to them.
- Template purchases, reviews, purchaser access, short links, seller workflows, admin approval, and accounting data.
- Existing storefront, expert profile, recommendation, and service-detail surfaces that can still link to a legacy template.

## Behavior

`/ready-made` and the packages tab will render only the Ready-Made Trips shelf. When no Ready-Made Trips are available, the marketplace must not render the retired template lane as a fallback.

No API, schema, data migration, redirect, or payment change is part of this work.

## Vocabulary boundary

This change intentionally does not rename legacy-template vocabulary outside the removed lane. Existing traveler-facing surfaces use inconsistent wording for the legacy template product and the newer Ready-Made Trip catalog; that requires a separate terminology decision so the two data models are not accidentally conflated by a piecemeal rename.

## Verification

- The recovered Field Guide build succeeds.
- `/ready-made` renders the Ready-Made Trips UI without the Itinerary Templates heading or empty state.
- Existing Ready-Made Trip filtering and cards still render when data is present.
- Direct `/expert-templates/:id` routes remain registered and unaffected.