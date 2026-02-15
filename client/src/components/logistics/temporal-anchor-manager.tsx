import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plane,
  Hotel,
  Camera,
  Heart,
  Clock,
  MapPin,
  Trash2,
  Plus,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const ANCHOR_TYPES = [
  { value: "flight_arrival", label: "Flight Arrival", icon: Plane },
  { value: "flight_departure", label: "Flight Departure", icon: Plane },
  { value: "hotel_checkin", label: "Hotel Check-in", icon: Hotel },
  { value: "hotel_checkout", label: "Hotel Check-out", icon: Hotel },
  { value: "pre_booked_tour", label: "Pre-booked Tour", icon: Camera },
  { value: "ceremony_time", label: "Ceremony", icon: Heart },
  { value: "rehearsal_time", label: "Rehearsal", icon: Clock },
  { value: "proposal_moment", label: "Proposal Moment", icon: Heart },
  { value: "dinner_reservation", label: "Dinner Reservation", icon: Clock },
  { value: "photographer_arrival", label: "Photographer Arrival", icon: Camera },
  { value: "reception_start", label: "Reception Start", icon: Heart },
  { value: "hair_makeup_start", label: "Hair & Makeup", icon: Clock },
  { value: "meeting_time", label: "Meeting", icon: Clock },
  { value: "custom", label: "Custom", icon: Clock },
] as const;

interface TemporalAnchor {
  id: string;
  tripId: string;
  anchorType: string;
  anchorDatetime: string;
  bufferBefore: number | null;
  bufferAfter: number | null;
  location: string | null;
  isImmovable: boolean | null;
  description: string | null;
  createdAt: string;
}

interface TemporalAnchorManagerProps {
  tripId: string;
}

export function TemporalAnchorManager({ tripId }: TemporalAnchorManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [anchorType, setAnchorType] = useState("");
  const [anchorDatetime, setAnchorDatetime] = useState("");
  const [bufferBefore, setBufferBefore] = useState("30");
  const [bufferAfter, setBufferAfter] = useState("30");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isImmovable, setIsImmovable] = useState(true);

  const { data: anchors = [], isLoading } = useQuery<TemporalAnchor[]>({
    queryKey: [`/api/trips/${tripId}/anchors`],
    enabled: !!tripId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/anchors`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Anchor Created", description: "Time constraint added to your trip." });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/anchors`] });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to create anchor", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/anchors/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Anchor Removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/anchors`] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to delete anchor", description: error.message });
    },
  });

  function resetForm() {
    setAnchorType("");
    setAnchorDatetime("");
    setBufferBefore("30");
    setBufferAfter("30");
    setLocation("");
    setDescription("");
    setIsImmovable(true);
    setShowForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!anchorType || !anchorDatetime) {
      toast({ variant: "destructive", title: "Missing fields", description: "Anchor type and date/time are required." });
      return;
    }
    createMutation.mutate({
      anchorType,
      anchorDatetime: new Date(anchorDatetime).toISOString(),
      bufferBefore: parseInt(bufferBefore) || 0,
      bufferAfter: parseInt(bufferAfter) || 0,
      location: location || null,
      description: description || null,
      isImmovable,
    });
  }

  function getAnchorIcon(type: string) {
    const found = ANCHOR_TYPES.find(a => a.value === type);
    return found ? found.icon : Clock;
  }

  function getAnchorLabel(type: string) {
    const found = ANCHOR_TYPES.find(a => a.value === type);
    return found ? found.label : type;
  }

  function formatDatetime(dt: string) {
    return new Date(dt).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Temporal Anchors
            </CardTitle>
            <CardDescription>
              Fixed time commitments that everything else must work around
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Anchor
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Create Form */}
        {showForm && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Anchor Type *</Label>
                    <Select value={anchorType} onValueChange={setAnchorType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ANCHOR_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Date & Time *</Label>
                    <Input
                      type="datetime-local"
                      value={anchorDatetime}
                      onChange={e => setAnchorDatetime(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Buffer Before (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="480"
                      value={bufferBefore}
                      onChange={e => setBufferBefore(e.target.value)}
                      placeholder="30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Buffer After (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="480"
                      value={bufferAfter}
                      onChange={e => setBufferAfter(e.target.value)}
                      placeholder="30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="e.g., LAX Terminal 4"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="e.g., Delta DL142 from JFK"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isImmovable}
                      onChange={e => setIsImmovable(e.target.checked)}
                      className="rounded"
                    />
                    Immovable (cannot be rescheduled)
                  </label>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Adding..." : "Add Anchor"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Anchors List */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading anchors...</div>
        ) : anchors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No temporal anchors yet</p>
            <p className="text-xs">Add flights, reservations, or ceremonies to lock in your schedule</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {anchors
                .sort((a, b) => new Date(a.anchorDatetime).getTime() - new Date(b.anchorDatetime).getTime())
                .map(anchor => {
                  const Icon = getAnchorIcon(anchor.anchorType);
                  const isExpanded = expandedId === anchor.id;

                  return (
                    <div
                      key={anchor.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-blue-100 text-blue-700">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {getAnchorLabel(anchor.anchorType)}
                              {anchor.isImmovable && (
                                <Badge variant="secondary" className="text-xs">Locked</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDatetime(anchor.anchorDatetime)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : anchor.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(anchor.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                          {anchor.location && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {anchor.location}
                            </div>
                          )}
                          {anchor.description && (
                            <div className="text-muted-foreground">{anchor.description}</div>
                          )}
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>Buffer before: {anchor.bufferBefore || 0} min</span>
                            <span>Buffer after: {anchor.bufferAfter || 0} min</span>
                          </div>
                          {(anchor.bufferBefore || anchor.bufferAfter) ? (
                            <div className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              Protected zone: {anchor.bufferBefore || 0}min before to {anchor.bufferAfter || 0}min after
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </ScrollArea>
        )}

        {/* Summary */}
        {anchors.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{anchors.length} anchor{anchors.length !== 1 ? "s" : ""} constraining your schedule</span>
              <span>{anchors.filter(a => a.isImmovable).length} immovable</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
