/**
 * SetupChecklistCard — the "Open your business" activation checklist (Build 1).
 *
 * Rendered on BOTH earner dashboards (expert + provider). Every step's completion comes
 * from GET /api/me/business-setup, which derives state from real rows server-side (§13 —
 * nothing here is self-reported or stored client-side except the dismiss flag).
 *
 * Steps deep-link into the surfaces that already exist — this card is connective tissue,
 * not a new flow: Settings (handle), Earnings (Stripe payouts), My Offerings / ServiceForm
 * (first offering), Calendar (provider availability), Share & Promote (+ the live /p/ page).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, Circle, ChevronRight, Clock, X, Rocket } from "lucide-react";
import { useState } from "react";

interface StepState {
  done: boolean;
  count?: number;
  value?: string | null;
  status?: string | null;
  applicable?: boolean;
  requiredForStorefront?: boolean;
}

interface BusinessSetup {
  eligible: boolean;
  consoleFamily?: "expert" | "provider";
  steps?: {
    handle: StepState;
    payouts: StepState;
    firstOffering: StepState;
    approvedOffering: StepState;
    availability: StepState;
    verification: StepState;
  };
  storefrontPath?: string | null;
}

const DISMISS_KEY_PREFIX = "traveloure_setup_dismissed_";

export function SetupChecklistCard() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() =>
    user?.id ? localStorage.getItem(DISMISS_KEY_PREFIX + user.id) === "1" : false,
  );

  const { data } = useQuery<BusinessSetup>({
    queryKey: ["/api/me/business-setup"],
    enabled: !!user,
  });

  if (dismissed || !data?.eligible || !data.steps) return null;

  const { steps, consoleFamily = "expert", storefrontPath } = data;
  const base = consoleFamily === "provider" ? "/provider" : "/expert";

  const items: Array<{
    key: string;
    label: string;
    doneLabel: string;
    done: boolean;
    pending?: boolean;
    href: string;
  }> = [
    {
      key: "handle",
      label: "Claim your storefront handle",
      doneLabel: `Handle: @${steps.handle.value ?? ""}`,
      done: steps.handle.done,
      href: `${base}/settings`,
    },
    {
      key: "payouts",
      label: "Connect payouts",
      doneLabel: "Payouts connected",
      done: steps.payouts.done,
      href: `${base}/earnings`,
    },
    {
      key: "firstOffering",
      label: "Create your first offering",
      doneLabel: `${steps.firstOffering.count} offering${(steps.firstOffering.count ?? 0) === 1 ? "" : "s"} created`,
      done: steps.firstOffering.done,
      href: `${base}/services`,
    },
    {
      key: "approvedOffering",
      label: "Get approved to sell",
      doneLabel: `${steps.approvedOffering.count} approved`,
      done: steps.approvedOffering.done,
      // In review, not actionable by the earner — reflected as a waiting state below.
      pending: steps.firstOffering.done && !steps.approvedOffering.done,
      href: `${base}/services`,
    },
    ...(steps.availability.applicable
      ? [
          {
            key: "availability",
            label: "Set your availability",
            doneLabel: `${steps.availability.count} open slot${(steps.availability.count ?? 0) === 1 ? "" : "s"}`,
            done: steps.availability.done,
            href: `${base}/calendar`,
          },
        ]
      : []),
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  const dismiss = () => {
    if (user?.id) localStorage.setItem(DISMISS_KEY_PREFIX + user.id, "1");
    setDismissed(true);
  };

  return (
    <Card className="border border-console-light" data-testid="card-setup-checklist">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            {allDone ? "Your business is live" : "Open your business"}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-console-mid" data-testid="text-setup-progress">
              {doneCount} of {items.length}
            </span>
            {allDone && (
              <button
                onClick={dismiss}
                aria-label="Dismiss setup checklist"
                className="text-console-mid hover:text-console-darkest"
                data-testid="button-dismiss-setup"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-console-light/60">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center justify-between py-2.5 group"
                data-testid={`setup-step-${item.key}`}
              >
                <span className="flex items-center gap-2.5 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : item.pending ? (
                    <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-console-mid/50 shrink-0" />
                  )}
                  <span className={item.done ? "text-console-mid line-through decoration-console-mid/40" : "text-console-darkest"}>
                    {item.done ? item.doneLabel : item.pending ? `${item.label} — in review` : item.label}
                  </span>
                </span>
                {!item.done && <ChevronRight className="w-4 h-4 text-console-mid opacity-0 group-hover:opacity-100 transition-opacity" />}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 pt-3">
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/share-promote`}>Share your storefront</Link>
          </Button>
          {storefrontPath && (
            <Button asChild size="sm" variant="ghost">
              <Link href={storefrontPath}>View public page →</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
