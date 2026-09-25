/**
 * "Plan a trip" for an accepted client (Locked Decision 52 (C), ledger
 * `2026-09-24-ea-plans-for-executive`).
 *
 * The plan is created on the CLIENT's account — the server takes the owner from the accepted
 * relationship, never from this form — and opens on the plan's own page, where the assistant adds
 * items and the client approves, books and pays. Destination and dates are asked, never guessed
 * (LD 42 D12).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CalendarPlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { refreshPlanLists } from "@/lib/plan-lists";

export function PlanForClientDialog({ relationshipId, clientLabel }: { relationshipId: string; clientLabel: string }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [title, setTitle] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const datesOk = !!startDate && !!endDate && endDate >= startDate;
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ea/clients/${relationshipId}/trips`, {
        destination: destination.trim(),
        startDate,
        endDate,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      return (await res.json()) as { id: string };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/trips"] });
      // RC-7: a plan was created; every loaded plan list must see it.
      void refreshPlanLists(queryClient);
      setOpen(false);
      navigate(`/plans/${id}`);
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't start the plan",
        description: String(err?.message ?? "").includes("409")
          ? "This client hasn't accepted your invitation yet."
          : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-plan-for-${relationshipId}`}>
          <CalendarPlus className="w-3 h-3 mr-1" /> Plan a trip
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plan a trip for {clientLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The plan belongs to {clientLabel}. You can add and change items; they approve, book and pay.
        </p>
        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="ea-plan-destination">Destination</Label>
            <Input
              id="ea-plan-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Kyoto, Japan"
              data-testid="input-ea-plan-destination"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ea-plan-start">Start</Label>
              <Input id="ea-plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-ea-plan-start" />
            </div>
            <div>
              <Label htmlFor="ea-plan-end">End</Label>
              <Input id="ea-plan-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-ea-plan-end" />
            </div>
          </div>
          <div>
            <Label htmlFor="ea-plan-title">Title (optional)</Label>
            <Input id="ea-plan-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={destination ? `Trip to ${destination}` : ""} data-testid="input-ea-plan-title" />
          </div>
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={create.isPending || !destination.trim() || !datesOk}
            data-testid="button-create-ea-plan"
          >
            {create.isPending ? "Creating…" : "Start the plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
