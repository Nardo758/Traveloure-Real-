export type AutomationDomain =
  | "messaging"
  | "payments"
  | "bookings"
  | "moderation"
  | "ai"
  | "provider"
  | "scheduled";

export type AutomationCategory =
  | "must_have"
  | "marketing"
  | "operational"
  | "financial"
  | "security";

export type AutomationActionKind =
  | "send_message"
  | "mutate_record"
  | "call_external_api"
  | "enqueue_job";

export type AutomationActionOutcome = "success" | "failure" | "skipped";

export interface AutomationContext {
  event?: string;
  scheduleId?: string;
  payload?: unknown;
  scope?: unknown;
  [key: string]: unknown;
}

export interface AutomationDefinition<C extends AutomationContext = AutomationContext> {
  id: string;
  name: string;
  domain: AutomationDomain;
  type: AutomationCategory;
  trigger:
    | { kind: "event"; events: readonly string[] }
    | { kind: "cron"; schedule: string; scheduleId: string; source: string };
  condition: {
    description: string;
    evaluate: (context: C) => boolean;
  };
  /** Real action-owned key pattern only. This engine never pre-checks or claims it. */
  idempotencyKey: string | null;
  delay: null | { milliseconds: number; durableAdapter: string };
  cancels: readonly string[];
  /** Existing action behavior/guards are documented separately from registry execution. */
  actionGuard: string;
  action: { kind: AutomationActionKind; detail: string };
  /** Action-owned interpretation of returned values. Required before any cancellation may run. */
  actionOutcome?: (result: unknown, context: C) => AutomationActionOutcome;
  retryPolicy: string;
  failureBehavior: string;
  enabled: boolean;
}

export interface AutomationRegistry {
  readonly domains: readonly AutomationDomain[];
  readonly byId: ReadonlyMap<string, AutomationDefinition>;
}

export interface AutomationCancellationAdapter {
  cancel(
    automationId: string,
    cancellationId: string,
    context: AutomationContext,
  ): Promise<void> | void;
}

export interface AutomationDelayAdapter {
  wait(
    automationId: string,
    milliseconds: number,
    context: AutomationContext,
  ): Promise<void>;
}

export interface AutomationAdapters {
  cancellation?: AutomationCancellationAdapter;
  delay?: AutomationDelayAdapter;
}