import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface AvailabilityRule {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxBookingsPerDay: number;
  isActive: boolean;
}

interface BlackoutDate {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export default function AvailabilityManagement() {
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [maxBookings, setMaxBookings] = useState("5");
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [blackoutReason, setBlackoutReason] = useState("");
  const { toast } = useToast();

  const { data: availabilityRules } = useQuery<AvailabilityRule[]>({
    queryKey: ["/api/provider/availability/rules"],
  });

  const { data: blackoutDates } = useQuery<BlackoutDate[]>({
    queryKey: ["/api/provider/availability/blackout-dates"],
  });

  const saveRuleMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/provider/availability/rules", {
        dayOfWeek: selectedDay,
        startTime,
        endTime,
        maxBookingsPerDay: parseInt(maxBookings, 10),
        isActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability/rules"] });
      toast({ title: "Schedule saved", description: `${selectedDay} schedule updated.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save schedule.", variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/provider/availability/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability/rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete rule.", variant: "destructive" });
    },
  });

  const addBlackoutMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/provider/availability/blackout-dates", {
        startDate: blackoutStart,
        endDate: blackoutEnd,
        reason: blackoutReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability/blackout-dates"] });
      setShowBlackoutForm(false);
      setBlackoutStart("");
      setBlackoutEnd("");
      setBlackoutReason("");
      toast({ title: "Blackout date added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add blackout date.", variant: "destructive" });
    },
  });

  const deleteBlackoutMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/provider/availability/blackout-dates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability/blackout-dates"] });
      toast({ title: "Blackout date removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete blackout date.", variant: "destructive" });
    },
  });

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <ProviderLayout title="Availability Management">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" data-testid="text-title">
              Availability Management
            </h2>
            <p className="text-gray-600 mt-1">Set your work hours, blackout dates, and booking rules</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-sync-calendar">
            <Calendar className="w-4 h-4 mr-2" /> Sync Calendar
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="weekly" className="w-full">
          <TabsList>
            <TabsTrigger value="weekly">Weekly Schedule</TabsTrigger>
            <TabsTrigger value="blackout">Blackout Dates</TabsTrigger>
            <TabsTrigger value="rules">Booking Rules</TabsTrigger>
          </TabsList>

          {/* Weekly Schedule */}
          <TabsContent value="weekly" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Day Selection */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg">Select Day</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {daysOfWeek.map((day) => (
                    <Button
                      key={day}
                      variant={selectedDay === day ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => setSelectedDay(day)}
                      data-testid={`button-day-${day.toLowerCase()}`}
                    >
                      {day}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Schedule Editor */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">{selectedDay} Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        data-testid="input-start-time"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        data-testid="input-end-time"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Bookings Per Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={maxBookings}
                      onChange={(e) => setMaxBookings(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      data-testid="input-max-bookings"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <p className="text-sm text-blue-700">
                      {selectedDay} is available from {startTime} to {endTime}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                      onClick={() => saveRuleMutation.mutate()}
                      disabled={saveRuleMutation.isPending}
                      data-testid="button-save-schedule"
                    >
                      {saveRuleMutation.isPending ? "Saving..." : "Save Schedule"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setStartTime("09:00"); setEndTime("17:00"); setMaxBookings("5"); }}
                      data-testid="button-reset-schedule"
                    >
                      Reset to Default
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Blackout Dates */}
          <TabsContent value="blackout" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Blackout Dates</CardTitle>
                <Button size="sm" onClick={() => setShowBlackoutForm(true)} data-testid="button-add-blackout">
                  <Plus className="w-4 h-4 mr-1" /> Add Blackout Date
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {showBlackoutForm && (
                  <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-3">
                    <p className="font-medium text-sm text-blue-900">New Blackout Date</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={blackoutStart}
                          onChange={(e) => setBlackoutStart(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          data-testid="input-blackout-start"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">End Date</label>
                        <input
                          type="date"
                          value={blackoutEnd}
                          onChange={(e) => setBlackoutEnd(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          data-testid="input-blackout-end"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Reason</label>
                      <input
                        type="text"
                        value={blackoutReason}
                        onChange={(e) => setBlackoutReason(e.target.value)}
                        placeholder="e.g. Vacation, maintenance..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        data-testid="input-blackout-reason"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                        onClick={() => addBlackoutMutation.mutate()}
                        disabled={addBlackoutMutation.isPending || !blackoutStart || !blackoutEnd}
                        data-testid="button-confirm-blackout"
                      >
                        {addBlackoutMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowBlackoutForm(false)} data-testid="button-cancel-blackout">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {(blackoutDates || []).length > 0 ? (
                  (blackoutDates || []).map((blackout) => (
                    <div
                      key={blackout.id}
                      className="p-4 border border-gray-200 rounded-lg flex items-start justify-between"
                      data-testid={`card-blackout-${blackout.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          <div>
                            <p className="font-semibold text-gray-900">
                              {new Date(blackout.startDate).toLocaleDateString()} - {new Date(blackout.endDate).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">{blackout.reason}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteBlackoutMutation.mutate(blackout.id)}
                          disabled={deleteBlackoutMutation.isPending}
                          data-testid={`button-delete-blackout-${blackout.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No blackout dates scheduled</p>
                    <Button variant="outline" className="mt-4" onClick={() => setShowBlackoutForm(true)} data-testid="button-add-first-blackout">
                      <Plus className="w-4 h-4 mr-1" /> Add Your First Blackout Date
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Booking Rules */}
          <TabsContent value="rules" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Booking Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(availabilityRules || []).length > 0 ? (
                  (availabilityRules || []).map((rule) => (
                    <div
                      key={rule.id}
                      className="p-4 border border-gray-200 rounded-lg"
                      data-testid={`card-rule-${rule.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-600" />
                            <div>
                              <p className="font-semibold text-gray-900">{rule.dayOfWeek}</p>
                              <p className="text-sm text-gray-600 mt-1">
                                {rule.startTime} - {rule.endTime} • Max {rule.maxBookingsPerDay} bookings
                              </p>
                            </div>
                          </div>
                          {rule.isActive && (
                            <Badge className="mt-2 bg-green-100 text-green-700">Active</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => deleteRuleMutation.mutate(rule.id)}
                            disabled={deleteRuleMutation.isPending}
                            data-testid={`button-delete-rule-${rule.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No custom booking rules. Create them via the Weekly Schedule tab.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ProviderLayout>
  );
}
