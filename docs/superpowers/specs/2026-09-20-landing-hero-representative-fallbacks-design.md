# Landing hero representative fallbacks

## Goal

Keep the homepage hero's full three-photo bento composition when the live city feed lacks an eligible expert, gem, or service, without presenting fictional inventory or implying that a representative card is bookable.

## Visual behavior

- Preserve each live tile unchanged when its corresponding feed record exists.
- When the anchor expert is absent, render a large representative market card in the same slot. It uses place-only copy such as `Goa`, the representative-photo chip, and optionally an honest general `Browse Goa` link. It must not imply that a local expert exists and has no person name, price, profile link, or booking action.
- When the gem is absent, render a representative destination card in the top-right slot.
- When the service is absent, render a representative exploration card in the bottom-right slot. It has no price or `Book on Traveloure` language.
- Every bundled fallback image displays the existing `Representative photo` chip.
- Reuse the existing `/images/landing/hero-*.jpg` bundled assets and their source, creator, and Pexels-license provenance in `client/public/images/landing/ATTRIBUTION.json`; add no new photo for this work. Any future hero photo must be recorded in that same JSON with the same provenance fields.

## Ways-to-earn strip

- Replace `Offer this` with `Ways to earn` in both the landing hero and feed wanted-slot card, and update `docs/design/lane4/BEHAVIOR_MATRIX.md` so all three surfaces use one vocabulary. The link continues to `/earn`.
- Return multiple real uncovered offering needs from the selected city's live feed rather than inventing demand.
- Rotate those needs with the existing rotation behavior: eight-second cadence, pause on hover or keyboard focus, and no animated transition when reduced motion is preferred.
- Coverage is city-scoped, so every item uses the honest city-level label `Wanted in <city>` and its server-derived offering title. Do not pair a city-level need with an arbitrary neighborhood.
- If only one valid need exists, render it without rotation. If no need exists or coverage is unknown because the slot engine did not run, omit the strip.

## Data flow

1. The landing route resolves the top city, its feed, offering types, and covered offerings.
2. The route distinguishes known empty coverage from unknown coverage. Unknown coverage is passed as `null` and produces no wanted slots.
3. The pure hero composer derives an ordered list of valid city-level wanted slots only from real offering and known coverage data.
4. The wanted-pool rule must have one implementation shared with `discover-location.tsx`. If extraction is not practical, the deliberate hero divergence and unknown-coverage behavior must be documented in the mirror comments on both sides rather than silently forking the rule.
5. `/api/landing/hero` changes `wanted` from one nullable item to a list in the same PR as the client consumer; they deploy together.
6. The client prefers live tile data. Missing legs are replaced only at presentation time with representative cards, so the API never fabricates experts, gems, services, prices, or scores.
7. The client rotates through the returned wanted slots and links the informational CTA to `/earn`.

## Accessibility and failure behavior

- Representative images are decorative; the card copy carries the meaning.
- Fallback cards are not links unless they lead to a general browse surface and never masquerade as inventory.
- A failed remote image falls back to the bundled representative image.
- A failed bundled image leaves the existing gradient treatment rather than showing a broken image.
- Rotation pauses on hover/focus and respects reduced-motion through the existing shared hook.

## Verification

- Pure composer tests under `server/services/__tests__` cover unknown coverage, known empty coverage, and zero, one, and multiple wanted slots; they prove every slot originates from provided city-level feed data.
- Component tests cover null expert/gem/service legs, representative-photo chips, absence of fabricated prices/actions, and `Ways to earn`.
- Rotation tests cover multiple needs, a single need, hover/focus pause, and reduced motion.
- Existing live-tile behavior and search behavior remain unchanged.
- A production-shaped payload with no expert and no service still renders the complete three-photo bento.
- The composer tests are named explicitly in a workflow job; the test directory is closed by name and must not rely on broad discovery.

## Lane constraints

- Add one `docs/DECISIONS.md` ledger row with a `[guarded: …]` tag naming the new composer and component tests.
- No schema change, migration, or `CLAUDE.md` delta.
- Land through the normal operating procedure.
- Before any publish, restore the workspace to clean `main == origin/main`.