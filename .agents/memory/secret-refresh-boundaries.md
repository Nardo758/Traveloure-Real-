---
name: Secret refresh boundaries
description: How to interpret secret values after replacing a Replit project secret.
---

Existing workspace shell environments can retain the previous value after a project secret is replaced through Replit's secure form. Even a newly launched child shell may inherit that cached parent environment.

**Why:** A rotated webhook secret was securely replaced, but subsequent shell processes continued producing the retired secret's fingerprint. Treating that fingerprint as the saved project value would incorrectly diagnose a mismatch.

**How to apply:** Never use an already-running workspace environment to validate a just-replaced secret. Republish or restart the runtime that receives freshly injected secrets, and validate behavior there without exposing the secret.

## Settings for an exact-commit release

Use the secure Secrets form when the operator requests release settings as Secrets. Do not substitute production environment-variable writes.

**Why:** The environment-variable setter persists settings in tracked `.replit`, which makes an otherwise clean exact-commit checkout fail strict publish preflight. Rolling those writes back removes the settings; it does not transfer them into Secrets.

**How to apply:** Collect the requested settings through Secrets, check existence only, and leave tracked release configuration unchanged. A requested default that should remain unset must not be added.

Configuration round-trips must also preserve line endings, not just parsed values.

**Why:** Programmatic shell output can contain terminal-style CRLF; feeding that output into the validated configuration writer can change every line and fail clean-checkout preflight despite identical TOML settings.

**How to apply:** Treat shell output as terminal text rather than byte-exact file data when restoring reviewed configuration, and confirm the resulting diff is empty.