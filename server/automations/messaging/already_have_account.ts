import { coreNode, type CoreMessage } from "./_core-definition";
export const alreadyHaveAccount: CoreMessage = {
  kind: "already_have_account", node: coreNode("already_have_account"),
  copy: () => ({ subject: "You already have a Traveloure account",
    body: "Someone tried to sign up with this email. If it was you, log in or reset your password.",
    button: "Log in", path: "/login" }),
};