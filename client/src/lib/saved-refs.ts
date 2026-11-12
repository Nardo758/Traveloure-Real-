/**
 * R4b-3 (round 4b, Nov 6, 2026; replaces CAP-2 Phase 3's in-session store): "Saved to plan" reads the PLAN'S OWN ITEMS
 * on the server, on both rails, so it survives a reload. A card names its item by `kind:source_id` (`savedRefKey`); a
 * stored item answers the same key (`savedRefKeyOfItem`, shared/plan-item-ref.ts).
 *   · guest (waitlist mode, signed out): the session's guest plan — `GET /api/guest-plans/current`, whose items carry
 *     their content link;
 *   · signed in: `GET /api/plans/saved-refs` — the keys the traveler's own plans that have not ended hold.
 * A save refreshes these reads (it never writes a client-side "saved" flag). No provider, or an unread answer ⇒ nothing
 * is saved (§13: never claimed before the server says so).
 */
import { useContext, useMemo } from "react";
import { QueryClient, QueryClientContext, useQuery, type QueryClient as QC } from "@tanstack/react-query";
import { savedRefKeyOfItem } from "@shared/plan-item-ref";
import { useSignupMode } from "./signup-mode";
import { fetchUser } from "@/hooks/use-auth";
import { fetchGuestPlan, GUEST_PLAN_QUERY_KEY, guestPlanReadAllowed, type GuestPlanView } from "./waitlist-guest-plan";

export function savedRefKey(ref: { kind?: string | null; source_id?: string | null } | null | undefined): string | null {
  const kind = typeof ref?.kind === "string" ? ref.kind.trim() : "";
  const id = typeof ref?.source_id === "string" ? ref.source_id.trim() : "";
  return kind && id ? `${kind}:${id}` : null;
}

export const SAVED_REFS_QUERY_KEY = ["/api/plans/saved-refs"] as const;

/** Pure: the keys a guest plan's items answer for. */
export function savedKeysFromGuestView(view: Pick<GuestPlanView, "items"> | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const it of view?.items ?? []) {
    const k = savedRefKeyOfItem(it as any);
    if (k) keys.add(k);
  }
  return keys;
}

/** After a confirmed save: refresh what "Saved to plan" reads, on both rails. */
export function refreshSavedRefs(client: QC): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: SAVED_REFS_QUERY_KEY }),
    client.invalidateQueries({ queryKey: GUEST_PLAN_QUERY_KEY }),
  ]);
}

const NO_PROVIDER_CLIENT = new QueryClient();
const EMPTY: ReadonlySet<string> = new Set();

async function fetchSavedRefs(): Promise<{ keys: string[] }> {
  const res = await fetch(SAVED_REFS_QUERY_KEY[0], { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** The keys the viewer's plan(s) hold, read from the server. */
export function useSavedRefKeys(): ReadonlySet<string> {
  return useSavedRefRead().keys;
}

/**
 * R4b-3 ruling (Nov 6, 2026): which rail answered. Signed in, "Saved to plan" is INFORMATIONAL — the press still opens
 * the picker (the same item may go on a second plan). The guest rail has one plan, so there the saved action is inert.
 */
function useSavedRefRead(): { keys: ReadonlySet<string>; guestRail: boolean } {
  const client = useContext(QueryClientContext);
  const qc = client ?? NO_PROVIDER_CLIENT;
  const { mode } = useSignupMode();
  const auth = useQuery({ queryKey: ["/api/auth/user"], queryFn: fetchUser, retry: false, staleTime: 5 * 60_000, enabled: !!client }, qc);
  const signedIn = !!auth.data;
  const authKnown = !!client && auth.isFetched;
  const owner = useQuery<{ keys: string[] }>(
    { queryKey: SAVED_REFS_QUERY_KEY, queryFn: fetchSavedRefs, retry: false, staleTime: 30_000, enabled: authKnown && signedIn },
    qc,
  );
  const guest = useQuery<GuestPlanView | null>(
    { queryKey: GUEST_PLAN_QUERY_KEY, queryFn: fetchGuestPlan, retry: false, staleTime: 30_000, enabled: !!client && guestPlanReadAllowed({ authLoading: !authKnown, signedIn }) && mode === "waitlist" },
    qc,
  );
  return useMemo(() => {
    if (!client) return { keys: EMPTY, guestRail: false };
    if (signedIn) return { keys: new Set(owner.data?.keys ?? []), guestRail: false };
    return { keys: savedKeysFromGuestView(guest.data), guestRail: true };
  }, [client, signedIn, owner.data, guest.data]);
}

/** Pure: a saved action is inert only on the guest rail (R4b-3 ruling). */
export function savedActionInert(saved: boolean, guestRail: boolean): boolean {
  return saved && guestRail;
}

/** `saved`: the plan holds it ("Saved to plan"). `inert`: the press does nothing (guest rail only). */
export function useRefSavedState(key: string | null | undefined): { saved: boolean; inert: boolean } {
  const { keys, guestRail } = useSavedRefRead();
  const saved = !!key && keys.has(key);
  return { saved, inert: savedActionInert(saved, guestRail) };
}

export function useRefSaved(key: string | null | undefined): boolean {
  return useRefSavedState(key).saved;
}
