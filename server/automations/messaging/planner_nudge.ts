import { coreNode, type CoreMessage } from "./_core-definition";
export const plannerNudge: CoreMessage = {
  kind: "planner_nudge", node: coreNode("planner_nudge"),
  copy: ({ name }) => ({ subject: `Where do you want to go, ${name}?`,
    body: "You haven't planned a trip yet — tell our AI your dream destination and get a full itinerary in minutes.",
    button: "Start planning", path: "/dashboard" }),
};