# Automation decision register

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Recorded 17 October 2026 from the owner's current message. This is a
report-only register, not proof of implementation, configuration or release.
The owner identifies this list as prompt-book Appendix D. No alternative
original D1–D12 list is held here. Earlier E2E decisions retain the distinct
namespace E2E-D1–E2E-D5.

## Authoritative Appendix D list

The wording and statuses below are transcribed from the owner. The recording
date is not an invented original approval date; original dates were not supplied.
Affected paths describe inspection/verification scope, not permission to edit
or execute them. Historical test locators are not current pass claims.

| ID | Exact owner wording/status | Affected code and verification scope | Difference / qualification |
|---|---|---|---|
| D1 | neutral server-written last-activity stamp in cart JSON: founder comment: #1552 2026-10-18T16:09:49Z | Cart writers in `server/routes.ts`; held commerce clock/snapshot service; J4/J8/J22, Part 2 atomicity/concurrency tests | Approval is not evidence of main integration. Do not replace with E2E-D1 signup order. |
| D2 | what must be kept after account deletion (legal, accounting) and the wording: no decision recorded | Account deletion in `server/routes.ts`; deletion notices/templates; J14 retention, grace-period and wording cases | OPEN; no retention policy invented. |
| D3 | upcoming bookings during deletion; marketing consent by region: no decision recorded | Deletion/booking writers; consent and marketing eligibility; J7/J9/J14/J22 | OPEN; two questions retained under one authoritative ID. |
| D4 | SMS or WhatsApp provider for emergency alerts: no decision recorded (deferred) | Future emergency-channel adapter; channel/provider and consent verification, not an email substitute | DEFERRED; no provider selected. |
| D5 | loyalty program: no decision recorded (defer if none exists) | Any loyalty/allowance integration and its eligibility tests | CONDITIONAL DEFERRAL; existence not established here. Not E2E-D5, not a dormant-user threshold ruling. |
| D6 | two or three team-owned QA inboxes: founder comment: #1552 2026-10-18T16:09:49Z (settings still to be entered through the secure form) | QA recipient guard, email transport and development runner; E2 and J21 non-QA-recipient cases | Owner record differs from historical reports of re-entry on 13 October. No settings inspected; storage/current-process state UNKNOWN. |
| D7 | scheduler: Replit Scheduled Deployment plus GitHub cron backup: founder comment: #1552 2026-10-18T16:09:49Z, for configuration only; production activation separate | `scripts/ci/post-internal-jobs.sh`, `.github/workflows/jobs-cron.yml`, `server/routes/internal.routes.ts`; roster and real-clock scheduler checks | Existing source describes this topology. Provisioning, configuration and firing not verified. No activation authorized. |
| D8 | Resend delivery and bounce webhook configured: no decision recorded | Provider receipt/webhook handlers, bounce classification, J10/J11 and receipt-to-outbox reconciliation | OPEN; presence of code or a key is not configuration proof. |
| D9 | payment-failure retry policy: no decision recorded | Payment-failure notification and payment lifecycle callers; J6/J10/J16 | OPEN. Outbox transport backoff is not a policy for retrying payments. No payment code changes authorized. |
| D10 | external monitor for health and failed jobs: no decision recorded | Health/heartbeat endpoints and external monitoring setup; failed-job and alert-delivery checks | OPEN; no monitor or tested alert asserted. |
| D11 | marketing priority order across automations: no decision recorded | Itinerary/cart eligibility, cap and quiet-hour rules; J22 collision tests | OPEN. Cart-first is a source-plan expectation, not proof of this owner's final cross-automation priority ruling. |
| D12 | release approval and who performs it: a person, after the final part; no release authorized | Release checklist, scheduler activation and authorized production-verification evidence | RELEASE HELD; no named operator or release window inferred. |

## Earlier E2E namespace and current additional rulings

| ID | Ruling / state | Affected code/tests and evidence boundary |
|---|---|---|
| E2E-D1 / F1 | Policy resolved: verify first, then welcome. Provider-verified email counts only if validated server-side. | `server/replit_integrations/auth/emailAuth.ts`, `server/services/signup-welcome-outbox.service.ts`, SSO handlers; J1/J11/social-linking tests. At inspected revision the signup enqueue and guard still differ. Task-feed “merged” status does not establish this checkout contains the fix. |
| E2E-D2 | Report retry ladder as built; historical brief differs. | `server/services/email-outbox.service.ts:68`, transport backoff 5/15/45/120/360 minutes, six attempts; J10. Distinct from Appendix D9 payment policy. |
| E2E-D3 | Observe/report kill-switch bypasses; no switch change. | `server/services/email.service.ts`, direct SDK callers; SYS1/J24. Distinct from Appendix D3. |
| E2E-D4 | Cancel changed-recipient obligations, never silently retarget. | Welcome/itinerary/outbox and other pending-family checks; J9/J13. Distinct from Appendix D4. |
| E2E-D5 | Absent automations stay not-built/blocked without stubs or invented thresholds. | Registry/caller inventory and J25 absence proof. Distinct from Appendix D5 loyalty. |
| TRACKING-LADDER | Non-email criteria in `automation-source-recovery-draft.md` are **DRAFT V1, tracking only**, not release criteria until owner approval. | Typed tracker rows and draft scores only. |
| SOURCE-PENDING | Missing-source rows are listed separately and excluded from percentages, neither zero nor done. Recompute only affected rows if a source later arrives. | Manual-original/readiness/atomic-source gaps; no retries or continued waiting on source-recovery work. |
| SCOPE-DEFERRALS | Credit alerts, wishlist price-drop and abandoned chat are out of scope; saved-search alerts deferred. | Historical A+B plan keeps all 45 rows; active known-family scope excludes these five rows. |
| SOCIAL-LINK | Verified provider email may link an existing password account only if that account is verified or owner control is proven. | Server-validated social claims, account-linking and one-welcome tests; implementation verification pending. |
| F3-CAP | Neutral signup approved in principle; durable per-address and separate resend/notice counters plus per-IP cap. Numeric limits await approval. | Signup/resend endpoints and abuse/concurrency tests; no new counter/schema authorized. |

## Remaining owner decisions

Appendix D2, D3, D8–D11; conditional D5; D12 operator/release authorization;
F3 cap/window and response timing tolerance; dormant-user threshold; trusted
must-have item-change payment/ownership ordering; job proof cycle count N;
final non-email/release ladder and draft metric scores. D4 remains deferred.
No approval is inferred from this register or an existing implementation.

## Parked work added 19 October 2026

Recorded from the decision-maker's rulings in the CS-1 lane session, 19 October 2026 (ledger `2026-10-19-1517-salvage`).

| ID | Ruling / state | Affected code and evidence boundary |
|---|---|---|
| PARK-COMMERCE | **Parked past 21 October.** The commerce branch `work/commerce-part7-verified-carry-20261010` is salvaged in pieces, never merged whole: (a) outbox dev-recipient safety and the non-sending sweep tests; (b) the cart-email state and item-change services; (c) the commerce sweep automation and its internal route; (d) the real-delivery proof scripts, as manual tools. Its migration `360_job_heartbeats_nullable_success.sql` collides with main's 360, so it is renumbered, and its NOT NULL drop is ruled separately. | Phase 0 dependencies: (a) D6; (b) D1, D11 and the postal-address rule; (c) D7 and the migration ruling; (d) D6, D8 and D12. |
