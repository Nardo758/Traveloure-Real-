// Single compact, horizontal filter surface for experience-template tabs.
// Replaces the prior split surfaces (the lean SelectionControlsPanel chips +
// the separate Sort row + the inert TemplateFiltersPanel facet wall) with ONE
// bar per tab: the tab's seeded selection controls + Sort, no section headers.
//
// Extended in #35 to support:
//   rangeControls     — price slider / numeric range (one value per control)
//   singleSelectControls — single-choice chips (stops, star rating)
//
// Selection controls stay as toggle chips (they are multi-select — e.g. the
// vendor-focus union — which a single dropdown can't express); Sort is a true
// dropdown. Chip test ids (selection-<control>-<option>, selection-clear) are
// preserved so the existing narrow/parity/tab-isolation DOM checks keep working.
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { SelectionControl } from "@shared/selection-controls";

export interface SortOption {
  value: string;
  label: string;
}

export interface RangeControl {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Formats the current value for display — e.g. (v) => `$${v.toLocaleString()}` */
  format?: (value: number) => string;
}

export interface SingleSelectControl {
  id: string;
  label: string;
  options: { value: string; label: string }[];
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
  /** Optional numeric range sliders (e.g. max price). */
  rangeControls?: RangeControl[];
  /** rangeControlId -> current value */
  rangeValues?: Record<string, number>;
  onRangeChange?: (controlId: string, value: number) => void;
  /** Optional single-select chip groups (e.g. stops, star rating). */
  singleSelectControls?: SingleSelectControl[];
  /** singleSelectControlId -> selected value */
  singleSelectValues?: Record<string, string>;
  onSingleSelectChange?: (controlId: string, value: string) => void;
  /** Extra filter controls rendered inline before Sort By. */
  additionalFilters?: React.ReactNode;
}

export function CompactFilterBar({
  controls,
  selected,
  onToggle,
  onClear,
  sortValue,
  onSortChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
  rangeControls = [],
  rangeValues = {},
  onRangeChange,
  singleSelectControls = [],
  singleSelectValues = {},
  onSingleSelectChange,
  additionalFilters,
}: CompactFilterBarProps) {
  const hasSelection = Object.values(selected).some((v) => v.length > 0);

  const hasSingleSelectSelection = singleSelectControls.some((ctrl) => {
    const val = singleSelectValues[ctrl.id];
    const defaultOpt = ctrl.options[0]?.value;
    return val !== undefined && val !== defaultOpt;
  });

  const showClear = hasSelection || hasSingleSelectSelection;

  return (
    <Card className="mb-6" data-testid="filter-bar">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">

          {/* Multi-select toggle chip groups (selection controls) */}
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
                      className={`h-8 ${active ? "bg-primary hover:bg-primary" : ""}`}
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

          {/* Single-select chip groups (e.g. stops, star rating) */}
          {singleSelectControls.map((ctrl) => {
            const current = singleSelectValues[ctrl.id] ?? ctrl.options[0]?.value ?? "";
            return (
              <div key={ctrl.id} className="min-w-[140px]">
                <Label className="text-xs font-medium text-muted-foreground">{ctrl.label}</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ctrl.options.map((opt) => {
                    const active = current === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        variant={active ? "default" : "outline"}
                        size="sm"
                        className={`h-8 ${active ? "bg-primary hover:bg-primary" : ""}`}
                        onClick={() => onSingleSelectChange?.(ctrl.id, opt.value)}
                        data-testid={`filter-${ctrl.id}-${opt.value}`}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Range slider controls (e.g. max price) */}
          {rangeControls.map((ctrl) => {
            const val = rangeValues[ctrl.id] ?? ctrl.max;
            const displayVal = ctrl.format ? ctrl.format(val) : String(val);
            return (
              <div key={ctrl.id} className="min-w-[180px]">
                <Label className="text-xs font-medium text-muted-foreground">
                  {ctrl.label}: <span className="text-foreground font-semibold">{displayVal}</span>
                </Label>
                <Slider
                  value={[val]}
                  onValueChange={([v]) => onRangeChange?.(ctrl.id, v)}
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  className="mt-2 w-[180px]"
                  data-testid={`slider-${ctrl.id}`}
                />
              </div>
            );
          })}

          {additionalFilters}

          {/* Sort — always present */}
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

          {showClear && (
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
