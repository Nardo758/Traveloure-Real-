# Review-branch snapshot status

This is an intermediate review-branch snapshot. The messaging stage has resumed
and passed its gate; this is not completion of the seven-domain migration and
not a production release candidate.

## Completed domain gates

- Payments: 199 unique tests passed, with no outstanding failures or skips.
  See `payments-verification.md` for commands and the isolated webhook harness.
- Moderation/security: 87 tests passed, with no failures or skips, including the
  two existing full-app verification suites on the isolated test server.
  See `moderation-verification.md` for scope and commands.
- Bookings: 126 unique cases passed, with no outstanding failures or skips.
  All 17 booking nodes have source-to-ID evidence. The five initially skipped
  deposit-cancel cases passed against the isolated development harness and
  existing Stripe test key after correcting two test-only fixture mismatches.
  No booking, fee, or refund policy changed. See `bookings-verification.md`,
  including superseded setup failures and external-test/email disclosures.
- Messaging: 110 unique checks passed (81 pure, 29 isolated DB/WebSocket), with
  no outstanding failures or skips. All 19 messaging nodes have source-to-ID
  evidence; no verification mail/push or live Stripe action occurred. The empty
  development fixture schema was removed. See `messaging-verification.md`.

## In-progress and remaining work

- Provider, AI, and cross-domain scheduled migrations have not started.
- The shared registry currently validates 77 nodes across the first four domains.
  All 32 registry/adapter cases pass with an allowlisted environment and a
  deliberately unreachable dummy database URL.
- The final messaging TypeScript check completed with 120 diagnostics, matching
  the measured baseline, and no diagnostics in the registry modules. Normalized
  fingerprints match after removing expanded object-type rendering and the
  unchanged `transfer.paid` diagnostic's truncated Stripe-union display order.
  This is not a clean typecheck.
- The server bundle passed and independent messaging review found no blocker.
- The development workflow restarted and the landing-page smoke check passed.
  The earlier bookings-stage restart applied two pre-existing pending development
  migrations; neither was authored by this registry migration. See its verification note.
- Separate scheduled-runner provisioning and delivery evidence remain unverified.
- No production Nominatim reachability result was obtained.

## Release boundary

This branch includes the canonical paid-booking confirmation prerequisite because
the base `origin/main` did not contain it. No merge, publish, production data edit,
production job execution, or production schema change accompanies this snapshot.
Do not publish this workspace checkout. Resume and verify the remaining migration
stages, obtain human review, and follow the existing release procedure.