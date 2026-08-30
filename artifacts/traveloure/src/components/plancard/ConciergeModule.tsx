import { Link } from "wouter";
import { Sparkles, ChevronRight } from "lucide-react";

/**
 * ConciergeModule — the front-and-center "revenue spine" surfaced high in BOTH
 * the summary card and the full control center (replacing the old bottom-bar
 * Concierge button). Built on platform tokens (primary accent on a soft card).
 *
 * Wiring is unchanged: it links to /concierge with a trip-scoped intent — the
 * same destination the prior Concierge entry used.
 */
interface ConciergeModuleProps {
  destination: string;
  /** copy line — slightly different between stages */
  subtitle?: string;
  testId?: string;
}

export function ConciergeModule({ destination, subtitle, testId }: ConciergeModuleProps) {
  const intent = `Help me with my ${destination} trip`;
  return (
    <Link
      href={`/concierge?intent=${encodeURIComponent(intent)}`}
      className="block"
      data-testid={testId}
    >
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 hover:bg-primary/10 transition-colors">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-foreground">Ask the Concierge</div>
          <div className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {subtitle ?? "Hand off any task — AI now, or an expert."}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
      </div>
    </Link>
  );
}
