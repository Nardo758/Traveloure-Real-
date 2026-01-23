import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  Check,
  MapPin,
  Plane,
  Users,
  DollarSign,
  Sun,
  Home,
  Bed,
  Star,
  Clock,
  Activity,
  Zap,
  Heart,
  Cloud,
  Car,
  Wine,
  Music,
  ChefHat,
  Sparkles,
  CalendarCheck,
  Lock,
  Leaf,
  Wand2,
  Palette,
  ClipboardList,
  Wrench,
  Calendar,
  CheckCircle,
  XCircle,
  BadgeCheck,
  CreditCard,
  Award,
  Scale,
  Camera,
  Armchair,
  Shirt,
  Flower2,
  Gift,
  Route,
  Layout,
  Building,
  DoorClosed,
  Bus,
} from "lucide-react";

interface FilterOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  icon?: string;
  minValue?: string;
  maxValue?: string;
}

interface Filter {
  id: string;
  name: string;
  slug: string;
  description?: string;
  filterType: string;
  icon?: string;
  options: FilterOption[];
}

interface Tab {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  filters: Filter[];
}

interface TemplateFiltersPanelProps {
  experienceTypeId: string;
  activeTab: string;
  selectedFilters: Record<string, string | string[]>;
  onFilterChange: (filterId: string, value: string | string[]) => void;
  onClearFilters: () => void;
}

const iconMap: Record<string, any> = {
  MapPin, Plane, Users, DollarSign, Sun, Home, Bed, Star, Clock, Activity, Zap, Heart,
  Cloud, Car, Wine, Music, ChefHat, Sparkles, CalendarCheck, Lock, Leaf, Wand2, Palette,
  ClipboardList, Wrench, Calendar, CheckCircle, XCircle, BadgeCheck, CreditCard, Award,
  Scale, Camera, Armchair, Shirt, Flower2, Gift, Route, Layout, Building, DoorClosed, Bus,
};

function getIcon(iconName?: string) {
  if (!iconName) return SlidersHorizontal;
  return iconMap[iconName] || SlidersHorizontal;
}

