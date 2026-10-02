import type { AutomationContext, AutomationDefinition } from "../contract";
import { coreNode, type CoreMessage } from "./_core-definition";

export const authWelcomeEmailAutomation: AutomationDefinition<AutomationContext> = {
  ...coreNode("welcome", "messaging.auth-welcome-email"),
  trigger: { kind: "event", events: ["signup_journey.welcome", "auth.welcome_email"] },
};

export const welcomeMessage: CoreMessage = {
  kind: "welcome",
  node: authWelcomeEmailAutomation,
  copy: ({ name }) => ({
    subject: `Welcome to Traveloure, ${name}`,
    body: "You're in. Tell our AI where you want to go and get a full itinerary in minutes. Need help? Just reply to this email.",
    button: "Plan my 1st Experience", path: "/dashboard",
  }),
};