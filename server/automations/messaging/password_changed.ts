import { coreNode, type CoreMessage } from "./_core-definition";
export const passwordChanged: CoreMessage = {
  kind: "password_changed", node: { ...coreNode("password_changed"), type: "security" },
  copy: () => ({ subject: "Your password was changed",
    body: "Your Traveloure password was just updated. If you didn't do this, contact us immediately.",
    button: "Secure my account", path: "/forgot-password" }),
};