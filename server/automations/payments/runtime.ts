import type { BackgroundJobSkipped } from "../../services/background-job-runner";
import type { AutomationContext } from "../contract";
import { dispatchAutomationEvent } from "../event-dispatcher";
import {
  runScheduledAutomation,
  type ScheduledAutomationSkipped,
} from "../scheduler-wrapper";
import { paymentAutomationRegistry } from "./index";
import {
  connectDisputeLifecycleAutomation,
  connectPaymentIntentFailedAutomation,
  connectPaymentIntentSucceededAutomation,
  connectTransferStatusAutomation,
  platformChargeRefundedAutomation,
  platformCheckoutSessionCompletedAutomation,
  platformPaymentIntentCanceledAutomation,
  platformPaymentIntentFailedAutomation,
  platformPaymentIntentRequiresActionAutomation,
  platformPaymentIntentSucceededAutomation,
  platformStripeBankPayoutAlertAutomation,
  platformStripeDisputeLifecycleAutomation,
  platformSubscriptionMembershipAutomation,
} from "./index";

function eventsOf(definition: { trigger: { kind: string; events?: readonly string[] } }): readonly string[] {
  return definition.trigger.kind === "event" ? definition.trigger.events ?? [] : [];
}

export const PLATFORM_PAYMENT_EVENT_AUTOMATION_IDS = new Map<string, string>([
  ...eventsOf(platformPaymentIntentSucceededAutomation).map((event) => [event, platformPaymentIntentSucceededAutomation.id] as const),
  ...eventsOf(platformPaymentIntentFailedAutomation).map((event) => [event, platformPaymentIntentFailedAutomation.id] as const),
  ...eventsOf(platformPaymentIntentCanceledAutomation).map((event) => [event, platformPaymentIntentCanceledAutomation.id] as const),
  ...eventsOf(platformPaymentIntentRequiresActionAutomation).map((event) => [event, platformPaymentIntentRequiresActionAutomation.id] as const),
  ...eventsOf(platformChargeRefundedAutomation).map((event) => [event, platformChargeRefundedAutomation.id] as const),
  ...eventsOf(platformCheckoutSessionCompletedAutomation).map((event) => [event, platformCheckoutSessionCompletedAutomation.id] as const),
  ...eventsOf(platformSubscriptionMembershipAutomation).map((event) => [event, platformSubscriptionMembershipAutomation.id] as const),
]);

export const CONNECT_FINANCIAL_EVENT_AUTOMATION_IDS = new Map<string, string>([
  ...eventsOf(connectPaymentIntentSucceededAutomation).map((event) => [event, connectPaymentIntentSucceededAutomation.id] as const),
  ...eventsOf(connectPaymentIntentFailedAutomation).map((event) => [event, connectPaymentIntentFailedAutomation.id] as const),
  ...eventsOf(connectDisputeLifecycleAutomation).map((event) => [event, connectDisputeLifecycleAutomation.id] as const),
  ...eventsOf(connectTransferStatusAutomation).map((event) => [event, connectTransferStatusAutomation.id] as const),
]);

export const PLATFORM_DISPUTE_PAYOUT_AUTOMATION_IDS = new Map<string, string>([
  ...eventsOf(platformStripeDisputeLifecycleAutomation).map((event) => [event, platformStripeDisputeLifecycleAutomation.id] as const),
  ...eventsOf(platformStripeBankPayoutAlertAutomation).map((event) => [event, platformStripeBankPayoutAlertAutomation.id] as const),
]);

export async function dispatchPaymentEvent<T>(
  id: string,
  event: string,
  payload: unknown,
  action: () => Promise<T> | T,
): Promise<T> {
  return dispatchPaymentTrigger(id, event, payload, { signatureVerified: true }, action);
}

export async function dispatchPaymentTrigger<T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  const dispatched = await dispatchAutomationEvent(
    paymentAutomationRegistry,
    id,
    { event, payload, ...context },
    action,
  );
  if (!dispatched.executed) {
    throw new Error(`Payment automation ${id} did not run (${dispatched.reason})`);
  }
  return dispatched.result;
}

export function runPaymentSchedule<T>(
  id: string,
  scheduleId: string,
  action: () => Promise<T> | T,
  options: {
    runnerName?: string;
    useBackgroundJobRunner?: boolean;
    context?: Record<string, unknown>;
  } = {},
): Promise<T | ScheduledAutomationSkipped | BackgroundJobSkipped> {
  const context: AutomationContext = {
    triggeredBy: scheduleId,
    ...options.context,
    scheduleId,
  };
  return runScheduledAutomation(
    paymentAutomationRegistry,
    id,
    context,
    action,
    { scheduleId, ...options },
  );
}