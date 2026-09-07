/**
 * THE EXPERT-REQUEST REVIEW SHEET — one component, both surfaces. Lane L19 of the Console &
 * AI Concierge brief (ledger `2026-09-07-request-is-a-click`), findings F1 and F2.
 *
 * AN EXPERT REQUEST IS A CLICK, NEVER A DIALOG OPENING. Opening `/experiences/:slug`'s "Get
 * Expert Help" used to mint a slip and POST `/api/expert-requests` before the traveler saw a
 * thing, and the Destination Concierge tier's "Request expert" sent the same lead on one press.
 * Both now open THIS sheet, which writes nothing, and the send lives on its one button.
 *
 * ONE COMPONENT, TWO CALLERS (§18 rule 1). A second review screen beside this one is how the
 * two surfaces start telling travelers different things about the same rail — and the honesty
 * rules below are exactly the kind that drift when they are copied.
 *
 * WHAT IT SHOWS, and why each line is the one it is:
 *   · WHAT WILL BE SENT — the plan basics, from stated values only. An unanswered basic reads
 *     "Not set" (§13): never a defaulted date, never a party the traveler did not give.
 *   · TO WHOM — a DESCRIPTION, not a name. The lead is auto-routed server-side after the POST,
 *     so naming a person here would be inventing one.
 *   · AT WHAT PRICE — the caller's own line: "Free request" on the free lead rail (it mints no
 *     PaymentIntent), or the tier card's OWN "from $N" for the concierge tier, passed in rather
 *     than recomputed (§18 rule 1).
 * Every one of those derivations lives in `@/lib/expert-request-review`, so none is restated in
 * the JSX below and all of them are provable without mounting anything.
 *
 * NEGATIVE SPACE: this sheet AUTHORIZES nothing and DERIVES nothing about money. It renders a
 * price line it is handed and calls `onSend`; the mint, the POST and every gate behind them are
 * the caller's and the server's, unchanged by this lane.
 */
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send, UserCheck } from "lucide-react";
import {
  EXPERT_REQUEST_NOT_SET,
  expertRequestPlanRows,
  expertRequestRecipientLine,
  type ExpertRequestPlanBasics,
} from "@/lib/expert-request-review";

export interface ExpertRequestReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The plan basics that will ride with the request. Absent fields render "Not set". */
  basics: ExpertRequestPlanBasics;
  /** The price line, in the caller's own words — see the header's third rule. */
  priceLabel: string;
  /** The traveler's own note/intent, when the request carries one. Absent ⇒ the row is omitted. */
  note?: string | null;
  /** True while the send is in flight; the button is disabled and says so. */
  sending?: boolean;
  /** Runs ONLY from the Send button. Nothing in this component writes anything itself. */
  onSend: () => void;
  /** Optional override for the Send button's label (a queued tier says "Join queue"). */
  sendLabel?: string;
  title?: string;
  description?: string;
}

export function ExpertRequestReviewSheet({
  open,
  onOpenChange,
  basics,
  priceLabel,
  note,
  sending = false,
  onSend,
  sendLabel = "Send request",
  title = "Send this to an expert?",
  description = "Nothing is sent until you press send. Here is exactly what goes out.",
}: ExpertRequestReviewSheetProps) {
  const rows = expertRequestPlanRows(basics);
  const recipient = expertRequestRecipientLine(basics.destination);
  const statedNote = (note ?? "").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="expert-request-review">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              What we send
            </h3>
            <dl className="space-y-1.5" data-testid="expert-request-review-basics">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  {/* A basic nobody answered says so — it is never filled in for them (§13). */}
                  <dd className={row.value ? "font-medium text-right" : "text-right text-muted-foreground italic"}>
                    {row.value ?? EXPERT_REQUEST_NOT_SET}
                  </dd>
                </div>
              ))}
            </dl>
            {statedNote && (
              <p className="mt-3 text-sm text-muted-foreground" data-testid="expert-request-review-note">
                <span className="font-medium text-foreground">Your note: </span>
                {statedNote}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Who it goes to
            </h3>
            <p className="text-sm" data-testid="expert-request-review-recipient">
              {recipient}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              What it costs
            </h3>
            <p className="text-sm font-medium" data-testid="expert-request-review-price">
              {priceLabel}
            </p>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            data-testid="button-cancel-expert-request"
          >
            Cancel
          </Button>
          <Button onClick={onSend} disabled={sending} data-testid="button-send-expert-request">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {sendLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExpertRequestReviewSheet;
