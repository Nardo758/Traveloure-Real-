import { useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";

/**
 * Shared "Ask an expert" action for the Discover feed.
 *
 * Every feed surface (gem, event, vendor service, recommendation, expert card,
 * neighborhood header) used to dump the traveler on the generic /local-experts
 * list — losing all context about *what* they wanted to ask about. This resolves
 * a relevant expert and routes straight into the chat with the subject pre-filled:
 *
 *   - a known expert (neighborhood local expert, expert card) → skip the lookup
 *   - otherwise resolve the most relevant expert for the city (prefer a
 *     local_expert; else the first city match) via the public /api/experts filter
 *   - chat consumes ?expertId (auto-selects the expert) + ?about (pre-fills the
 *     first message) — both already supported by client/src/pages/chat.tsx
 *
 * /chat is a ProtectedRoute (it bounces logged-out users to "/"), so we gate on
 * auth here and open the sign-in modal instead of sending them into a dead end.
 * If no expert can be resolved for the city, we fall back to the public experts
 * list pre-filtered to that city — context preserved, never a bare list.
 */

interface AskExpertParams {
  /** City used to resolve a relevant expert when no expertId is known. */
  city?: string | null;
  /** What the traveler is asking about — pre-fills the first chat message. */
  subject?: string | null;
  /** A known relevant expert (e.g. the neighborhood's local expert) — skips resolution. */
  expertId?: string | null;
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
    async ({ city, subject, expertId }: AskExpertParams) => {
      // Chat is auth-gated — sign in first rather than bounce to "/".
      if (!user) {
        openSignInModal();
        return;
      }

      const aboutQ = subject ? `&about=${encodeURIComponent(subject)}` : "";
      let id = expertId ?? null;
      if (!id && city) {
        id = await resolveExpertByCity(city);
      }

      if (id) {
        navigate(`/chat?expertId=${encodeURIComponent(id)}${aboutQ}`);
        return;
      }

      // No expert resolved for the city — honest fallback to the public list,
      // pre-filtered so the traveler still lands on city-relevant experts.
      navigate(city ? `/local-experts?location=${encodeURIComponent(city)}` : "/local-experts");
    },
    [user, openSignInModal, navigate],
  );
}
