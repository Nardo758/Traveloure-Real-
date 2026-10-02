/**
 * Shared registry foundation. Later domain owners add their own node files and
 * compose those definitions into this registry; they should route event
 * producers through dispatchAutomationEvent and scheduled callers through
 * runScheduledAutomation. Actions stay bound at the call site so service-owned
 * transactions remain the sole authorities.
 */
export { AUTOMATION_DOMAINS, createAutomationRegistry, getAutomation } from "./registry";
export { dispatchAutomationEvent } from "./event-dispatcher";
export { runScheduledAutomation } from "./scheduler-wrapper";
export type {
  AutomationAdapters,
  AutomationContext,
  AutomationDefinition,
  AutomationDomain,
  AutomationRegistry,
} from "./contract";
export { paymentAutomations, paymentAutomationRegistry } from "./payments";
export { bookingAutomations, bookingAutomationRegistry } from "./bookings";
export { moderationAutomations, moderationAutomationRegistry } from "./moderation";
export { messagingAutomations, messagingAutomationRegistry } from "./messaging";
