import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import {
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  X,
  ArrowLeftRight,
  MapPin,
  Utensils,
  Calendar,
  MessageSquare,
} from "lucide-react";

interface BookingRequest {
  id: string;
  tripId: string;
  providerId: string;
  expertId: string | null;
  serviceType: string;
  serviceDescription: string | null;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  price: string | null;
  clientContext: {
    tripDay: number;
    energyLevel: string;
    priorActivity: string | null;
    nextActivity: string | null;
    clientAvailableFrom: string;
    clientAvailableUntil: string;
    dietaryRestrictions: string[];
    mobilityLevel: string;
    specialNotes: string;
  } | null;
  anchorConstraints: Array<{
    anchorType: string;
    time: string;
    constraint: string;
  }> | null;
  expertNotes: string | null;
  status: string;
  counterOffer: {
    newStartTime: string;
    newEndTime: string;
    newPrice: number;
    reason: string;
  } | null;
  providerResponse: string | null;
  createdAt: string;
}

const ENERGY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  high: { label: "High Energy", color: "text-green-700 bg-green-50 border-green-200", icon: "text-green-600" },
  medium: { label: "Medium Energy", color: "text-amber-700 bg-amber-50 border-amber-200", icon: "text-amber-600" },
  low: { label: "Low Energy", color: "text-red-700 bg-red-50 border-red-200", icon: "text-red-600" },
  unknown: { label: "Unknown", color: "text-gray-700 bg-gray-50 border-gray-200", icon: "text-gray-600" },
};

