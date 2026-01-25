import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Shield, Loader2 } from "lucide-react";

export default function AcceptTermsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  // Check if user is authenticated
  const { data: user, isLoading: isLoadingUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoadingUser && !user) {
      window.location.href = "/api/login";
    }
  }, [isLoadingUser, user]);

  // Redirect to home if user has already accepted terms
  useEffect(() => {
    if (user?.termsAcceptedAt && user?.privacyAcceptedAt) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // Show loading while checking auth
  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/auth/accept-terms", {
        acceptTerms: true,
        acceptPrivacy: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome to Traveloure!",
        description: "Thank you for accepting our terms. You now have full access to the platform.",
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept terms. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = acceptTerms && acceptPrivacy;

  const handleAccept = () => {
    if (canSubmit) {
      acceptMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Traveloure</CardTitle>
          <CardDescription className="text-base">
            Before you continue, please review and accept our Terms of Service and Privacy Policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
              <Checkbox
                id="accept-terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                data-testid="checkbox-accept-terms"
              />
              <div className="flex-1">
                <label htmlFor="accept-terms" className="text-sm font-medium cursor-pointer">
                  I have read and agree to the Terms of Service
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Our terms outline your rights and responsibilities when using Traveloure.
                </p>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                  data-testid="link-view-terms"
                >
                  <FileText className="w-3 h-3" />
                  View Terms of Service
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
              <Checkbox
                id="accept-privacy"
                checked={acceptPrivacy}
                onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
                data-testid="checkbox-accept-privacy"
              />
              <div className="flex-1">
                <label htmlFor="accept-privacy" className="text-sm font-medium cursor-pointer">
                  I have read and agree to the Privacy Policy
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Our privacy policy explains how we collect, use, and protect your personal information.
                </p>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                  data-testid="link-view-privacy"
                >
                  <Shield className="w-3 h-3" />
                  View Privacy Policy
                </a>
              </div>
            </div>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!canSubmit || acceptMutation.isPending}
            className="w-full"
            size="lg"
            data-testid="button-accept-continue"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Accept and Continue"
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By clicking "Accept and Continue", you confirm that you are at least 18 years old and agree to be bound by these terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
