# Part 7 — golden restoration and isolated database proof

The historical 143/143 claim was a 13-stage provider-free regression run, not 143 independent database scenarios or live-email proofs. TAP parent/suite entries and two successful registry/roster commands contribute to that reported count. Its saved assertion-level evidence is in reports/automation-part2-evidence/golden-1-results.json and golden-2-results.json.

The missing runner was retained on work/automation-part1-baseline-freeze at 66220381817fc98cc68787a0ce5ce92222ca36f9 and used from a temporary worktree during Part 2. That worktree is now marked prunable; these three verification files were never carried into this checkout. They have been restored unchanged, not rebuilt or approximated:
- scripts/check-automation-golden-baseline.cjs
- scripts/verification/automation-baseline-reporter.mjs
- server/automations/messaging/__tests__/automation-baseline-harness.test.ts

No runtime, registry, outbox, sender or CI copies were restored. Optional --live-proof was NOT invoked. The existing fingerprint-guarded run-messaging-gate.mjs created five fresh constraint-preserving empty namespaces per outer loop. These are isolated schemas on the approved development database, not separate physical database servers. All ten namespaces were dropped. The full itinerary stage used the existing private HTTP fixture server, not preview or production. Provider credentials are stripped; suites use mocked transports.

## Fresh stage results

| Stage / covered behavior | Loop 1 | Loop 2 |
|---|---:|---:|
| Itinerary outcome payload | 5 PASS | 5 PASS |
| Itinerary follow-up payload | 5 PASS | 5 PASS |
| Generation authoritative-writer tests | 8 PASS | 8 PASS |
| Three itinerary follow-up tests | 20 PASS | 20 PASS |
| Signup welcome | 22 PASS | 22 PASS |
| Verification and password-reset boundaries | 4 PASS | 4 PASS |
| Booking confirmation duplicate and payment retry | 3 PASS | 3 PASS |
| Booking durable delivery / retry | 3 PASS | 3 PASS |
| Outbox retry / leases / dedupe / cancellation | 26 PASS | 26 PASS |
| Retained registry contract suites | 38 PASS | 38 PASS |
| Registry IDs | 1 PASS | 1 PASS |
| Cron roster | 1 PASS | 1 PASS |
| New harness safety tests | 7 PASS | 7 PASS |

Both fresh outer loops passed 143/143 with zero failed or skipped assertions. Every stage-qualified test name matches the historical run, not just the total. This proves parity with that named regression set; it does not establish cart all-rail certification, live delivery, or unknown legacy-removal completion. No behavior from the historical set lacks its former coverage after restoration. Future unknown/unrecorded commerce payment rails remain outside this historical set.

## Counts per itinerary and signup rule

Counts are actual passing named rule entries across the two fresh outer loops; repeated internal randomized loop 1/2 cases are combined. Parent entries are explicitly marked and are not independent rule proofs.