export function ProviderBookingContextPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery<{ requests: BookingRequest[] }>({
    queryKey: ["/api/provider/booking-requests"],
  });

  const requests = data?.requests || [];
  const pending = requests.filter(r => r.status === "pending");
  const responded = requests.filter(r => r.status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Booking Requests
          </CardTitle>
          <CardDescription>
            {pending.length} pending &middot; {responded.length} responded
          </CardDescription>
        </CardHeader>
      </Card>

      <ScrollArea className="max-h-[700px]">
        <div className="space-y-4">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No booking requests yet. Requests from experts will appear here with full schedule context.
              </CardContent>
            </Card>
          ) : (
            requests.map((request) => (
              <BookingRequestCard key={request.id} request={request} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function BookingRequestCard({ request }: { request: BookingRequest }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCounter, setShowCounter] = useState(false);
  const [counterStart, setCounterStart] = useState(request.requestedStartTime);
  const [counterEnd, setCounterEnd] = useState(request.requestedEndTime);
  const [counterPrice, setCounterPrice] = useState(request.price || "");
  const [counterReason, setCounterReason] = useState("");
  const [responseNote, setResponseNote] = useState("");

  const respondMutation = useMutation({
    mutationFn: async (action: { status: string; counterOffer?: any; providerResponse?: string }) => {
      const res = await apiRequest("PUT", `/api/provider/booking-requests/${request.id}/respond`, action);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/booking-requests"] });
      toast({ title: "Response sent" });
    },
  });

  const ctx = request.clientContext;
  const energyConf = ctx ? ENERGY_CONFIG[ctx.energyLevel] || ENERGY_CONFIG.unknown : ENERGY_CONFIG.unknown;
  const isPending = request.status === "pending";

  return (
    <Card className={isPending ? "border-blue-200" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">
              {request.serviceType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
            </CardTitle>
            <CardDescription className="text-xs">
              {request.requestedDate} &middot; {request.requestedStartTime} - {request.requestedEndTime}
              {request.price && ` &middot; $${parseFloat(request.price).toLocaleString()}`}
            </CardDescription>
          </div>
          <Badge
            variant={isPending ? "default" : request.status === "accepted" ? "outline" : "destructive"}
            className="text-[10px]"
          >
            {request.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {request.serviceDescription && (
          <p className="text-sm text-muted-foreground">{request.serviceDescription}</p>
        )}

        {/* Client Context */}
        {ctx && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client Schedule Context</div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-blue-500" />
                Trip Day {ctx.tripDay}
              </div>
              <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 border ${energyConf.color}`}>
                <Zap className={`h-3 w-3 ${energyConf.icon}`} />
                {energyConf.label}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-gray-500" />
                Available {ctx.clientAvailableFrom} - {ctx.clientAvailableUntil}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-gray-500" />
                Mobility: {ctx.mobilityLevel}
              </div>
            </div>

            {(ctx.priorActivity || ctx.nextActivity) && (
              <div className="text-xs space-y-1">
                {ctx.priorActivity && (
                  <div className="text-muted-foreground">Before: {ctx.priorActivity}</div>
                )}
                {ctx.nextActivity && (
                  <div className="text-muted-foreground">After: {ctx.nextActivity}</div>
                )}
              </div>
            )}

            {ctx.dietaryRestrictions && ctx.dietaryRestrictions.length > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Utensils className="h-3 w-3 text-orange-500" />
                {ctx.dietaryRestrictions.join(", ")}
              </div>
            )}

            {ctx.specialNotes && (
              <div className="text-xs text-muted-foreground italic">{ctx.specialNotes}</div>
            )}
          </div>
        )}

        {/* Anchor Constraints */}
        {request.anchorConstraints && request.anchorConstraints.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Schedule Constraints
            </div>
            {request.anchorConstraints.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 rounded p-1.5 border border-amber-200">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{c.constraint}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expert Notes */}
        {request.expertNotes && (
          <div className="text-xs bg-blue-50 text-blue-800 rounded p-2 border border-blue-200">
            <div className="flex items-center gap-1 font-medium mb-1">
              <MessageSquare className="h-3 w-3" />
              Expert Note
            </div>
            {request.expertNotes}
          </div>
        )}

        {/* Counter Offer Display */}
        {request.counterOffer && (
          <div className="text-xs bg-purple-50 text-purple-800 rounded p-2 border border-purple-200">
            <div className="font-medium mb-1">Counter Offer Sent</div>
            <div>{request.counterOffer.newStartTime} - {request.counterOffer.newEndTime}</div>
            {request.counterOffer.newPrice && <div>${request.counterOffer.newPrice}</div>}
            <div className="text-muted-foreground mt-1">{request.counterOffer.reason}</div>
          </div>
        )}

        {/* Provider Response */}
        {request.providerResponse && (
          <div className="text-xs text-muted-foreground italic">
            Your response: {request.providerResponse}
          </div>
        )}

        <Separator />

        {/* Action Buttons (only if pending) */}
        {isPending && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Response Note (optional)</Label>
              <Textarea
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="Any message for the expert..."
                rows={2}
                className="text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() =>
                  respondMutation.mutate({
                    status: "accepted",
                    providerResponse: responseNote || "Accepted",
                  })
                }
                disabled={respondMutation.isPending}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  respondMutation.mutate({
                    status: "declined",
                    providerResponse: responseNote || "Declined",
                  })
                }
                disabled={respondMutation.isPending}
              >
                <X className="h-3 w-3 mr-1" />
                Decline
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCounter(!showCounter)}
              >
                <ArrowLeftRight className="h-3 w-3 mr-1" />
                Counter
              </Button>
            </div>

            {showCounter && (
              <div className="border rounded p-3 space-y-2 bg-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">New Start</Label>
                    <Input
                      type="time"
                      value={counterStart}
                      onChange={(e) => setCounterStart(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">New End</Label>
                    <Input
                      type="time"
                      value={counterEnd}
                      onChange={(e) => setCounterEnd(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">New Price</Label>
                    <Input
                      type="number"
                      value={counterPrice}
                      onChange={(e) => setCounterPrice(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Reason</Label>
                  <Input
                    value={counterReason}
                    onChange={(e) => setCounterReason(e.target.value)}
                    placeholder="Why are you suggesting different timing?"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    respondMutation.mutate({
                      status: "counter_offered",
                      counterOffer: {
                        newStartTime: counterStart,
                        newEndTime: counterEnd,
                        newPrice: parseFloat(counterPrice) || 0,
                        reason: counterReason,
                      },
                      providerResponse: responseNote || "Counter offer submitted",
                    })
                  }
                  disabled={respondMutation.isPending || !counterReason}
                >
                  Send Counter Offer
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
