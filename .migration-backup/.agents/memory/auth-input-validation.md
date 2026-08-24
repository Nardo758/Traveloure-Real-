---
name: Email-auth input validation posture
description: Length caps + no-trim rules on the public email-auth routes, and why
---
Public email-auth routes (server/replit_integrations/auth/emailAuth.ts) must bound every hashed/queried input:
- register/reset newPassword: min 8, **max 200**, NO .trim() — hashPassword runs scrypt verbatim; unbounded = CPU/memory DoS.
- login password: NO .trim() (register stores verbatim; trimming let a padded variant of a correct password authenticate and locked out passwords with real edge whitespace).
- firstName/lastName: trim + max 100 (an unbounded firstName persisted 100k chars = storage DoS; React + escHtml() render safe, so it was DoS not stored-XSS).
- email: max 254; reset/verify tokens: max 128 (generated as 64-hex).

**Why:** pre-launch pen-test (Aug 2026) found unbounded firstName + login trim + unbounded reset scrypt input.
**How to apply:** any new public auth field that gets hashed or written needs a max; never .trim() a password anywhere. forgot-password intentionally returns generic 200 even on validation failure (anti-enumeration) — the .max() still short-circuits safeParse before the DB query, so that is fine.
