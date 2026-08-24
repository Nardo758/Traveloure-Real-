// Shared avatar-initials computation: businessName → firstName+lastName → fallback.
// Extracted from provider-sidebar.tsx so the sidebar and the provider Profile avatar can
// never disagree (provider console audit, Aug 10 2026: profile.tsx hardcoded "GE" while
// the sidebar computed real initials from the same user object).
export function initialsFromUser(
  user:
    | {
        businessName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      }
    | null
    | undefined,
  fallback = "P",
): string {
  if (user?.businessName) {
    return user.businessName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  if (user?.firstName && user?.lastName) {
    return (user.firstName[0] + user.lastName[0]).toUpperCase();
  }
  return fallback;
}
