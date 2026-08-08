/**
 * useAuth — Clerk-backed auth hook.
 *
 * Maintains the same interface as the old Replit Auth hook so no existing
 * component needs to change its imports or destructuring:
 *   { user, isLoading, isAuthenticated, logout, isLoggingOut, updatePreferredCurrency }
 *
 * Identity (sign-in state, session loading) comes from Clerk's hooks directly
 * (no server round-trip, no race with Clerk's session loading).
 *
 * App-specific DB data (role, preferences, termsAcceptedAt, etc.) is fetched
 * from GET /api/auth/user, gated on Clerk being loaded + signed in. This
 * prevents the transient-401 loop that would occur if the request fired before
 * Clerk has validated its session cookie.
 */
import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchDbUser(): Promise<User | null> {
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
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  const { data: user, isLoading: isDbLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchDbUser,
    // Only fire the server request once Clerk has validated its session cookie.
    // Without this gate, a request fires immediately on mount before Clerk is
    // ready and gets a 401, causing a redirect-to-sign-in loop (transient-401).
    enabled: isLoaded && !!isSignedIn,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: updateUserCurrency,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
  });

  const logout = () => {
    signOut({ redirectUrl: "/" });
  };

  // isLoading is true while:
  // - Clerk is still validating the session (isLoaded === false), OR
  // - Clerk says signed-in but the DB fetch hasn't completed yet
  const isLoading = !isLoaded || (isLoaded && !!isSignedIn && isDbLoading);

  return {
    user: isSignedIn ? (user ?? null) : null,
    isLoading,
    isAuthenticated: !!isSignedIn && !!user,
    logout,
    isLoggingOut: false,
    updatePreferredCurrency: updateCurrencyMutation.mutate,
  };
}
