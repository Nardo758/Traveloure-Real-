import { messagingChatFollowOnsAutomation } from "./chat-follow-ons";
import { messagingMessageFollowOnsAutomation } from "./message-follow-ons";
import { messagingNotificationCreateAutomation } from "./notification-create";
import { messagingChatRealtimeFanoutAutomation } from "./chat-realtime-fanout";

export const chatAutomations = [
  messagingChatFollowOnsAutomation,
  messagingMessageFollowOnsAutomation,
  messagingNotificationCreateAutomation,
  messagingChatRealtimeFanoutAutomation,
] as const;

export {
  messagingChatFollowOnsAutomation,
  messagingMessageFollowOnsAutomation,
  messagingNotificationCreateAutomation,
  messagingChatRealtimeFanoutAutomation,
};