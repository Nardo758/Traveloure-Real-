---
name: Passport is the live auth system
description: Clerk secrets exist but no Clerk code — Passport is genuinely in use; don't remove it
---
Despite CLERK_* secrets in the environment, there is **no Clerk code** in server/ or client/ (as of Aug 2026). Passport is the live auth system: Replit OIDC (replitAuth.ts), email/password login via req.login/passport.session (emailAuth.ts), and Facebook/Instagram influencer auth (facebookAuth.ts).

**Why:** A task assumed "Clerk migration happened, remove Passport" — removing it would have broken all authentication. `passport-local` was the only dead dep (removed Aug 2026).

**How to apply:** Any task claiming Clerk is the sole auth should be verified with a grep for clerk imports first. Keep `passport`/`passport-facebook` until every flow above is migrated (header notes in replitAuth.ts/facebookAuth.ts say the same).
