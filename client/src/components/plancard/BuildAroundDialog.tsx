import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  Loader2,
  Map,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type {
  ComparisonPinnedAnchor,
  ComparisonPinnedAnchorType,
} from "@/lib/create-comparison";

interface AnchorCandidate {
  anchorId: string;
  type: ComparisonPinnedAnchorType;
  name: string;
  medianMeters: number | null;
  estMedianWalkMinutes: number | null;
  within15MinCount: number;
  locatedStops: number;
  totalStops: number;
  rating?: number | string | null;
  area?: string | null;
}

type RankedAnchors = Record<ComparisonPinnedAnchorType, AnchorCandidate[]>;
type AnchorMode = "auto" | ComparisonPinnedAnchorType;

const EMPTY_RANKED: RankedAnchors = {
  hotel: [],
  neighborhood: [],
  activity: [],
};

const TYPE_OPTIONS: Array<{
  type: ComparisonPinnedAnchorType;
  label: string;
  Icon: typeof Building2;
}> = [
  { type: "hotel", label: "Hotel", Icon: Building2 },
  { type: "neighborhood", label: "Neighborhood", Icon: Map },
  { type: "activity", label: "Activity", Icon: Activity },
];

const EMPTY_COPY: Record<ComparisonPinnedAnchorType, string> = {
  hotel: "No hotels scored near your stops yet",
  neighborhood: "No neighborhoods scored near your stops yet",
  activity: "No activities scored near your stops yet",
};

export function formatAnchorCandidateMedian(candidate: AnchorCandidate): string {
  return candidate.estMedianWalkMinutes == null
    ? "— min"
    : `${Math.round(candidate.estMedianWalkMinutes)} min median`;
}

