---
name: Provider role string
description: The DB role value for service providers is 'service_provider', not 'provider'.
---

## Rule
When checking if a user is a service provider, include BOTH strings:
```ts
if (!["service_provider", "provider"].includes(dbUser.role)) { ... }
```

**Why:** The seed data and registration flow stores provider users with role `service_provider` in the DB. Some code checks for `provider` only, causing 403s for all provider users logged in via email/password. Verified in DB: `pacific-rentals@traveloure.test` has role `service_provider`.

**How to apply:** All provider-specific routes in `provider.ts` and related files.
