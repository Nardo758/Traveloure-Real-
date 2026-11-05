# Launch checklist — LD 51 handoff: stays and transport become link tasks before open mode

**Status:** launch-checklist item, not built. **Blocks:** the switch of `traveler_signup_mode` to `open`.
**Owner:** a money-path lane with a human read of the diff. Not Lane 8.
**Source:** Lane 8 A-32 part 1 trace (nardo758/traveloure-real-#1894), recorded Nov 5, 2026.

## What is true now

- CN-1 concierge tasks treat stays and transport as links only. `isConciergeLinkOnly`
  (`shared/concierge-tasks.ts:26-38`) marks the `stays` and `transport` domains (and the seeded `stays`/`transport`
  keys) link-only; the task log accepts a link only on those kinds and closes them only with an https link
  (`server/services/concierge-task-log.service.ts:195`, `:280-285`). The task log writes only `concierge_tasks` and
  `concierge_task_events` (`:217`, `:229`, `:297`, `:302`).
- The older LD 51 booking-concierge handoff is a separate path and is still live. Buying a listing whose
  `expert_offering_type_key` is `booking_concierge` (not CN-1's `service_type = 'concierge'`) runs
  `createHandoffRequestsForBooking` (`server/services/concierge-handoff.service.ts:156`), called from
  `server/services/checkout-claim.service.ts:1186` and `server/routes/payments.routes.ts:909`.
- That handoff turns every unpurchased partner item on the plan (`affiliate_product_id` set, `provider_service_id`
  NULL — `concierge-handoff.service.ts` ~`:229-236`) into an `affiliate_booking_requests` row for a booking agent. It
  has no category filter, so a partner hotel or transfer reaches the agent rail as a booking request.

## What must be true before open mode

Stays and transport are filtered out of the handoff. Instead of an `affiliate_booking_requests` row, each such item
becomes a link task on the CN-1 rail (link-only kind), so the expert sends a link and nothing books a stay or a
transfer on the traveler's behalf. Every other partner item keeps today's handoff.

## Why it is a separate lane

It runs inside the checkout promotion and the booking-concierge payment path (§15b/§15c in CLAUDE.md). The change needs
a human read of the diff, a ruling on how a handoff item maps to a CN-1 task kind, and its own DB tests on both
callers. No migration is expected; if one is, it needs its own approval.
