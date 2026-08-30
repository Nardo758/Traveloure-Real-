import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { isExpertRole } from "@shared/roles";

export type ExpertIdentityVerificationStatus = "pending" | "processing" | "verified" | "failed";

interface ExpertApplicationStatusResponse {
  identityVerificationStatus?: string;
  identityVerifiedAt?: string;
}

const KNOWN_STATUSES: readonly ExpertIdentityVerificationStatus[] = [
  "pending",
  "processing",
  "verified",
  "failed",
];

/**
 * dispatch v1.3 R2 (docs/DECISIONS.md ruling 53): the single place every early-visibility
 * surface (Catalog console entry, ServiceForm) reads an expert's identity-verification
 * status, so they all render the SAME real `local_expert_forms.identity_verification_status`
 * value that `expert-status.tsx` already surfaces — one query, reused, not reimplemented.
 *
 * §13 honesty: `status` is `undefined` until the query actually resolves to one of the four
 * real values — never defaulted to "pending" client-side (the server route's own `?? "pending"`
 * fallback for a MISSING form row is a real, meaningful state — "no application started yet" —
 * not a guess this hook should paper over further). Callers that need "should I show a nag"
 * should check `isLoading` / `isError` explicitly rather than treating `undefined` as unverified.
 */
export function useExpertVerificationStatus(opts?: { enabled?: boolean }) {
  const { user } = useAuth();
  const enabled = (opts?.enabled ?? true) && isExpertRole((user as any)?.role);

  const query = useQuery<ExpertApplicationStatusResponse>({
    queryKey: ["/api/expert/application-status"],
    enabled,
  });

  const rawStatus = query.data?.identityVerificationStatus;
  const status =
    query.isSuccess && KNOWN_STATUSES.includes(rawStatus as ExpertIdentityVerificationStatus)
      ? (rawStatus as ExpertIdentityVerificationStatus)
      : undefined;

  return {
    enabled,
    isLoading: enabled && query.isLoading,
    // A resolved response whose status isn't one of the four known values is exactly as
    // "unknown" as a network error — §13 forbids guessing "pending" for either case.
    isError: enabled && (query.isError || (query.isSuccess && status === undefined)),
    status,
    isVerified: status === "verified",
    isPending: status === "pending",
    isProcessing: status === "processing",
    isFailed: status === "failed",
    identityVerifiedAt: query.data?.identityVerifiedAt,
  };
}
