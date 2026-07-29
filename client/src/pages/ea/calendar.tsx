import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar as CalendarIcon,
  AlertCircle,
  Bot,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Download,
  ShieldAlert,
  Gift,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDelegateToAi } from "./use-ea-ai-delegate";

interface EaEvent {
  id: string; title: string; executiveId?: string | null; executiveName?: string; type?: string;
  date?: string; venue?: string; guests?: number; status: string;
  notes?: string; giftNeeded?: boolean;
}

interface EaExecutive {
  id: string;
  name: string;
}

interface EaPreferences {
  calendar?: { weekStartsOn?: "sunday" | "monday" };
  display?: { twentyFourHourTime?: boolean };
}

const TYPE_CODE: Record<string, string> = { dinner: "D", meeting: "M", travel: "T", personal: "P" };
const LEGEND = [
  { code: "D", meaning: "Dinner" },
  { code: "M", meaning: "Meeting" },
  { code: "T", meaning: "Travel" },
  { code: "P", meaning: "Personal" },
];

function startOfWeek(base: Date, weekStartsOn: "sunday" | "monday"): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  const diff = weekStartsOn === "monday" ? (dow === 0 ? -6 : 1 - dow) : -dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function EACalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [delegateTask, setDelegateTask] = useState("");

  const { data: events = [] } = useQuery<EaEvent[]>({ queryKey: ["/api/ea/events"] });
  const { data: executives = [] } = useQuery<EaExecutive[]>({ queryKey: ["/api/ea/executives"] });
  const { data: prefs } = useQuery<EaPreferences>({ queryKey: ["/api/ea/preferences"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ea/events/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/events"] });
      toast({ title: "Event updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delegate = useDelegateToAi();

  const weekStartsOn = prefs?.calendar?.weekStartsOn ?? "monday";
  const use24h = prefs?.display?.twentyFourHourTime ?? false;

  const weekStart = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    return startOfWeek(base, weekStartsOn);
  }, [weekOffset, weekStartsOn]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, use24h ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" });

  // Real per-executive, per-day event lookup — no invented calendar grid.
  const eventsForExecOnDay = (execId: string, execName: string, day: Date) =>
    events.filter((e) => {
      if (!e.date) return false;
      const isThisExec = e.executiveId ? e.executiveId === execId : e.executiveName === execName;
      if (!isThisExec) return false;
      const d = new Date(e.date);
      return !isNaN(d.getTime()) && sameDay(d, day);
    });

  const today = new Date();
  const todayEvents = events
    .filter((e) => e.date && !isNaN(new Date(e.date).getTime()) && sameDay(new Date(e.date), today))
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

  // Real conflict detection: two+ events for the SAME executive at the EXACT
  // same date+time. No duration/end-time exists on ea_events, so this is the
  // only honest definition available — never a fabricated "busy" heuristic.
  const conflicts = useMemo(() => {
    const groups = new Map<string, EaEvent[]>();
    for (const e of events) {
      if (!e.date) continue;
      const execKey = e.executiveId || e.executiveName || "unknown";
      const key = `${execKey}__${new Date(e.date).getTime()}`;
      if (isNaN(new Date(e.date).getTime())) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  }, [events]);

  function exportCsv() {
    const header = ["Executive", "Title", "Type", "Date", "Venue", "Guests", "Status"];
    const rows = events.map((e) => [
      e.executiveName ?? "",
      e.title,
      e.type ?? "",
      e.date ? new Date(e.date).toISOString() : "",
      e.venue ?? "",
      String(e.guests ?? ""),
      e.status,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ea-events-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${events.length} event${events.length !== 1 ? "s" : ""} exported to CSV.` });
  }

  return (
    <EALayout title="Multi-Event Coordination">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-calendar-title">
              Multi-Event Coordination
            </h1>
            <p className="text-gray-600">Manage all executive events in one view</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConflictsOpen(true)} data-testid="button-resolve-conflicts">
              <ShieldAlert className="w-4 h-4 mr-2" />
              Resolve Conflicts{conflicts.length > 0 ? ` (${conflicts.length})` : ""}
            </Button>
            <Button variant="outline" disabled={events.length === 0} onClick={exportCsv} data-testid="button-export-calendar">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Calendar Matrix */}
        <Card className="border border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w - 1)} data-testid="button-prev-week">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg">
                  {weekOffset === 0 ? "This Week" : weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w + 1)} data-testid="button-next-week">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {weekOffset !== 0 && (
                  <Button variant="ghost" size="sm" className="text-primary" onClick={() => setWeekOffset(0)} data-testid="button-this-week">
                    Today
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                {executives.length > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-700">{executives.length} executive{executives.length !== 1 ? "s" : ""}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-sm font-medium text-gray-500 border-b">Executive</th>
                    {weekDays.map((day) => (
                      <th key={day.toISOString()} className={`p-3 text-center text-sm font-medium border-b min-w-16 ${sameDay(day, today) ? "text-primary" : "text-gray-500"}`}>
                        {day.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
                        <div className="text-xs font-normal">{day.getDate()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {executives.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-[#7A7A72] text-sm">
                        No executives added yet — add executives to see their calendars here
                      </td>
                    </tr>
                  )}
                  {executives.map((exec) => (
                    <tr key={exec.id} className="border-b hover:bg-gray-50" data-testid={`calendar-row-${exec.id}`}>
                      <td className="p-3 text-sm font-medium text-gray-900">{exec.name}</td>
                      {weekDays.map((day) => {
                        const dayEvents = eventsForExecOnDay(exec.id, exec.name, day);
                        return (
                          <td key={day.toISOString()} className="p-3 text-center">
                            {dayEvents.length > 0 && (
                              <Badge
                                variant="outline"
                                className={`text-xs cursor-default ${dayEvents.some((e) => e.type === "dinner" || e.type === "travel") ? "bg-primary/10 text-primary border-primary" : ""}`}
                                title={dayEvents.map((e) => `${e.title} (${e.type ?? "event"})`).join(", ")}
                              >
                                {TYPE_CODE[dayEvents[0].type ?? ""] ?? "•"}
                                {dayEvents.length > 1 ? `+${dayEvents.length - 1}` : ""}
                                {dayEvents.some((e) => e.giftNeeded) && <Gift className="w-3 h-3 inline ml-1" />}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-2">Legend:</p>
              <div className="flex flex-wrap gap-3">
                {LEGEND.map((item) => (
                  <span key={item.code} className="text-xs text-gray-600">
                    <Badge variant="outline" className="mr-1">{item.code}</Badge>={item.meaning}
                  </span>
                ))}
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Gift className="w-3 h-3" /> = Gift needed
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Events */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              Today's Events ({todayEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayEvents.length === 0 && (
              <div className="text-center py-8">
                <CalendarIcon className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No events today</p>
                <p className="text-sm text-[#7A7A72] mt-1">Today's events will appear here</p>
              </div>
            )}
            {todayEvents.map((event) => (
              <div
                key={event.id}
                className={`p-4 rounded-lg border ${event.status === "urgent" ? "border-red-200 bg-red-50" : "border-gray-200"}`}
                data-testid={`today-event-${event.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-gray-600">{formatTime(new Date(event.date!))}</span>
                      {event.status === "urgent" && <Badge className="bg-red-500 text-white">URGENT</Badge>}
                      {event.status === "confirmed" && <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>}
                    </div>
                    <p className="font-semibold text-gray-900">{event.executiveName ? `${event.executiveName} - ` : ""}{event.title}</p>

                    {event.venue && (
                      <p className="text-sm text-gray-600 mt-1">Venue: {event.venue}</p>
                    )}
                    {!!event.guests && (
                      <p className="text-sm text-gray-600">Guests: {event.guests}</p>
                    )}
                    {event.notes && (
                      <p className="text-sm text-red-600 mt-1">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {event.notes}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">Status: {event.status}</p>
                  </div>

                  {event.status !== "confirmed" && (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: event.id, status: "confirmed" })}
                        data-testid={`button-confirm-${event.id}`}
                      >
                        {event.status === "urgent" ? "Handle Now" : "Mark Confirmed"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Coordination */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="w-5 h-5 text-green-600" />
              AI Coordination Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Delegate a cross-executive coordination task — it lands in your AI Assistant queue for review:</p>
            <ul className="space-y-2 text-sm text-gray-600 mb-4">
              <li>• Suggest optimal meeting times for groups</li>
              <li>• Coordinate multi-city travel logistics</li>
              <li>• Draft communications on your behalf</li>
              <li>• Research venues, restaurants, hotels in bulk</li>
            </ul>
            <Textarea
              placeholder="Describe the coordination task…"
              value={delegateTask}
              onChange={(e) => setDelegateTask(e.target.value)}
              rows={2}
              className="mb-3"
              data-testid="input-calendar-delegate-task"
            />
            <Button
              className="bg-primary hover:bg-primary/90"
              disabled={delegate.isPending || !delegateTask.trim()}
              onClick={() => {
                delegate.mutate({ type: "coordination", task: delegateTask.trim() }, {
                  onSuccess: () => setDelegateTask(""),
                });
              }}
              data-testid="button-delegate-task"
            >
              <Bot className="w-4 h-4 mr-2" /> {delegate.isPending ? "Sending…" : "Delegate Task to AI"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts Dialog */}
      <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Scheduling Conflicts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {conflicts.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No conflicts found</p>
                <p className="text-sm text-[#7A7A72] mt-1">No executive has two events booked at the exact same time.</p>
              </div>
            )}
            {conflicts.map((group, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-red-200 bg-red-50" data-testid={`conflict-${idx}`}>
                <p className="text-sm font-medium text-red-800 mb-1">
                  {group[0].executiveName || "Unknown executive"} — {new Date(group[0].date!).toLocaleString()}
                </p>
                <ul className="text-sm text-red-700 list-disc list-inside">
                  {group.map((e) => (
                    <li key={e.id}>{e.title}{e.venue ? ` @ ${e.venue}` : ""}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </EALayout>
  );
}
