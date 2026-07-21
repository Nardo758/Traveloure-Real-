import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";

/**
 * "Request a service that doesn't exist yet" dialog. A traveler describes what
 * they're looking for in a city; the request lands in the admin triage queue
 * (POST /api/service-requests, travelerId derived server-side from the session).
 * Surfaced on the discover-location page so a "nothing here matches" moment has a
 * forward action instead of a dead end.
 */
export function ServiceRequestDialog({
  city,
  country,
  trigger,
}: {
  city?: string;
  country?: string;
  trigger?: React.ReactNode;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [cityValue, setCityValue] = useState(city ?? "");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const budgetNum = budget.trim() ? Number(budget) : undefined;
      const res = await apiRequest("POST", "/api/service-requests", {
        city: cityValue.trim(),
        country: country ?? undefined,
        serviceType: serviceType.trim() || undefined,
        description: description.trim(),
        budget: Number.isFinite(budgetNum) && (budgetNum as number) > 0 ? String(budgetNum) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: "Thanks — our team will look into finding this for you.",
      });
      setOpen(false);
      setDescription("");
      setServiceType("");
      setBudget("");
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Couldn't submit request",
        description: err?.message ?? "Please try again.",
      });
    },
  });

  const canSubmit = cityValue.trim().length > 0 && description.trim().length >= 5 && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2" data-testid="button-open-service-request">
            <Sparkles className="w-4 h-4" />
            Request a service
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Can't find what you're looking for?</DialogTitle>
          <DialogDescription>
            Tell us the experience or service you want and we'll try to source it for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sr-city">City</Label>
            <Input
              id="sr-city"
              value={cityValue}
              onChange={(e) => setCityValue(e.target.value)}
              placeholder="e.g. Kyoto"
              data-testid="input-service-request-city"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sr-type">Type of service <span className="text-gray-400">(optional)</span></Label>
            <Input
              id="sr-type"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder="e.g. private tea ceremony, night photography"
              data-testid="input-service-request-type"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sr-desc">What are you looking for?</Label>
            <Textarea
              id="sr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the experience you'd like — dates, group size, anything specific."
              rows={4}
              data-testid="textarea-service-request-description"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sr-budget">Budget (USD) <span className="text-gray-400">(optional)</span></Label>
            <Input
              id="sr-budget"
              type="number"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. 250"
              data-testid="input-service-request-budget"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => submit.mutate()}
            disabled={!canSubmit}
            className="bg-[#FF385C] hover:bg-[#E31C5F] text-white"
            data-testid="button-submit-service-request"
          >
            {submit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
