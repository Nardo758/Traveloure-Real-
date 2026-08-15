import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { wipeLocalTripSession } from "@/lib/trip-context";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  // EX-1 (expert walkthrough, docs/testing/EXPERT_UX_WALKTHROUGH.md): the old
  // implementation navigated to GET /api/logout, a route that only exists when
  // REPL_ID is set — setupAuth early-returns (replitAuth.ts:130) before
  // registering it off-Replit, so logout 404'd and the session SURVIVED.
  // POST /api/auth/logout (emailAuth.ts) is registered in EVERY environment and
  // destroys any passport session (email or OIDC). Redirect only on success —
  // redirecting on failure would show a logged-out UI over a live session.
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Logout failed: ${response.status}`);
  }
  // Synchronous cleanup before navigation. useEffect-based cleanup in
  // useSyncTripContextOnSignIn fires post-render, which is too late when
  // window.location.href replaces the document immediately. Wiping here
  // ensures no pending debounced PUT can fire after the session ends, and the
  // prior user's context/ownership stamp cannot survive to the next session.
  wipeLocalTripSession();
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
  const { data: user, isLoading } = useQuery<User | null>({
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
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    updatePreferredCurrency: updateCurrencyMutation.mutate,
  };
}
