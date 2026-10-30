/**
 * Row 280b (ledger `2026-10-29-guest-plan-my-day-button`): "Plan my day around this" on the
 * confirmed step of the guest invite page. Shown only to a signed-in guest who has accepted.
 * One press sends one POST; a refusal opens nothing, shows the held error line and re-enables.
 */
import React, { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { GUEST_CARD_COPY } from '@/lib/guest-card-copy';
import { requestGuestPlan, showPlanMyDayButton } from '@/lib/guest-plan';

export function GuestPlanMyDayButton({ token, rsvpStatus }: { token: string; rsvpStatus: string | null | undefined }) {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  if (!showPlanMyDayButton(isAuthenticated, rsvpStatus)) return null;

  async function open() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const path = await requestGuestPlan(token);
    if (path) {
      navigate(path);
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setFailed(true);
  }

  return (
    <div className="space-y-2" data-testid="guest-plan-my-day">
      <Button className="w-full sm:w-auto" onClick={open} disabled={busy} data-testid="button-plan-my-day">
        {GUEST_CARD_COPY.planButton}
      </Button>
      {failed && (
        <p className="text-sm text-destructive" role="alert" data-testid="text-plan-my-day-error">
          {GUEST_CARD_COPY.planError}
        </p>
      )}
    </div>
  );
}
