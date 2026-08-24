import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface PricingRule {
  id: string;
  label: string;
  adjustment: number;
  enabled: boolean;
}

const DEFAULT_RULES: PricingRule[] = [
  { id: "early", label: "Early Morning (before 8 AM)", adjustment: 50, enabled: false },
  { id: "late", label: "Late Night (after 9 PM)", adjustment: 30, enabled: false },
  { id: "weekend", label: "Weekend Premium", adjustment: 20, enabled: false },
  { id: "peak", label: "Peak Season", adjustment: 25, enabled: false },
  { id: "offpeak", label: "Off-Peak Discount", adjustment: -25, enabled: false },
  { id: "lastmin", label: "Last-Minute (within 24h)", adjustment: -30, enabled: false },
  { id: "gapfill", label: "Gap-Fill Bonus", adjustment: 10, enabled: false },
];

export function DynamicPricingEditor({
  rules: initialRules,
  onChange,
  basePrice = 0,
}: {
  rules?: PricingRule[];
  onChange?: (rules: PricingRule[]) => void;
  basePrice?: number;
}) {
  const [rules, setRules] = useState<PricingRule[]>(initialRules || DEFAULT_RULES);

  const handleToggle = (id: string) => {
    const updated = rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    onChange?.(updated);
  };

  const handleAdjustment = (id: string, value: number) => {
    const updated = rules.map((r) => r.id === id ? { ...r, adjustment: value } : r);
    setRules(updated);
    onChange?.(updated);
  };

  const activeRules = rules.filter((r) => r.enabled);
  const minAdj = activeRules.filter((r) => r.adjustment < 0).reduce((s, r) => s + r.adjustment, 0);
  const maxAdj = activeRules.filter((r) => r.adjustment > 0).reduce((s, r) => s + r.adjustment, 0);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Dynamic Pricing Rules</h4>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
            <div className="flex items-center gap-2.5">
              <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule.id)} />
              <span className="text-xs">{rule.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{rule.adjustment >= 0 ? "+" : ""}$</span>
              <Input
                type="number"
                value={rule.adjustment}
                onChange={(e) => handleAdjustment(rule.id, parseInt(e.target.value) || 0)}
                className="w-16 h-7 text-xs text-center"
                disabled={!rule.enabled}
              />
            </div>
          </div>
        ))}
      </div>
      {basePrice > 0 && (
        <div className="text-xs text-muted-foreground bg-background rounded-lg p-2.5">
          Price range: ${basePrice + minAdj} – ${basePrice + maxAdj} (base: ${basePrice})
        </div>
      )}
    </div>
  );
}
