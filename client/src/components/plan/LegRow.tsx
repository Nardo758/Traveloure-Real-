/**
 * `LegRow` — the airport ↔ lodging leg (surface step 3, ruling R-i). Sits between the arrival anchor
 * and the first stop, and before the departure anchor, when the plan has a flight AND a stay.
 *
 * "Book": the per-leg booking path (`transport_booking_options`) is keyed on a computed
 * `transport_legs` row, which exists only after an optimization — so before one, every bookable mode
 * goes to an AGENT BOOKING REQUEST (the existing `POST /api/affiliate-booking-requests`, partner
 * route built server-side, §16). A platform private car opens the platform's own drivers browse.
 * No travel minutes or distance are shown (A8 off).
 */
import { Car } from "lucide-react";
import { Link } from "wouter";
import { AIRPORT_LEG_MODE_LABEL, airportLegLine, type AirportLegMode } from "@shared/airport-leg";

export interface LegRowProps {
  direction: "arrival" | "departure";
  stayName: string;
  airport: string | null;
  modes: AirportLegMode[];
  /** Owner only — everyone else reads the leg and books nothing. */
  canBook: boolean;
  /** The platform's drivers browse for this plan (a private car is a platform listing). */
  driversHref?: string | null;
  onRequest?: (mode: AirportLegMode) => void;
  busy?: boolean;
}

export function LegRow({ direction, stayName, airport, modes, canBook, driversHref, onRequest, busy = false }: LegRowProps) {
  return (
    <div className="px-3 py-2 border-l-2 border-dashed border-border ml-4 space-y-1" data-testid={`slip-leg-airport-${direction}`}>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Car className="w-3.5 h-3.5" aria-hidden="true" />
        <span data-testid={`slip-leg-airport-${direction}-line`}>{airportLegLine(direction, stayName, airport)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {modes.map((m) => (
          <span key={m} className="inline-flex items-center gap-1 text-xs" data-testid={`slip-leg-mode-${direction}-${m}`}>
            <span className="rounded border border-border px-1.5 py-0.5">{AIRPORT_LEG_MODE_LABEL[m]}</span>
            {canBook ? (
              m === "private_car" ? (
                driversHref ? (
                  <Link href={driversHref} className="underline underline-offset-2" data-testid={`slip-leg-book-${direction}-${m}`}>
                    Book
                  </Link>
                ) : null
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-2 disabled:opacity-50"
                  onClick={() => onRequest?.(m)}
                  disabled={busy}
                  data-testid={`slip-leg-book-${direction}-${m}`}
                >
                  Book
                </button>
              )
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
