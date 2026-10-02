# Messaging automation migration verification

## Scope and source-to-ID evidence

This stage implements the approved messaging inventory without changing message
policies, recipients, authorization, transactions, delivery claims, timers, or
business-domain ownership. It adds 19 messaging nodes; the combined registry has
77 nodes. Node files contain metadata only, not service imports or alternate runners.

| Existing boundary | Stable ID | Preserved behavior |
|---|---|---|
| `email-outbox.service.ts` public `enqueueEmail` | `messaging.email-outbox-enqueue` | Processing-at-insert, 10-minute lease, immediate attempt, direct single attempt if insert fails, and nullable/nonthrowing return. No universal producer dedupe is claimed. |
| Public `drainOutbox` | `messaging.email-outbox-drain` | Original due/expired-lease SQL claim, batch size, conditional status updates, six-attempt ceiling and 5/15/45/120/360-minute backoffs. |
| Admin retry after authenticated failed/dead-only reset | `messaging.email-outbox-admin-retry` | Existing reset stays in the admin request; its asynchronous drain is dispatched once. This is explicit operator replay, not a new retry policy. |
| `web-push.service.ts` immediate dispatch | `messaging.push-notification-dispatch` | Preferences/VAPID/subscriptions, notification claim before attempt, invalid-subscription removal, and nonfatal behavior. Failed claimed notices are not automatically retried. |
| Existing notification push sweep | `messaging.push-notification-sweep` | Original 15-minute candidate window and atomic claim; same outbox-job sweep sequence. |
| `email.service.ts` password-reset sender | `messaging.auth-password-reset-email` | Existing caller/account/token gates stay in auth; original direct sender no-key/throw behavior. |
| Verification sender | `messaging.auth-verification-email` | Registration/resend caller ordering, token lifecycle, direct-send return/error behavior. |
| Welcome sender | `messaging.auth-welcome-email` | Existing signup calls and nonfatal sender behavior; no new welcome campaign. |
| Plan delivery sender | `messaging.plan-delivered-email` | Original recipient, content, no-key and nonfatal behavior. |
| Plan approval sender | `messaging.plan-approved-email` | Original expert notification and return behavior. |
| Changes-requested sender | `messaging.plan-changes-requested-email` | Original decision-triggered email, without a retry or new decision. |
| New suggestion sender | `messaging.plan-suggestion-email` | Existing approved-plan caller gate and direct sender remain authoritative. |
| Shared `sendActivityEmail` | `messaging.activity-email` | Earner/address/preferences gates, copy, existing non-atomic hourly SELECT-then-enqueue check, and sent/skipped result. Concurrent calls can race that check; no stronger guarantee is added. |
| `sendExperienceInvites` | `messaging.guest-invite-send` | Organizer/hidden-event guards, selected/all guests, atomic invite claim/debounce, release on failed enqueue, per-guest results/logging. Accepted enqueue does not establish delivery. |
| Each `email.service.ts`-created Resend client's bound `emails.send` | `messaging.email-provider-transport` | All SDK arguments/options, response and thrown-error identity. Generic sending still constructs a fresh client; named cached senders retain their existing singleton. SDK error responses classify as failure metadata, not changed caller results. |
| Canonical `storage.createChat`, after insert/content registration | `messaging.chat-follow-ons` | One existing recipient notification and fire-and-forget activity-email scheduling; notification failure remains best effort. No storage-level realtime broadcast. |
| `messages.service.sendMessage` and legacy `/api/chat/start`, after their existing inserts | `messaging.message-follow-ons` | Each path's existing notification, push/activity scheduling and error behavior; no new notification or persistence path. |
| `storage.createNotification`, after notification insert | `messaging.notification-create` | Existing nonblocking immediate push follow-on. Notice persistence remains in its original owner. |
| Existing chat send sites in `routes.ts`, `messages.ts`, `conversations.routes.ts`, `content.routes.ts`, and `/ws` | `messaging.chat-realtime-fanout` | Same frame/recipient, synchronous `broadcastToUser` helper inside async caller boundaries, sender ack before WS recipient relay, once per existing send site. No durable websocket queue or retry. |

### Ownership and exclusions

- Booking occasion/no-response/Trip Card lifecycle triggers remain in bookings;
  Connect/payment/claim triggers remain in payments; approval/verification
  decisions remain provider-owned. Their active `email.service.ts` transport
  now has a downstream messaging node without moving the upstream decision.
- The daily admin digest collector and its schedule are cross-domain maintenance,
  deferred to scheduled. Its actual `email.service.ts` delivery is covered here.
- Existing outbox timer jitter, five-minute cadence, composite drain-then-sweep,
  outer background runner, external internal-job handler, and admin entrypoint
  are unchanged. Messaging schedule adapters do not add another background runner.
- Broken vendor bulk email and orphan booking-confirmation sender are not newly
  activated. No dormant-user campaign or post-booking review solicitation is added.
- Manual admin diagnostic test-email clients are not part of this migration.
  Provider-transport coverage means clients created by `email.service.ts`, not
  every Resend instance elsewhere in the repository.
