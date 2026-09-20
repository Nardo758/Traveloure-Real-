# Landing hero representative fallbacks

## Goal

Keep the homepage hero's full three-photo bento composition when the live city feed lacks an eligible expert, gem, or service, without presenting fictional inventory or implying that a representative card is bookable.

## Visual behavior

- Preserve each live tile unchanged when its corresponding feed record exists.
- When the anchor expert is absent, render a large representative market card in the same slot. It uses the current Preview photo treatment, neutral copy such as `Local perspective in Goa`, and no person name, price, profile link, or booking action.
- When the gem is absent, render a representative destination card in the top-right slot.
- When the service is absent, render a representative exploration card in the bottom-right slot. It has no price or `Book on Traveloure` language.
- Every bundled fallback image displays the existing `Representative photo` chip.
- Use the same licensed photos currently shown by Preview. Store them as bundled assets with source, photographer, and license provenance, following the representative-photo pattern used by the Plan-the-moment section.

## Ways-to-earn strip

- Replace the `Offer this` link text with `Ways to earn`; it continues to link to `/earn`.
- Return multiple real uncovered offering needs from the selected city's live feed rather than inventing demand.
- Rotate those needs with the existing rotation behavior: eight-second cadence, pause on hover or keyboard focus, and no animated transition when reduced motion is preferred.
- Each item retains the honest `Wanted in <neighborhood>` label and its server-derived offering title.
- If only one valid need exists, render it without rotation. If no need exists, omit the strip.

## Data flow

1. The landing route resolves the top city, its feed, offering types, and covered offerings.
2. The pure hero composer derives an ordered list of valid wanted slots from real neighborhood and offering data.
3. `/api/landing/hero` returns the existing live legs plus the wanted-slot list.
4. The client prefers live tile data. Missing legs are replaced only at presentation time with representative cards, so the API never fabricates experts, gems, services, prices, or scores.
5. The client rotates through the returned wanted slots and links the informational CTA to `/earn`.

## Accessibility and failure behavior

- Representative images are decorative; the card copy carries the meaning.
- Fallback cards are not links unless they lead to a general browse surface and never masquerade as inventory.
- A failed remote image falls back to the bundled representative image.
- A failed bundled image leaves the existing gradient treatment rather than showing a broken image.
- Rotation pauses on hover/focus and respects reduced-motion through the existing shared hook.

## Verification

- Pure composer tests cover zero, one, and multiple wanted slots and prove every slot originates from provided feed data.
- Component tests cover null expert/gem/service legs, representative-photo chips, absence of fabricated prices/actions, and `Ways to earn`.
- Rotation tests cover multiple needs, a single need, hover/focus pause, and reduced motion.
- Existing live-tile behavior and search behavior remain unchanged.
- A production-shaped payload with no expert and no service still renders the complete three-photo bento.