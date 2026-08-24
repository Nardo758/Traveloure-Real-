import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plane,
  Users,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Accessibility,
  UserCheck,
  UserX,
  Calendar,
} from "lucide-react";

interface Participant {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  status: string | null;
  arrivalDatetime: string | null;
  departureDatetime: string | null;
  mobilityLevel: string | null;
  mandatoryEventIds: string[];
  optionalEventIds: string[];
  accessibilityNeeds: string[];
}

interface ParticipantTravelTrackerProps {
  tripId: string;
  participants: Participant[];
  eventDate?: string;
}

export function ParticipantTravelTracker({
  tripId,
  participants,
  eventDate,
}: ParticipantTravelTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Edit form state
  const [arrivalDatetime, setArrivalDatetime] = useState("");
  const [departureDatetime, setDepartureDatetime] = useState("");
  const [mobilityLevel, setMobilityLevel] = useState("high");

  const updateMutation = useMutation({
    mutationFn: async ({ participantId, updates }: { participantId: string; updates: Record<string, unknown> }) => {
      const response = await apiRequest("PATCH", `/api/trips/${tripId}/participants/${participantId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Participant Updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/participants`] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    },
  });

  function startEditing(p: Participant) {
    setEditingId(p.id);
    setArrivalDatetime(p.arrivalDatetime ? new Date(p.arrivalDatetime).toISOString().slice(0, 16) : "");
    setDepartureDatetime(p.departureDatetime ? new Date(p.departureDatetime).toISOString().slice(0, 16) : "");
    setMobilityLevel(p.mobilityLevel || "high");
  }

  function handleSave(participantId: string) {
    updateMutation.mutate({
      participantId,
      updates: {
        arrivalDatetime: arrivalDatetime ? new Date(arrivalDatetime).toISOString() : null,
        departureDatetime: departureDatetime ? new Date(departureDatetime).toISOString() : null,
        mobilityLevel,
      },
    });
  }

  function formatDatetime(dt: string | null) {
    if (!dt) return "Not set";
    return new Date(dt).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getMobilityBadge(level: string | null) {
    if (!level || level === "high") return null;
    if (level === "medium") return <Badge className="bg-amber-100 text-amber-800 text-xs">Medium Mobility</Badge>;
    return <Badge variant="destructive" className="text-xs">Low Mobility</Badge>;
  }

  function getStatusIcon(status: string | null) {
    if (status === "confirmed") return <UserCheck className="h-3 w-3 text-green-600" />;
    if (status === "declined") return <UserX className="h-3 w-3 text-red-600" />;
    return <Clock className="h-3 w-3 text-amber-600" />;
  }

  // Group participants by arrival date for timeline view
  const withArrival = participants.filter(p => p.arrivalDatetime);
  const withoutArrival = participants.filter(p => !p.arrivalDatetime);

  const arrivalGroups: Record<string, Participant[]> = {};
  for (const p of withArrival) {
    const day = new Date(p.arrivalDatetime!).toLocaleDateString();
    if (!arrivalGroups[day]) arrivalGroups[day] = [];
    arrivalGroups[day].push(p);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5 text-indigo-600" />
              Arrival & Departure Tracking
            </CardTitle>
            <CardDescription>
              Track when each participant arrives and departs for group scheduling
            </CardDescription>
          </div>
          <Badge variant="outline">
            {withArrival.length}/{participants.length} tracked
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {participants.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No participants yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {/* Arrival timeline */}
              {Object.entries(arrivalGroups)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([date, group]) => (
                  <div key={date} className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{date}</span>
                      <Badge variant="outline" className="text-xs">{group.length} arriving</Badge>
                    </div>
                    {group.map(p => renderParticipant(p))}
                  </div>
                ))}

              {/* Untracked participants */}
              {withoutArrival.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Travel not yet set</span>
                  </div>
                  {withoutArrival.map(p => renderParticipant(p))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );

  function renderParticipant(p: Participant) {
    const isExpanded = expandedId === p.id;
    const isEditing = editingId === p.id;

    return (
      <div key={p.id} className="border rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(p.status)}
            <span className="text-sm font-medium">{p.name}</span>
            {p.role && p.role !== "guest" && (
              <Badge variant="secondary" className="text-xs">{p.role}</Badge>
            )}
            {getMobilityBadge(p.mobilityLevel)}
            {p.accessibilityNeeds && p.accessibilityNeeds.length > 0 && (
              <Accessibility className="h-3 w-3 text-blue-600" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => startEditing(p)}>
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpandedId(isExpanded ? null : p.id)}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Arrival/departure summary */}
        {!isExpanded && (p.arrivalDatetime || p.departureDatetime) && (
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            {p.arrivalDatetime && (
              <span className="flex items-center gap-1">
                <Plane className="h-3 w-3 rotate-45" /> {formatDatetime(p.arrivalDatetime)}
              </span>
            )}
            {p.departureDatetime && (
              <span className="flex items-center gap-1">
                <Plane className="h-3 w-3 -rotate-45" /> {formatDatetime(p.departureDatetime)}
              </span>
            )}
          </div>
        )}

        {/* Expanded / Edit view */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Arrival</Label>
                    <Input
                      type="datetime-local"
                      value={arrivalDatetime}
                      onChange={e => setArrivalDatetime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Departure</Label>
                    <Input
                      type="datetime-local"
                      value={departureDatetime}
                      onChange={e => setDepartureDatetime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mobility Level</Label>
                  <Select value={mobilityLevel} onValueChange={setMobilityLevel}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High — no restrictions</SelectItem>
                      <SelectItem value="medium">Medium — some limitations</SelectItem>
                      <SelectItem value="low">Low — wheelchair / limited walking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleSave(p.id)} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Arrives</span>
                    <div className="flex items-center gap-1">
                      <Plane className="h-3 w-3 text-green-600 rotate-45" />
                      {formatDatetime(p.arrivalDatetime)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Departs</span>
                    <div className="flex items-center gap-1">
                      <Plane className="h-3 w-3 text-red-600 -rotate-45" />
                      {formatDatetime(p.departureDatetime)}
                    </div>
                  </div>
                </div>
                {p.accessibilityNeeds && p.accessibilityNeeds.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <Accessibility className="h-3 w-3" />
                    {(p.accessibilityNeeds as string[]).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