| Rule | Passing entries | Clean outer loops |
|---|---:|---:|
| Generation authoritative-writer tests — ready DB loop: concurrent completion, two same-day itineraries, provider retry and dedupe | 4 | 2 |
| Generation authoritative-writer tests — failed DB loop: exact timeout and two variations, late success, error, new attempt | 4 | 2 |
| Generation authoritative-writer tests — refinement loop: cancelled ready notice is recoverable, exact case plus two variants | 4 | 2 |
| Generation authoritative-writer tests — missing email and deleted/superseded itineraries or accounts never reach sender | 2 | 2 |
| Generation authoritative-writer tests — outbox persistence failure rolls back the terminal state | 2 | 2 |
| Three itinerary follow-up tests — itinerary_nudge_2h SQL loop: registry fires, persisted send, stable retry identity | 4 | 2 |
| Three itinerary follow-up tests — itinerary_followup_24h SQL loop: registry fires, persisted send, stable retry identity | 4 | 2 |
| Three itinerary follow-up tests — itinerary_reengagement_5d SQL loop: registry fires, persisted send, stable retry identity | 4 | 2 |
| Three itinerary follow-up tests — cancellation loop: a booking within one hour cancels all three at the first send | 4 | 2 |
| Three itinerary follow-up tests — supersession loop: newer ready itinerary cancels old sequence, not ready notices | 4 | 2 |
| Three itinerary follow-up tests — bookability loop: absent or newly paused items cancel five-day mail without urgency | 4 | 2 |
| Three itinerary follow-up tests — mid-sequence cancellation preserves already-sent 2h mail and stops both remaining emails | 2 | 2 |
| Three itinerary follow-up tests — late older completion cannot cancel a newer plan: exact case plus two creation-age variations | 2 | 2 |
| Three itinerary follow-up tests — daily marketing cap defers, consent/deletion cancel, retries retain provider identity | 2 | 2 |
| Three itinerary follow-up tests — a booking on the legacy, affiliate or coordination rail cancels the follow-ups at send time | 2 | 2 |
| Three itinerary follow-up tests — real HTTP unsubscribe: scanner GET is read-only; explicit POST cancels all pending rows | 2 | 2 |
| Three itinerary follow-up tests — authenticated preferences save actual consent, reject bad input and CSRF, preserve other preferences | 2 | 2 |
| Three itinerary follow-up tests — booking vs send, both orders: a committed booking stops the send; a send in flight blocks the booking | 2 | 2 |
| Three itinerary follow-up tests — actual outbox claim routes a due follow-up and will not claim a future one | 2 | 2 |
| Signup welcome — permits recorded consent and unchanged recipient | 2 | 2 |
| Signup welcome — suppresses missing, deleted and suspended accounts | 2 | 2 |
| Signup welcome — suppresses changed email, missing consent and previous delivery | 2 | 2 |
| Signup welcome — keeps signup enqueue transactional and removes its direct welcome call | 2 | 2 |
| Signup welcome — retains main itinerary dispatch and provider guards | 2 | 2 |
| Signup welcome — production app send path never imports or reads the QA inbox | 2 | 2 |
| Signup welcome — production recipient resolution returns the account address without reading the inbox | 2 | 2 |
| Signup welcome — signup welcome pure guards and main wiring (parent summary) | 2 | 2 |
| Signup welcome — rolls back the account and welcome obligation together | 2 | 2 |
| Signup welcome — concurrent enqueues persist exactly one welcome | 2 | 2 |
| Signup welcome — immediate delivery claims once and persists the provider ID | 2 | 2 |
| Signup welcome — production dispatcher sends to the account's own address even with an override configured | 2 | 2 |
| Signup welcome — the scheduled/admin dispatcher cannot resend an already sent row | 2 | 2 |
| Signup welcome — send-time guard cancels changed-email without transport | 2 | 2 |
| Signup welcome — send-time guard cancels no-consent without transport | 2 | 2 |
| Signup welcome — send-time guard cancels soft-deleted without transport | 2 | 2 |
| Signup welcome — send-time guard cancels suspended without transport | 2 | 2 |
| Signup welcome — send-time guard cancels missing-account without transport | 2 | 2 |
| Signup welcome — provider failure uses existing backoff and a stable retry key | 2 | 2 |
| Signup welcome — another sent welcome suppresses a duplicate row | 2 | 2 |
| Signup welcome — a stale duplicate sender waits for the first sender and cannot send again | 2 | 2 |
| Signup welcome — signup welcome real database (parent summary) | 2 | 2 |

Full follow-up DB proof: 20 named leaf tests per outer loop (40 passes total), including all three schedules; booking cancellation; supersession; stock/bookability; marketing cap/consent/deletion; legacy, affiliate and coordination booking rails; real isolated HTTP unsubscribe and preferences/CSRF handlers; both booking/send orderings; and actual outbox claims.

Signup: 13 database leaf tests per outer loop (26 passes total), plus seven pure guard/wiring tests per loop and two parent summaries. DB rules cover rollback atomicity, concurrent dedupe, claims/provider IDs, own-address production resolution, repeated/admin delivery, every cancellation branch, stable retry/backoff, prior sent rows and competing senders. All provider IDs are synthetic; zero live emails.

Fresh build passes. Typecheck reports 117 diagnostics at the established baseline count; this is not a zero-error claim. Test wiring passes. The fresh guard-only batch passes (see Part Gate for counts).
