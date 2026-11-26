/**
 * R3 U7 - the pure piece behind the deletion request: the four fields the contact endpoint accepts, built from the
 * signed-in traveller. No React, no network.
 */
export interface DeletionRequestUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export const DELETION_SUBJECT = "Data Deletion Request";
export const DELETION_MESSAGE = "Account deletion requested from Settings by the signed-in account holder.";
export const DELETION_FALLBACK_NAME = "Traveloure traveler";

/** `{ name, email, subject, message }` - exactly the four fields `POST /api/contact` validates. */
export function r3DeletionRequestBody(user: DeletionRequestUser | null | undefined): {
  name: string;
  email: string;
  subject: string;
  message: string;
} {
  const name = [user?.firstName, user?.lastName].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
  return {
    name: name || DELETION_FALLBACK_NAME,
    email: (user?.email ?? "").trim(),
    subject: DELETION_SUBJECT,
    message: DELETION_MESSAGE,
  };
}
