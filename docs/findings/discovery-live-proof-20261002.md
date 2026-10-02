# Discovery fixes — live evidence, 2026-10-02

## Release boundary

Work is on `fix/discovery-live-proof-20261002`, based on fetched `origin/main`,
with the remote canonical-confirmation review branch merged into it. No main
push, force-push, production publish, production job POST, or production
database/schema change was performed. Automation-registry work was not resumed.

## Item 1 — canonical traveler confirmation

**Confirmed finding:** Yes. Main's canonical payment promotion lacked the
traveler confirmation. PR #1218 addresses the same issue, not a different email
fix; it was open, draft and unmerged during the live status check.

**Fix:** Reused #1218's existing implementation. The winning full/deposit/balance
payment transaction persists the existing durable email outbox entry. Its event
key is booking/payment-leg scoped; replayed payment transitions cannot insert a
second confirmation. Persistence failures are retryable instead of silently
losing the notification. No new schema migration.

**Fresh live proof:**

- A real receiving mailbox was created at Mail.tm. No Gmail/Outlook integration.
- The isolated traveler account's email was that same mailbox.
- Actual `POST /api/checkout` returned HTTP 201 and created canonical
  `service_bookings` booking `a6a42cd8-6497-4f97-aaa6-522db677b607`.
- Reference: `TRV-202610-00001`.
- Real Stripe TEST PaymentIntent: `pi_3UM1MPRJlh67IHOH1WM6AySJ`, `livemode=false`,
  `status=succeeded`, amount 2,140 cents USD. No live charge.
- Client confirmation and the real outbox drain delivered the email.
- Sender: `Traveloure <no-reply@traveloure.com>`.
- Subject: `Booking confirmed — Live canonical email verification`.
- Received: `2026-10-02T07:58:32+00:00`.
- The received message states reference `TRV-202610-00001` and payment `21.40 USD`,
  matching the freshly created booking and Stripe payment.
- Two signature-verified simulated deliveries of the same succeeded event
  returned HTTP 200 at `/api/bookings/webhooks/stripe`.
- A repeated client confirmation returned HTTP 200. The subsequent drain claimed
  zero rows. Exactly one confirmation row existed, sent with one attempt.
- An independent inbox read after replay still found exactly one confirmation.

The original received SMTP message is
[`received-booking-confirmation.eml`](../testing/assets/discovery-live-proof/received-booking-confirmation.eml).
This is received-message evidence, not a reconstructed email or sender success
log. Inbox metadata and text are retained alongside it.

**Verification limitations:** This was a real API/payment/email test on an
isolated development database, with a loopback-only authenticated fixture
identity. It did not exercise browser registration or the payment form. The
receipt's bookings link uses the isolated harness's localhost default; it is not
a production booking. The successful sandbox PaymentIntent remains as an
auditable test artifact. Production remains unrepaired until reviewed code is
merged and the operator publishes it.

## Item 2 — vendor bulk email

**Confirmed finding:** Yes. The route now delegates to the vendor service, but
the service still imported nonexistent `emailService`.

**Before fix, actual HTTP route result:**

```json
{
  "httpStatus": 200,
  "body": {
    "sent": 0,
    "failed": 1,
    "failureReasons": [
      "Contract edc43fe9-1bd8-498d-933a-9b4f8b196dee: Cannot read properties of undefined (reading 'sendEmail')"
    ]
  }
}
```

**Fix:** Call the exported `sendEmail`, supply escaped HTML and plain text,
await delivery acceptance, and count/log sent mail only after `ok=true`. Preserve
calendar invitations through the generic sender's optional attachment support.
Authorization, trip/contract ownership checks and fan-out limits are unchanged.

**After fix:** Actual route returned HTTP 200, `sent=1`, `failed=0`, no failure
reasons. The same receiving mailbox obtained:

- Sender: `Traveloure <no-reply@traveloure.com>`.
- Subject: `Traveloure live vendor verification`.
- Received: `2026-10-02T07:55:46+00:00`.
- Attachment: `invitation.ics`, MIME type `text/calendar`.

Original received message:
[`received-vendor-email.eml`](../testing/assets/discovery-live-proof/received-vendor-email.eml).

An additional live negative check disabled email in the isolated platform
settings. The route returned HTTP 200 with `sent=0`, `failed=1`, and the disabled
email reason. The communication log stayed at one entry: no false send record.
The temporary setting was removed.

**Remaining risk:** The original direct-send bulk behavior remains; this is not
a new durable bulk-mail feature. Operator merge/publish is still required.

## Item 3 — actual scheduled deployment

**Confirmed finding:** No Scheduled Deployment project exists. The operator
explicitly confirmed that no dedicated runner Repl has been created. The live
Replit deployment API independently reported:

