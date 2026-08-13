---
name: Sanitizer deny-list drift
description: Deny-list response sanitizers drift from real column names and fail open; prefer allow-list projection
---
Rule: response sanitizers must be allow-list projections, never deny-lists of assumed field names.

**Why:** a deny-list written against assumed names (e.g. `paymentIntentId` when the real columns are `stripe*IntentId`) fails OPEN — sensitive fields leak silently, and newly added columns leak by default.

**How to apply:** when building or auditing a sanitized response, reconcile against the actual schema columns, not the sanitizer's own list; project through an explicit allow-list so anything new fails closed.
