/**
 * CN-1b-UI (ledger `2026-11-01-cn1b-ui-concierge-fields`): a concierge listing's own fields on the listing form — the
 * per-trip price unit, response hours, and the task picker with optional caps.
 *
 * The task list is the admin's (`GET /api/concierge-task-kinds`). Stays and transport are links only, so the picker
 * never offers them. The lines under the fields are CN-1's `listing.price.perTrip` and `listing.responseHours`
 * (`shared/cn1-copy.ts`, pending Leon); every other word here is a HELD placeholder (`CN1B_HELD_COPY`). No traveler
 * fee is shown.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { conciergeResponseHoursLine } from "@shared/cn1-copy";
import {
  CN1B_HELD_COPY,
  admitConciergeCap,
  pickableConciergeKinds,
  type ConciergeTaskKindOption,
  type ConciergeTaskPickForm,
} from "@/lib/concierge-listing-form";

export function ConciergeListingFields(props: {
  perTrip: boolean;
  onPerTrip: (on: boolean) => void;
  responseHours: string;
  onResponseHours: (value: string) => void;
  /** False when the async fields above already ask for the same response window. */
  showResponseHours: boolean;
  kinds: ReadonlyArray<ConciergeTaskKindOption>;
  tasks: ReadonlyArray<ConciergeTaskPickForm>;
  onTasks: (next: ConciergeTaskPickForm[]) => void;
}) {
  const picked = new Map(props.tasks.map((t) => [t.taskKindKey, t]));
  const hours = Number(props.responseHours);
  const hoursLine = Number.isInteger(hours) && hours > 0 ? conciergeResponseHoursLine(hours) : null;

  const toggle = (id: string, on: boolean) => {
    const rest = props.tasks.filter((t) => t.taskKindKey !== id);
    props.onTasks(on ? [...rest, { taskKindKey: id, cap: "" }] : rest);
  };
  const setCap = (id: string, cap: string) => {
    props.onTasks(props.tasks.map((t) => (t.taskKindKey === id ? { ...t, cap } : t)));
  };

  return (
    <div className="space-y-4 mt-3" data-testid="concierge-listing-fields">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="conciergePerTrip">{CN1B_HELD_COPY.perTripToggle}</Label>
        <Switch id="conciergePerTrip" checked={props.perTrip} onCheckedChange={props.onPerTrip} data-testid="switch-concierge-per-trip" />
      </div>

      {props.showResponseHours ? (
        <div>
          <Label htmlFor="conciergeResponseHours">{CN1B_HELD_COPY.responseHoursLabel}</Label>
          <Input
            id="conciergeResponseHours"
            type="number"
            min={1}
            step={1}
            value={props.responseHours}
            onChange={(e) => props.onResponseHours(e.target.value)}
            className="mt-1"
            data-testid="input-concierge-response-hours"
          />
          {hoursLine ? (
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-concierge-response-hours">
              {hoursLine}
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset data-testid="concierge-task-picker">
        <legend className="text-sm font-medium">{CN1B_HELD_COPY.tasksHeading}</legend>
        <div className="mt-2 space-y-2">
          {pickableConciergeKinds(props.kinds).map((kind) => {
            const pick = picked.get(kind.id);
            const capBad = pick ? !admitConciergeCap(pick.cap).ok : false;
            return (
              <div key={kind.id} className="flex items-center gap-3" data-testid={`concierge-task-${kind.id}`}>
                <Checkbox
                  id={`concierge-task-${kind.id}-on`}
                  checked={!!pick}
                  onCheckedChange={(on) => toggle(kind.id, on === true)}
                  data-testid={`checkbox-concierge-task-${kind.id}`}
                />
                <Label htmlFor={`concierge-task-${kind.id}-on`} className="flex-1">
                  {kind.label}
                </Label>
                {pick ? (
                  <Input
                    aria-label={`${CN1B_HELD_COPY.capLabel}: ${kind.label}`}
                    type="number"
                    min={1}
                    step={1}
                    placeholder={CN1B_HELD_COPY.capPlaceholder}
                    value={pick.cap}
                    onChange={(e) => setCap(kind.id, e.target.value)}
                    className={`w-24 ${capBad ? "border-destructive" : ""}`}
                    data-testid={`input-concierge-cap-${kind.id}`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