- External scheduled-runner provisioning/delivery is still unverified.

## Verification commands and results

The provider-free launcher is `scripts/verification/run-messaging-gate.mjs`.
It allowlists only required nonsecret runtime/Nix settings, supplies synthetic
Stripe/session configuration, and excludes mail/push/AI/live/production credentials.
Pure suites use an unreachable dummy DB; they never start the application.

```sh
node scripts/verification/run-messaging-gate.mjs \
  $(find server/automations -type f -name '*.test.ts' | sort) \
  server/__tests__/email-outbox.test.ts \
  server/__tests__/guest-invite-mailer.test.ts \
  server/utils/__tests__/activity-email-copy.test.ts \
  server/routes/__tests__/notification-email.test.ts
```

The pure batch passed 81 unique cases. The four producer cases were initially at
`server/__tests__/messaging-producer-index.test.ts`, then moved without assertion
changes into `server/automations/messaging/__tests__/producer-boundaries.test.ts`
for CI discovery. All four moved cases passed again; repeats are not added to
the unique count. The automation-only portion now contains 32 cases, including
13 new messaging cases and 19 existing cross-domain engine/adapter cases.

Before fixture DDL, the approved database tool independently obtained a
development-only fingerprint of current database/server identity. The launcher
required its match against the inherited development connection, without
printing the connection or retaining it in a file. The fingerprint is not a
credential. Invoke the DB gate with that independently obtained value:

```sh
MESSAGING_DEV_FINGERPRINT=<independently-obtained-development-fingerprint> \
node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/__tests__/web-push.db.test.ts \
  server/__tests__/guest-invite-send.db.test.ts \
  server/__tests__/suggestion-listing-activity-email.db.test.ts \
  server/__tests__/websocket-auth.db.test.ts \
  server/__tests__/dead-email-digest.db.test.ts \
  server/__tests__/rc11-first-message.db.test.ts
```

| Gate | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| Pure registry/adapters, outbox, invite mailer, activity copy, notification wiring | 81 | 81 | 0 | 0 |
| Isolated SQL and real loopback WebSocket regression suites | 29 | 29 | 0 | 0 |
| Unique final stage total | 110 | 110 | 0 | 0 |

One superseded pure invocation failed because the first producer test used
Vitest under Node's runner: 76 passed and one file-level failure. Converting
that test to Node resolved the runner mismatch; no business test was bypassed.
Additional focused/repath checks repeat cases in the final counts above.

### Database and transport isolation

These sweeps are globally scoped: merely faking transport or removing keys is
not safe against a populated dataset because claims still mutate rows. The DB
gate created an empty, randomly named **development-only** temporary schema:

- 321 tables copied structurally, with 404 foreign keys redirected to clones.
- No public rows copied; local serial defaults and independently created identity
  sequences prevent advancing shared sequences.
- Same indexes/check constraints/columns and native SQL locking; views, triggers,
  data and production configuration were not cloned.
- Child search path contains only the fixture schema, without public fallback.
  The test-only preload redirects connect-pg-simple's otherwise explicit
  `public.sessions` default and rejects explicit public SQL/search-path resets.
- Web Push uses its existing fake transport; outbox unit tests stub DB/sender;
  invites use injected ports where appropriate; activity sends have no provider
  credential. WebSocket tests boot only their ephemeral loopback server.
- All 29 DB cases passed. The schema was dropped and its absence verified;
  no fixture server or test subprocess remains. No verification email/push send,
  real Stripe action, production job, production DDL, or public-row claim occurred.

## Integration checks and limits

- Read-only registry inspection validates 77 nodes, including 19 messaging nodes.
- Final full TypeScript check completed with 120 diagnostics, matching the
  measured review-branch baseline, with zero new normalized fingerprints.
  Normalization accounts for expanded/truncated object display order and the
  pre-existing truncated `transfer.paid` Stripe union diagnostic. This is not a
  clean typecheck. An intermediate closure-nullability error was corrected by
  capturing the already-guarded recipient value; no runtime guard changed.
- One plain foreground typecheck timed out without diagnostic output; the final
  completed check used a 6 GiB Node heap and its own temporary build-info file.
- Server esbuild bundle passed using the project's production NODE_ENV define.
  A preliminary CJS attempt without that define failed on development Vite
  top-level await; existing seed import.meta warnings remain.
- Independent integrated review passed after transport coverage, test-runner,
  and metadata corrections. It found no duplicate runner, lost guard, new cycle,
  or return/error/transaction regression.
- The development workflow restarted successfully and the public landing page
  rendered in the smoke screenshot. Its anonymous auth/cart requests returned
  expected 401 responses; landing APIs/assets returned 200. No registry startup
  crash was observed.
- Coverage proves native SQL claims and WS auth/persistence/notification behavior,
  not actual mail/push recipient delivery, a new HTTP/browser end-to-end flow,
  distributed websocket delivery, or the deferred external scheduled runner.
- Provider, AI, and scheduled migration stages remain unstarted. This is a
  messaging-only gate, not completion of the seven-domain task or a release.