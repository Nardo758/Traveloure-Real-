/**
 * In-app payout-setup prompt (fix-queue row 115): one at onboarding, one at first earning. No email. It renders
 * nothing once setup is complete, while loading, or for a non-earner. It never blocks anything.
 */
import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PAYOUT_SETUP_COPY as T, PAYOUT_SETUP_URL, payoutPromptMoment, type PayoutSetup } from "@/lib/payout-setup";

export function PayoutSetupPrompt({ hasEarnings, settingsHref }: { hasEarnings: boolean; settingsHref: string }) {
  const { data } = useQuery<PayoutSetup>({ queryKey: [PAYOUT_SETUP_URL], retry: false });
  const moment = payoutPromptMoment(data, hasEarnings);
  if (!moment) return null;
  return (
    <Link href={settingsHref}>
      <div className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 hover:bg-amber-100/60" data-testid={`prompt-payout-setup-${moment}`}>
        <div>
          <p className="text-sm font-semibold text-amber-900">{moment === "first_earning" ? T.promptEarningTitle : T.promptOnboardingTitle}</p>
          <p className="text-xs text-amber-800">{moment === "first_earning" ? T.promptEarningBody : T.promptOnboardingBody}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-amber-700">{T.promptAction} →</span>
      </div>
    </Link>
  );
}