| Property | Verified status |
|---|---|
| Current publishing type | Autoscale |
| Web app deployed | Yes |
| Successful web build | Yes |
| Primary URL | `https://traveloure.com` |
| Scheduled project exists | No — operator confirmation |
| Scheduled deployment enabled | No |
| Scheduled deployment schedule | None |
| Recent Scheduled Deployment run log | None; no such runner exists |

No web logs, GitHub Actions logs, repository configuration or shared heartbeat
have been represented as Scheduled Deployment evidence.

**Reliability gap:** Jobs rely on warm-instance timers and the GitHub Actions
cron backup. Timers stop when Autoscale sleeps; the independent Replit scheduled
trigger is missing. This affects earnings release, booking auto-completion,
Stripe reconciliation, availability materialization and the rest of the roster.

**Required operator setup**, from `docs/ops/REPLIT_SCHEDULED_JOBS.md`:

1. Create a separate Repl by importing `Nardo758/Traveloure-Real-`, branch `main`.
   Suggested name: `traveloure-jobs-runner`. Do not publish it as a web app.
2. On that Repl: Deployments → Scheduled → New Scheduled Deployment.
3. Command:
   `git pull --ff-only origin main && bash scripts/ci/post-internal-jobs.sh --due`
4. Cron: `*/15 * * * *`; timezone UTC.
5. Set only `BASE_URL=https://www.traveloure.com` and the production
   `INTERNAL_JOB_SECRET`, through Secrets. Do not copy database or Stripe keys.
   Optional settings: `WARMUP_MAX_SECONDS` and `POST_RETRIES`.
6. Save and enable it. Do not set `ROUTES` or `FORCE_BUCKET` on the recurring
   deployment.
7. After at least one cycle, inspect its own run history/log for `Due this run`
   and the posted routes. Independently check authenticated
   `GET /internal/jobs/health`; expect `staleCount=0` within approximately
   20 minutes. That health check alone cannot identify which scheduler fired.

**Fix applied:** No infrastructure change attempted. Creating/enabling the
separate deployment is an operator action. Its enabled status, cadence and real
run log must be checked after provisioning; they cannot be shown now.

## Item 4 — status only

Live GitHub API checks:

- #1218: `Restore canonical paid-booking confirmation emails`; open, draft,
  unmerged; remote head `74102bc765cb29fbef8f9efe2150c80dcc1e265f`.
- #1225: `WIP: staged automation registry migration`; open, draft, unmerged;
  remote head `fcf7f24309af2ddae4f9d9bbb6ab0ec46a76d613`.
- Both heads have successful `suite-server-tests` checks. #1225 also has a
  successful `registry` check. Those CI checks do not prove email receipt or
  external runner provisioning.
- Local canonical review branch was 42 commits behind its remote.
- Local registry branch was 36 commits behind its remote.
- Remote Track A changes include canonical reconciliation outbox cleanup and
  registry reconciliation cleanup, CI/glob wiring and webhook manifest updates.
- Those original PR branches were not force-pushed or modified by this work.

## Regression and cleanup

- Seven existing payment/email/fee suites: 98 tests; 97 passed, zero failed,
  one skipped because the empty fixture has no platform concierge account from
  migration 313. Canonical confirmation tests themselves passed.
- The first regression run had 27 fixture-hook failures because the preserved
  offering-key foreign key referenced an empty catalog. Seeding the non-personal
  platform offering catalog resolved those failures; production constraints and
  behavior were not relaxed.
- Compiler comparison against this branch's pre-vendor-fix HEAD: 120 baseline
  diagnostics, 118 current, zero new diagnostic fingerprints. Not a clean
  typecheck.
- Database isolation: 321 empty cloned tables, 404 preserved foreign keys,
  isolated serial defaults and no public search-path fallback. Only platform fee
  and offering catalogs were copied, never customer records.
- Fixture processes are stopped before removing the dedicated schema.
- Cleanup completed; an independent namespace query returned zero remaining
  fixture schemas.
- The application workflow restarted successfully. A fresh public preview
  screenshot renders the landing page; unauthenticated session requests return
  the expected HTTP 401.
- Final log review separately observed existing production
  `ItineraryGenerationSweep` / checkout-sweep database connection timeouts
  around 08:02 and 08:12 UTC. Those are not Scheduled Deployment logs and were
  not investigated or changed in this scoped repair. Provisioning a scheduler
  does not by itself repair database connectivity.

**Release blockers:** The separate Scheduled Deployment is not provisioned.
Code repair is on a review branch, not merged/published. Do not treat the
automation-registry migration as cleared for continuation.