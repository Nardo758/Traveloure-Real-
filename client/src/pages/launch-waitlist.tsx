// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch market's waitlist page (`/kyoto`).
//
// ALL VISIBLE COPY HERE IS A PLACEHOLDER until Marketing's Part F copy reaches the Launch session (the hand-off
// file); every placeholder string is marked so it cannot ship unnoticed. The form posts to POST /api/waitlist:
// email, the OPT-IN consent tick (joining never requires it — Launch ruling 1), the source from this page's own
// URL, and a hidden honeypot. The answer is the same whether or not the address was already on the list.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SEOHead } from "@/components/seo-head";
import { WAITLIST_CONSENT_TEXT } from "@shared/launch-waitlist";
import { waitlistSourceFromSearch, type SignupModeView } from "@/lib/launch-waitlist-view";

export default function LaunchWaitlistPage() {
  const { source, sourceRef, blocked } = waitlistSourceFromSearch(window.location.search);
  const { data: signup } = useQuery<SignupModeView>({ queryKey: ["/api/public/signup-mode"], retry: false });
  const market = signup?.launchMarketSlug ? signup.launchMarketSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          consent,
          source,
          ...(sourceRef ? { sourceRef } : {}),
          ...(website ? { website } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16" data-testid="page-launch-waitlist">
      <SEOHead title={market ? `${market} waitlist` : "Waitlist"} description="[Placeholder — F1 copy pending]" />
      {blocked && (
        <p className="mb-6 rounded-lg border p-4 text-sm" data-testid="text-waitlist-blocked">
          [Placeholder — Marketing's blocked-sign-up line pending]
        </p>
      )}
      <h1 className="text-3xl font-bold" data-testid="heading-waitlist">
        {market ? `[Placeholder] Join the ${market} waitlist` : "[Placeholder] Join the waitlist"}
      </h1>
      <p className="mt-3 text-muted-foreground">[Placeholder — F1 page copy pending]</p>

      {status === "done" ? (
        <p className="mt-8 rounded-lg border p-4" data-testid="text-waitlist-done">
          [Placeholder] You're on the list.
        </p>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={submit} data-testid="form-waitlist">
          <div>
            <Label htmlFor="waitlist-email">Email</Label>
            <Input
              id="waitlist-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-waitlist-email"
            />
          </div>
          {/* Honeypot: hidden from people and from assistive technology; a bot that fills it is answered as a success. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="waitlist-website">Website</label>
            <input
              id="waitlist-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="waitlist-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              data-testid="checkbox-waitlist-consent"
            />
            <Label htmlFor="waitlist-consent" className="text-sm font-normal leading-snug">
              {WAITLIST_CONSENT_TEXT}
            </Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="text-waitlist-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={status === "sending"} data-testid="button-waitlist-join">
            {status === "sending" ? "Joining…" : "[Placeholder] Join the waitlist"}
          </Button>
        </form>
      )}
    </div>
  );
}
