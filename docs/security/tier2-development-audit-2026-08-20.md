# Tier 2 Security Audit — Development Environment

**Date:** 20 August 2026  
**Scope:** Development environment only  
**Surfaces:** Authentication/session integrity, authorization/IDOR, input validation/injection, abuse controls, and image/file upload validation  
**Verdict:** **Development gate passed for the exercised controls.** This is not a production penetration-test certification; the structural risks below remain.

## Safety boundaries

- No production users or production records were queried or modified.
- No payments, registration emails, password-reset emails, AI generations, or third-party notifications were triggered.
- Test users were inserted directly into the development database, authenticated through the real login endpoint, and deleted after each run.
- The harness refuses to run without `TIER2_DEV_AUDIT_OK=1` and refuses to run when the development and production database URLs match.
- Evidence records statuses and redacted summaries only. Cookies, credentials, reset tokens, sensitive bodies, and secret values are never printed.

## Method

Each surface was exercised with fresh randomized users, identifiers, payload variants, and rate-limit IP markers. A surface passed only after two consecutive clean loops. Confirmed defects were fixed and their original failure shape plus variations were re-run.

Primary live harness:

```text
TIER2_DEV_AUDIT_OK=1 npx tsx --test server/__tests__/tier2-security-audit.http.test.ts
```

Final result: **5/5 surfaces passed, 2/2 clean loops per surface, 0 failures**.

## Surface evidence

| Surface | Loop variations | Final evidence |
|---|---|---|
| Authentication/session | Mixed-case email, whitespace-altered password, tampered cookie, 3- and 4-way concurrent reset replay, two active devices, deleted-account session | Exactly one reset succeeds; all replays return 400; both prior sessions return 401; tampered and orphaned-account sessions return 401. Two clean loops. |
| Authorization/IDOR | Random users against real foreign booking and trip fixtures; unauthenticated/non-admin admin access; guessed message and review IDs; application query with foreign identifier | Admin paths return 401/403; foreign resources never return private data; guessed IDs return bounded 4xx responses. Real foreign booking/trip fixtures existed in both loops. |
| Validation/injection | Two stored-XSS payload families, SQL-like and SVG search strings, invalid AI roles, overlong blueprint input, 51-segment transport request, overlong image prompt | Stored profile output contains no executable markup; search does not 500 or reflect executable SVG; all malformed/oversized AI inputs return 400 before provider invocation. Two clean loops. |
| Abuse controls | Eleven login attempts, six contact submissions, eleven AI requests, and 31 search requests from fresh per-loop IPs | Final requests return 429 for auth, contact, AI, and search in both loops. |
| Upload validation | Executable/PHP bytes renamed as PNG, truncated JPEG, empty Base64, marker-only pseudo-PNG/JPEG, a valid-CRC PNG with prohibited filter byte 5, malformed GIF extension/palette semantics, oversized logical canvas, cumulative multi-frame decode work, exact 5 MiB valid image and one-byte-over boundary | Spoofed, empty, truncated, marker-only, semantically invalid, oversized-canvas, and aggregate-work payloads are rejected; exact limit passes and over-limit fails. Two live loops plus 16/16 focused unit checks. |

## Confirmed findings and remediation

### 1. Concurrent password-reset replay

**Severity:** High  
**Finding:** Reset-token selection, password update, token consumption, and session invalidation were separate operations. Concurrent requests could observe the same unused token.  
**Fix:** The reset now conditionally claims the unused/unexpired token inside one database transaction. Password replacement and deletion of both supported Passport session shapes occur in the same transaction. Any failure rolls back the claim and password change.  
**Verification:** Three and four concurrent contenders were used. Exactly one response succeeded in each loop; all others returned 400, and both pre-existing sessions returned 401.

### 2. Authenticated account-state checks did not fully fail closed

**Severity:** High  
**Finding:** Database errors continued the request, and a valid session whose user record no longer existed also continued.  
**Fix:** Lookup failures return a safe 503; missing users are logged out and return 401; suspended/deleted users remain denied.  
**Verification:** A genuine login session was created, its isolated fixture user was removed, and the next authenticated request returned 401 in both loops.

### 3. Sensitive and unsafe profile fields

**Severity:** Medium  
**Finding:** Serialized user data could retain `instagramAccessToken`; profile names/bio accepted executable markup; password comparison used ordinary string equality.  
**Fix:** Sensitive token/password fields are removed from serialized users, profile text is bounded and sanitized, currency is normalized, and password-hash comparison uses constant-time equality after strict hash-shape validation.  
**Verification:** Two stored-XSS families were saved through the real profile endpoint and returned without executable markup.

### 4. Image validation trusted declared MIME/container markers

