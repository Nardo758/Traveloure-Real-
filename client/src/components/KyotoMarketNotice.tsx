/**
 * Leon, Nov 11, 2026, 12:02 PM ET: after sign-in, while traveler sign-up is in waitlist mode,
 * say that only Kyoto is open. Dismissed for this browser. Wording approved — Leon.
 */
import { useState } from "react";
import { useSignupMode } from "@/lib/signup-mode";
import { useAuth } from "@/hooks/use-auth";

export const KYOTO_MARKET_NOTICE = "Only the Kyoto market is open right now.";
const DISMISS_KEY = "traveloure_kyoto_market_notice_dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function KyotoMarketNotice() {
  const { user } = useAuth();
  const { mode } = useSignupMode();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!user || mode !== "waitlist" || dismissed) return null;
  return (
    <div
      className="border-b border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-4 py-2"
      role="status"
      data-testid="banner-kyoto-market-notice"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <p className="text-sm text-foreground">{KYOTO_MARKET_NOTICE}</p>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          data-testid="button-kyoto-market-notice-dismiss"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* a full store still hides the banner for this view */
            }
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
