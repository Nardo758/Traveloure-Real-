import { coreNode, type CoreMessage } from "./_core-definition";
export const deletionConfirm: CoreMessage = {
  kind: "deletion_confirm", node: coreNode("deletion_confirm"),
  copy: ({ name }) => ({ subject: `We're sorry to see you go, ${name}`,
    body: "Your account deletion is confirmed. You have 7 days to change your mind — just log back in to cancel.",
    button: "Cancel deletion", path: "/login" }),
};