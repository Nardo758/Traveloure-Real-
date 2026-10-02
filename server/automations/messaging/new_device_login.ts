import { coreNode, type CoreMessage } from "./_core-definition";
export const newDeviceLogin: CoreMessage = {
  kind: "new_device_login", node: { ...coreNode("new_device_login"), type: "security" },
  copy: ({ device, place, time }) => ({ subject: "New sign-in to your account",
    body: `We noticed a new sign-in to your Traveloure account from ${place || "an unknown place"} on ${device || "an unknown device"} at ${time || "an unknown time"}. Wasn't you? Secure your account now.`,
    button: "No, secure my account", path: "/forgot-password" }),
};