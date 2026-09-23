# Dispatch: One directory card for providers and experts

**Base:** `main` @ `2fcdcd60`. Run `bash scripts/check-lane-base.sh 2fcdcd60` first.
**Standing clauses:** LANE_PROTOCOL §3 applies. Commit early, never push, no `npm install`, zero new `tsc` errors or unit failures, and report before/after counts.
**Sequencing:** do this after Task #1783 lands. The card's primary button targets the unified `/s/:handle` storefront.

## Problem

`/providers` and `/experts` list the same kind of thing: an earner with a storefront. They use two unrelated cards.

**Provider card** (`ProviderCard` in `client/src/pages/providers-directory.tsx`) is too thin:

- No location. `GET /api/provider-storefronts` already returns `location` from `resolveEarnerLocation`, but the card never renders it. The page's comments ("no location facet") are stale.
- No category or what-they-do. You can't tell a photographer from a food tour without clicking.
- No starting price and no verified badge.
- No Message button. The whole card is a single link.
- The search box says "What do you need help with?" but only matches name and handle (`matchesProviderSearch`). Searching "photography" returns nothing.

**Expert card** (`client/src/components/expert-card.tsx`) is rich but repeats itself:

- The price appears twice: "from $0" in the meta line and "$0 PLAN IT FOR ME" in the facts row.
- The review state appears twice: "New" in the meta line and "New / NO REVIEWS YET" in the facts row.
- The volume appears twice: a "3 services" chip and "3 OFFERINGS".
- The card has four links to the same place: "More from X", "@handle", "View profile", and the card title.
- It shows "$0" prices. `expertLowestPrice` filters out values ≤ 0, so find the path that still renders `$0` and fix it.
- The heart button only flips local `useState`. Nothing is saved, and it resets on reload. `/api/saved-items` exists.
- Broken images: Mika Fujita's avatar renders solid black, and Inês Almeida's renders alt text.
- Raw data leaks: Mika's response time shows "2" instead of a formatted label.
- Names get truncated ("Demo Porto Gui…").

## Target: one shared `EarnerCard`

Extract a single component used by `/providers`, `/experts` and the city feed. It uses the same grammar for every role, and each field only renders when real data exists (§13 honest-omit).

1. **Header**
   - `Avatar` with an initials fallback, which also covers broken URLs.
   - Name, wrapping to 2 lines, never truncated.
   - Verified badge.
   - Role pill: "Local Expert", "Trip Planner", or, for a provider, the primary service category from `providerServices.categoryId`.
   - Location.
   - Save heart, wired to `/api/saved-items`. For a guest, it opens sign-in. If saving can't be wired in this lane, remove the heart.
2. **Meta line:** rating, or "New"; response time (experts only, via `formatExpertResponseTime`); languages.
3. **Body**
   - Bio clamped to 2 lines.
   - Up to 3 chips: specialties or neighbourhoods for experts, service categories for providers, then "+N".
4. **Facts row, and nothing else repeats it**
   - **From:** the lowest live price > 0. Hide it if there's none; never show "$0".
   - **Rating:** "4.7 (12)" or "New".
   - **Offerings:** the count.
   - Delete the duplicate meta-line price, the "N services" chip and the "More from X" link.
5. **Footer**
   - `@handle` as plain text.
   - Two buttons: **Message** (outline) and **View storefront** (primary → `/s/:handle`).
   - The card body stays clickable to the same `/s/:handle`, so there's one destination.

## Provider directory API and page

- `loadProviderStorefrontDirectory` should return these additional fields, all real:
  - `categories`: distinct category names across approved, active services
  - `startingPrice`: minimum price > 0 among services with `showPrice`
  - `verified`: the same `identityVerificationStatus === 'verified'` signal the storefront uses
  - `languages`, if the provider form carries them
- **Filters:** add a Location select and a Category select built from the returned rows, following the `/experts` filter-bar pattern, plus a result count.
- **Search:** extend it to match categories and location, or change the placeholder to "Search providers by name". Don't keep a placeholder that promises more than the search does.
- Update the stale "no location facet" comments.

## Data (dev fixtures)

- The public directories list QA fixtures: "Test Provider", Kenji Nakamura ("DEV-only B5 verification fixture…"), and "Demo Porto/Goa/Bogotá… Guide". Confirm they are excluded in production. If a flag is missing, add a directory exclusion for fixture accounts.
- All 9 seeded providers share the same bio template ("A trusted {City} team for warm, well-organized traveler experiences.") and an identical 4.7 (12) rating. Give them distinct bios and categories so the design can be judged.
- Fix Mika Fujita's and Inês Almeida's `profileImageUrl`.

## Verify

- Playwright at 375px and 1280px on `/providers` and `/experts`:
  - Every card shows location and a role or category pill.
  - No "$0" anywhere.
  - Price, rating and offerings each appear once per card.
  - The avatar fallback renders when the image 404s.
  - The save heart persists across a reload for a signed-in traveler.
  - The location filter narrows provider results.
  - Searching "photography" finds the photography provider.
- Screenshots of both directories before and after.

## Out of scope

- Storefront page layout (Task #1783).
- Ranking and sort logic.
