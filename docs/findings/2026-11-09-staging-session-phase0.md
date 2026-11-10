# Staging sign-up/session investigation — Phase 0

Status: diagnosis only; **not a session-persistence fix**. No application code,
user-facing strings, Secrets, migrations, seeds, or account data changed.

## Scope and source

Requested base: `b81a6ee2aa9e57db64991679569dd17d0c551e34` (gate-cookie
merge plus ledger stamp). The findings below describe that source.

Reported symptom: sign-up returns to the sign-in modal and sign-in may bounce,
at approximately 20:53 America/New_York on 2026-11-09.

The read-only deployment investigation queried **2026-11-10
01:50:00–01:55:00 UTC**, equivalent to **20:50–20:55 EST on November 9**.
Latest successful staging revision before the window:
`176ed225-e2e1-4afe-935a-e3e1db82c8f4`, created at 01:39:27 UTC.
Telemetry did not independently establish its source commit; do not describe
these logs as proof that the requested source revision was served.

## 1. Runtime evidence

### Gate-401 distribution by reported instance

| Reported instance | Reason | Gate-cookie state | Count | UTC timestamps |
| --- | --- | --- | --- | --- |
| `localhost:35` | `no_authorization_header` | `absent` | 2 | 01:50:24.177, 01:50:27.469 |

These are exact `staging gate 401` structured messages, not all HTTP 401s.
`localhost:35` is the application's hostname/PID field, **not a verified unique
Autoscale instance identifier**. The available evidence cannot establish a
distribution across distinct infrastructure instances.

### Auth request completions

All listed request completions report `hostname=localhost`, `pid=35`.
Their response content type is `application/json; charset=utf-8`.

| Method/path | Status | UTC timestamps |
| --- | --- | --- |
| POST `/api/auth/register` | 202 (2) | 01:52:17.942, 01:52:59.750 |
| POST `/api/auth/login` | 401 (4) | 01:52:18.142, 01:52:40.589, 01:53:07.689, 01:53:14.632 |
| GET `/api/auth/user` | 401 (1) | 01:50:27.580 |

No post-registration `/api/auth/user` completion or successful login is present
in the targeted window. The gate's challenges are plain text; the four JSON
login 401s are consistent with the email route's credential-rejection branch,
not a session that was created successfully and then lost. Exact response
bodies were not logged and are not reconstructed here.

Targeted log queries were complete. The unfiltered window was truncated.
Endpoint metrics returned fewer register/login requests than the completion
logs, so those metrics are not substituted for the logged counts.

Read-only staging production-database check (no account identifiers, password
hashes, or session contents selected):

```sql
SELECT count(*) AS accounts_created_in_window
FROM public.users
WHERE created_at >= '2026-11-10T01:50:00Z'::timestamptz
  AND created_at < '2026-11-10T01:55:00Z'::timestamptz;
-- 0
```

The neutral 202s therefore do **not** establish fresh account creation.
Existing-address/unique-conflict neutral responses are a plausible explanation.
Without request-to-account correlation, this does not identify which account
was used or why its credentials were rejected.

## 2. Session configuration

Source: `server/replit_integrations/auth/replitAuth.ts`, `getSession`/`setupAuth`,
and `server/db-pool-config.ts`.

- Store: **connect-pg-simple**, PostgreSQL `sessions` table, using
  `DATABASE_URL` through `sessionPoolConfig`. Not MemoryStore.
- The `public.sessions` table **exists** in the staging production database
  (read-only information-schema query). No table creation or migration needed
  for this investigation.
- `SESSION_SECRET` comes directly from the environment, with no per-instance
  random fallback in this session middleware. Its deployment Secret name is
  present. Values and per-instance equality were not inspected.
- `resave: false`; `saveUninitialized: false`.
- Cookie: HttpOnly, SameSite=Lax, seven-day max age, no explicit domain
  (host-only), default path `/`. Secure when `NODE_ENV=production`, except the
  explicit `SESSION_COOKIE_INSECURE=1` test override. Runtime values of that
  override and forwarded-proto headers were not checked.
- `app.set("trust proxy", 1)` precedes the session middleware.
- Staging and production use the **same store implementation and configuration
  path**, each against its environment's database. There is no staging-only
  MemoryStore branch. This does not prove that separate processes currently
  have identical deployed Secret values.
- Passport serializes/deserializes users in every environment.

## 3. Registration and login contract

Source: `server/replit_integrations/auth/emailAuth.ts`,
`shared/registration-neutral.ts`,
`client/src/components/auth/SignupForm.tsx`, and `SignInModal.tsx`.

- Registration intentionally does **not** call `req.login`. New and existing
  addresses receive the same neutral 202 without a new authenticated session
  (AUTH-1 3b). Changing registration to authenticate directly would violate
  that existing anti-enumeration contract.
- After a neutral registration response, `signInAfterSignup` sends a separate
  POST `/api/auth/login` with the entered credentials and `credentials: include`.
  A failed login returns the form to sign-in.
- Login verifies credentials **before** creating a session. Its explicit JSON
  401 branch rejects incorrect/unusable credentials or an unknown account;
  deleted/suspended account checks return 403.
- Successful login explicitly regenerates the session, then invokes Passport
  `req.login`. The route stamps verification fields afterward and responds.
  It has no additional explicit `req.session.save` after that stamp.
  That merits a regression test if successful-login loss is reproduced, but
  does not explain these pre-session credential rejections.

## Decision and next evidence

**No session-store replacement or registration auto-login fix is justified by
this window.** Production behavior remains unchanged. There is no demonstrated
production session defect in this evidence.

Before a code fix, Leon should reproduce with a genuinely unused allowed
staging address, or use the supported reset flow for a known account. Capture
the register → login → `/api/auth/user` status sequence without credentials or
cookie values. A login **200 followed by an unauthenticated next request** would
establish the session-loss path that this report currently lacks.

The requested regression coverage must preserve neutral registration: test
register → separate login → authenticated next request, plus replay against
a second app with a separate store object using the same database/secret.
No new tests were added or run in this documentation-only Phase 0 PR. This PR
must remain draft and must not be described as a completed bug fix.
