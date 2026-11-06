/**
 * CAP-2 Phase 3: the ONE client read of GET /api/public/guest-capabilities. Unread, loading or failed ⇒ undefined, and
 * `planActionsVisible` reads that as closed (no Book, no Hire). No provider mounted (a static render) ⇒ nothing fetched.
 */
import { useContext } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { guestCapabilitiesUrl, type GuestCapabilities } from "./plan-actions";

const NO_PROVIDER_CLIENT = new QueryClient();

export function useGuestCapabilities(city: string | null | undefined): GuestCapabilities | undefined {
  const client = useContext(QueryClientContext);
  const url = guestCapabilitiesUrl(city);
  const q = useQuery<GuestCapabilities>(
    { queryKey: [url], retry: false, staleTime: 30_000, enabled: !!client },
    client ?? NO_PROVIDER_CLIENT,
  );
  return q.data;
}
