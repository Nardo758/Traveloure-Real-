import { createAutomationRegistry } from "../registry";
import { deliveryAutomations } from "./delivery-index";
import { producerAutomations } from "./producer-index";
import { chatAutomations } from "./chat-index";
import { itineraryNudge2hAutomation } from "./itinerary-nudge-2h";
import { itineraryFollowup24hAutomation } from "./itinerary-followup-24h";
import { itineraryReengagement5dAutomation } from "./itinerary-reengagement-5d";

export const messagingAutomations = [
  ...deliveryAutomations,
  ...producerAutomations,
  ...chatAutomations,
  itineraryNudge2hAutomation,
  itineraryFollowup24hAutomation,
  itineraryReengagement5dAutomation,
] as const;

export const messagingAutomationRegistry = createAutomationRegistry(messagingAutomations);