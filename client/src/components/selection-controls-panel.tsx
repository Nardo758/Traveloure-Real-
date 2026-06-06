// P462 reconcile (Phase 3 UI) — renders the lean, per-tab selection controls
// that replace the (inert) facet wall. Selecting options drives the real #462
// working keys via resolveSelectionsToFilterQuery in the parent page.
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { SelectionControl } from "@shared/selection-controls";

interface SelectionControlsPanelProps {
  controls: SelectionControl[];
  /** controlId -> selected optionIds */
  selected: Record<string, string[]>;
  onToggle: (control: SelectionControl, optionId: string) => void;
  onClear: () => void;
}

export function SelectionControlsPanel({ controls, selected, onToggle, onClear }: SelectionControlsPanelProps) {
  if (!controls || controls.length === 0) return null;
  const hasSelection = Object.values(selected).some((v) => v.length > 0);

  return (
    <Card className="mb-6" data-testid="selection-controls-panel">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-6">
          {controls.map((control) => (
            <div key={control.id} className="min-w-[200px]">
              <Label className="text-sm font-medium">{control.label}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {control.options.map((opt) => {
                  const active = (selected[control.id] ?? []).includes(opt.id);
                  return (
                    <Button
                      key={opt.id}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() => onToggle(control, opt.id)}
                      className={active ? "bg-[#FF385C] hover:bg-[#FF385C]" : ""}
                      data-testid={`selection-${control.id}-${opt.id}`}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {hasSelection && (
          <Button variant="ghost" size="sm" onClick={onClear} data-testid="selection-clear">
            Clear
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
