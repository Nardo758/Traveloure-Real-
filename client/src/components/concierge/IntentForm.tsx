/**
 * Concierge IntentForm (CON-A.P6 / D1).
 *
 * Free-text intent + chips (eventType, destination, party size). Submit triggers
 * a server-side route through /api/concierge/quote, returning prices for each
 * delivery tier. Guest-reachable — no auth required (D6).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";

export interface IntentSubmission {
  intent: string;
  eventType?: string;
  destination?: string;
  partySize?: number;
}

// Event types align with the AI Concierge fee config (FEE-A) — wedding/proposal/
// corporate trigger the $49.99 override; the rest fall back to the $9.99 standard.
const EVENT_TYPE_OPTIONS = [
  { value: "vacation", label: "Vacation / travel" },
  { value: "wedding", label: "Wedding" },
  { value: "proposal", label: "Proposal" },
  { value: "corporate", label: "Corporate" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "anniversary", label: "Anniversary" },
  { value: "birthday", label: "Birthday" },
  { value: "other", label: "Other" },
];

export function IntentForm({
  defaultIntent = "",
  defaultEventType,
  loading = false,
  onSubmit,
}: {
  defaultIntent?: string;
  defaultEventType?: string;
  loading?: boolean;
  onSubmit: (submission: IntentSubmission) => void;
}) {
  const [intent, setIntent] = useState(defaultIntent);
  const [eventType, setEventType] = useState<string | undefined>(defaultEventType);
  const [destination, setDestination] = useState("");
  const [partySize, setPartySize] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intent.trim()) return;
    onSubmit({
      intent: intent.trim(),
      eventType: eventType || undefined,
      destination: destination.trim() || undefined,
      partySize: partySize ? Math.max(1, parseInt(partySize, 10) || 1) : undefined,
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          What do you want to plan?
        </CardTitle>
        <CardDescription>
          Tell us in your own words. We'll price options across AI, expert, and full-service —
          before you commit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="concierge-intent">Your request</Label>
            <Textarea
              id="concierge-intent"
              value={intent}
              onChange={e => setIntent(e.target.value)}
              placeholder="e.g. Plan a 5-day Kyoto trip for two with cherry blossoms and a tea ceremony"
              rows={3}
              required
              data-testid="textarea-concierge-intent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="concierge-event-type">Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="concierge-event-type" data-testid="select-concierge-event-type">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="concierge-destination">Destination</Label>
              <Input
                id="concierge-destination"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="e.g. Kyoto"
                data-testid="input-concierge-destination"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="concierge-party-size">Party size</Label>
              <Input
                id="concierge-party-size"
                type="number"
                min={1}
                value={partySize}
                onChange={e => setPartySize(e.target.value)}
                placeholder="2"
                data-testid="input-concierge-party-size"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !intent.trim()}
            data-testid="button-concierge-submit"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? "Pricing options…" : "Show me options"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
