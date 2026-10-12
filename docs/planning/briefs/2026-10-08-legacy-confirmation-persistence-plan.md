> **Engineer note from #1360, moved here by the rebuild (ledger `2026-10-12-legacy-confirmation-persistence`).** Amended by decision-maker rulings, Oct 12, 2026: the webhook confirms only `LEGACY_PREPAYMENT_STATUSES` (`pending_payment`, `pending`, `payment_failed`; §15c) — not "anything except confirmed"; a late signal on any other status writes one `legacy_late_payment_signal` admin alert per booking and PaymentIntent; and after commit each writer kicks `deliverQueuedEmail` once, non-blocking, so delivery is immediate in the normal case (the 5-minute drain stays the guarantee). Where the text below says otherwise, the ruling governs.

# Legacy confirmation persistence implementation plan

The founder approved the design and implementation on 2026-10-08.

1. Add a typed transaction-bound legacy confirmation helper to the existing
   outbox service, with an explicit retryable persistence error. Persist the
   existing email payload, or a blocked dead row for a missing recipient.
2. Move the webhook's winning claim and traveler email into one transaction;
   add the same helper to the browser writer's existing transaction. Remove
   both post-commit traveler enqueue calls. Map the browser persistence error
   to the existing retryable 503 response without changing its other gates.
3. Adapt native concurrency verification to transactional claims. Extend the
   isolated harness with pre-commit failure, restart/drain recovery, transport
   retry, and missing-recipient cases. Preserve all money assertions.
4. Run native database tests with a verified development fingerprint and
   simulated transports, compare TypeScript diagnostics to the task base,
   restart the configured preview once, and document evidence and boundaries.
5. Record the approved persistence policy, propose distinct follow-ups, and
   submit the finished task for configured validation and completion review.

The writing-plans skill was not available in the installed skill catalog;
this scoped plan follows the approved design directly.