export function TemplateFiltersPanel({
  experienceTypeId,
  activeTab,
  selectedFilters,
  onFilterChange,
  onClearFilters,
}: TemplateFiltersPanelProps) {
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set());

  const { data: tabs, isLoading: tabsLoading } = useQuery<Tab[]>({
    queryKey: [`/api/experience-types/${experienceTypeId}/tabs`],
    enabled: !!experienceTypeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: universalFilters, isLoading: universalLoading } = useQuery<Filter[]>({
    queryKey: [`/api/experience-types/${experienceTypeId}/universal-filters`],
    enabled: !!experienceTypeId,
    staleTime: 5 * 60 * 1000,
  });

  const currentTab = useMemo(() => {
    return tabs?.find(tab => tab.slug === activeTab);
  }, [tabs, activeTab]);

  const toggleFilter = (filterId: string) => {
    setExpandedFilters(prev => {
      const next = new Set(prev);
      if (next.has(filterId)) {
        next.delete(filterId);
      } else {
        next.add(filterId);
      }
      return next;
    });
  };

  const handleSingleSelect = (filterSlug: string, value: string) => {
    const current = selectedFilters[filterSlug];
    if (current === value) {
      onFilterChange(filterSlug, "");
    } else {
      onFilterChange(filterSlug, value);
    }
  };

  const handleMultiSelect = (filterSlug: string, value: string) => {
    const current = selectedFilters[filterSlug] as string[] || [];
    if (current.includes(value)) {
      onFilterChange(filterSlug, current.filter(v => v !== value));
    } else {
      onFilterChange(filterSlug, [...current, value]);
    }
  };

  const handleToggle = (filterSlug: string, checked: boolean) => {
    onFilterChange(filterSlug, checked ? "true" : "");
  };

  const activeFiltersCount = useMemo(() => {
    return Object.values(selectedFilters).filter(v => {
      if (Array.isArray(v)) return v.length > 0;
      return !!v;
    }).length;
  }, [selectedFilters]);

  if (tabsLoading || universalLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!tabs || tabs.length === 0) {
    return null;
  }

  const filtersToRender = currentTab?.filters || [];
  const allFilters = [...filtersToRender, ...(universalFilters || [])];

  if (allFilters.length === 0) {
    return null;
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFiltersCount}
              </Badge>
            )}
          </CardTitle>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {currentTab?.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {currentTab.description}
          </p>
        )}
      </CardHeader>
      <ScrollArea className="h-[calc(100%-80px)]">
        <CardContent className="space-y-3 pr-4">
          {filtersToRender.map((filter) => (
            <FilterSection
              key={filter.id}
              filter={filter}
              isExpanded={expandedFilters.has(filter.id)}
              onToggle={() => toggleFilter(filter.id)}
              selectedValue={selectedFilters[filter.slug]}
              onSingleSelect={(v) => handleSingleSelect(filter.slug, v)}
              onMultiSelect={(v) => handleMultiSelect(filter.slug, v)}
              onToggleFilter={(checked) => handleToggle(filter.slug, checked)}
            />
          ))}
          
          {universalFilters && universalFilters.length > 0 && (
            <>
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  Universal Filters
                </p>
              </div>
              {universalFilters.map((filter) => (
                <FilterSection
                  key={filter.id}
                  filter={filter}
                  isExpanded={expandedFilters.has(filter.id)}
                  onToggle={() => toggleFilter(filter.id)}
                  selectedValue={selectedFilters[filter.slug]}
                  onSingleSelect={(v) => handleSingleSelect(filter.slug, v)}
                  onMultiSelect={(v) => handleMultiSelect(filter.slug, v)}
                  onToggleFilter={(checked) => handleToggle(filter.slug, checked)}
                />
              ))}
            </>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

interface FilterSectionProps {
  filter: Filter;
  isExpanded: boolean;
  onToggle: () => void;
  selectedValue?: string | string[];
  onSingleSelect: (value: string) => void;
  onMultiSelect: (value: string) => void;
  onToggleFilter: (checked: boolean) => void;
}

function FilterSection({
  filter,
  isExpanded,
  onToggle,
  selectedValue,
  onSingleSelect,
  onMultiSelect,
  onToggleFilter,
}: FilterSectionProps) {
  const IconComponent = getIcon(filter.icon);
  const selectedCount = Array.isArray(selectedValue) 
    ? selectedValue.length 
    : selectedValue ? 1 : 0;

  if (filter.filterType === "toggle") {
    const isChecked = selectedValue === "true";
    return (
      <div className="flex items-center justify-between py-2 px-1 rounded-md">
        <div className="flex items-center gap-2">
          <IconComponent className="h-4 w-4 text-muted-foreground" />
          <Label 
            htmlFor={`toggle-${filter.id}`}
            className="text-sm font-medium cursor-pointer"
          >
            {filter.name}
          </Label>
        </div>
        <Switch
          id={`toggle-${filter.id}`}
          checked={isChecked}
          onCheckedChange={onToggleFilter}
          data-testid={`toggle-${filter.slug}`}
        />
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-2 h-9 font-medium"
          data-testid={`filter-trigger-${filter.slug}`}
        >
          <div className="flex items-center gap-2">
            <IconComponent className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{filter.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {selectedCount}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-1 px-2">
        {filter.filterType === "single_select" && (
          <RadioGroup
            value={selectedValue as string || ""}
            className="space-y-1"
          >
            {filter.options.map((option) => (
              <div
                key={option.id}
                className="flex items-center gap-2 p-2 rounded-md cursor-pointer"
                onClick={() => onSingleSelect(option.value)}
                data-testid={`option-${filter.slug}-${option.value}`}
              >
                <RadioGroupItem
                  value={option.value}
                  id={`${filter.id}-${option.value}`}
                  className="shrink-0"
                />
                <Label
                  htmlFor={`${filter.id}-${option.value}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {option.label}
                  {option.minValue && option.maxValue && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (${option.minValue}-${option.maxValue})
                    </span>
                  )}
                  {option.minValue && !option.maxValue && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (${option.minValue}+)
                    </span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
        
        {filter.filterType === "multi_select" && (
          <div className="space-y-1">
            {filter.options.map((option) => {
              const isSelected = Array.isArray(selectedValue) && selectedValue.includes(option.value);
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 p-2 rounded-md cursor-pointer"
                  onClick={() => onMultiSelect(option.value)}
                  data-testid={`option-${filter.slug}-${option.value}`}
                >
                  <Checkbox
                    id={`${filter.id}-${option.value}`}
                    checked={isSelected}
                    className="shrink-0"
                  />
                  <Label
                    htmlFor={`${filter.id}-${option.value}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </div>
        )}
        
        {filter.filterType === "range" && filter.options.length >= 2 && (
          <div className="px-2 py-3">
            <Slider
              min={parseInt(filter.options[0].minValue || "0")}
              max={parseInt(filter.options[filter.options.length - 1].maxValue || "1000")}
              step={50}
              value={[parseInt(selectedValue as string || "0")]}
              onValueChange={([v]) => onSingleSelect(v.toString())}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>${filter.options[0].minValue || "0"}</span>
              <span>${filter.options[filter.options.length - 1].maxValue || "1000+"}</span>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function useTemplateFilters() {
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string | string[]>>({});

  const handleFilterChange = (filterId: string, value: string | string[]) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterId]: value,
    }));
  };

  const clearFilters = () => {
    setSelectedFilters({});
  };

  return {
    selectedFilters,
    onFilterChange: handleFilterChange,
    onClearFilters: clearFilters,
  };
}
