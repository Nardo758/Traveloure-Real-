import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface Home {
  available: boolean;
  message?: string;
  cityName?: string;
  bankSignedOff?: boolean;
  identityVerified?: boolean;
  canStart?: boolean;
  inProgress?: string | null;
  retake?: { state: string; eligibleAt?: string };
  result?: {
    outcome: string | null;
    overallPercent: number | null;
    partAPercent: number | null;
    partBPercent: number | null;
    attention: boolean;
    attentionReasons: string[];
    topics: { topic: string; label: string; percent: number; flagged: boolean }[];
  } | null;
}

interface AttemptView {
  phase: "part_a" | "part_b";
  index?: number;
  total?: number;
  secondsLeft?: number;
  item?: {
    id: string;
    type: "mc" | "sa";
    select: "one" | "all";
    prompt: string;
    options: { id: string; text: string }[];
  };
  briefs?: { id: "b1" | "b2"; title: string; prompt: string }[];
  message?: string;
}

interface StopDraft {
  date: string;
  stopName: string;
  plannedArrival: string;
  plannedDeparture: string;
  mode: string;
  notes: string;
  reservationTime: string;
}

interface BriefDraft {
  locationNotes: string;
  avoid: string;
  backup: string;
  stops: StopDraft[];
}

const emptyStop = (): StopDraft => ({
  date: "",
  stopName: "",
  plannedArrival: "",
  plannedDeparture: "",
  mode: "",
  notes: "",
  reservationTime: "",
});

function minutesLeft(seconds: number | undefined): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function outcomeLabel(outcome: string | null | undefined): string {
  if (outcome === "pass") return "You passed.";
  if (outcome === "fail") return "You did not pass.";
  if (outcome === "recorded") return "Your result is recorded. It is not a pass and it is not a fail.";
  if (outcome === "held") return "This sitting could not be fully scored. It is not a pass and it is not a fail.";
  return "No result yet.";
}

