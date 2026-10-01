import { emailOutboxAdminRetryAutomation } from "./email-outbox-admin-retry";
import { emailOutboxDrainAutomation } from "./email-outbox-drain";
import { emailOutboxEnqueueAutomation } from "./email-outbox-enqueue";
import { pushNotificationDispatchAutomation } from "./push-notification-dispatch";
import { pushNotificationSweepAutomation } from "./push-notification-sweep";

export const deliveryAutomations = [
  emailOutboxEnqueueAutomation,
  emailOutboxDrainAutomation,
  emailOutboxAdminRetryAutomation,
  pushNotificationDispatchAutomation,
  pushNotificationSweepAutomation,
] as const;