**Severity:** High  
**Finding:** Base64 and MIME checks accepted renamed non-images. A first remediation using only file sentinels was rejected during independent review because marker-only pseudo-images could still pass.  
**Fix:** Central validation now parses JPEG frame components, quantization-table references, scan selectors, entropy data, and exact segment structure, then requires a bounded non-tolerant `jpeg-js` decode. PNG validation parses mandatory chunks, bounds and inflates image data to the exact declared scanline size, then requires a CRC-checking `pngjs` decode so invalid filter semantics cannot pass. GIF validation requires an active color table, enforces each extension's fixed structure, bounds logical-canvas and cumulative animation work, and decodes each LZW stream to the declared pixel count while checking color indices. Pixel, frame-count, aggregate decoded-pixel, and decoded-byte caps bound decompression work. WebP uploads are explicitly disabled in both server policy and the expert-photo picker until a bounded decoder is integrated. Static site WebP assets are unaffected. The expert-photo path reuses the shared validator with its 2 MiB limit.
**Verification:** Executable/PHP payloads, truncation, empty data, malformed JPEG/GIF streams, extensions, and transparent palette references, marker-only pseudo-images, a valid-CRC 1×1 PNG using prohibited filter byte 5, a 65,535×65,535 logical-canvas GIF carrying only a 1×1 frame, and a two-frame low-entropy GIF exceeding the global 64 MiB decoded budget all fail. Header-only VP8L is rejected as a disallowed format. Real minimal PNG/JPEG/GIF fixtures and a decoded exact-5-MiB JPEG pass.

### 5. AI/provider requests were insufficiently bounded

**Severity:** High  
**Finding:** Blueprint, chat, optimization, transport-package, and dormant image-generation handlers accepted unbounded or weakly typed prompt inputs. The transport route was outside the global `/api/ai` limiter.  
**Fix:** Strict Zod schemas now bound strings, arrays, aggregate chat content, JSON context, numeric ranges, roles, service counts, and transport segments. Transport generation receives the AI limiter. Invalid model JSON is handled without leaking provider details. The dormant image route requires authentication, strict limiting, and an allowlisted size if it is mounted in future.  
**Verification:** Invalid role, overlong destination/prompt, and 51-segment payloads return 400 before any provider call. No AI provider request was made by the audit.

### 6. Submission endpoints relied on broad limits

**Severity:** Medium  
**Finding:** Contact and expert-application submissions had no narrow path-specific abuse control.  
**Fix:** Path-scoped strict limits protect contact, expert applications/forms, and expert photo uploads. Strict limiter keys include the path so one protected form does not consume another form's allowance.  
**Verification:** The sixth contact request returns 429 in both fresh-IP loops; auth, AI, and search thresholds also return 429 at their configured boundaries.

## Authorization conclusion

No exploitable IDOR was confirmed in the tested development routes. The live negative matrix used actual foreign booking and trip rows in both loops and exercised admin, message, review, and application boundaries. This is evidence for the selected routes, not proof that every route in the large application has equivalent negative coverage.

## Structural and out-of-scope risks

1. **Rate limits are process-local and primarily IP-based.** They are effective in one development process but do not coordinate across multiple deployed instances and are not account/cost quotas. A shared production limiter remains necessary for distributed abuse resilience.
2. **Authorization negative coverage remains sparse across the full route inventory.** The critical sampled paths passed, but every admin/payout/application/message mutation is not represented by a dedicated negative test.
3. **`/api/generate-image` is currently not mounted.** Live requests return 404, so it is not an active cost surface. Its handler was secured defensively before any future registration; enabling it requires a dedicated live test and product policy decision.
4. **Local Playwright CLI initially could not launch Chromium because `libglib-2.0.so.0` was unavailable.** The audit used a native HTTP/DB harness. A managed browser verification later passed the homepage and confirmed `/api/auth/me` returns a minimal 401 response.
5. **Existing TypeScript baseline is not clean.** Final `tsc --noEmit` reports the established 164-error project baseline; no error was reported in the changed PNG validator or its test.
6. **Development Vite HMR websocket errors remain visible.** They did not block rendering or API verification and are unrelated to the audited controls.

## Scanner evidence

- Initial dependency audit: **3 high, 7 moderate, 1 low**.
  - Safe updates available: `postcss` 8.5.15 → 8.5.18 and `ip-address` 10.2.0 → 10.3.1.
  - `uuid` remediation proposed by the scanner is a major upgrade (9.0.1 → 11.1.1) and requires compatibility review.
- SAST: 3 critical reports reviewed as parameterized/static SQL maintenance-script false positives.
- Secret scan: 2 critical reports reviewed; logged values are readiness markers/warmup summaries, not secret material.

Dependency maintenance is reported separately because it is outside the five requested dynamic audit surfaces.

After adding `jpeg-js`, a final `npm audit --omit=dev` reported **2 high, 7 moderate, 0 low**, with no advisory against `jpeg-js`.

## Final checks

- Live two-loop audit: **PASS (5/5)**
- Image validation regression: **PASS (16/16)**
- Expert-application XSS regression: **PASS (10/10)**
- Independent blocker review: **PASS (no confirmed task-blocking defect)**
- TypeScript comparison: **PASS (164 errors, unchanged baseline; no PNG-related error)**
- Managed browser smoke/auth response: **PASS**
- Application workflow after restart: **RUNNING**
- Homepage snapshot: rendered successfully
- Secret/cookie/token leakage in evidence: **none**
