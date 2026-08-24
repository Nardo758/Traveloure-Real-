---
name: Legacy API parity
description: Preserving Traveloure's custom API and shared behavior during workspace migrations.
---

Traveloure's backend and frontend should continue using the existing custom API and shared contract modules when moving workspace layouts; do not substitute an incomplete generated API layer.

**Why:** The product has a broad authenticated API, WebSockets, and custom client behavior whose parity is more important than a mechanical OpenAPI conversion.

**How to apply:** For migration work, wire the established route registration and client query layer into the new artifacts first. Only replace individual contracts after their full behavior has been independently validated.