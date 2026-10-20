/**
 * /admin/bot-proposals — BOT-1 Phase 1's review queue (ledger `2026-10-15-bot1-phase1`). A bot's proposed hours or
 * last-admission fact for a stop, beside the fact stored now (read live). Approve writes the fact through the one
 * writer with you as its verifier; reject needs a reason and writes nothing to the facts table. Any admin may
 * approve (decision C). An approved fact shows only "<source name> · checked <approval date>" — never an author.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BOT_PROPOSAL_STATUSES, type BotProposalStatus } from "@shared/bot-proposals";

interface ReviewRow {
  id: string;
  kind: string;
  placeRef: string;
  market: string | null;
  value: Record<string, unknown>;
  sourceUrl: string;
  quote: string;
  checkedAt: string;
  status: string;
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  botName: string | null;
  sourceName: string | null;
  currentFact: { value: Record<string, unknown>; origin: string; fetchedAt: string; expiresAt: string | null } | null;
}

/** Words for the server's named refusals. An unknown one says so rather than guessing. */
const REFUSALS: Record<string, string> = {
  not_pending: "Someone has already reviewed this proposal.",
  source_not_eligible: "The source is no longer active, official and terms-checked.",
  url_not_https: "The page is not an https address.",
  url_off_source_host: "The page is not on the source's own site.",
  expiry_unset: "No expiry is set: the source has no refresh interval and bot_fact_default_expiry_days is missing.",
  fact_refused: "The facts writer refused this fact (missing source, quote or official license).",
  bad_kind: "This proposal's kind is not one Phase 1 can apply.",
  expiry_required: "Enter the expiry date the source states. A safety fact has no default.",
  expiry_invalid: "The expiry date could not be read.",
  expiry_past: "The expiry date has already passed.",
  expiry_after_limit: "The expiry date is later than the source's expiry setting allows.",
  already_reviewed: "Someone has already reviewed this fact.",
  not_found: "This fact is no longer waiting for review.",
};

/** An `<input type="date">` value as the end of that day, UTC. Empty ⇒ undefined (the server's default applies). */
const expiryBody = (d: string) => (d ? { expiresAt: new Date(`${d}T23:59:59Z`).toISOString() } : {});

function ExpiryField({ id, safety, latest, value, onChange }: { id: string; safety: boolean; latest?: string | null; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`expiry-${id}`}>{safety ? "Expiry date from the source (required)" : "Expiry date (optional — shorten only)"}</Label>
      <Input id={`expiry-${id}`} type="date" value={value} onChange={(e) => onChange(e.target.value)} max={latest ? latest.slice(0, 10) : undefined} data-testid={`expiry-${id}`} />
      <p className="text-xs text-muted-foreground">
        {latest === undefined
          ? "No later than the source's expiry setting allows."
          : latest
            ? `No later than ${day(latest)}, the source's expiry setting.`
            : "The source has no expiry setting and none is set for the platform."}
        {safety ? "" : " Left empty, the fact expires on the latest allowed date."}
      </p>
    </div>
  );
}

/** apiRequest throws "<status>: <body>"; the server's refusal code is in the JSON body. */
function refusalText(e: unknown): string {
  const msg = String((e as any)?.message ?? "");
  try {
    const code = JSON.parse(msg.slice(msg.indexOf(":") + 1).trim())?.code;
    if (typeof code === "string") return REFUSALS[code] ?? `Refused: ${code}`;
  } catch {
    // not JSON — fall through
  }
  return msg || "Something went wrong.";
}

const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

function valueLines(v: Record<string, unknown> | null | undefined): string {
  if (!v) return "—";
  const lines = (v as any).weekdayDescriptions;
  if (Array.isArray(lines)) return lines.join("\n") + ((v as any).season ? `\n(season ${(v as any).season.from}–${(v as any).season.to})` : "");
  const by = (v as any).byWeekday;
  if (by && typeof by === "object") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return Object.entries(by).map(([d, t]) => `${names[Number(d)] ?? d}: ${t ?? "—"}`).join("\n") + ((v as any).season ? `\n(season ${(v as any).season.from}–${(v as any).season.to})` : "");
  }
  return typeof (v as any).text === "string" ? (v as any).text : "—";
}

