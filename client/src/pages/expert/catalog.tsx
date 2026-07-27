/**
 * Catalog — Backoffice Phase B3 (ratified v9 spec, module 4).
 *
 * "Catalog — what I sell: services + builds + their distribution states, per-service
 * availability (closes the 'no slot UI for experts' hole). Absorbs: My Offerings, Store
 * Listings management."
 *
 * This page is the front door: the existing cross-lane MyOfferingsTable (services + itinerary
 * templates + Ready Made Trips, unmodified — it already aggregates the three owner-console
 * endpoints), a new Availability section wired to the Part 1 slot-CRUD endpoints
 * (server/routes/expert-console.routes.ts), and a quick-link card into the Store Listings
 * management page (which stays the dedicated Ready Made Trips console per the absorption note
 * — Catalog surfaces it, it doesn't replace it).
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { MyOfferingsTable } from "@/components/backoffice/my-offerings-table";
import { PageHeader, EmptyState, StatusBadge } from "@/components/backoffice/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid, CalendarClock, Store, Trash2, Plus, ArrowRight } from "lucide-react";

interface MyService {
  id: string;
  serviceName?: string;
  title?: string;
  approvalStatus?: string;
  status?: string;
}

interface AvailabilitySlot {
  id: string;
  date: string;
  startTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null;
}

/** apiRequest throws `Error("<status>: <body>")` — pull the server's honest message out of it
 *  (falling back to the raw text) so a 409 booked-slot refusal reads as prose, not a status code. */
function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = match ? match[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) return parsed.message as string;
    } catch {
      // not JSON — use the raw body text
    }
    return body || fallback;
  }
  return fallback;
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// ─── Availability section ────────────────────────────────────────────────────

function AvailabilitySection() {
  const { toast } = useToast();
  const { data: services, isLoading: servicesLoading } = useQuery<MyService[]>({
    queryKey: ["/api/expert/services"],
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [capacity, setCapacity] = useState("");

  const list = Array.isArray(services) ? services : [];
  const activeServiceId = selectedServiceId || list[0]?.id || "";

  const { data: slots, isLoading: slotsLoading } = useQuery<AvailabilitySlot[]>({
    queryKey: [`/api/me/services/${activeServiceId}/slots`],
    enabled: !!activeServiceId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { date };
      if (startTime.trim()) body.startTime = startTime.trim();
      if (capacity.trim()) body.capacity = Number(capacity);
      const res = await apiRequest("POST", `/api/me/services/${activeServiceId}/slots`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot added", description: "Travelers can now book this date." });
      setDate("");
      setStartTime("");
      setCapacity("");
    },
    onError: (err) => {
      toast({
        title: "Could not add slot",
        description: parseApiErrorMessage(err, "Please check the date and try again."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await apiRequest("DELETE", `/api/me/slots/${slotId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot removed" });
    },
    onError: (err) => {
      // 409 booked-slot refusal surfaces here, honestly, as the server wrote it.
      toast({
        title: "Could not remove slot",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return (
    <section data-testid="section-catalog-availability">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Availability
      </h2>
      <Card className="border border-console-light">
        <CardContent className="p-4 space-y-4">
          {servicesLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No services yet"
              body="Create a service first, then publish dates travelers can book."
              testId="empty-catalog-no-services"
            />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="catalog-service-picker" className="text-sm text-console-mid whitespace-nowrap">
                  Service
                </Label>
                <Select value={activeServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger id="catalog-service-picker" className="w-64" data-testid="select-catalog-service">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.serviceName ?? s.title ?? "Untitled service"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const current = list.find((s) => s.id === activeServiceId);
                  return current?.approvalStatus ? <StatusBadge status={current.approvalStatus} /> : null;
                })()}
              </div>

              {slotsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !slots || slots.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No availability published yet"
                  body="Travelers can't pick a time until you add slots."
                  testId="empty-catalog-no-slots"
                />
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-console-light p-3"
                      data-testid={`catalog-slot-${slot.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-console-darkest">
                          {formatSlotDate(slot.date)}
                          {slot.startTime && <span className="text-console-mid"> · {slot.startTime}</span>}
                        </p>
                        <p className="text-xs text-console-mid">
                          {(slot.bookedCount ?? 0)} / {slot.capacity ?? 1} booked
                          {slot.status ? ` · ${slot.status}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 flex-shrink-0"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(slot.id)}
                        data-testid={`button-delete-slot-${slot.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <form
                className="flex items-end gap-2 flex-wrap pt-2 border-t border-console-light"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!date || !activeServiceId) return;
                  createMutation.mutate();
                }}
              >
                <div>
                  <Label htmlFor="catalog-slot-date" className="text-xs text-console-mid">Date</Label>
                  <Input
                    id="catalog-slot-date"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    data-testid="input-slot-date"
                  />
                </div>
                <div>
                  <Label htmlFor="catalog-slot-time" className="text-xs text-console-mid">Start time (optional)</Label>
                  <Input
                    id="catalog-slot-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-slot-start-time"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="catalog-slot-capacity" className="text-xs text-console-mid">Capacity</Label>
                  <Input
                    id="catalog-slot-capacity"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    data-testid="input-slot-capacity"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5"
                  disabled={createMutation.isPending || !date || !activeServiceId}
                  data-testid="button-add-slot"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add slot
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Store Listings quick block ──────────────────────────────────────────────

function StoreListingsQuickBlock() {
  return (
    <section data-testid="section-catalog-store-listings">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Store Listings
      </h2>
      <Link href="/expert/ready-made">
        <Card className="border border-console-light hover:border-primary/40 transition-colors cursor-pointer" data-testid="card-catalog-store-listings">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-console-bg flex items-center justify-center flex-shrink-0">
                <Store className="w-5 h-5 text-console-darkest" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-console-darkest">Store Listings</p>
                <p className="text-xs text-console-mid">Manage your Ready Made Trips</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-console-mid flex-shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ExpertCatalog() {
  return (
    <ExpertLayout title="Catalog">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="Catalog"
          subtitle="Everything you sell, in one place"
          icon={LayoutGrid}
          testId="text-catalog-title"
        />

        <section data-testid="section-catalog-offerings">
          <MyOfferingsTable />
        </section>

        <AvailabilitySection />
        <StoreListingsQuickBlock />
      </div>
    </ExpertLayout>
  );
}
