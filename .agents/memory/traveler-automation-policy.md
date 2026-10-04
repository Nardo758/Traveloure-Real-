---
name: Traveler planning and cart automation policy
description: Requested product and evidence rules for traveler itinerary, cart, and AI-chat notifications; not implementation or certification claims.
---

## Current generation-outcome scope

Keep pay-per-use and Trip Pass behavior untouched. Part 1 includes only `itinerary_ready` and `itinerary_failed` (including attempts exceeding five minutes). Do not reactivate the retired wallet or introduce an allowance system. `one_credit_left` and `out_of_credits` are explicitly dropped until a real credit/allowance policy is introduced and separately authorized.

**Why:** The user explicitly narrowed this task and reconfirmed it on 2026-10-04 after the agent incorrectly reopened the credit-policy question. Billing changes are outside scope.

**How to apply:** Part 1 certification has exactly two outcome automations. Remove superseded four-automation and credit-counter checks entirely; do not retain them as Deferred blockers or ask the user to choose credit policy again. A credit/allowance policy requires a separate, explicit future task. Live-email certification still needs an actual approved inbox; literal bracketed instructions are not recipient addresses.

Part 2's prerequisite is a fresh check of these two outcomes after reconciling preserved work with current main.

**Why:** The operator explicitly clarified the attachment's obsolete four-automation preflight and authorized reconciliation on a task branch.

**How to apply:** Do not reuse a passing test from the old branch as reconciliation evidence; run fresh checks before extending its sequences.

## Broader reminder policy

The requested traveler automation policy requires:
- At most one marketing email per traveler per calendar day globally. Competing eligible messages defer rather than disappear.
- Cart reminders take priority over itinerary reminders due on the same day.
- A booking or started payment stops both itinerary and cart reminder sequences immediately.
- A second itinerary on the same day explicitly cancels the first itinerary's pending follow-ups.
- Itinerary-ready emails remain per itinerary: two distinct itineraries on the same day require two ready notices. Reminder supersession must not suppress ready notices. The older credit-counter requirement is deferred.
- Deleting an itinerary, cart, or account cancels its pending messages.
- Night-time emails wait until morning; exact quiet hours and recipient timezone policy require an explicit design decision.
- Itinerary follow-ups require nothing booked; five-day reengagement additionally requires bookable items. Urgency copy must never imply bookability where none exists.
- A cart-item-change notice suppresses that day's scheduled cart reminder. The cart reminder sequence ends after the third reminder.
- Guests without captured email receive no cart emails.
- Out-of-credits and cart-item-change notices bypass marketing unsubscribe.
- Failed itinerary generation must not consume an AI credit; the one-credit-left alert fires once per cycle.
- Wishlist price-drop eligibility starts at exactly 10%, once per actual drop event.
- AI-chat abandonment defaults to once per conversation ever, including return and subsequent abandonment. Personalization and resume links must use actual persisted context, never inferred trip associations.

**Why:** The user explicitly specified these interaction rules; independently correct reminder nodes can still violate traveler-level suppression, priority, or consent requirements.

**How to apply:** Treat these as requested product constraints, not proof they exist. Apply them to shared scheduling and delivery eligibility, and preserve authoritative business write paths. Resolve missing credit entitlements and timezone policy before inventing defaults.

## Credit-policy discovery

This section applies only to separately authorized future credit work, never to Part 1 certification.

Discover the implemented credit source, tier allowances, reset cadence, generation versus regeneration costs, and purchased top-up behavior before writing threshold logic. Never turn usage-cost logs, membership billing periods, historical package copy, or dormant wallet balances into an assumed AI-credit policy. If no active policy exists, report that explicitly and seek approval for a concrete minimal policy before implementing it.

**Why:** The user explicitly instructed “discover, do not invent” and rejected assumed allowances, reset timing, and credit costs.

**How to apply:** Trace actual writers and enforcement, not just schema names. Report what the reset-date placeholder really resolves to; if no reset implementation exists, say that it has no valid value. A missing credit counter is not passing evidence that failures consumed no credits.

## Reuse and evidence

Report intent-based registry reuse before writing automation code. Adopt and extend equivalent existing nodes instead of adding duplicate notifications. All new sends must use the existing email outbox.

Certification requires real test-account email evidence and actual database state. Actual AI-credit evidence applies only to future separately authorized credit scope. Randomized scenarios need two consecutive clean loops per automation; a bug requires its exact case plus two variations after fixing. Six loops without closure flags structural risk. Part 1 must verify concurrent ready notices for distinct itineraries belonging to one user. Combined account/planning/cart journeys belong to their later automation scopes. Unresolved in-scope deferrals must not be labeled certified; excluded future work must not be turned into a Part 1 blocker.

**Why:** The user's requested completion standard distinguishes successful live behavior from metadata, mocks, or accepted enqueue operations.

**How to apply:** Use isolated development test recipients and data. Test-email links must point to the environment holding the fixtures, not automatically to a shared production canonical host: production cannot open development-only records. Record actual outcomes without claiming delivery from provider acceptance alone or credit correctness from a fabricated counter. A provider's delivered event establishes recipient-server delivery, not Inbox placement or authenticated link usability.

## Conditional abandoned-chat scope

Part 2 may validly contain three automations. If authoritative per-conversation context,
idle state, resume identity and completed-itinerary linkage are not reachable, report that
finding before building and exclude abandoned-chat emails. Do not build a new context bridge
or expert handoff simply to reach four automations.

**Why:** The user explicitly conditioned the fourth automation on reachability and prohibited
fabricated partial context or a new human handoff path.

**How to apply:** Treat excluded chat work as a separately authorized future capability, not
an unresolved Part 2 blocker. Preserve the existing expert-request rail if it becomes reachable.

## Booking/send race evidence

Certify the order of provider attempts/acceptance relative to booking commits, not external
inbox arrival. A provider-accepted email can arrive later even when the database ordering is correct.

**Why:** Asynchronous recipient delivery cannot be serialized with a local database transaction;
claiming otherwise would overstate the requested no-send-after-booking guarantee.

**How to apply:** Exercise both database race orderings and retain their actual evidence.
Keep recipient-server delivery and authenticated-link usability as separate certification checks.