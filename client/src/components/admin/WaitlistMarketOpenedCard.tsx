// 291b (ledger `2026-10-29-waitlist-consent-screens`): the admin "market opened" card on /admin/waitlist.
//
// Choose a city and a role (both required, no default), confirm, and the card calls
// POST /api/admin/waitlist/market-opened (291a) with exactly `{ market, role }`. The route only ENQUEUES the
// waitlist_open email (sending stays with EMAIL_SENDS_ENABLED and the template allowlist), so every word here says
// "queued". The result shows both numbers the server returns, `enqueued` and `skipped`, even when 0; a repeat run
// shows its repeats as skipped (ruling 4 — no separate warning). One POST per confirm.
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WAITLIST_MARKET_OPTIONS, WAITLIST_MARKET_OPENED_ROLES, waitlistCityName, type WaitlistMarketOpenedRole as WaitlistRole } from "@shared/launch-waitlist";
import { WAITLIST_CONSENT_COPY as COPY, fillWaitlistCopy } from "@/lib/waitlist-consent-copy";

export const MARKET_OPENED_ROUTE = "/api/admin/waitlist/market-opened";

export type MarketOpenedResult =
  | { kind: "ok"; enqueued: number; skipped: number }
  | { kind: "error"; message: string | null };

type Poster = (method: string, url: string, body: unknown) => Promise<Response>;

/** The body is exactly `{ market, role }`. */
export function marketOpenedBody(market: string, role: WaitlistRole): { market: string; role: WaitlistRole } {
  return { market, role };
}

/** The confirm question, naming the city and the role. */
export function marketOpenedConfirmLine(market: string, role: WaitlistRole): string {
  return fillWaitlistCopy(COPY.adminConfirm, { role, city: waitlistCityName(market) ?? market });
}

/** The result line: both numbers, always. */
export function marketOpenedResultLine(enqueued: number, skipped: number): string {
  return fillWaitlistCopy(COPY.adminResult, { enqueued, skipped });
}

/** The server's error string, when it sent one, from apiRequest's "<status>: <body>" error. */
function serverError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : "";
  const body = msg.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.error === "string" && parsed.error.trim() !== "" ? parsed.error : null;
  } catch {
    return null;
  }
}

/** One POST. A non-2xx answer (apiRequest throws) is the error result. */
export async function postMarketOpened(market: string, role: WaitlistRole, post: Poster = apiRequest): Promise<MarketOpenedResult> {
  try {
    const res = await post("POST", MARKET_OPENED_ROUTE, marketOpenedBody(market, role));
    const data = (await res.json().catch(() => null)) as { ok?: unknown; enqueued?: unknown; skipped?: unknown } | null;
    if (data?.ok === true && typeof data.enqueued === "number" && typeof data.skipped === "number") {
      return { kind: "ok", enqueued: data.enqueued, skipped: data.skipped };
    }
    return { kind: "error", message: null };
  } catch (err) {
    return { kind: "error", message: serverError(err) };
  }
}

/**
 * A confirm runner that allows one POST at a time: a second confirm while the first is in flight returns null and
 * posts nothing (a double click is one POST).
 */
export function marketOpenedRunner(post: Poster = apiRequest) {
  let busy = false;
  return async (market: string, role: WaitlistRole): Promise<MarketOpenedResult | null> => {
    if (busy) return null;
    busy = true;
    try {
      return await postMarketOpened(market, role, post);
    } finally {
      busy = false;
    }
  };
}

export function WaitlistMarketOpenedCard({ post = apiRequest }: { post?: Poster }) {
  const [market, setMarket] = useState("");
  const [role, setRole] = useState<WaitlistRole | "">("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MarketOpenedResult | null>(null);
  const run = useMemo(() => marketOpenedRunner(post), [post]);
  const ready = market !== "" && role !== "";

  async function confirm() {
    if (market === "" || role === "") return;
    const pending = run(market, role);
    setBusy(true);
    setResult(null);
    const r = await pending;
    // null: another confirm is already in flight; it owns the busy state and the result.
    if (r === null) return;
    setResult(r);
    setBusy(false);
    setConfirming(false);
  }

  return (
    <Card className="min-w-0" data-testid="card-waitlist-market-opened">
      <CardHeader><CardTitle className="break-words">{COPY.adminCardTitle}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <select
            aria-label="City"
            className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            value={market}
            onChange={(e) => { setMarket(e.target.value); setResult(null); }}
            data-testid="select-market-opened-market"
          >
            <option value="">—</option>
            {WAITLIST_MARKET_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>{m.city}</option>
            ))}
          </select>
          <select
            aria-label="Role"
            className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            value={role}
            onChange={(e) => { setRole(e.target.value as WaitlistRole | ""); setResult(null); }}
            data-testid="select-market-opened-role"
          >
            <option value="">—</option>
            {WAITLIST_MARKET_OPENED_ROLES.map((r) => (
              <option key={r} value={r}>{r === "provider" ? COPY.adminRoleProvider : COPY.adminRoleTraveler}</option>
            ))}
          </select>
        </div>
        <Button
          className="h-auto max-w-full whitespace-normal text-left"
          disabled={!ready || busy}
          onClick={() => setConfirming(true)}
          data-testid="button-market-opened"
        >
          {COPY.adminButton}
        </Button>
        {result?.kind === "ok" && (
          <p className="text-sm" role="status" data-testid="text-market-opened-result">
            {marketOpenedResultLine(result.enqueued, result.skipped)}
          </p>
        )}
        {result?.kind === "error" && (
          <p className="break-words text-sm text-destructive" role="alert" data-testid="text-market-opened-error">
            {COPY.adminError}{result.message ? ` ${result.message}` : ""}
          </p>
        )}
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={(o) => { if (!busy) setConfirming(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{COPY.adminCardTitle}</AlertDialogTitle>
            <AlertDialogDescription className="break-words" data-testid="text-market-opened-confirm">
              {market !== "" && role !== "" ? marketOpenedConfirmLine(market, role) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void confirm(); }}
              data-testid="button-market-opened-confirm"
            >
              {COPY.adminButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
