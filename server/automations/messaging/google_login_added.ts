import { coreNode, type CoreMessage } from "./_core-definition";
export const googleLoginAdded: CoreMessage = {
  kind: "google_login_added",
  // Intentionally disabled: Traveloure has no genuine Google identity/linking
  // integration. Replit OIDC and Facebook MUST NOT impersonate this trigger.
  node: coreNode("google_login_added", "messaging.google_login_added", false),
  copy: () => ({ subject: "Google login added to your account",
    body: "You can now sign in with Google. Not you? Secure your account right away.",
    button: "Secure my account", path: "/forgot-password" }),
};