import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Plus,
  Trash2,
  CalendarOff,
  Calendar,
  DollarSign,
} from "lucide-react";

interface ScheduleEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  pricingModifier: number;
  pricingReason: string | null;
  preferredSlots: Array<{
    label: string;
    startTime: string;
    endTime: string;
    isPreferred: boolean;
    reason: string;
  }>;
}

interface BlackoutDate {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ProviderAvailabilityManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newDay, setNewDay] = useState(1); // Monday
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [newPricing, setNewPricing] = useState(0);

  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [blackoutReason, setBlackoutReason] = useState("");

  const { data } = useQuery<{ schedule: ScheduleEntry[]; blackoutDates: BlackoutDate[] }>({
    queryKey: ["/api/provider/availability"],
  });

  const addScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/availability", {
        dayOfWeek: newDay,
        startTime: newStart,
        endTime: newEnd,
        isAvailable: true,
        pricingModifier: newPricing,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      toast({ title: "Schedule Added" });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
    },
  });

  const addBlackoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/blackout-dates", {
        startDate: blackoutStart,
        endDate: blackoutEnd,
        reason: blackoutReason || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      setBlackoutStart("");
      setBlackoutEnd("");
      setBlackoutReason("");
      toast({ title: "Blackout Date Added" });
    },
  });

  const deleteBlackoutMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/blackout-dates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
    },
  });

  const schedule = data?.schedule || [];
  const blackoutDates = data?.blackoutDates || [];

  // Group schedule by day
  const byDay = DAY_NAMES.map((name, i) => ({
    name,
    dayOfWeek: i,
    entries: schedule.filter(s => s.dayOfWeek === i),
  }));

  return (
    <div className="space-y-4">
      {/* Weekly Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Weekly Availability
          </CardTitle>
          <CardDescription>Set your regular working hours for each day</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {byDay.map((day) => (
            <div key={day.dayOfWeek} className="flex items-center gap-3 border-b pb-2 last:border-0">
              <span className="w-24 text-sm font-medium">{day.name}</span>
              {day.entries.length > 0 ? (
                <div className="flex-1 flex flex-wrap gap-2">
                  {day.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2 py-1 text-sm">
                      <span className="font-mono">{entry.startTime} - {entry.endTime}</span>
                      {entry.pricingModifier !== 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {entry.pricingModifier > 0 ? "+" : ""}{entry.pricingModifier}%
                        </Badge>
                      )}
                      <button
                        onClick={() => deleteScheduleMutation.mutate(entry.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not available</span>
              )}
            </div>
          ))}

          <Separator />

          {/* Add new schedule entry */}
          <div className="grid grid-cols-5 gap-2 items-end">
            <div>
              <Label className="text-xs">Day</Label>
              <select
                value={newDay}
                onChange={(e) => setNewDay(parseInt(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Price %</Label>
              <Input
                type="number"
                value={newPricing}
                onChange={(e) => setNewPricing(parseInt(e.target.value) || 0)}
                className="h-9"
                placeholder="0"
              />
            </div>
            <Button
              size="sm"
              onClick={() => addScheduleMutation.mutate()}
              disabled={addScheduleMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Blackout Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-red-500" />
            Blackout Dates
          </CardTitle>
          <CardDescription>
            Dates when you are completely unavailable
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {blackoutDates.length > 0 ? (
            <div className="space-y-2">
              {blackoutDates.map((b) => (
                <div key={b.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{b.startDate} to {b.endDate}</span>
                    {b.reason && <span className="text-muted-foreground ml-2">({b.reason})</span>}
                  </div>
                  <button
                    onClick={() => deleteBlackoutMutation.mutate(b.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No blackout dates set</p>
          )}

          <Separator />

          <div className="grid grid-cols-4 gap-2 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={blackoutStart} onChange={(e) => setBlackoutStart(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={blackoutEnd} onChange={(e) => setBlackoutEnd(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={blackoutReason}
                onChange={(e) => setBlackoutReason(e.target.value)}
                placeholder="Vacation, etc."
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addBlackoutMutation.mutate()}
              disabled={addBlackoutMutation.isPending || !blackoutStart || !blackoutEnd}
            >
              <CalendarOff className="h-3 w-3 mr-1" />
              Block
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
