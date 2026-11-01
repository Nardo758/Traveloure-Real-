/**
 * Row 306 (CS-3 brief 10, E): "Your travel style" on the traveler's profile.
 *
 * Reads `GET /api/me/selection-profile`. While the server says the profile is off (`selection_profile` is not
 * "true") the card draws NOTHING, so nothing about the profile shows until Leon turns it on. On, it shows
 * "Built around: [traits]." from the server's plain counts, and a reset button that clears the traveler's own
 * rows (`POST /api/me/selection-profile/reset`). It never computes a trait itself.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SelectionTrait } from "@shared/selection-profile";
import { TRAVEL_STYLE_COPY, travelStyleLine } from "@/lib/travel-style-copy";

export const SELECTION_PROFILE_URL = "/api/me/selection-profile";

export interface SelectionProfileResponse {
  enabled: boolean;
  traits: SelectionTrait[];
}

/** The card's body: nothing while off; the traits line, or the no-pattern line, while on. */
export function TravelStyleCardView({
  data,
  onReset,
  resetting,
}: {
  data: SelectionProfileResponse | undefined;
  onReset: () => void;
  resetting: boolean;
}) {
  if (!data?.enabled) return null;
  const line = travelStyleLine(data.traits);
  return (
    <Card className="border border-border" data-testid="card-travel-style">
      <CardHeader>
        <CardTitle className="text-lg text-foreground dark:text-white">{TRAVEL_STYLE_COPY.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground m-0" data-testid="text-travel-style">
          {line ?? TRAVEL_STYLE_COPY.noPattern}
        </p>
        <Button variant="outline" size="sm" onClick={onReset} disabled={resetting} data-testid="button-travel-style-reset">
          {TRAVEL_STYLE_COPY.reset}
        </Button>
      </CardContent>
    </Card>
  );
}

export function TravelStyleCard() {
  const { toast } = useToast();
  const { data } = useQuery<SelectionProfileResponse>({ queryKey: [SELECTION_PROFILE_URL], staleTime: 0 });
  const reset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${SELECTION_PROFILE_URL}/reset`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SELECTION_PROFILE_URL] });
      toast({ title: TRAVEL_STYLE_COPY.resetDone });
    },
    onError: () => toast({ variant: "destructive", title: TRAVEL_STYLE_COPY.resetFailed }),
  });
  return <TravelStyleCardView data={data} onReset={() => reset.mutate()} resetting={reset.isPending} />;
}
