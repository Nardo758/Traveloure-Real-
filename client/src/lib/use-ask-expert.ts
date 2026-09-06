import { useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import {
  conversationChatPath,
  resolveContactAddress,
  startConversation,
  type ContactAddressInput,
} from "@/lib/earner-address";

/**
 * Shared "Ask an expert" / "Message" action.
 *
 * CANONICAL (CLAUDE.md Locked Decision 40, lane 3; amended by its D22 addendum, ledger
 * `2026-09-05-slip-decisions-d18-d22`): a caller says WHAT the conversation is about — a storefront
 * `handle`, a public `serviceId`, a `bookingId` it is already on, or a `tripId` whose plan the two
 * people share — and this hook opens the thread through `POST /api/conversations/start`, which
 * resolves the recipient SERVER-SIDE and answers with an opaque conversation id. The traveler then lands on
 * `/chat?conversation=<opaque id>`. No user id is sent, and none comes back.
 *
 * DEPRECATED, kept for the rows that have no address yet: `expertId` (a `users.id`) and the
 * `city` → `/api/experts` resolution behind it. Both still route to `/chat?expertId=` exactly as
 * before. They are the fallback for an expert who has claimed no handle — lane 2 removes the id
 * from the public expert projection, and every remaining caller of this branch has to have a
 * handle (or a service/booking) by then.
 *
 * Feed surfaces (gem, event, vendor service, recommendation, expert card, neighborhood header)
 * still get context rather than a bare directory: `subject` pre-fills the composer through the
 * existing `?about=` param — deliberately NOT sent to the start rail, which would deliver it as a
 * message the traveler never typed.
 *
 * /chat is a ProtectedRoute (it bounces logged-out users to "/"), so we gate on auth here and open
 * the sign-in modal instead of sending them into a dead end. If nothing resolves, we fall back to
 * the public experts list pre-filtered to the city — context preserved, never a bare list.
 */

interface AskExpertParams extends ContactAddressInput {
  /** City used to resolve a relevant expert when no address and no expertId is known. */
  city?: string | null;
  /** What the traveler is asking about — pre-fills the first chat message. */
  subject?: string | null;
  /**
   * @deprecated Locked Decision 40 — a `users.id` is not an address. Pass `handle`, `serviceId` or
   * `bookingId` instead. Kept for rows that have no handle yet; removed with the id route.
   */
  expertId?: string | null;
  /**
   * Where to send the caller back to after signing in (e.g. the storefront page they came
   * from). Passed straight through to the sign-in modal's `returnTo`; omitted callers keep
   * today's behavior (post-auth lands on the role home page).
   */
  returnTo?: string | null;
  /**
   * Display fallback for the chat page's thread header. A conversation started by address has no
   * message in it yet, so it does not appear in the thread list — without a name/avatar the header
   * would have nothing true to render (§13). The start rail answers with a recipient card, so the
   * canonical path fills these itself; a caller may still pass them for the legacy `?expertId=`
   * branch, where `/api/experts/:id` resolves expert-family roles only and a provider-role target
   * 404s there.
   */
  fallbackName?: string | null;
  fallbackAvatar?: string | null;
}

async function resolveExpertByCity(city: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/experts?location=${encodeURIComponent(city)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const experts = await res.json();
    if (!Array.isArray(experts) || experts.length === 0) return null;
    // Prefer a local expert (the strongest "ask about this place" match); else
    // take the first city match. The endpoint already filters by location.
    const local = experts.find((e: any) => e?.role === "local_expert");
    const picked = local ?? experts[0];
    return picked?.id != null ? String(picked.id) : null;
  } catch {
    return null;
  }
}

export function useAskExpert() {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [, navigate] = useLocation();

  return useCallback(
    async ({
      city,
      subject,
      handle,
      serviceId,
      bookingId,
      tripId,
      expertId,
      returnTo,
      fallbackName,
      fallbackAvatar,
    }: AskExpertParams) => {
      // Chat is auth-gated — sign in first rather than bounce to "/".
      if (!user) {
        openSignInModal(returnTo ? { returnTo } : undefined);
        return;
      }

      // CANONICAL PATH (Locked Decision 40). An `ambiguous` result is a caller bug and is treated
      // as no address at all rather than resolved in a priority order — the server refuses two
      // addresses for the same reason (§13).
      const addressed = resolveContactAddress({ handle, serviceId, bookingId, tripId });
      if (addressed.ok) {
        const started = await startConversation(addressed.address);
        if (started) {
          navigate(
            conversationChatPath(started.conversationId, {
              about: subject,
              name: started.recipient.displayName || fallbackName || null,
              avatar: started.recipient.avatarUrl ?? fallbackAvatar ?? null,
            }),
          );
          return;
        }
        // The rail refused (no such handle/listing, a suspended earner, a block, a rate limit).
        // Every one of those is one 404 by design, so the client cannot tell them apart and must
        // not claim to (§13). Fall through to the honest directory fallback below rather than
        // silently retrying with a user id.
      }

      const aboutQ = subject ? `&about=${encodeURIComponent(subject)}` : "";
      // LD 40 lane 2: still id-addressed — the caller holds no handle/service/booking for this row.
      let id = expertId ?? null;
      if (!id && city) {
        id = await resolveExpertByCity(city);
      }

      if (id) {
        const fallbackQ =
          (fallbackName ? `&name=${encodeURIComponent(fallbackName)}` : "") +
          (fallbackAvatar ? `&avatar=${encodeURIComponent(fallbackAvatar)}` : "");
        navigate(`/chat?expertId=${encodeURIComponent(id)}${aboutQ}${fallbackQ}`);
        return;
      }

      // Nothing resolved — honest fallback to the public list, pre-filtered so the traveler still
      // lands on city-relevant experts.
      navigate(city ? `/local-experts?location=${encodeURIComponent(city)}` : "/local-experts");
    },
    [user, openSignInModal, navigate],
  );
}
