---
name: Provider storefront URL contract
description: Canonical and legacy public URL behavior for provider storefronts.
---

Public Service Provider storefront URLs use `/providers/:handle`; Expert and Local Expert storefronts use `/s/:handle`. New service-card, provider-console, share, QR-code, short-link, sitemap, and OG links must use the provider form for `service_provider` accounts. `/p/:handle` stays as a role-aware legacy entry point.

**Why:** Provider-owned services and expert-owned planning inventory have different marketplace jobs. A single mixed storefront obscures where service cards originate and lets the wrong inventory leak into the wrong public page.

**How to apply:** Resolve the account role before generating a URL. Use `/providers` only for `service_provider`, `/s` for expert-family roles, and preserve `/p` redirects until a deliberate deprecation is approved. Never emit either URL without a claimed handle.