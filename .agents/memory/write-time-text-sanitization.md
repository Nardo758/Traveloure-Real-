---
name: Write-time text sanitization
description: Durable rules for sanitizing user-authored prose on write (stored-XSS defense-in-depth)
---
Decision: user-authored prose is sanitized ON WRITE (strip tags/script content, entity-encode `<>'"`), as defense-in-depth for non-React sinks (emails, PDFs, exports), via one shared server-side sanitizer.

**Why:** React escaping protects only React renders; raw stored payloads bite every other consumer. Review repeatedly rejected partial passes.

**How to apply (review-enforced rules):**
- Sanitize BEFORE length/required validation: entity encoding grows strings (`'` → `&#39;`, 5×) past varchar limits, and tag-only input must fail `min(1)` rather than persist empty.
- Prose hides in JSON columns (FAQ objects, string arrays, dynamic category attributes) — a top-level string-only pass is incomplete; sanitize deeply and enumerate every provider-authored field, including jsonb.
- Bare tag-stripping leaves `<script>` inner text behind; drop script/style elements including content.
