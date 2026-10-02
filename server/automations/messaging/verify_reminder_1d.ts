import { coreNode, type CoreMessage } from "./_core-definition";
export const verifyReminder1d: CoreMessage = {
  kind: "verify_reminder_1d", node: coreNode("verify_reminder_1d"),
  copy: ({ name }) => ({ subject: `Don't lose your spot, ${name}`,
    body: "Quick reminder — your account's still waiting. Verify now so your first itinerary isn't far away.",
    button: "Confirm my email", path: "/verify-email" }),
};