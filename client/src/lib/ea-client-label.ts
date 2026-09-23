/**
 * What an EA's roster calls a client (board task #502 follow-up, ledger
 * `2026-09-23-ea-accepted-client-name`). ONE derivation for every place the roster names a client —
 * the card header, its avatar initials, the edit and push dialogs and the push toast (§18 rule 1).
 *
 * Order:
 *   1. the name the EA typed for this client, when they typed one;
 *   2. once the person has ACCEPTED, the name on their own account;
 *   3. the email the invitation was addressed to.
 *
 * A stored display name equal to the invitation email counts as "no name typed": invitations
 * created by the first #502 release stored the email there, and treating it as a typed name is what
 * left an accepted client showing their email twice. The account name is read only when
 * `clientUserId` is set — before acceptance the EA sees nothing from the account (§13).
 */
export interface EaClientLabelInput {
  clientUserId: string | null;
  clientEmail: string | null;
  displayName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function eaClientName(client: EaClientLabelInput): string | null {
  const typed = clean(client.displayName);
  const invitedEmail = clean(client.clientEmail);
  if (typed && typed.toLowerCase() !== invitedEmail.toLowerCase()) return typed;
  if (client.clientUserId) {
    const accountName = [clean(client.userFirstName), clean(client.userLastName)].filter(Boolean).join(" ");
    if (accountName) return accountName;
  }
  return null;
}

export function eaClientEmail(client: EaClientLabelInput): string | null {
  return clean(client.userEmail) || clean(client.clientEmail) || null;
}

/** The roster card's two lines. The second line is omitted when it would repeat the first. */
export function eaClientLabel(client: EaClientLabelInput): { primary: string; secondary: string | null } {
  const name = eaClientName(client);
  const email = eaClientEmail(client);
  if (name) return { primary: name, secondary: email };
  if (email) return { primary: email, secondary: null };
  return { primary: "Unknown client", secondary: null };
}
