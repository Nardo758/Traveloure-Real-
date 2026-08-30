import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ServiceTemplatesResponse {
  requiresApplication: boolean;
  applicationRejected: boolean;
  pendingApproval: boolean;
  templates: unknown[];
}

interface UseApplicationGuardOptions {
  /**
   * Skip the wizard-eligibility check entirely — audit A3 / CLAUDE.md §5 Phase 3
   * "role is the gate" (ratified Jul 29, 2026): a session that already holds an
   * expert-family `users.role` (the same source `ProtectedRoute`'s
   * `requiredRole="expert"` reads, via `isExpertRole`) must never be bounced into the
   * application wizard — only a user who does NOT yet hold the role goes through this
   * `local_expert_forms`-presence check. Callers on role-gated routes (where
   * ProtectedRoute already guarantees the role) pass `skip: true`.
   */
  skip?: boolean;
}

export function useApplicationGuard(options: UseApplicationGuardOptions = {}) {
  const { skip = false } = options;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ServiceTemplatesResponse>({
    queryKey: ["/api/expert/service-templates"],
    enabled: !skip,
  });

  const requiresApplication = !skip && (data?.requiresApplication ?? false);
  const applicationRejected = !skip && (data?.applicationRejected ?? false);
  const pendingApproval = !skip && (data?.pendingApproval ?? false);

  useEffect(() => {
    if (!skip && !isLoading && requiresApplication) {
      toast({
        title: "Application required",
        description: "You need to submit an expert application before creating services.",
        variant: "destructive",
      });
      navigate("/expert/apply");
    }
  }, [skip, isLoading, requiresApplication, toast, navigate]);

  useEffect(() => {
    if (!skip && !isLoading && applicationRejected) {
      toast({
        title: "Application rejected",
        description: "Your expert application was not approved. Please reapply or contact support.",
        variant: "destructive",
      });
      navigate("/expert/apply");
    }
  }, [skip, isLoading, applicationRejected, toast, navigate]);

  useEffect(() => {
    if (!skip && !isLoading && pendingApproval) {
      toast({
        title: "Application under review",
        description: "Your application is under review. You can create services once it has been approved.",
        variant: "default",
      });
      navigate("/expert/apply");
    }
  }, [skip, isLoading, pendingApproval, toast, navigate]);

  return {
    isLoading: skip ? false : isLoading,
    requiresApplication,
    applicationRejected,
    pendingApproval,
    templates: data?.templates ?? [],
  };
}
