import { coreNode, type CoreMessage } from "./_core-definition";
export const deletionComplete: CoreMessage = {
  kind: "deletion_complete", node: coreNode("deletion_complete"),
  copy: () => ({ subject: "Your Traveloure account has been deleted",
    body: "Your account and personal data have been removed, as requested. Some records are retained only where required for legal or accounting purposes." }),
};