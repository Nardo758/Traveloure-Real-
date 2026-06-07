// Single compact, horizontal filter surface for experience-template tabs.
// Replaces the prior split surfaces (the lean SelectionControlsPanel chips +
// the separate Sort row + the inert TemplateFiltersPanel facet wall) with ONE
// bar per tab: the tab's seeded selection controls + Sort, no section headers.
//
// Reusable by design so flights/hotels (still on their own Block A Collapsible)
// can adopt it later as a separate, tested change.
//
// Selection controls stay as toggle chips (they are multi-select — e.g. the
// vendor-focus union — which a single dropdown can't express); Sort is a true
// dropdown. Chip test ids (selection-<control>-<option>, selection-clear) are
// preserved so the existing narrow/parity/tab-isolation DOM checks keep working.
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SelectionControl } from "@shared/selection-controls";

export interface SortOption {
  value: string;
  label: string;
}

const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { value: "popular", label: "Most Popular" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "rating", label: "Highest Rated" },
];

interface CompactFilterBarProps {
  /** Tab's seeded selection controls (may be empty — bar still shows Sort). */
  controls: SelectionControl[];
  /** controlId -> selected optionIds */
  selected: Record<string, string[]>;
  onToggle: (control: SelectionControl, optionId: string) => void;
  onClear: () => void;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions?: SortOption[];
}

export function CompactFilterBar({
  controls,
  selected,
  onToggle,
  onClear,
  sortValue,
  onSortChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
}: CompactFilterBarProps) {
  const hasSelection = Object.values(selected).some((v) => v.length > 0);

  return (
    <Card className="mb-6" data-testid="filter-bar">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {controls.map((control) => (
            <div key={control.id} className="min-w-[140px]">
              <Label className="text-xs font-medium text-muted-foreground">{control.label}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {control.options.map((opt) => {
                  const active = (selected[control.id] ?? []).includes(opt.id);
                  return (
                    <Button
                      key={opt.id}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={`h-8 ${active ? "bg-[#FF385C] hover:bg-[#FF385C]" : ""}`}
                      onClick={() => onToggle(control, opt.id)}
                      data-testid={`selection-${control.id}-${opt.id}`}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sort — always present (the only working sort dimension for these tabs). */}
          <div className="min-w-[160px]">
            <Label className="text-xs font-medium text-muted-foreground">Sort By</Label>
            <Select value={sortValue} onValueChange={onSortChange}>
              <SelectTrigger className="h-8 mt-1.5 w-[180px]" data-testid="select-template-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasSelection && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={onClear}
              data-testid="selection-clear"
            >
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
