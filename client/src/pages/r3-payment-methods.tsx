/**
 * R3 U8a - the Payment methods page on the R3 surface, in the U7 Settings card style. No board panel; Leon ruled the
 * card style. It reuses the profile card's wiring through usePaymentMethodActions, so nothing is duplicated.
 */
import { useEffect, useState } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BOARD_CELL, BOARD_DANGER, BOARD_FILL, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import { R3TopBar } from "@/components/r3/TopBar";
import { RemovePaymentMethodDialog } from "@/components/payment/RemovePaymentMethodDialog";
import { AddCardDialog } from "@/components/payment/AddCardDialog";
import { useSavedPayment, type SavedCard } from "@/hooks/use-saved-payment";
import { usePaymentMethodActions } from "@/hooks/use-payment-method-actions";
import { savedPaymentMethodLabel } from "@shared/saved-payment-method";
import { readR3SurfaceFlag } from "@/lib/r3-surface";

export function R3PaymentMethodsPage() {
  const search = useSearch();
  const asked = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("surface") === "r3";
  // D12: no parameter, or the flag off, sends the traveller to /profile, where their card is.
  const [flag, setFlag] = useState<boolean | null>(asked ? null : false);
  useEffect(() => {
    if (!asked) return;
    let alive = true;
    readR3SurfaceFlag().then((on) => {
      if (alive) setFlag(on);
    });
    return () => {
      alive = false;
    };
  }, [asked]);
  const { available, methods, defaultPaymentMethodId, isLoading, refresh } = useSavedPayment(asked);
  const { setDefault, remove, pendingId, removing } = usePaymentMethodActions();
  const { data: plans } = useQuery<Array<{ id: string; title?: string | null; startDate?: string | null; endDate?: string | null }>>({
    queryKey: ["/api/trips"],
    enabled: asked,
  });
  const [removeTarget, setRemoveTarget] = useState<SavedCard | null>(null);

  // After an add the default arrives from the webhook a moment later: when a refresh shows exactly one method and no
  // default, refetch once after 3 seconds. One recheck only, and string 8 is not shown while it is pending.
  const [recheckPending, setRecheckPending] = useState(false);
  const [rechecks, setRechecks] = useState(0);
  const singleNoDefault = !isLoading && available && methods.length === 1 && !defaultPaymentMethodId;
  useEffect(() => {
    if (!singleNoDefault) {
      // The card changed under the recheck (removed, or a default arrived): cancel it and let the list speak.
      if (recheckPending) setRecheckPending(false);
      return;
    }
    if (rechecks > 0) return;
    setRecheckPending(true);
    const timer = window.setTimeout(() => {
      setRechecks(1);
      setRecheckPending(false);
      void refresh();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [singleNoDefault, rechecks, refresh]);

  if (!asked) return <Redirect to="/profile" replace />;
  if (flag === null) return <div data-testid="r3-payment-methods" data-state="loading" />;
  if (flag === false) return <Redirect to="/profile" replace />;

  const state = isLoading ? "loading" : !available ? "unavailable" : methods.length === 0 ? "empty" : "list";
  const showNoDefault = state === "list" && !defaultPaymentMethodId && !recheckPending;

  return (
    <div data-testid="r3-payment-methods" data-state={state} data-rechecks={rechecks}>
      <R3TopBar tripId={null} plan={null} plans={plans ?? []} />
      <main className="mx-auto max-w-[760px] px-4 py-8">
        <div className="rounded-xl border p-4" style={{ backgroundColor: BOARD_CELL, borderColor: BOARD_LINE }}>
          <Link href="/settings?surface=r3" className="text-[13px]" style={{ color: BOARD_TEXT }} data-testid="r3-pm-back">
            Settings
          </Link>
          <h1 className="mt-2 text-[16px] font-semibold" style={{ color: BOARD_INK }}>
            Payment methods
          </h1>
          <div className="mt-2 border-t" style={{ borderColor: BOARD_LINE }} />

          {state === "loading" ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-6 rounded" style={{ backgroundColor: BOARD_LINE }} />
              ))}
            </div>
          ) : null}

          {state === "unavailable" ? (
            <p className="text-[13px] text-muted-foreground" data-testid="r3-pm-unavailable">
              Payment methods aren't available right now. Try again later.
            </p>
          ) : null}

          {state === "empty" ? (
            <>
              <p className="mt-3 text-[13px] text-muted-foreground" data-testid="r3-pm-empty">
                No saved cards yet. Add one to pay in one tap.
              </p>
              <div className="mt-3">
                <AddCardDialog triggerLabel="Add a card" />
              </div>
            </>
          ) : null}

          {state === "list" ? (
            <>
              {showNoDefault ? (
                <p className="mb-3 mt-3 text-[12px] text-muted-foreground" data-testid="r3-pm-no-default">
                  No default card. Your next payment will ask for card details.
                </p>
              ) : null}
              <ul>
                {methods.map((card) => {
                  const isDefault = card.id === defaultPaymentMethodId;
                  return (
                    <li
                      key={card.id}
                      className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0"
                      style={{ borderTopColor: BOARD_LINE }}
                      data-testid="r3-pm-row"
                      data-default={isDefault}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium" style={{ color: BOARD_INK }}>
                          {savedPaymentMethodLabel(card)}
                        </p>
                        {card.expMonth != null && card.expYear != null ? (
                          <p className="text-[12px] text-muted-foreground">
                            {`Expires ${String(card.expMonth).padStart(2, "0")}/${card.expYear}`}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isDefault ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: BOARD_FILL, color: BOARD_TEXT }}
                            data-testid="r3-pm-default"
                          >
                            Default
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDefault(card.id)}
                            disabled={pendingId === card.id}
                            className="text-[12px] underline underline-offset-2 disabled:opacity-50"
                            style={{ color: BOARD_TEXT }}
                            data-testid="r3-pm-make-default"
                          >
                            Make default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(card)}
                          disabled={pendingId === card.id}
                          className="text-[12px] underline underline-offset-2 disabled:opacity-50"
                          style={{ color: BOARD_DANGER }}
                          data-testid="r3-pm-remove"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3">
                <AddCardDialog triggerLabel="Add a card" />
              </div>
            </>
          ) : null}
        </div>

        <RemovePaymentMethodDialog
          target={removeTarget}
          pending={removing}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          onConfirm={() => {
            if (!removeTarget) return;
            const id = removeTarget.id;
            setRemoveTarget(null);
            remove(id);
          }}
        />
      </main>
    </div>
  );
}
