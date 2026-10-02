import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingCompletionLedgerReconciliationAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.completion-ledger-reconciliation",
  name: "Repair missing ledgers for completed bookings",
  domain: "bookings",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "as pass 2 of the existing hourly completion job",
    scheduleId: "booking-auto-completion",
    source: "bookingAutoCompleteScheduler.reconcileMissingLedgerRows",
  },
  condition: {
    description: "Run only from the existing hourly completion job.",
    evaluate: (context) => context.triggeredBy === "booking-auto-completion",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The retained reconciliation helper checks existing earning/revenue ledger rows and delegates to the guarded mint implementation; it does not complete bookings or replace payment rules.",
  action: { kind: "mutate_record", detail: "Heal missing earning-ledger rows for already-completed service bookings" },
  retryPolicy: "The existing next hourly pass retries failed reconciliation; no new retry policy is added.",
  failureBehavior: "The caller continues to log reconciliation failure without failing earlier completion passes.",
  enabled: true,
};