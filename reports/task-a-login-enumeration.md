# Task A — login enumeration

Ledger: `docs/decisions/pending/2026-10-21-login-enumeration.md` (`R?`).

A syntactically valid email and password now does one account lookup (existing lowercase email normalization), then one scrypt and one 64-byte comparison in `verifyLoginCredential` (`server/services/login-credentials.service.ts`). The route in `server/replit_integrations/auth/emailAuth.ts` no longer returns before that work for an unknown email, and it no longer returns a provider-specific message when the stored hash is missing. Unknown email, wrong password, and a provider-only account all answer HTTP 401 `{"message":"Invalid email or password"}` with no session. A usable hash is compared against itself. Anything else is compared against a fixed valid dummy hash, and that path returns false even if the bytes match. A scrypt failure still rejects and the route's existing catch answers HTTP 500 `{"message":"Failed to log in"}`. Deleted and suspended checks still run only after the password matches. A correct password still regenerates the session. Malformed bodies stay HTTP 400 and do no scrypt. Password whitespace stays significant.

The credential check does not look up accounts or create sessions, so the later email-verification work (fix-queue S-09) can sit beside it.

The sign-in modal shows the same sentence to everyone. The profile shows the provider sentence only when the signed-in user's `authProvider` is a non-empty value other than `email`. That value is already on `GET /api/auth/user`. No new provider storage, account linking, or password-setting flow.

## What the tests proved

- Unit (`server/__tests__/login-enumeration.test.ts`): dummy hash shape, default scrypt parameters match the explicit `{N:16384, r:8, p:1}` call, one derivation and one fixed-length compare, dummy path never authenticates, a short derivation throws, a scrypt error rejects, whitespace is part of the password.
- HTTP (`server/__tests__/login-enumeration.http.test.ts`), two loops on fresh `@t.test` accounts: unknown, wrong password, and provider-only share status, body, and the absence of a session; the spy sees one scrypt at key length 64 with no options object; a correct password logs in, regenerates the session, and the old cookie no longer authenticates; deleted and suspended still 403 only after a match; malformed bodies are 400 with zero scrypt; a thrown scrypt is 500; register, forgot-password, and a bad reset token keep their existing responses.
- Playwright (`playwright/tests/auth/login-enumeration.spec.ts`), two loops: the modal sentence does not change as the email changes; the three failures show the same visible error and leave the visitor on the homepage; an `email` account's profile omits the provider sentence; an account with `authProvider` `replit` that can still password-login sees it.

`tsc --noEmit` reports 115 errors, the recorded baseline. Decision guards, `scripts/phase2-fee-gate.sh`, and the guard-batch scripts were run locally against this tree.

## What the tests could not prove

- Equal wall-clock timing. The guarantee is equal credential work (one scrypt, one 64-byte compare, same parameters). No delay was added, and no timing distribution was measured.
- A real Facebook, Instagram, or Replit OAuth round trip. The profile sentence is proven for a session whose stored `authProvider` is not `email`, including an account that also has a password hash. It is not proven by completing a provider callback.
