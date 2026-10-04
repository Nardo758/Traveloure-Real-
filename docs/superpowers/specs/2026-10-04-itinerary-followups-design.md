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

## Recorded development results; live certification still pending

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
the registered migration; the home page rendered. Development recipient configuration was checked
without displaying it and no currently approved inbox was configured. No copied user's inbox was
used. Real provider IDs, recipient-server delivered events, and authenticated email-link checks
remain required before certification. A full TypeScript check completed at the CI ceiling of
118 existing diagnostics with none in the new follow-up/outcome/preferences modules; that pass
preceded the final late-worker refinement. Its post-refinement retry exceeded a 60-second
shell budget, so the final compiler check remains separately pending rather than claimed clean.
Do not infer a clean typecheck from the successful bundle.