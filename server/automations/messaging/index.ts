import { createAutomationRegistry } from "../registry";
import { deliveryAutomations } from "./delivery-index";
import { producerAutomations } from "./producer-index";
import { chatAutomations } from "./chat-index";
import { coreMessages } from "./_core-index";

export const messagingAutomations = [
  ...deliveryAutomations,
  // Replace the three generic auth definitions in-place; never register two
  // competing owners for the same stable ID.
  ...producerAutomations.filter((node) => !coreMessages.some((message) => message.node.id === node.id)),
  ...chatAutomations,
  ...coreMessages.map((message) => message.node),
] as const;

export const messagingAutomationRegistry = createAutomationRegistry(messagingAutomations);