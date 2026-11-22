/**
 * A10 part 2: the "Next:" question - ONE at a time, in the board's order, each skippable. It asks only; the press
 * opens the panel or sheet the strip's own chips open, and Skip hides the question for THIS VISIT (no memory, per
 * Leon, Nov 21 2026).
 */
import { NEXT_QUESTION_COPY, NEXT_QUESTION_SKIP, type NextQuestionKey } from "@/lib/next-question";

export function NextQuestion({
  question,
  onAnswer,
  onSkip,
}: {
  question: NextQuestionKey;
  onAnswer: () => void;
  onSkip: () => void;
}) {
  const copy = NEXT_QUESTION_COPY[question];
  return (
    <section
      className="space-y-2 rounded-[var(--slip-radius-card)] border border-white/15 p-3"
      data-testid="slip-next-question"
      data-next-question={question}
    >
      <p className="text-[13px] leading-[1.45] text-[color:var(--slip-on-navy-muted)]" data-testid="slip-next-sentence">
        {copy.sentence}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAnswer}
          data-testid="slip-next-action"
          className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[color:var(--slip-navy)]"
        >
          {copy.action}
        </button>
        <button
          type="button"
          onClick={onSkip}
          data-testid="slip-next-skip"
          className="inline-flex items-center rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-medium text-white"
        >
          {NEXT_QUESTION_SKIP}
        </button>
      </div>
    </section>
  );
}
