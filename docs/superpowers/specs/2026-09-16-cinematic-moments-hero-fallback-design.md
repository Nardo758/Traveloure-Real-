# Cinematic moment photography and hero fallback

## Goal
Raise the representative Moment photography to the proposal image's editorial quality and prevent the Kyoto hero cards from displaying empty gradients when remote imagery fails.

## Photography direction
Use a proposal-specific Unsplash image that clearly shows the ring exchange at night. The other representative images remain locally bundled, reusable licensed photos that combine three qualities: each remains specific to its occasion; people or social activity appears where natural; and dusk, evening, warm interior, or late-day light creates depth and anticipation. Golf remains clearly golf-focused with players and golden light.

Every representative image retains a visible representative label and linked creator/license credit. It never receives expert attribution. The approved wedding, proposal, golf, and girls' trip images remain pinned because the current expert-media query is city-level rather than Moment-level; allowing it to replace them can duplicate one city's image under multiple labels. Other Moments may still use qualifying expert photography until expert media is associated with a specific Moment key.

## Hero card behavior
Remote API imagery remains first choice. The local-expert, gem, and service cards each receive a bundled fallback appropriate to the active market. Missing or failed remote URLs switch to that local image rather than exposing the gradient. Fallback imagery carries the existing Reference photo label. The readability overlay remains above the image and below content and badges.

## Verification
Cover remote success, missing URL, and image-error fallback in component tests. Verify the representative-photo metadata and build, then inspect the homepage at desktop and mobile widths.
