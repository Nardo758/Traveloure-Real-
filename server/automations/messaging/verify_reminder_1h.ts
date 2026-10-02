import { coreNode, type CoreMessage } from "./_core-definition";
export const verifyReminder1h: CoreMessage = {
  kind: "verify_reminder_1h", node: coreNode("verify_reminder_1h"),
  copy: () => ({ subject: "Still want to plan your next trip?",
    body: "Your Traveloure account is one click from ready. Confirm your email to unlock your AI trip planner.",
    button: "Confirm my email", path: "/verify-email" }),
};