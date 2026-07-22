import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ServiceTemplatesResponse {
  requiresApplication: boolean;
  applicationRejected: boolean;
  templates: unknown[];
}

export function useApplicationGuard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ServiceTemplatesResponse>({
    queryKey: ["/api/expert/service-templates"],
  });

  const requiresApplication = data?.requiresApplication ?? false;
  const applicationRejected = data?.applicationRejected ?? false;

  useEffect(() => {
    if (!isLoading && requiresApplication) {
      toast({
        title: "Application required",
        description: "You need to submit an expert application before creating services.",
        variant: "destructive",
      });
      navigate("/expert/apply");
    }
  }, [isLoading, requiresApplication, toast, navigate]);

  useEffect(() => {
    if (!isLoading && applicationRejected) {
      toast({
        title: "Application rejected",
        description: "Your expert application was not approved. Please reapply or contact support.",
        variant: "destructive",
      });
      navigate("/expert/apply");
    }
  }, [isLoading, applicationRejected, toast, navigate]);

  return { isLoading, requiresApplication, applicationRejected, templates: data?.templates ?? [] };
}
