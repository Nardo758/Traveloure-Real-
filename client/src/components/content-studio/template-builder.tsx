import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface TemplateBuilderProps {
  contentType: string;
  content: string;
  onChange: (content: string) => void;
}

interface PackingItem {
  category: string;
  items: string[];
}

interface BudgetItem {
  category: string;
  estimated: string;
  notes: string;
}

interface DayActivity {
  time: string;
  activity: string;
  notes: string;
}

function PackingListBuilder({ data, onUpdate }: { data: PackingItem[]; onUpdate: (d: PackingItem[]) => void }) {
  const addCategory = () => onUpdate([...data, { category: "New Category", items: [] }]);
  const removeCategory = (i: number) => onUpdate(data.filter((_, idx) => idx !== i));
  const updateCategory = (i: number, name: string) => {
    const updated = [...data];
    updated[i] = { ...updated[i], category: name };
    onUpdate(updated);
  };
  const addItem = (i: number) => {
    const updated = [...data];
    updated[i] = { ...updated[i], items: [...updated[i].items, ""] };
    onUpdate(updated);
  };
  const updateItem = (ci: number, ii: number, val: string) => {
    const updated = [...data];
    updated[ci].items[ii] = val;
    onUpdate(updated);
  };
  const removeItem = (ci: number, ii: number) => {
    const updated = [...data];
    updated[ci].items = updated[ci].items.filter((_, idx) => idx !== ii);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      {data.map((cat, ci) => (
        <div key={ci} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-gray-400" />
            <Input
              value={cat.category}
              onChange={(e) => updateCategory(ci, e.target.value)}
              className="font-medium"
              placeholder="Category name"
              data-testid={`input-packing-category-${ci}`}
            />
            <Button variant="ghost" size="sm" onClick={() => removeCategory(ci)} type="button">
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
          <div className="space-y-2 pl-6">
            {cat.items.map((item, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={(e) => updateItem(ci, ii, e.target.value)}
                  placeholder="Item name"
                  className="text-sm"
                  data-testid={`input-packing-item-${ci}-${ii}`}
                />
                <Button variant="ghost" size="sm" onClick={() => removeItem(ci, ii)} type="button">
                  <Trash2 className="w-3 h-3 text-gray-400" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(ci)} type="button">
              <Plus className="w-3 h-3 mr-1" /> Add Item
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={addCategory} type="button" data-testid="button-add-packing-category">
        <Plus className="w-4 h-4 mr-2" /> Add Category
      </Button>
    </div>
  );
}

function BudgetBreakdownBuilder({ data, onUpdate }: { data: BudgetItem[]; onUpdate: (d: BudgetItem[]) => void }) {
  const addRow = () => onUpdate([...data, { category: "", estimated: "", notes: "" }]);
  const removeRow = (i: number) => onUpdate(data.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof BudgetItem, val: string) => {
    const updated = [...data];
    updated[i] = { ...updated[i], [field]: val };
    onUpdate(updated);
  };
  const total = data.reduce((sum, r) => sum + (parseFloat(r.estimated) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm font-medium text-gray-600 px-1">
        <span>Category</span>
        <span>Estimated ($)</span>
        <span>Notes</span>
      </div>
      {data.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 items-center">
          <Input
            value={row.category}
            onChange={(e) => updateRow(i, "category", e.target.value)}
            placeholder="e.g., Flights"
            data-testid={`input-budget-category-${i}`}
          />
          <Input
            type="number"
            value={row.estimated}
            onChange={(e) => updateRow(i, "estimated", e.target.value)}
            placeholder="0.00"
            data-testid={`input-budget-amount-${i}`}
          />
          <div className="flex gap-1">
            <Input
              value={row.notes}
              onChange={(e) => updateRow(i, "notes", e.target.value)}
              placeholder="Notes"
              data-testid={`input-budget-notes-${i}`}
            />
            <Button variant="ghost" size="sm" onClick={() => removeRow(i)} type="button">
              <Trash2 className="w-3 h-3 text-gray-400" />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="outline" size="sm" onClick={addRow} type="button" data-testid="button-add-budget-row">
          <Plus className="w-4 h-4 mr-2" /> Add Row
        </Button>
        <p className="text-sm font-medium">Total: ${total.toFixed(2)}</p>
      </div>
    </div>
  );
}

function DayItineraryBuilder({ data, onUpdate }: { data: DayActivity[]; onUpdate: (d: DayActivity[]) => void }) {
  const addActivity = () => onUpdate([...data, { time: "", activity: "", notes: "" }]);
  const removeActivity = (i: number) => onUpdate(data.filter((_, idx) => idx !== i));
  const updateActivity = (i: number, field: keyof DayActivity, val: string) => {
    const updated = [...data];
    updated[i] = { ...updated[i], [field]: val };
    onUpdate(updated);
  };

  return (
    <div className="space-y-3">
      {data.map((act, i) => (
        <div key={i} className="flex gap-3 items-start border rounded-lg p-3">
          <Input
            value={act.time}
            onChange={(e) => updateActivity(i, "time", e.target.value)}
            placeholder="9:00 AM"
            className="w-28 shrink-0"
            data-testid={`input-day-time-${i}`}
          />
          <div className="flex-1 space-y-2">
            <Input
              value={act.activity}
              onChange={(e) => updateActivity(i, "activity", e.target.value)}
              placeholder="Activity name"
              data-testid={`input-day-activity-${i}`}
            />
            <Textarea
              value={act.notes}
              onChange={(e) => updateActivity(i, "notes", e.target.value)}
              placeholder="Notes, tips, or details..."
              rows={2}
              className="text-sm resize-none"
              data-testid={`input-day-notes-${i}`}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => removeActivity(i)} type="button">
            <Trash2 className="w-4 h-4 text-gray-400" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={addActivity} type="button" data-testid="button-add-day-activity">
        <Plus className="w-4 h-4 mr-2" /> Add Activity
      </Button>
    </div>
  );
}

export function TemplateBuilder({ contentType, content, onChange }: TemplateBuilderProps) {
  const parseContent = () => {
    try {
      return content ? JSON.parse(content) : null;
    } catch {
      return null;
    }
  };

  const [data, setData] = useState<any>(() => {
    const parsed = parseContent();
    if (parsed) return parsed;
    if (contentType === "packing-list") return [{ category: "Clothing", items: ["T-shirts", "Pants"] }];
    if (contentType === "budget-breakdown") return [{ category: "Flights", estimated: "500", notes: "" }];
    if (contentType === "day-itinerary") return [{ time: "9:00 AM", activity: "Check-in", notes: "" }];
    return [];
  });

  useEffect(() => {
    onChange(JSON.stringify(data));
  }, [data]);

  const labels: Record<string, string> = {
    "packing-list": "Packing List",
    "budget-breakdown": "Budget Breakdown",
    "day-itinerary": "Day Itinerary",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Label className="text-base font-medium">{labels[contentType] || "Template"}</Label>
      </div>
      {contentType === "packing-list" && (
        <PackingListBuilder data={data} onUpdate={setData} />
      )}
      {contentType === "budget-breakdown" && (
        <BudgetBreakdownBuilder data={data} onUpdate={setData} />
      )}
      {contentType === "day-itinerary" && (
        <DayItineraryBuilder data={data} onUpdate={setData} />
      )}
    </div>
  );
}
