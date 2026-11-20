/**
 * THE ONE "ASK AN EXPERT" BUTTON (F1; Leon, Nov 19).
 *
 * One label everywhere. A card that names a specific expert (`direct`) goes straight to that expert. Every
 * other press opens the chooser: the approved options for which the card's city has an expert, each starting
 * the existing ask (`useAskExpert`) with an expert of that kind. Unpriced; a signed-out press reaches the
 * existing sign-in gate after the choice. The caller decides whether the button draws at all (the engine's
 * `ask_expert`), so this component never reads availability.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAskExpert } from "@/lib/use-ask-expert";
import { ASK_EXPERT_COPY, askChoiceLabel } from "@/lib/ask-expert-copy";
import { askChoiceOptions, askChooserExpertsUrl, type AskChoiceOption } from "@/lib/ask-expert-chooser";

type AskParams = Parameters<ReturnType<typeof useAskExpert>>[0];

export interface AskExpertButtonProps {
  testId: string;
  city: string | null | undefined;
  /** What the traveler is asking about; pre-fills the composer. */
  subject?: string | null;
  /** The card names ONE expert (a curator, an expert's own card): the press skips the chooser. */
  direct?: Pick<AskParams, "handle" | "serviceId" | "expertId" | "fallbackName" | "fallbackAvatar"> | null;
  returnTo?: string | null;
  className?: string;
  style?: CSSProperties;
}

export function AskExpertButton({ testId, city, subject, direct, returnTo, className, style }: AskExpertButtonProps) {
  const askExpert = useAskExpert();
  const [open, setOpen] = useState(false);
  const cityName = city?.trim() || null;
  const directed = !!direct && (direct.handle != null || direct.serviceId != null || direct.expertId != null);
  const experts = useQuery<unknown>({
    queryKey: [cityName ? askChooserExpertsUrl(cityName) : "/api/experts#none"],
    enabled: open && !!cityName,
    staleTime: 60_000,
    retry: false,
  });
  const options: AskChoiceOption[] = askChoiceOptions(experts.data);
  const base = { city: cityName, subject: subject ?? null, returnTo: returnTo ?? null };
  // The directory answered and holds no expert of an approved kind: there is nothing to choose between, so the
  // press runs the existing city ask (which says nothing it cannot back) and no empty dialog is left open.
  const nothingToChoose = open && (!cityName || (!experts.isLoading && options.length === 0));
  useEffect(() => {
    if (!nothingToChoose) return;
    setOpen(false);
    void askExpert(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToChoose]);

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        data-testid={testId}
        onClick={(e) => {
          // A card is often itself a link: the press is this action's, never the card's.
          e.preventDefault();
          e.stopPropagation();
          if (directed) void askExpert({ ...base, ...direct });
          else setOpen(true);
        }}
      >
        {ASK_EXPERT_COPY.button}
      </button>
      {open && !nothingToChoose ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="sm:max-w-sm" aria-describedby={undefined} data-testid="ask-expert-chooser" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{ASK_EXPERT_COPY.button}</DialogTitle>
            </DialogHeader>
            {experts.isLoading ? (
              <div className="flex justify-center py-4" role="status" aria-busy="true" data-testid="ask-expert-chooser-loading">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {options.map((o) => (
                  <Button
                    key={o.kind}
                    type="button"
                    variant="outline"
                    className="justify-start"
                    data-testid={`ask-expert-choice-${o.kind}`}
                    onClick={() => {
                      setOpen(false);
                      void askExpert({ ...base, expertId: o.expertId });
                    }}
                  >
                    {askChoiceLabel(o.kind)}
                  </Button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
