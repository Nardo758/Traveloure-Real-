// 291b (ledger `2026-10-29-waitlist-consent-screens`): the waitlist unsubscribe page at /unsubscribe?token=….
//
// Public, no sign-in. The GET (GET /api/waitlist/unsubscribe?token=, 291a) only CONFIRMS — it returns the list and the
// city and revokes nothing, because link scanners prefetch GETs. The revoke is ONE POST (POST /api/waitlist/unsubscribe,
// body exactly `{ token }`, the strict `waitlistUnsubscribeBodySchema`), sent only when the person presses the button;
// the button is disabled while it is in flight, so a double press is one POST. The token is opaque: it is never
// logged and never shown. Every word comes from WAITLIST_CONSENT_COPY.
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WAITLIST_CONSENT_COPY as COPY, fillWaitlistCopy } from "@/lib/waitlist-consent-copy";

export type UnsubscribeState =
  | { kind: "loading" }
  | { kind: "confirm"; city: string | null; posting: boolean }
  | { kind: "done" }
  | { kind: "invalid" }
  | { kind: "error"; step: "load" | "revoke" };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const UNSUBSCRIBE_ROUTE = "/api/waitlist/unsubscribe";

/** The token from the query string, or null when absent or blank. */
export function unsubscribeTokenFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get("token");
  return token && token.trim() !== "" ? token : null;
}

/** The confirm read. A GET only: it never revokes. 400 ⇒ invalid; any other failure ⇒ error. */
export async function loadUnsubscribe(token: string | null, fetcher: Fetcher): Promise<UnsubscribeState> {
  if (!token) return { kind: "invalid" };
  try {
    const res = await fetcher(`${UNSUBSCRIBE_ROUTE}?token=${encodeURIComponent(token)}`, {
      method: "GET",
      credentials: "include",
    });
    if (res.status === 400) return { kind: "invalid" };
    if (!res.ok) return { kind: "error", step: "load" };
    const data = (await res.json().catch(() => null)) as { ok?: unknown; city?: unknown } | null;
    if (data?.ok !== true) return { kind: "error", step: "load" };
    return { kind: "confirm", city: typeof data.city === "string" && data.city.trim() !== "" ? data.city : null, posting: false };
  } catch {
    return { kind: "error", step: "load" };
  }
}

/** The revoke: one POST whose body is exactly `{ token }`. 200 ⇒ done; 400 ⇒ invalid; any other failure ⇒ error. */
export async function revokeUnsubscribe(token: string, fetcher: Fetcher): Promise<UnsubscribeState> {
  try {
    const res = await fetcher(UNSUBSCRIBE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    if (res.status === 400) return { kind: "invalid" };
    if (!res.ok) return { kind: "error", step: "revoke" };
    const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return data?.ok === true ? { kind: "done" } : { kind: "error", step: "revoke" };
  } catch {
    return { kind: "error", step: "revoke" };
  }
}

/** One call at a time: a second call while the first is in flight is dropped (a double press is one POST). */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T | undefined> {
  let busy = false;
  return async () => {
    if (busy) return undefined;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  };
}

/** The page's words for a state. Pure; never includes the token. */
export function UnsubscribeView({
  state,
  onUnsubscribe,
  onRetry,
}: {
  state: UnsubscribeState;
  onUnsubscribe: () => void;
  onRetry: () => void;
}) {
  let body: JSX.Element;
  if (state.kind === "loading") {
    body = <p className="text-sm text-muted-foreground" role="status" aria-busy="true" data-testid="text-unsubscribe-loading">…</p>;
  } else if (state.kind === "confirm") {
    body = (
      <>
        <CardHeader className="px-0 pt-0">
          <CardTitle className="break-words text-xl" data-testid="text-unsubscribe-heading">{COPY.unsubConfirmHeading}</CardTitle>
        </CardHeader>
        <p className="break-words text-sm" data-testid="text-unsubscribe-body">
          {state.city ? fillWaitlistCopy(COPY.unsubConfirmBodyCity, { city: state.city }) : COPY.unsubConfirmBody}
        </p>
        <Button
          className="mt-4 w-full sm:w-auto"
          disabled={state.posting}
          onClick={onUnsubscribe}
          data-testid="button-unsubscribe"
        >
          {COPY.unsubButton}
        </Button>
      </>
    );
  } else if (state.kind === "done") {
    body = (
      <div role="status" data-testid="text-unsubscribe-done">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="break-words text-xl">{COPY.unsubDoneHeading}</CardTitle>
        </CardHeader>
        <p className="break-words text-sm">{COPY.unsubDoneBody}</p>
      </div>
    );
  } else if (state.kind === "invalid") {
    body = <p className="break-words text-sm" role="alert" data-testid="text-unsubscribe-invalid">{COPY.unsubInvalid}</p>;
  } else {
    body = (
      <>
        <p className="break-words text-sm text-destructive" role="alert" data-testid="text-unsubscribe-error">{COPY.unsubError}</p>
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={onRetry} aria-label={state.step === "revoke" ? undefined : COPY.unsubError} data-testid="button-unsubscribe-retry">
          {state.step === "revoke" ? COPY.unsubButton : <span aria-hidden="true">↻</span>}
        </Button>
      </>
    );
  }
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10" data-testid="page-waitlist-unsubscribe">
      <Card className="w-full min-w-0">
        <CardContent className="p-6">{body}</CardContent>
      </Card>
    </div>
  );
}

export default function WaitlistUnsubscribePage() {
  const search = useSearch();
  const token = unsubscribeTokenFromSearch(search);
  const [state, setState] = useState<UnsubscribeState>(token ? { kind: "loading" } : { kind: "invalid" });
  const fetcher: Fetcher = (url, init) => fetch(url, init);

  const load = () => {
    setState(token ? { kind: "loading" } : { kind: "invalid" });
    void loadUnsubscribe(token, fetcher).then(setState);
  };
  // The GET on mount only confirms; it never leads to a POST.
  useEffect(load, [token]);

  // One single-flight guard per token: a double press is one POST.
  const revoke = useMemo(
    () =>
      singleFlight(async () => {
        if (!token) return;
        setState((s) => (s.kind === "confirm" ? { ...s, posting: true } : s));
        setState(await revokeUnsubscribe(token, fetcher));
      }),
    [token],
  );

  return (
    <UnsubscribeView
      state={state}
      onUnsubscribe={() => void revoke()}
      onRetry={() => (state.kind === "error" && state.step === "revoke" ? void revoke() : load())}
    />
  );
}