export function BuildAroundDialog({
  open,
  tripId,
  busy = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  tripId: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pinnedAnchor?: ComparisonPinnedAnchor) => void;
}) {
  const [mode, setMode] = useState<AnchorMode>("auto");
  const [ranked, setRanked] = useState<RankedAnchors>(EMPTY_RANKED);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<AnchorCandidate | null>(null);
  const [customName, setCustomName] = useState("");
  const requestedRef = useRef(false);
  const requestEpochRef = useRef(0);

  useEffect(() => {
    requestEpochRef.current += 1;
    if (!open) return;
    requestedRef.current = false;
    setMode("auto");
    setRanked(EMPTY_RANKED);
    setLoading(false);
    setLoadError(null);
    setSelectedCandidate(null);
    setCustomName("");
  }, [open]);

  async function loadCandidatesOnce() {
    if (requestedRef.current) return;
    requestedRef.current = true;
    const epoch = requestEpochRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(
        "GET",
        `/api/trips/${encodeURIComponent(tripId)}/anchor-candidates`,
      );
      const data = (await response.json()) as Partial<RankedAnchors>;
      if (epoch !== requestEpochRef.current) return;
      setRanked({
        hotel: Array.isArray(data.hotel) ? data.hotel : [],
        neighborhood: Array.isArray(data.neighborhood) ? data.neighborhood : [],
        activity: Array.isArray(data.activity) ? data.activity : [],
      });
    } catch (error: any) {
      if (epoch !== requestEpochRef.current) return;
      setLoadError(error?.message || "Could not load anchor candidates");
    } finally {
      if (epoch === requestEpochRef.current) setLoading(false);
    }
  }

  function selectMode(nextMode: AnchorMode) {
    setMode(nextMode);
    setSelectedCandidate(null);
    setCustomName("");
    if (nextMode !== "auto") void loadCandidatesOnce();
  }

  const customLocationName = customName.trim();
  const selectedName =
    selectedCandidate?.name || (mode !== "auto" ? customLocationName : "");
  const canConfirm =
    !busy &&
    (mode === "auto" || selectedCandidate !== null || customLocationName.length > 0);

  function confirm() {
    if (!canConfirm) return;
    if (mode === "auto") {
      onConfirm();
      return;
    }
    if (selectedCandidate) {
      onConfirm({
        type: mode,
        id: selectedCandidate.anchorId,
        name: selectedCandidate.name,
      });
      return;
    }
    onConfirm({ type: mode, name: customLocationName });
  }

  const visibleCandidates = mode === "auto" ? [] : ranked[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-[560px] overflow-y-auto border-[color:var(--earn-border)] bg-[var(--earn-card)] p-0"
        data-testid="build-around-dialog"
      >
        <DialogHeader className="border-b border-[color:var(--earn-border)] px-5 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
          <DialogTitle className="font-display text-2xl text-[color:var(--earn-ink)]">
            Build around a location
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-[color:var(--earn-muted)]">
            Choose how the optimizer should anchor the three versions of your plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 sm:px-6">
          <button
            type="button"
            onClick={() => selectMode("auto")}
            aria-pressed={mode === "auto"}
            className={`flex min-h-20 w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 ${
              mode === "auto"
                ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)]"
                : "border-[color:var(--earn-border)] bg-[var(--earn-card)] hover:border-[color:var(--earn-teal)]"
            }`}
            data-testid="build-around-auto"
          >
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-[color:var(--earn-ink)]">
                Auto
                <span className="rounded-full bg-[color:var(--earn-teal-wash)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[color:var(--earn-teal-ink)]">
                  recommended
                </span>
              </span>
              <span className="mt-1 block text-sm leading-5 text-[color:var(--earn-muted)]">
                The AI scores hotels, neighborhoods &amp; activities against your stops and picks the 3 strongest anchors.
              </span>
            </span>
            <span
              className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                mode === "auto"
                  ? "border-[color:var(--earn-teal)] bg-[var(--earn-teal)] text-white"
                  : "border-[color:var(--earn-border-dash)]"
              }`}
              aria-hidden="true"
            >
              {mode === "auto" && <Check className="h-3 w-3" />}
            </span>
          </button>

          <div>
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-muted)]">
              or pin your own anchor
            </p>
            <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
              {TYPE_OPTIONS.map(({ type, label, Icon }) => {
                const selected = mode === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => selectMode(type)}
                    aria-pressed={selected}
                    className={`flex min-h-16 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 min-[430px]:flex-col min-[430px]:items-start ${
                      selected
                        ? "border-[color:var(--earn-coral-border)] bg-[var(--earn-coral-bg)] text-[color:var(--earn-coral-ink)]"
                        : "border-[color:var(--earn-border)] text-[color:var(--earn-ink)] hover:border-[color:var(--earn-coral-border)]"
                    }`}
                    data-testid={`build-around-type-${type}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode !== "auto" && (
            <div className="space-y-3" data-testid={`build-around-candidates-${mode}`}>
              {loading ? (
                <div className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--earn-border-dash)] text-sm text-[color:var(--earn-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scoring locations against your stops…
                </div>
              ) : loadError ? (
                <div
                  className="rounded-xl border border-[color:var(--earn-coral-border)] bg-[var(--earn-coral-bg)] p-3 text-sm text-[color:var(--earn-coral-ink)]"
                  role="alert"
                  data-testid="build-around-load-error"
                >
                  {loadError}. Close and reopen to try again; Auto is still available.
                </div>
              ) : visibleCandidates.length === 0 ? (
                <div
                  className="rounded-xl border border-dashed border-[color:var(--earn-border-dash)] p-4 text-sm text-[color:var(--earn-muted)]"
                  data-testid={`build-around-empty-${mode}`}
                >
                  {EMPTY_COPY[mode]}
                </div>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label={`${mode} anchors`}>
                  {visibleCandidates.map((candidate, index) => {
                    const selected = selectedCandidate?.anchorId === candidate.anchorId;
                    const details = [
                      candidate.rating != null ? `${candidate.rating} rating` : null,
                      candidate.area || null,
                    ].filter(Boolean);
                    return (
                      <button
                        key={`${candidate.type}:${candidate.anchorId}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setSelectedCandidate(candidate);
                          setCustomName("");
                        }}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--earn-teal)] focus-visible:ring-offset-2 ${
                          selected
                            ? "border-[color:var(--earn-teal)] bg-[color:var(--earn-teal-wash)]"
                            : "border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]"
                        }`}
                        data-testid={`build-around-candidate-${candidate.anchorId}`}
                      >
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                            selected
                              ? "border-[color:var(--earn-teal)] bg-[var(--earn-teal)] text-white"
                              : "border-[color:var(--earn-border-dash)]"
                          }`}
                          aria-hidden="true"
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[color:var(--earn-ink)]">
                              {candidate.name}
                            </span>
                            {index === 0 && (
                              <span className="rounded-full bg-[color:var(--earn-teal-wash)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[color:var(--earn-teal-ink)]">
                                best fit
                              </span>
                            )}
                          </span>
                          {details.length > 0 && (
                            <span className="mt-0.5 block text-xs text-[color:var(--earn-muted)]">
                              {details.join(" · ")}
                            </span>
                          )}
                        </span>
                        <span
                          className="shrink-0 font-mono text-xs text-[color:var(--earn-muted)]"
                          title="Estimated walking time from straight-line distance at 80 m/min"
                        >
                          {formatAnchorCandidateMedian(candidate)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[color:var(--earn-ink)]">
                  Not listed? Build around a custom location
                </span>
                <Input
                  value={customName}
                  onChange={(event) => {
                    setCustomName(event.target.value);
                    if (event.target.value.trim()) setSelectedCandidate(null);
                  }}
                  placeholder={`Enter a ${mode} name`}
                  maxLength={200}
                  data-testid="build-around-custom"
                />
              </label>
            </div>
          )}
        </div>

        <div className="border-t border-[color:var(--earn-border)] px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <p className="mb-4 font-mono text-[11px] leading-5 text-[color:var(--earn-muted)]">
            Optimization is a paid step — you confirm here before anything runs or is charged.
          </p>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              data-testid="build-around-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="bg-[var(--earn-coral-ink)] text-white hover:bg-[var(--earn-coral-ink)] hover:brightness-95"
              data-testid="build-around-confirm"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedName
                ? `Generate 3 versions around ${selectedName}`
                : "Generate 3 versions"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}