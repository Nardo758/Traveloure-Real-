import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { forgetPhonePushOnSignOut } from "@/lib/web-push";
import { clearPaymentMethodPromptDismissed } from "@/lib/payment-method-setup";
import { clearGuestClaimMemo, hasGuestClaimMemo } from "@/lib/waitlist-guest-plan";

/** QA round 3 PR 3: did this page hold a signed-in session (the last `/api/auth/user` answered a user)? */
let sessionSeen = false;

export async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    // QA round 3 PR 3 (Leon, Nov 11, 2026): a 401 after a session had existed (seen on this page, or recorded by this
    // tab's claim memo) forgets the claim memo, so the next sign-in in this tab claims again.
    if (sessionSeen || hasGuestClaimMemo()) clearGuestClaimMemo();
    sessionSeen = false;
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = (await response.json()) as User | null;
  if (user) sessionSeen = true;
  return user;
}

async function logout(): Promise<void> {
  // EX-1 (expert walkthrough, docs/testing/EXPERT_UX_WALKTHROUGH.md): the old
  // implementation navigated to GET /api/logout, a route that only exists when
  // REPL_ID is set — setupAuth early-returns (replitAuth.ts:130) before
  // registering it off-Replit, so logout 404'd and the session SURVIVED.
  // POST /api/auth/logout (emailAuth.ts) is registered in EVERY environment and
  // destroys any passport session (email or OIDC). Redirect only on success —
  // redirecting on failure would show a logged-out UI over a live session.
  // LD 53: a shared device stops receiving this account's phone notices (bounded, never fails).
  await forgetPhonePushOnSignOut();
  clearPaymentMethodPromptDismissed();
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Logout failed: ${response.status}`);
  }
  // QA round 3 PR 3 (TB2): the claim memo and the claimed-plan hand-off survive the reload below in sessionStorage;
  // forget them so a guest plan made after signing out is claimed by the next sign-in in this tab.
  clearGuestClaimMemo();
  sessionSeen = false;
  window.location.href = "/";
}

async function updateUserCurrency(currency: string): Promise<User> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferredCurrency: currency }),
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: updateUserCurrency,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
  });

  return {
    user,
    isLoading,
    isError,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    updatePreferredCurrency: updateCurrencyMutation.mutate,
  };
}
