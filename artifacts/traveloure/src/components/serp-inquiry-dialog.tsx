import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send, ExternalLink } from "lucide-react";
import type { UnifiedResult } from "./unified-result-card";

interface SerpInquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: UnifiedResult | null;
  template?: string;
  destination?: string;
}

export function SerpInquiryDialog({
  open,
  onOpenChange,
  provider,
  template = "",
  destination = ""
}: SerpInquiryDialogProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const displayName = provider?.name || provider?.title || "Provider";
  const websiteUrl = provider?.websiteUrl || provider?.website;

  const inquiryMutation = useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("No provider selected");
      
      return apiRequest("POST", "/api/serp/inquiry", {
        serpProviderId: provider.id,
        providerName: displayName,
        providerPhone: provider.phone,
        providerWebsite: websiteUrl,
        message,
        destination,
        category: provider.category || "",
        template
      });
    },
    onSuccess: () => {
      toast({
        title: "Inquiry sent!",
        description: `Your inquiry has been sent to ${displayName}. We'll follow up with you.`
      });
      setMessage("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send inquiry",
        description: error.message || "Please try again or visit their website directly."
      });
    }
  });

  const handleSubmit = () => {
    if (!message.trim()) {
      toast({
        variant: "destructive",
        title: "Message required",
        description: "Please enter a message to send to the provider."
      });
      return;
    }
    inquiryMutation.mutate();
  };

  const handleVisitWebsite = () => {
    if (websiteUrl) {
      window.open(websiteUrl, "_blank");
    }
  };

  if (!provider) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact {displayName}</DialogTitle>
          <DialogDescription>
            Send an inquiry through Traveloure. We'll help coordinate the communication and follow up with you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-3 bg-muted/50">
            <div className="font-medium">{displayName}</div>
            {provider.address && (
              <div className="text-sm text-muted-foreground">{provider.address}</div>
            )}
            {provider.phone && (
              <div className="text-sm text-muted-foreground">{provider.phone}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inquiry-message">Your Message</Label>
            <Textarea
              id="inquiry-message"
              placeholder={`Hi, I'm interested in your services for my ${template || "event"} in ${destination || "your area"}. I'd like to learn more about...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none"
              data-testid="textarea-inquiry-message"
            />
            <p className="text-xs text-muted-foreground">
              Include details about your event date, group size, and specific requirements.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {websiteUrl && (
            <Button
              variant="outline"
              onClick={handleVisitWebsite}
              className="w-full sm:w-auto"
              data-testid="button-visit-website"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Website
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={inquiryMutation.isPending || !message.trim()}
            className="w-full sm:w-auto"
            data-testid="button-send-inquiry"
          >
            {inquiryMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send via Traveloure
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
