# Review-branch snapshot status

This is an intermediate snapshot requested by the operator, not completion of the
seven-domain migration and not a production release candidate.

## Completed domain gates

- Payments: 199 unique tests passed, with no outstanding failures or skips.
  See `payments-verification.md` for commands and the isolated webhook harness.
- Moderation/security: 87 tests passed, with no failures or skips, including the
  two existing full-app verification suites on the isolated test server.
  See `moderation-verification.md` for scope and commands.

## In-progress and remaining work

- Bookings implementation was paused for this repository snapshot. Its complete
  domain regression gate and source-to-ID evidence have **not** been completed.
- Messaging, provider, AI, and cross-domain scheduled migrations have not started.
- The shared registry currently validates 58 nodes across the first three domains.
  The 14 current registry/adapter tests pass with a deliberately unreachable dummy
  database URL; these are not a substitute for the bookings domain gate.
- A snapshot TypeScript check hit its 120-second limit before reporting results.
  The previously completed payments/moderation checks remained at the measured
  120-diagnostic baseline. That does not establish the bookings snapshot's type
  status.
- Separate scheduled-runner provisioning and delivery evidence remain unverified.
- No production Nominatim reachability result was obtained.

## Release boundary

This branch includes the canonical paid-booking confirmation prerequisite because
the base `origin/main` did not contain it. No merge, publish, production data edit,
production job execution, or production schema change accompanies this snapshot.
Do not publish this workspace checkout. Resume and verify the remaining migration
stages, obtain human review, and follow the existing release procedure.