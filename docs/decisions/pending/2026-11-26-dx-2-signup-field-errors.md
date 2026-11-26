# R? - DX-2: sign-up field errors

| # | Ruling | Where | Why |
|---|---|---|---|
| R? | On `/signup`, each server `errors[]` message shows under its field, with `aria-invalid` and `aria-describedby`; when every error is placed under a field the `Validation failed` banner is not also shown. The banner stays for errors that cannot be placed, or when there is no `errors[]`. | `client/src/lib/auth-response.ts`, `client/src/components/auth/SignupForm.tsx`, `client/src/pages/Signup.tsx` | DX-2 brief (Leon, Nov 26 2026); D3 confirmed with Leon. Server messages only, no new strings; the sign-in pop-up is unchanged. |
