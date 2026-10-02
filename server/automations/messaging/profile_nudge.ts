import { coreNode, type CoreMessage } from "./_core-definition";
export const profileNudge: CoreMessage = {
  kind: "profile_nudge", node: coreNode("profile_nudge"),
  copy: ({ name }) => ({ subject: "Finish setting up your profile",
    body: `A complete profile helps our AI build better trips for you, ${name}. Just 2 minutes to finish.`,
    button: "Complete my profile", path: "/settings" }),
};