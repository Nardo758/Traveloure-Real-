---
name: Secret refresh boundaries
description: How to interpret secret values after replacing a Replit project secret.
---

Existing workspace shell environments can retain the previous value after a project secret is replaced through Replit's secure form. Even a newly launched child shell may inherit that cached parent environment.

**Why:** A rotated webhook secret was securely replaced, but subsequent shell processes continued producing the retired secret's fingerprint. Treating that fingerprint as the saved project value would incorrectly diagnose a mismatch.

**How to apply:** Never use an already-running workspace environment to validate a just-replaced secret. Republish or restart the runtime that receives freshly injected secrets, and validate behavior there without exposing the secret.