export default function CityKnowledgeTestPage() {
  const queryClient = useQueryClient();
  const home = useQuery<Home>({ queryKey: ["/api/expert/city-knowledge"] });
  const sitting = useQuery<AttemptView>({
    queryKey: ["/api/expert/city-knowledge/attempt"],
    enabled: !!home.data?.inProgress,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [shortAnswer, setShortAnswer] = useState("");
  const [drafts, setDrafts] = useState<Record<string, BriefDraft>>({});

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/expert/city-knowledge"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/expert/city-knowledge/attempt"] });
  };

  const start = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/expert/city-knowledge/start"),
    onSuccess: async () => {
      setSelected([]);
      setShortAnswer("");
      await refresh();
    },
  });

  const answer = useMutation({
    mutationFn: async (body: { itemId: string; selectedOptionIds?: string[]; shortAnswer?: string }) => {
      const res = await apiRequest("POST", "/api/expert/city-knowledge/answer", body);
      return res.json() as Promise<{ phase: string }>;
    },
    onSuccess: async () => {
      setSelected([]);
      setShortAnswer("");
      await refresh();
    },
  });

  const submitPlans = useMutation({
    mutationFn: async () => {
      const briefs = (sitting.data?.briefs ?? []).map((brief) => {
        const draft = drafts[brief.id] ?? { locationNotes: "", avoid: "", backup: "", stops: [] };
        return {
          id: brief.id,
          locationNotes: draft.locationNotes || undefined,
          avoid: draft.avoid || undefined,
          backup: draft.backup || undefined,
          stops: draft.stops
            .filter((stop) => stop.stopName && stop.date && stop.plannedArrival)
            .map((stop) => ({
              date: stop.date,
              stopName: stop.stopName,
              plannedArrival: stop.plannedArrival,
              ...(stop.plannedDeparture ? { plannedDeparture: stop.plannedDeparture } : {}),
              ...(stop.mode ? { mode: stop.mode } : {}),
              ...(stop.notes ? { notes: stop.notes } : {}),
              ...(stop.reservationTime ? { reservationTime: stop.reservationTime } : {}),
            })),
        };
      });
      const res = await apiRequest("POST", "/api/expert/city-knowledge/part-b", { briefs });
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
    },
  });

  const data = home.data;
  const item = sitting.data?.phase === "part_a" ? sitting.data.item : undefined;

  function toggle(id: string, select: "one" | "all") {
    setSelected((current) => {
      if (select === "one") return [id];
      return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    });
  }

  function updateBrief(id: string, patch: Partial<BriefDraft>) {
    setDrafts((current) => {
      const prev = current[id] ?? { locationNotes: "", avoid: "", backup: "", stops: [emptyStop()] };
      return { ...current, [id]: { ...prev, ...patch } };
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4" data-testid="city-knowledge-test">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">City-knowledge test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.cityName ? data.cityName : "Your city"} · Part A is 20 questions, 30 minutes, one at a time. You cannot go back. Part B is two plans, 90 minutes.
          </p>
        </div>

        {home.isLoading && <p className="text-sm text-muted-foreground">Loading the test…</p>}

        {data && !data.available && (
          <Card>
            <CardContent className="p-4 text-sm">{data.message}</CardContent>
          </Card>
        )}

        {data?.available && !data.identityVerified && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm">Identity verification has to be finished before this test.</p>
              <Link href="/expert-status">
                <Button className="w-full sm:w-auto" data-testid="city-knowledge-identity">Go to your application</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {data?.available && data.identityVerified && !data.bankSignedOff && !data.inProgress && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            The question bank is still being checked. A result is saved. It cannot approve your application until the bank is signed off.
          </p>
        )}

        {data?.result && !data.inProgress && (
          <Card data-testid="city-knowledge-result">
            <CardHeader>
              <CardTitle className="text-lg">{outcomeLabel(data.result.outcome)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Overall {data.result.overallPercent == null ? "not scored" : `${Math.floor(data.result.overallPercent)}%`}
                {" · "}Part A {data.result.partAPercent == null ? "not scored" : `${Math.floor(data.result.partAPercent)}%`}
                {" · "}Part B {data.result.partBPercent == null ? "not scored" : `${Math.floor(data.result.partBPercent)}%`}
              </p>
              <p>You need 80% overall, and at least 70% on Part A and on Part B. A fail is not overridden.</p>
              {data.result.topics.map((topic) => (
                <p key={topic.topic}>
                  {topic.label}: {Math.floor(topic.percent)}%{topic.flagged ? " · This topic is below 60%." : ""}
                </p>
              ))}
              {data.result.attentionReasons.map((reason) => (
                <p key={reason} className="text-amber-700 dark:text-amber-400">{reason}</p>
              ))}
            </CardContent>
          </Card>
        )}

        {data?.canStart && !data.inProgress && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm">You can be granted up to two retakes, after 14 days and then 60 days.</p>
              {start.isError && <p className="text-sm text-red-600">The test could not be started.</p>}
              <Button className="w-full sm:w-auto" onClick={() => start.mutate()} disabled={start.isPending} data-testid="city-knowledge-start">
                Start the test
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.inProgress && sitting.data?.phase === "part_a" && item && (
          <Card data-testid="city-knowledge-question">
            <CardHeader>
              <CardTitle className="text-lg">Question {sitting.data.index} of {sitting.data.total}</CardTitle>
              <p className="text-sm text-muted-foreground">Time left {minutesLeft(sitting.data.secondsLeft)}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-base">{item.prompt}</p>
              {item.type === "mc" && item.options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                  <input
                    type={item.select === "all" ? "checkbox" : "radio"}
                    name="city-knowledge-option"
                    className="mt-1"
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(option.id, item.select)}
                    data-testid="city-knowledge-option"
                  />
                  <span>{option.text}</span>
                </label>
              ))}
              {item.type === "sa" && (
                <textarea
                  className="w-full min-h-24 rounded-md border border-border bg-background p-3 text-sm"
                  value={shortAnswer}
                  onChange={(event) => setShortAnswer(event.target.value)}
                  data-testid="city-knowledge-short-answer"
                />
              )}
              {answer.isError && <p className="text-sm text-red-600">That answer was not accepted.</p>}
              <Button
                className="w-full sm:w-auto"
                disabled={answer.isPending || (item.type === "mc" ? selected.length === 0 : shortAnswer.trim().length === 0)}
                data-testid="city-knowledge-submit"
                onClick={() => answer.mutate({
                  itemId: item.id,
                  ...(item.type === "mc" ? { selectedOptionIds: selected } : { shortAnswer }),
                })}
              >
                Submit answer
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.inProgress && sitting.data?.phase === "part_b" && (
          <div className="space-y-4" data-testid="city-knowledge-part-b">
            <p className="text-sm text-muted-foreground">Time left {minutesLeft(sitting.data.secondsLeft)}</p>
            {(sitting.data.briefs ?? []).map((brief) => {
              const draft = drafts[brief.id] ?? { locationNotes: "", avoid: "", backup: "", stops: [emptyStop()] };
              return (
                <Card key={brief.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{brief.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{brief.prompt}</p>
                    {draft.stops.map((stop, index) => (
                      <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="Date YYYY-MM-DD" value={stop.date} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, date: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="Stop" value={stop.stopName} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, stopName: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="Arrival HH:MM" value={stop.plannedArrival} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, plannedArrival: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="Departure HH:MM" value={stop.plannedDeparture} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, plannedDeparture: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="How you get there" value={stop.mode} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, mode: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                        <input className="rounded-md border border-border bg-background p-2 text-sm" placeholder="Reservation time HH:MM" value={stop.reservationTime} onChange={(event) => {
                          const stops = draft.stops.slice();
                          stops[index] = { ...stop, reservationTime: event.target.value };
                          updateBrief(brief.id, { stops });
                        }} />
                      </div>
                    ))}
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => updateBrief(brief.id, { stops: [...draft.stops, emptyStop()] })}>
                      Add a stop
                    </Button>
                    <textarea className="w-full min-h-16 rounded-md border border-border bg-background p-2 text-sm" placeholder="Where you would send them, and why" value={draft.locationNotes} onChange={(event) => updateBrief(brief.id, { locationNotes: event.target.value })} />
                    <textarea className="w-full min-h-16 rounded-md border border-border bg-background p-2 text-sm" placeholder="What you would tell them to avoid" value={draft.avoid} onChange={(event) => updateBrief(brief.id, { avoid: event.target.value })} />
                    <textarea className="w-full min-h-16 rounded-md border border-border bg-background p-2 text-sm" placeholder="Rain or closure backup" value={draft.backup} onChange={(event) => updateBrief(brief.id, { backup: event.target.value })} />
                  </CardContent>
                </Card>
              );
            })}
            {submitPlans.isError && <p className="text-sm text-red-600">The plans could not be submitted.</p>}
            <Button className="w-full sm:w-auto" disabled={submitPlans.isPending} data-testid="city-knowledge-submit-plans" onClick={() => submitPlans.mutate()}>
              Submit plans
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
