# Expert cards and public landing pages

## Goal

Bring expert discovery and public expert destinations into the same visual and content-quality system as the Marketplace:

- Expert cards use a clear, editorial Marketplace-style structure.
- `/experts/:id` uses a polished public expert profile layout.
- `/s/:handle` and legacy `/p/:handle` use the same public identity and offering language.
- Untrusted profile content cannot corrupt the visible layout or become executable markup.

## Public content safety

Public profile data is user-controlled and must be treated as plain text:

- Add one shared display-normalization helper for public names, bios, locations, specialties, languages, neighborhood names, and offering titles.
- Normalize whitespace and control characters, remove markup-like tags from visible text, and apply explicit fallbacks for missing values.
- Continue rendering values through normal React text interpolation only. No public profile surface may use `dangerouslySetInnerHTML`.
- Keep image URLs and route handles separate from display text; only accepted image URL schemes may be used as image sources.
- The safety layer is display-focused and does not silently rewrite database records.

## Expert cards

Update `ExpertCard` to follow the Marketplace card rhythm while keeping it recognizable as a person card:

- A visual identity/header area with the profile avatar and a deterministic fallback treatment.
- Name, role, verification state, location, honest rating/review state, and response-time proof.
- Bounded specialty, language, and neighborhood chips with safe text and stable keys.
- Storefront inventory badges only when real counts are non-zero.
- A consistent action footer for Message, View Profile, and the canonical storefront link when a handle exists.

Existing search filters, neighborhood callbacks, sign-in behavior, profile links, and storefront links remain functional.

## Expert profile page

Update `/experts/:id` for experts without a claimed storefront:

- Keep the shared global navigation and existing loading/not-found states.
- Replace the old gray hero with a Field Guide-style identity hero: avatar, name, role, location, trust badges, proof stats, and a clear primary contact/booking action.
- Use consistent editorial section headings and Marketplace-style lanes for services and Ready-Made Trips.
- Keep expert-template, review, plan-handoff, contact, consultation, and auth behavior unchanged.
- Preserve the existing redirect to `/s/:handle` for experts who have claimed a public storefront handle.

## Public storefront

Update `/s/:handle` and `/p/:handle` without changing the canonical URL contract:

- Keep `/s/:handle` canonical and `/p/:handle` compatible.
- Use shared global navigation for loading, error, and loaded states; remove the duplicate custom logo/language header.
- Restyle the storefront identity hero and offering lanes to match the Marketplace card language.
- Keep cover-image fallback, verified state, away status, category filters, search, share, message, service booking, template, and Ready-Made links intact.
- Keep all offering prices, availability, booking modes, and server-gated data unchanged.

## Data flow and boundaries

- The server remains the source of truth for experts, storefronts, services, trips, templates, reviews, identity, and metrics.
- The client normalizes only values at the public display boundary.
- Existing canonical links remain: `/experts/:id` for unclaimed expert profiles, `/s/:handle` for claimed storefronts, and `/p/:handle` as a legacy alias.
- No database migration, data cleanup, route rename, checkout change, or offering deletion is included.

## Error and empty states

- Missing names, bios, locations, images, ratings, and counts use honest fallbacks rather than generic claims.
- Empty service/trip/review lanes remain hidden or show their existing empty state; no fabricated inventory is added.
- Invalid public text must not break card layout, link targets, or action buttons.
- API failures keep the current not-found/error behavior and shared navigation.

## Verification

- Build succeeds with no new TypeScript or bundler errors.
- Expert discovery renders safe, legible cards for normal, missing-data, and markup-like profile values.
- `/experts/:id` renders the new profile hero and preserves contact, booking, handoff, review, service, and trip interactions.
- `/s/:handle` and `/p/:handle` render the shared navigation and consistent storefront identity/offering layout.
- Storefront filters, search, share, message, away status, and offering links continue to work.
- Browser checks cover desktop and mobile layouts and confirm markup-like input is displayed safely without executing or breaking the page.