import { coreNode, type CoreMessage } from "./_core-definition";
export const verifyReminder3d: CoreMessage = {
  kind: "verify_reminder_3d", node: coreNode("verify_reminder_3d"),
  copy: () => ({ subject: "Last reminder: activate your account",
    body: "This is the final nudge. After this, we'll stop reminding you — but you can always come back and verify anytime.",
    button: "Confirm my email", path: "/verify-email" }),
};