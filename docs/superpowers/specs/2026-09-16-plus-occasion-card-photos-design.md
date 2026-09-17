# Plus occasion card photography

## Goal

Replace the abstract color headers on the three Plus pricing cards with candid photography that explains the product at a glance without suggesting destination travel.

## Product vocabulary and routes

- The cards remain Birthday, Anniversary, and Date Night, matching the Plus intake keys `birthday`, `anniversary`, and `date_night`.
- The cards remain informational. The existing “Set up your occasions” action continues to route from `/pricing` to the protected `/plus/occasions` intake.
- Photography depicts attainable plans in a member’s home city, consistent with the Plus product promise.

## Visual treatment

- Use one candid lifestyle photo per card.
- Keep the current compact three-card layout.
- Apply a restrained dark gradient and retain the existing occasion icon as a small frosted marker.
- Use occasion-specific alt text and lazy loading.
- Store source and license details beside the image assets.

## Responsive behavior

The existing grid stacks the cards on small screens and displays three columns from the `sm` breakpoint. Images use a fixed-height, full-width crop with per-photo focal positioning.