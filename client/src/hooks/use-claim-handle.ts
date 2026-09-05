/**
 * use-claim-handle — the ONE client writer of `PATCH /api/me/handle`.
 *
 * Ledger `2026-09-05-handles-are-claimed` (CLAUDE.md Locked Decision 40). The claim rail now has
 * three surfaces asking for a handle — the Settings/Distribute card, the console banner, and the
 * two application wizards' handle step — and a second `fetch("/api/me/handle")` beside this one
 * is the derivation-drift class §18 rule 1 names: the copies would disagree about what a 409
 * means, about which query to invalidate, or about whether the value is normalised, and the
 * disagreement would show up as a handle that looks claimed on one surface and not on another.
 *
 * WHAT IT DOES NOT DO (§13):
 *   • It does not decide whether a handle is free. Uniqueness, reservation and the earner-role
 *     gate are the SERVER's answers; this hook surfaces the server's own message VERBATIM rather
 *     than translating a status code into a guess.
 *   • It does not normalise beyond what the input control already shows the user. The server
 *     trims and lowercases (`claimSchema`), and re-implementing that here would be a second
 *     authority on the shape.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ClaimHandleResult {
  handle: string;
}

/**
 * The claim mutation. Callers own their own toasts/copy — this owns the request, the error
 * surfacing and the auth-cache invalidation (so every surface reading `user.handle`, the console
 * banner included, stops showing the prompt the moment the claim lands).
 */
export function useClaimHandle(options?: { onClaimed?: (handle: string) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string): Promise<ClaimHandleResult> => {
      const res = await fetch("/api/me/handle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ handle: next }),
      });
      const body = await res.json().catch(() => ({}));
      // The server's own sentence — "That handle is already taken.", "That handle is reserved.",
      // the role refusal — reaches the earner unchanged. A client-invented message here would be
      // the platform guessing at a fact only the database holds.
      if (!res.ok) throw new Error(body?.message ?? `Failed (${res.status})`);
      return body as ClaimHandleResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      options?.onClaimed?.(data.handle);
    },
  });
}
