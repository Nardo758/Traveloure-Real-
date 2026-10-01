# Provider domain gate — review branch only

The operator explicitly authorized the provider stage only after cancelling the
original queued task. That cancellation remains in force. This gate does not
complete or reopen that task, finish the seven-domain migration, merge, or publish.
AI and cross-domain scheduled migration work remain deferred.

## Ownership and source-to-ID evidence

Eight metadata-only provider nodes are registered once. Existing manual decisions,
authorization, application/listing persistence, role/audit transactions and rollback
remain in their original handlers. No new policy, retry, send, timer, dependency,
schema migration, or production operation was introduced.

| Stable ID | Original active producer/action | Preserved boundary |
| --- | --- | --- |
| `provider.application-bio-mirror` | `server/routes.ts` — shared `mirrorBioToUsersRow`; six calls across expert creation/resubmission and provider creation, including both compatibility aliases | Existing nonblank/trim guard and unconditional latest-submission overwrite; encompassing nonfatal catch; persisted form and response untouched. |
| `provider.expert-application-neighborhood-stamp` | `server/routes.ts` — both new-expert intake hooks | Existing server-derived stamp and its guards; new applications only, nonfatal errors; all four AI scoring calls remain outside and unchanged. |
| `provider.expert-application-decision-follow-ons` | `server/routes/admin.routes.ts` — expert approval/rejection entry notices and email | Original entered-status guard, awaited notification, and expert email import/send catch; role/status/audit/rollback outside the callback. |
| `provider.provider-application-decision-follow-ons` | Same router — provider approval/rejection entry notices and email | Original entry-only notice, awaited notification, and bare fire-and-forget email contract; no outbox conversion or new delivery guarantee. |
| `provider.expert-rejection-feedback-notification` | Same router — expert rejection-feedback update follow-on | Original awaited in-app notice; repeated feedback still repeats it; feedback persistence and response unchanged. |
| `provider.provider-rejection-feedback-follow-ons` | Same router — provider rejection-feedback update follow-ons | Original awaited notice and bare fire-and-forget rejection email; repeated feedback still repeats; no dedupe/retry added. |
| `provider.verification-decision-email` | Same router — user verification decision email follow-on | Changed verified/rejected status only, existing address guard and logged promise catch; background-check-only edits stay silent; verification write remains manual. |
| `provider.listing-review-decision-notification` | Same router — shared `notifyListingDecision`, called from all four listing/edit-review decision arms | Existing SQL dedupe/unique-violation interpretation and encompassing nonfatal catch; manual apply/discard/approve/reject/audits remain outside. |

Availability authoring and the daily weekly-pattern horizon sweep already belong
to the four bookings nodes. Verification-held listing activation already belongs
to `moderation.verification-held-listing-activation`. They were regression-tested,
not rewrapped, renamed, or transferred. No dark router, old publish helper,
automatic application/listing decision, stale-slot cleanup, quote notice/expiry,
or automatic reassignment was activated.

## Verification commands and observed results

All test children use the explicit provider-free environment allowlist in
`scripts/verification/run-messaging-gate.mjs`, synthetic Stripe/session values,
and no inherited production/provider credentials. Pure children use a deliberately
unreachable dummy database. Counts below are executable Node test cases, not
individual assertions or metadata rows.

| Gate | Command | Result |
| --- | --- | --- |
| All registry/runtime/producer tests plus existing provider approval/rejection email and price gates | `node scripts/verification/run-messaging-gate.mjs $(find server/automations -name '*.test.ts' -type f \| sort) server/__tests__/provider-approval-email.test.ts server/__tests__/provider-rejection-email.test.ts server/__tests__/listing-price-gate.test.ts` | 63 passed, 0 failed, 0 skipped |
| Existing provider directory projection | `node scripts/verification/run-messaging-gate.mjs server/__tests__/provider-directory-listings.test.ts` | 4 passed, 0 failed, 0 skipped |
| Existing F2 verification gate, publish hold, and availability authoring/materialization | `MESSAGING_DEV_FINGERPRINT=<independently-verified-development-fingerprint> node scripts/verification/run-messaging-gate.mjs --isolated-db --http-harness server/__tests__/f2-verification-gate.http.test.ts server/__tests__/publish-verification-hold.http.test.ts server/__tests__/availability-model.db.test.ts` | 33 passed, 0 failed, 0 skipped |
| Metadata-only combined registry inspection | `node node_modules/tsx/dist/cli.mjs scripts/check-automation-registry.ts` | 85 nodes, 8 provider, unique IDs |

**Total: 100 test cases passed, zero outstanding failures or skips.**

The HTTP gate independently confirmed the development database identity before
creating one empty schema with 321 cloned tables and 404 restored foreign keys.
Serial/identity sequences were isolated; no public data or sequence was copied or
claimed. The existing preload scopes sessions and rejects qualified-public SQL
and search-path resets. The fixed fixture server and tests share this schema and
the credential-free environment. The server binds an ephemeral loopback port,
reports its actual address after registration, and that exact URL is given to
tests; the ordinary preview/default port 5000 is never a fixture target.
Both process groups stopped before schema removal; removal was verified.
No verification mail/push, live Stripe action, or production job/data/schema
operation occurred.

## Superseded test-only failures

The first pure run passed 61/63 cases. Two new source assertions mismatched existing
guard/metadata wording. The next run exposed a stale route-section end marker and
another prose-only retry match. Corrected actual markers and wording assertions,
without changing production behavior; the final full pure run passed 63/63.
One targeted intermediate run also exposed an incorrect replacement end marker,
which was restored to the verified existing source marker.

The old rejection-email negative approval case could pass after an unmocked
role/audit transaction returned 500. The dummy database made the unintended query
fail visibly, with no shared data touched. Its test-only transaction seam now uses
the same mocked select/insert/update handles as the existing approval suite, and
the negative case first asserts HTTP 200, then no rejection email. Mail transport
hooks remain fake; no application or email-delivery policy changed.

## Integration and limitations

- Full current TypeScript check completed with 120 diagnostics. An independent
  compiler-host baseline read tracked files from the pre-provider Git HEAD without
  checkout or workspace source changes, also producing 120. Primary diagnostic
  fingerprints match after normalizing line offsets, expanded object-type field
  order and the unchanged truncated `transfer.paid` Stripe-union display.
  No provider registry diagnostics were introduced. This is not a clean typecheck.
- Server CJS bundle passed with the production `NODE_ENV` define; existing
  seed-file `import.meta` warnings remain.
- Independent static review found no production blocker, duplicate execution,
  import cycle, or unsafe schema-drop ordering. Its test-marker finding was
  corrected and the entire pure gate subsequently passed.
- The normal development workflow restarted once, applied zero migrations,
  and served the public landing-page screenshot successfully. Ordinary startup
  seed/scheduler behavior was unchanged and is not an isolated test assertion.
- Tests do not certify live verification SDKs, actual communication delivery,
  production data, scheduled-runner provisioning/delivery, or the deferred AI and
  cross-domain scheduled migrations.

Keep the review PR open and draft. Do not publish this workspace checkout.