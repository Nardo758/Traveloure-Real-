import { coreNode, type CoreMessage } from "./_core-definition";
export const accountLocked: CoreMessage = {
  kind: "account_locked", node: { ...coreNode("account_locked"), type: "security" },
  copy: () => ({ subject: "Your account is temporarily locked",
    body: "For your security, we've locked your account after several failed sign-in attempts. Try again in 30 minutes, or reset your password now.",
    button: "Reset password", path: "/forgot-password" }),
};