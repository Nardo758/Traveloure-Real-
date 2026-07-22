import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ServiceTemplatesResponse {
  requiresApplication: boolean;
  templates: unknown[];
}

export function useApplicationGuard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ServiceTemplatesResponse>({
    queryKey: ["/api/expert/service-templates"],
  });

  const requiresApplication = data?.requiresApplication ?? false;

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

  return { isLoading, requiresApplication, templates: data?.templates ?? [] };
}
