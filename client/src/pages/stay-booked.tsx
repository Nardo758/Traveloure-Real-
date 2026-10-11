/**
 * `/plans/:tripId/stays/:itemId/booked` — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`). Nuitée's Payment
 * SDK returns the traveler here after they pay. The page asks the server to book ONCE (the server's own
 * `prebooked → booking` claim is the guard; a second press is refused there, never here) and says what came back.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { STAY_BOOK_WORDS, postStayBooking, stayBookingQueryKey, stayRefusalText } from "@/lib/stay-booking";

export default function StayBookedPage() {
  const { tripId = "", itemId = "" } = useParams<{ tripId: string; itemId: string }>();
  const qc = useQueryClient();
  const sent = useRef(false);
  const [text, setText] = useState<string>(STAY_BOOK_WORDS.confirming);
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    if (sent.current || !tripId || !itemId) return;
    sent.current = true;
    postStayBooking(tripId, itemId, "book")
      .then((out) => {
        setState(out.state);
        setText(out.state === "confirmed" ? STAY_BOOK_WORDS.confirmed(out.hotelConfirmationCode ?? null) : stayRefusalText(out.state));
      })
      .catch((e: any) => {
        setState("error");
        setText(e?.message || stayRefusalText(""));
      })
      .finally(() => {
        qc.invalidateQueries({ queryKey: stayBookingQueryKey(tripId, itemId) });
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes(tripId) });
      });
  }, [tripId, itemId, qc]);

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="font-serif text-2xl">Your stay</h1>
      <p className="mt-3 text-sm" data-testid="stay-booked-result" data-state={state ?? "pending_request"}>
        {text}
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href={`/plans/${tripId}`} data-testid="stay-booked-back">
          {STAY_BOOK_WORDS.backToPlan}
        </Link>
      </Button>
    </main>
  );
}
