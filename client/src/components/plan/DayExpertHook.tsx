/**
 * FB-1 expert hook (ledger `2026-10-18-fb1-expert-hook`): the locked "With local picks" section under a free plan's
 * day, on the owner's slip only. Every word and both switch states come from `@shared/expert-hook` — this file draws
 * them and decides nothing. No blurred text, no sample notes, no promise of anything not built.
 */
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXPERT_HOOK_BUTTON, EXPERT_HOOK_TITLE, IN_SEASON_SEE_THEM, expertHookForDay, inSeasonLine, type ExpertHook,
} from "@shared/expert-hook";
import type { LocalTeaser } from "@shared/free-draft-cap";

export function DayExpertHook(props: {
  dayKey: string;
  dayNumber: number;
  hook: ExpertHook;
  teaser?: LocalTeaser | null;
  inSeason?: { count: number; href: string } | null;
  onAsk: () => void;
}) {
  const { line, button } = expertHookForDay(props.hook, props.teaser);
  const seasonText = inSeasonLine(props.inSeason?.count, props.dayNumber);
  return (
    <div className="mx-3 mt-2 mb-1 rounded-md border border-dashed border-border px-3 py-2 text-xs" data-testid={`day-expert-hook-${props.dayKey}`}>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Lock className="h-3 w-3" aria-hidden="true" />
        {EXPERT_HOOK_TITLE}
      </p>
      <p className="mt-1 text-muted-foreground" data-testid={`day-expert-hook-line-${props.dayKey}`}>{line}</p>
      {seasonText && props.inSeason?.href ? (
        <p className="mt-1 text-muted-foreground" data-testid={`day-in-season-${props.dayKey}`}>
          {seasonText} ·{" "}
          <a href={props.inSeason.href} className="underline">{IN_SEASON_SEE_THEM}</a>
        </p>
      ) : null}
      {button ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={props.onAsk} data-testid={`day-expert-hook-ask-${props.dayKey}`}>
          {EXPERT_HOOK_BUTTON}
        </Button>
      ) : null}
    </div>
  );
}
