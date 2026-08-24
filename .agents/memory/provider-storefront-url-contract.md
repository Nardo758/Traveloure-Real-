---
name: Provider storefront URL contract
description: Canonical and legacy public URL behavior for provider storefronts.
---

Public provider storefront URLs use `/s/:handle` as the canonical route. New marketplace links, provider-console share links, QR codes, short-link redirects, sitemap entries, and OG metadata must use this form. `/p/:handle` stays routable as a backward-compatible legacy entry point.

**Why:** The approved provider-console mockups explicitly present storefronts as `traveloure.com/s/<handle>`, while existing public links had already been shared under `/p/<handle>`.

**How to apply:** Generate and display `/s/:handle` everywhere new public storefront URLs are emitted. Keep both client and server route handling for `/p/:handle` until a deliberate deprecation is approved.