/**
 * R3-21 — ONE display-name rule for the signed-in member (§18 rule 1).
 * First name, else the local part of the email, else NULL. NULL is "we do
 * not know a name" (§13) and is never rendered as a placeholder noun such as
 * "Traveler" or "User" — a caller with no name omits it.
 */
export function memberDisplayName(
  user: { firstName?: string | null; email?: string | null } | null | undefined,
): string | null {
  const first = user?.firstName?.trim();
  if (first) return first;
  const local = user?.email?.split("@")[0]?.trim();
  if (local) return local;
  return null;
}

/** "Welcome back, Ana" — or "Welcome back" when no name is known. */
export function welcomeBackLine(
  user: { firstName?: string | null; email?: string | null } | null | undefined,
): string {
  const name = memberDisplayName(user);
  return name ? `Welcome back, ${name}` : "Welcome back";
}
