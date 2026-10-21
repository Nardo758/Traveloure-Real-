/**
 * Application status is read from the same query key the apply wizards use.
 * The client default is stale forever and does not refetch on focus, so a status
 * page opened after the wizard painted the cached payload until Refresh.
 * These options belong to the status page, the dashboard card, and the denial page.
 */
export const applicationStatusQuery = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchInterval: 15_000,
};
