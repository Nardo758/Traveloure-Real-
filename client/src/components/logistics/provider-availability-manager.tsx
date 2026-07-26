import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Calendar } from "lucide-react";
import type { ProviderService } from "@shared/schema";

// C2 repair: this manager previously POSTed a {dayOfWeek, startTime, endTime, isAvailable,
// pricingModifier} weekly-schedule shape the server never accepted (it required serviceId +
// date), and its GET expected {schedule, blackoutDates} while the server returns a flat
// vendor_availability_slots row array — every real submit 400d and nothing ever rendered.
// C0 ratified vendor_availability_slots as canonical for concrete, dated slots;
// provider_availability_schedule (recurring weekly patterns) is a separate layer that is
// OUT OF SCOPE here — this component only authors concrete dated slots against the owner's
// own services, matching what the canonical model + the server actually support. The old
// weekly-schedule and blackout-dates sections (neither backed by a working round-trip on
// this model) are removed rather than left pretending to work.
interface VendorAvailabilitySlot {
  id: string;
  serviceId: string;
  providerId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null;
}

export function ProviderAvailabilityManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: services } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider/services"],
  });

  const { data: slots } = useQuery<VendorAvailabilitySlot[]>({
    queryKey: ["/api/provider/availability"],
  });

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [newCapacity, setNewCapacity] = useState(1);

  const addSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/availability", {
        serviceId: selectedServiceId,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
        capacity: newCapacity,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      setNewDate("");
      toast({ title: "Availability slot added" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not add slot",
        description: error?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
    },
  });

  const services_ = services || [];
  const serviceNameById = new Map(services_.map((s) => [s.id, s.serviceName]));

  const upcomingSlots = [...(slots || [])]
    .filter((s) => s.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  const canSubmit = Boolean(selectedServiceId && newDate && newStart && newEnd);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Availability Slots
          </CardTitle>
          <CardDescription>
            Publish concrete dates and times travelers can book for one of your services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {services_.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a service before adding availability.
            </p>
          ) : upcomingSlots.length > 0 ? (
            <div className="space-y-2">
              {upcomingSlots.map((slot) => {
                const capacity = slot.capacity ?? 1;
                const booked = slot.bookedCount ?? 0;
                const fullyBooked = booked >= capacity;
                return (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 border border-console-light rounded px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {serviceNameById.get(slot.serviceId) || "Service"}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {slot.date} · {slot.startTime}–{slot.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={fullyBooked ? "outline" : "secondary"} className="text-[10px]">
                        {fullyBooked ? "Fully booked" : `${capacity - booked} of ${capacity} open`}
                      </Badge>
                      <button
                        onClick={() => deleteSlotMutation.mutate(slot.id)}
                        className="text-red-400 hover:text-red-600"
                        aria-label="Delete slot"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No slots scheduled yet.</p>
          )}

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
            <div className="sm:col-span-2">
              <Label className="text-xs">Service</Label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  {services_.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.serviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            <div>
              <Label className="text-xs">Capacity</Label>
              <Input
                type="number"
                min={1}
                value={newCapacity}
                onChange={(e) => setNewCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              onClick={() => addSlotMutation.mutate()}
              disabled={!canSubmit || addSlotMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add slot
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
