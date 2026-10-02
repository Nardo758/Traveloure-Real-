import { createAutomationRegistry } from "../registry";
import { deliveryAutomations } from "./delivery-index";
import { producerAutomations } from "./producer-index";
import { chatAutomations } from "./chat-index";

export const messagingAutomations = [
  ...deliveryAutomations,
  ...producerAutomations,
  ...chatAutomations,
] as const;

export const messagingAutomationRegistry = createAutomationRegistry(messagingAutomations);