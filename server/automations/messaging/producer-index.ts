import type { AutomationContext, AutomationDefinition } from "../contract";
import { authPasswordResetEmailAutomation } from "./auth-password-reset-email";
import { authVerificationEmailAutomation } from "./auth-verification-email";
import { authWelcomeEmailAutomation } from "./auth-welcome-email";
import { planDeliveredEmailAutomation } from "./plan-delivered-email";
import { planApprovedEmailAutomation } from "./plan-approved-email";
import { planChangesRequestedEmailAutomation } from "./plan-changes-requested-email";
import { planSuggestionEmailAutomation } from "./plan-suggestion-email";
import { activityEmailAutomation } from "./activity-email";
import { guestInviteSendAutomation } from "./guest-invite-send";
import { emailProviderTransportAutomation } from "./email-provider-transport";

export const producerAutomations = [
  authPasswordResetEmailAutomation,
  authVerificationEmailAutomation,
  authWelcomeEmailAutomation,
  planDeliveredEmailAutomation,
  planApprovedEmailAutomation,
  planChangesRequestedEmailAutomation,
  planSuggestionEmailAutomation,
  activityEmailAutomation,
  guestInviteSendAutomation,
  emailProviderTransportAutomation,
] as const;

export type MessagingEventDispatcher = <T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
) => Promise<T>;

/** Bind a node's stable ID and declared event to its unchanged producer action. */
export function dispatchMessagingProducer<T>(
  definition: AutomationDefinition<AutomationContext>,
  dispatcher: MessagingEventDispatcher,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  return dispatcher(definition.id, event, payload, context, action);
}

/** Downstream adapter for the one configured Resend client's actual transport method. */
export function wrapEmailProviderTransport<TArgs extends unknown[], TResult>(
  originalSend: (...args: TArgs) => Promise<TResult>,
  dispatcher: MessagingEventDispatcher,
): (...args: TArgs) => Promise<TResult> {
  return (...args) => dispatchMessagingProducer(
    emailProviderTransportAutomation,
    dispatcher,
    "email.provider_send",
    null,
    { providerConfigured: true },
    () => originalSend(...args),
  );
}