function ProposalCard({ row, onDone }: { row: ReviewRow; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const approve = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/bot-proposals/${row.id}/approve`, expiryBody(expiry))).json(),
    onSuccess: () => {
      toast({ title: "Approved", description: "The fact is stored, with you as its verifier." });
      onDone();
    },
    onError: (e: unknown) => toast({ title: "Not approved", description: refusalText(e), variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/bot-proposals/${row.id}/reject`, { reason: reason.trim() })).json(),
    onSuccess: () => {
      toast({ title: "Rejected" });
      onDone();
    },
    onError: (e: unknown) => toast({ title: "Not rejected", description: refusalText(e), variant: "destructive" }),
  });
  return (
    <Card data-testid={`bot-proposal-${row.id}`}>
      <CardHeader>
        <CardTitle className="text-base">
          {row.kind === "place_fact.hours" ? "Opening hours" : "Last admission"} · <span className="font-mono text-sm">{row.placeRef}</span>
        </CardTitle>
        <CardDescription>
          From {row.botName ?? "an unknown bot"} · {row.market ?? "no market"} · read {day(row.checkedAt)} · filed {day(row.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Proposed</p>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{valueLines(row.value)}</pre>
          </div>
          <div>
            <p className="text-sm font-medium">Stored now</p>
            {row.currentFact ? (
              <>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{valueLines(row.currentFact.value)}</pre>
                <p className="text-xs text-muted-foreground">
                  {row.currentFact.origin} · checked {day(row.currentFact.fetchedAt)}
                  {row.currentFact.expiresAt ? ` · expires ${day(row.currentFact.expiresAt)}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No registry fact is stored for this stop.</p>
            )}
          </div>
        </div>
        <div className="text-sm">
          <p>
            <span className="font-medium">Source:</span> {row.sourceName ?? "—"} ·{" "}
            <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              {row.sourceUrl}
            </a>
          </p>
          <p className="mt-1">
            <span className="font-medium">Quote:</span> “{row.quote}”
          </p>
        </div>
        {row.status === "pending" ? (
          <div className="space-y-2">
            <ExpiryField id={row.id} safety={row.kind === "place_fact.last_admission"} value={expiry} onChange={setExpiry} />
            <Textarea placeholder="Reason, if you reject" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`bot-proposal-reason-${row.id}`} />
            <div className="flex gap-2">
              <Button
                onClick={() => approve.mutate()}
                disabled={approve.isPending || reject.isPending || (row.kind === "place_fact.last_admission" && !expiry)}
                data-testid={`bot-proposal-approve-${row.id}`}
              >
                Approve
              </Button>
              <Button variant="outline" onClick={() => reject.mutate()} disabled={!reason.trim() || approve.isPending || reject.isPending} data-testid={`bot-proposal-reject-${row.id}`}>
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {row.status} {row.reviewedAt ? `on ${day(row.reviewedAt)}` : ""}
            {row.rejectReason ? ` — ${row.rejectReason}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface RefreshFactRow {
  id: string;
  factType: string;
  safety: boolean;
  placeRef: string;
  market: string | null;
  value: Record<string, unknown>;
  sourceName: string | null;
  sourceUrl: string | null;
  checkedAt: string;
  latestExpiry: string | null;
}

/**
 * CS-1 item 3: an official refresh fact no person has reviewed. It is not shown anywhere until approved here; approval
 * writes a reviewed row with your expiry and replaces this one. A safety fact needs the expiry date the source states.
 */
function RefreshFactCard({ row, onDone }: { row: RefreshFactRow; onDone: () => void }) {
  const { toast } = useToast();
  const [expiry, setExpiry] = useState("");
  const approve = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/bot-proposals/refresh-facts/${row.id}/approve`, expiryBody(expiry))).json(),
    onSuccess: () => {
      toast({ title: "Approved", description: "The fact now shows, with its source and check date." });
      onDone();
    },
    onError: (e: unknown) => toast({ title: "Not approved", description: refusalText(e), variant: "destructive" }),
  });
  return (
    <Card data-testid={`refresh-fact-${row.id}`}>
      <CardHeader>
        <CardTitle className="text-base">
          {row.factType.replace(/_/g, " ")} · <span className="font-mono text-sm">{row.placeRef}</span>
        </CardTitle>
        <CardDescription>
          {row.sourceName ?? "Unknown source"} · checked {day(row.checkedAt)}
          {row.safety ? " · safety fact" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="whitespace-pre-wrap text-sm">{valueLines(row.value)}</pre>
        {row.sourceUrl ? (
          <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sm underline">
            {row.sourceUrl}
          </a>
        ) : null}
        <ExpiryField id={row.id} safety={row.safety} latest={row.latestExpiry} value={expiry} onChange={setExpiry} />
        <Button onClick={() => approve.mutate()} disabled={approve.isPending || (row.safety && !expiry)} data-testid={`refresh-fact-approve-${row.id}`}>
          Approve
        </Button>
      </CardContent>
    </Card>
  );
}

function RefreshFactsSection() {
  const qc = useQueryClient();
  const key = ["/api/admin/bot-proposals/refresh-facts"];
  const { data, isLoading, isError } = useQuery<RefreshFactRow[]>({ queryKey: key });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Official refresh facts awaiting review</CardTitle>
          <CardDescription>
            Dated facts the scheduled refresh read from an official page. None shows to travelers until a person approves it here.
          </CardDescription>
        </CardHeader>
      </Card>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {isError ? <p className="text-sm text-destructive">The refresh facts could not be read.</p> : null}
      {data && !data.length ? <p className="text-sm text-muted-foreground">No refresh facts are waiting.</p> : null}
      {data?.map((row) => (
        <RefreshFactCard key={row.id} row={row} onDone={() => qc.invalidateQueries({ queryKey: key })} />
      ))}
    </div>
  );
}

export default function AdminBotProposals() {
  const [status, setStatus] = useState<BotProposalStatus>("pending");
  const qc = useQueryClient();
  const key = [`/api/admin/bot-proposals?status=${status}`];
  const { data, isLoading, isError } = useQuery<ReviewRow[]>({ queryKey: key });
  return (
    <AdminLayout title="Bot proposals">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bot proposals</CardTitle>
            <CardDescription>
              Facts a bot read from an official page. Nothing changes until you approve. An approved fact shows its source and the approval date, never an author.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {BOT_PROPOSAL_STATUSES.map((s) => (
              <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)} data-testid={`bot-proposals-tab-${s}`}>
                {s}
              </Button>
            ))}
          </CardContent>
        </Card>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {isError ? <p className="text-sm text-destructive">The proposals could not be read.</p> : null}
        {data && !data.length ? <p className="text-sm text-muted-foreground">No {status} proposals.</p> : null}
        {data?.map((row) => (
          <ProposalCard key={row.id} row={row} onDone={() => qc.invalidateQueries({ queryKey: key })} />
        ))}
        {data?.length ? <Badge variant="outline">{data.length} shown</Badge> : null}
        <RefreshFactsSection />
      </div>
    </AdminLayout>
  );
}
