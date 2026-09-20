/**
 * concierge-plan-read — THE ONE SENTENCE FOR A BOOKING-CONCIERGE READ GRANT.
 *
 * Decision-maker ruling 2026-09-20 (ledger `2026-09-20-concierge-plan-read`). CLAUDE.md §13,
 * §18 rule 1.
 *
 * WHY THIS LIVES IN `shared/`, NOT SERVER-ONLY. The server writes this exact string onto
 * `trip_expert_advisors.message` (`server/services/concierge-plan-read.service.ts`), and the
 * client's advisor-label mapping (`client/src/lib/plan-vocabulary.ts`) must key its rendering off
 * the SAME literal — a re-typed copy on either side is the derivation-drift class §18 rule 1
 * names, and here the drift would be a LIE: a `pending` row carrying this sentence is a read
 * grant the concierge never accepted or was invited to accept, and it must never render as
 * "Request sent — awaiting <name>" (`slipAdvisorStandingLine`'s ordinary pending copy, §13).
 */
export const CONCIERGE_READ_GRANT_MESSAGE =
  "Booking concierge — read access from hand-off/claim" as const;
