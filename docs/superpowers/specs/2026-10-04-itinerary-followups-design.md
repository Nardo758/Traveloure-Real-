# Part 2: itinerary follow-ups

The operator approved reconciling preserved Part 1 with fresh origin/main and building Part 2.
Fresh Part 1 preflight on that reconciliation: nine contract/rendering checks and eight
rollback-only database checks passed. This is not new provider or inbox-delivery evidence.

## Scope and reachability

Three marketing definition files: itinerary-nudge-2h, itinerary-followup-24h, and
itinerary-reengagement-5d. Each is scheduled atomically with a first ready outcome through
the existing outbox. Same-traveler newer itineraries physically cancel older pending,
failed and processing follow-ups; ready notices remain per itinerary.
Creation order controls which ready itinerary owns the sequence. An older generation finishing
late records cancelled follow-ups and cannot replace a newer ready plan's pending sequence.

AI chat is excluded under the requested conditional scope. Conversations and timestamped
messages persist. However, structured TripContext is per user or per trip, not per conversation;
unlinked conversations have no authoritative completed-itinerary association, durable idle
session marker, or resumable partial-context identity. Associating a user's latest draft with
an arbitrary conversation would guess context. No fourth automation or new handoff is created.
The existing human rail is POST /api/concierge/escalations; it must not be duplicated.

## Consent, timing and truthful copy

Consent defaults off. Self-scoped preferences explicitly collect timezone and quiet-hour
boundaries; no traveler timezone or overnight policy is invented. Marketing delivery observes
these preferences and at most one delivery reservation per local calendar day. Competing rows
defer instead of disappearing. Each email has an unsubscribe capability scoped to turning
off this marketing category; GET only shows confirmation, POST performs cancellation.

Follow-ups become due at ready + 2 hours, 24 hours, and 120 hours. Quiet hours and the daily
cap can defer actual delivery. The expert branch uses a real approved matching expert or the
literal fallback "top-rated activity". Five-day mail is cancelled unless an itinerary item
links to a currently approved, active provider service (the catalog's publication contract). Only that positive branch
contains "Prices may change"; names, prices, availability, and partial context are not invented.

## Cancellation and concurrency

Service bookings, legacy bookings, affiliate requests, and coordination bookings have BEFORE triggers.
Their writers and the marketing sender serialize
on the same traveler row; the sender holds the lock through its provider attempt and sent-state
update. Booking-first means no send; sender-first means provider acceptance precedes booking
commit. External inbox arrival cannot be ordered against a database commit.

Booking/payment creation and status promotion cancel every relevant unsent follow-up immediately.
Relevance uses a matching trip or a booking created since that itinerary was started, including
bookings made during generation; unrelated historical bookings do not permanently suppress new plans.
Deletion cancels itinerary follow-ups. No fee resolver, authorization, entitlement, Trip Pass,
or payment writer is changed. Retry identity is stable per outbox row.

## Verification

Two randomized loops must cover each send/skip branch, supersession, cancellation before and
mid-sequence, current bookability, expert fallback, consent, quiet hours, local-day throttling,
deletion and both race orderings on separate real database connections. Intercepted provider
tests are not inbox evidence. Completion requires separate live approved-recipient evidence;
no "genuinely complete" claim is permitted until that evidence exists.

## Recorded development results

Reconciled against origin/main at the start of this dispatch on task-itinerary-part2.
The fresh Part 1 preflight passed before Part 2 edits; its eight rollback-only database checks
passed again after integrating Part 2. The combined contract/rendering checks passed (14).
The Part 2 SQL/send-boundary checks passed (20 distinct checks across the completed suite
and its focused refinement passes), including two loops of
each marketing definition, both expert branches, absent and newly paused bookability,
same-day supersession with actual cancelled rows, bookings within one hour, mid-sequence
cancellation, stable retry identities, and both booking/send orderings.
The send-first race observed PostgreSQL's actual blocked writer before releasing the provider seam.
The suite also covered all four booking writers, the outbox's competing claims, daily deferral,
and a real HTTP unsubscribe: scanner GET did not mutate consent; POST did.
Authenticated HTTP preferences were also exercised through actual email-auth login: invalid
timezone and CSRF requests were refused, the HTML form saved consent and cancelled pending
rows, and unrelated preferences survived. The late-older-worker regression passed twice
consecutively, each with the exact case and two creation-age variations.
Provider transport was intercepted in those tests, not real delivery.

The production build passed with existing bundle warnings. The running development workflow applied
the registered migration; the home page rendered. The final compiler check, including the live
verification harness, completed with 118 diagnostics, matching the existing CI ceiling, and none
in the new follow-up/outcome/preferences modules. This is baseline parity, not a globally clean tsc.

## Live certification: 2026-10-04

The operator supplied a valid development-only recipient through the environment-variable form.
Production recipients and settings were not changed. The approved inbox was not committed into
source. No copied traveler was changed or used as a live fixture.

The real outbox claim, registered dispatch, payload renderer and Resend transport delivered each
automation twice. Only the test process's URL resolver was configured for the development host.
Fixture ready timestamps were backdated to accelerate the 2h/24h/120h eligibility checks.
Each send used a fresh isolated traveler so no daily-cap reservation was bypassed. Accounts sharing
the approved recipient were created sequentially, then deleted; the final one stayed only for
the signed-in browser check.

| Automation | Loop | Actual provider ID | Provider event |
|---|---:|---|---|
| itinerary_nudge_2h | 1 | 01a107eb-18f8-70dd-a656-f18d06f517ff | delivered |
| itinerary_followup_24h | 1 | 01a107eb-27e8-7ccc-b041-74f64eb7ab69 | delivered |
| itinerary_reengagement_5d | 1 | 01a107eb-3a70-7d07-a11b-ad99f2fc0b47 | delivered |
| itinerary_nudge_2h | 2 | 01a107eb-4f1d-7723-ba35-a0e73ee87293 | delivered |
| itinerary_followup_24h | 2 | 01a107eb-5d59-7564-96e6-5b45e03e873f | delivered |
| itinerary_reengagement_5d | 2 | 01a107eb-71e0-7499-a886-23ffbb2cac9c | delivered |

Each receipt was retrieved from the provider, not inferred from enqueue or acceptance. These
events prove recipient-server delivery, not Inbox placement. The 24h live loops exercised both
the approved-expert and top-rated-activity fallback branches. Five-day urgency appeared only
in the bookable branch; absence and newly paused services were skipped in both SQL loops.
Repeated claims kept each real live send at one attempt.

Authenticated HTTP checks verified all six exact itinerary identities and development links.
The real browser accepted the test account's required Terms/Privacy flow, then rendered the
exact emailed destination, variant and item. Unsubscribe GET preserved consent and pending rows;
UI confirmation disabled consent and physically cancelled the remaining 2h and 24h rows while
preserving the sent five-day row. Browser observations included existing non-blocking CSP style
warnings and a resource 404; the tested page and unsubscribe flow worked.

The fresh full SQL suite passed all 20 checks, including immediate and mid-sequence booking
cancellation, all four booking writers, latest-itinerary supersession, both real two-connection
race orders and retry/claim idempotency. The earlier late-worker fix's exact case and two age
variations remained green. There are no unresolved in-scope structural risks or code references.
All live fixture comparisons and sent rows were removed, with zero residual final-fixture users;
test-only emailed record links are deliberately no longer usable after cleanup.

Exactly three marketing definition files remain; conditional abandoned-chat work stays excluded.
No booking, payment, AI generation or publication was performed for live receipt verification.
The development-only Part 2 scope is genuinely complete; production activation remains separate.