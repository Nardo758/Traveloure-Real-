---
name: Write-time text sanitization
description: Rules for sanitizing user-authored prose on write (stored-XSS defense-in-depth)
---

# Write-time text sanitization

Shared sanitizer: `server/utils/text-sanitizer.ts` (strip script/style incl. content, strip tags, entity-encode `<>'"`). Provider/expert prose is sanitized ON WRITE as defense-in-depth for non-React sinks (emails, PDFs, exports).

**Rules learned (review-enforced):**
- Sanitize BEFORE zod length/min validation (`z.preprocess` or sanitize the raw body before `.parse`). Entity encoding grows strings (`'` → `&#39;`, 5×) and can push an accepted value past a varchar limit; tag-only input sanitizes to `""` and must fail `min(1)` rather than persist empty.
- Prose lives in JSON columns too: field allow-lists must cover structured prose (faqs question/answer, whatIncluded/requirements arrays, pricingTiers label/unit/description) via deep sanitization — a top-level string-only pass is incomplete and gets rejected in review.
- Bare tag-stripping leaves `<script>` inner text behind; drop script/style elements including content first.

**How to apply:** any new user-authored free-text write endpoint should reuse `sanitizeText`/`sanitizeDeep`/`sanitizeTextFields`; regression tests in `server/__tests__/text-sanitization.test.ts`.
