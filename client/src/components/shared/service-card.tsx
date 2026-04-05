import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function ServiceCard({
  name, price, bookings, active, onToggle, onEdit, onDelete,
}: {
  name: string; price: number; bookings: number; active: boolean;
  onToggle?: () => void; onEdit?: () => void; onDelete?: () => void;
}) {
  return (
    <div className={`flex justify-between items-center bg-secondary rounded-lg px-3.5 py-2.5 ${!active ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Switch checked={active} onCheckedChange={onToggle} />
        <span className="text-xs font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-muted-foreground">{bookings} bookings</span>
        <span className="font-semibold">${price}</span>
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}
