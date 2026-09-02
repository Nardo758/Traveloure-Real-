/**
 * ClaimCaptureForm — the four-prompt capture for one claimed neighborhood (expert field knowledge
 * v2, Phase 1). Shared by the onboarding step, the console Neighborhoods panel and the ops
 * manual-entry form, so every path writes the same shape.
 *
 * Copy is the companion file's (shared/neighborhood-claims.ts CLAIM_PROMPTS) — never paraphrased.
 * Vocabulary rule: the expert sees "Show us {neighborhood}", "claimed" and "verified"; nothing here
 * mentions grading of any kind.
 */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  ACCESS_TYPES,
  CAPTURE_SHAPE,
  CLAIM_PROMPTS,
  CONTINGENCY_TRIGGERS,
  CONTINGENCY_TRIGGER_LABELS,
  EXPERT_CONFIDENCE,
  EXPERT_CONFIDENCE_LABELS,
  HARD_CONSTRAINT_KINDS,
  HARD_CONSTRAINT_LABELS,
  PRICE_BANDS,
  TRANSITION_MODES,
  claimCaptureSubmitSchema,
  type Daypart,
} from "@shared/neighborhood-claims";

// ── Draft shape (strings while typing; numbers/nulls only at submit) ──────────────────────────

export type P2ItemDraft = { name: string; durationMin: string; transition: { mode: string; minutes: string } | null };
export type P1Draft = {
  name: string;
  category: string;
  doThis: string;
  when: { hours: string; days: string; season: string };
  watchOut: string;
  priceBand: string;
  expertConfidence: string;
};
export type P2Draft = { items: P2ItemDraft[]; orderReason: string; hardConstraints: { kind: string; detail: string }[] };
export type P3Draft = { trigger: string; replacesPosition: string; alternate: P2ItemDraft; reason: string };
export type P4Draft = { venue: string; accessType: string; relationshipBasis: string };
export type CaptureDraft = { p1: P1Draft[]; p2: P2Draft; p3: P3Draft; p4: P4Draft[] };

const emptyP1 = (): P1Draft => ({
  name: "", category: "", doThis: "", when: { hours: "", days: "", season: "" }, watchOut: "", priceBand: "", expertConfidence: "",
});
const emptyItem = (first: boolean): P2ItemDraft => ({ name: "", durationMin: "", transition: first ? null : { mode: "walk", minutes: "" } });

export function emptyCapture(): CaptureDraft {
  return {
    p1: [emptyP1(), emptyP1()],
    p2: { items: [emptyItem(true), emptyItem(false), emptyItem(false)], orderReason: "", hardConstraints: [{ kind: "", detail: "" }] },
    p3: { trigger: "", replacesPosition: "", alternate: emptyItem(false), reason: "" },
    p4: [],
  };
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function itemFromStored(v: any, first: boolean): P2ItemDraft {
  const t = v?.transition;
  return {
    name: str(v?.name),
    durationMin: str(v?.durationMin),
    transition: first ? null : { mode: str(t?.mode) || "walk", minutes: str(t?.minutes) },
  };
}

/** Rehydrate whatever the server stored (a loose draft or a last-submitted capture) into the draft shape. */
export function fromStoredDraft(v: unknown): CaptureDraft {
  const base = emptyCapture();
  if (!v || typeof v !== "object") return base;
  const o = v as any;
  const p1 = Array.isArray(o.p1) && o.p1.length > 0
    ? o.p1.slice(0, CAPTURE_SHAPE.p1Max).map((e: any) => ({
        name: str(e?.name), category: str(e?.category), doThis: str(e?.doThis),
        when: { hours: str(e?.when?.hours), days: str(e?.when?.days), season: str(e?.when?.season) },
        watchOut: str(e?.watchOut), priceBand: str(e?.priceBand), expertConfidence: str(e?.expertConfidence),
      }))
    : base.p1;
  while (p1.length < CAPTURE_SHAPE.p1Min) p1.push(emptyP1());
  const p2Items = Array.isArray(o.p2?.items) ? o.p2.items : [];
  const p2: P2Draft = {
    items: Array.from({ length: CAPTURE_SHAPE.p2Items }, (_, i) => (p2Items[i] ? itemFromStored(p2Items[i], i === 0) : emptyItem(i === 0))),
    orderReason: str(o.p2?.orderReason),
    hardConstraints: Array.isArray(o.p2?.hardConstraints) && o.p2.hardConstraints.length > 0
      ? o.p2.hardConstraints.map((h: any) => ({ kind: str(h?.kind), detail: str(h?.detail) }))
      : base.p2.hardConstraints,
  };
  const p3: P3Draft = {
    trigger: str(o.p3?.trigger),
    replacesPosition: str(o.p3?.replacesPosition),
    alternate: o.p3?.alternate ? itemFromStored(o.p3.alternate, false) : emptyItem(false),
    reason: str(o.p3?.reason),
  };
  const p4: P4Draft[] = Array.isArray(o.p4)
    ? o.p4.map((a: any) => ({ venue: str(a?.venue), accessType: str(a?.accessType), relationshipBasis: str(a?.relationshipBasis) }))
    : [];
  return { p1, p2, p3, p4 };
}

const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));
const itemToPayload = (it: P2ItemDraft, first: boolean) => ({
  name: it.name,
  durationMin: num(it.durationMin),
  transition: first || !it.transition || it.transition.mode === "" ? null : { mode: it.transition.mode, minutes: num(it.transition.minutes) },
});

/** The submit body: numbers parsed, empties → null. The server validates against the same schema. */
export function toSubmitPayload(d: CaptureDraft) {
  return {
    p1: d.p1
      .filter((e) => Object.values({ ...e, when: undefined }).some((v) => typeof v === "string" && v.trim() !== "") || Object.values(e.when).some((v) => v.trim() !== ""))
      .map((e) => ({
        name: e.name, category: e.category, doThis: e.doThis, when: e.when, watchOut: e.watchOut,
        priceBand: e.priceBand === "" ? null : e.priceBand,
        expertConfidence: e.expertConfidence === "" ? null : e.expertConfidence,
      })),
    p2: {
      items: d.p2.items.map((it, i) => itemToPayload(it, i === 0)),
      orderReason: d.p2.orderReason,
      hardConstraints: d.p2.hardConstraints.filter((h) => h.kind !== "" || h.detail.trim() !== ""),
    },
    p3: {
      trigger: d.p3.trigger,
      replacesPosition: d.p3.replacesPosition === "" || d.p3.replacesPosition === "all" ? null : num(d.p3.replacesPosition),
      alternate: itemToPayload(d.p3.alternate, false),
      reason: d.p3.reason,
    },
    p4: d.p4.filter((a) => a.venue.trim() !== "" || a.accessType !== ""),
  };
}

/** Is the draft complete enough to send? Same rule the server applies. */
export function captureCompleteness(d: CaptureDraft): { complete: boolean; firstIssue: string | null } {
  const r = claimCaptureSubmitSchema.safeParse(toSubmitPayload(d));
  if (r.success) return { complete: true, firstIssue: null };
  const i = r.error.errors[0];
  return { complete: false, firstIssue: i ? `${i.path.join(" › ") || "answer"}: ${i.message}` : "Please complete every required answer" };
}

/** True when the expert has typed anything at all (so an untouched form is not saved as a draft). */
export function captureHasContent(d: CaptureDraft): boolean {
  return JSON.stringify(d) !== JSON.stringify(emptyCapture());
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────

interface Props {
  neighborhoodName: string;
  daypart: Daypart;
  value: CaptureDraft;
  onChange: (next: CaptureDraft) => void;
  disabled?: boolean;
  /** Shorter framing for the onboarding step (hides the P4 block unless opened). */
  compact?: boolean;
}

export function ClaimCaptureForm({ neighborhoodName, daypart, value, onChange, disabled, compact }: Props) {
  const set = (patch: Partial<CaptureDraft>) => onChange({ ...value, ...patch });
  const setP1 = (i: number, patch: Partial<P1Draft>) => set({ p1: value.p1.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setItem = (i: number, patch: Partial<P2ItemDraft>) =>
    set({ p2: { ...value.p2, items: value.p2.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } });
  const setHC = (i: number, patch: Partial<{ kind: string; detail: string }>) =>
    set({ p2: { ...value.p2, hardConstraints: value.p2.hardConstraints.map((h, j) => (j === i ? { ...h, ...patch } : h)) } });
  const setP3 = (patch: Partial<P3Draft>) => set({ p3: { ...value.p3, ...patch } });
  const setP4 = (i: number, patch: Partial<P4Draft>) => set({ p4: value.p4.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const inputCls = "mt-1 border-border";

  return (
    <div className="space-y-8" data-testid="claim-capture-form">
      {/* P1 — places */}
      <section className="space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">1. Places</h3>
          <p className="text-sm text-muted-foreground mt-1">{CLAIM_PROMPTS.p1(neighborhoodName)}</p>
        </div>
        {value.p1.map((e, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3" data-testid={`p1-entry-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Place {i + 1}</span>
              {value.p1.length > CAPTURE_SHAPE.p1Min && (
                <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => set({ p1: value.p1.filter((_, j) => j !== i) })} aria-label={`Remove place ${i + 1}`}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input className={inputCls} disabled={disabled} value={e.name} onChange={(ev) => setP1(i, { name: ev.target.value })} placeholder="The place, as a local would say it" />
              </div>
              <div>
                <Label>What kind of place</Label>
                <Input className={inputCls} disabled={disabled} value={e.category} onChange={(ev) => setP1(i, { category: ev.target.value })} placeholder="shrine, izakaya, viewpoint…" />
              </div>
            </div>
            <div>
              <Label>What they should actually do there</Label>
              <Textarea className={inputCls} disabled={disabled} rows={2} value={e.doThis} onChange={(ev) => setP1(i, { doThis: ev.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>When — hour</Label>
                <Input className={inputCls} disabled={disabled} value={e.when.hours} onChange={(ev) => setP1(i, { when: { ...e.when, hours: ev.target.value } })} placeholder="e.g. from 18:00" />
              </div>
              <div>
                <Label>When — day</Label>
                <Input className={inputCls} disabled={disabled} value={e.when.days} onChange={(ev) => setP1(i, { when: { ...e.when, days: ev.target.value } })} placeholder="e.g. not Mondays" />
              </div>
              <div>
                <Label>When — season</Label>
                <Input className={inputCls} disabled={disabled} value={e.when.season} onChange={(ev) => setP1(i, { when: { ...e.when, season: ev.target.value } })} placeholder="e.g. skip mid-July" />
              </div>
            </div>
            <div>
              <Label>The one thing that goes wrong if they don't know it</Label>
              <Textarea className={inputCls} disabled={disabled} rows={2} value={e.watchOut} onChange={(ev) => setP1(i, { watchOut: ev.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Price</Label>
                <Select disabled={disabled} value={e.priceBand || "none"} onValueChange={(v) => setP1(i, { priceBand: v === "none" ? "" : v })}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not sure / free</SelectItem>
                    {PRICE_BANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>How sure are you about this one?</Label>
                <Select disabled={disabled} value={e.expertConfidence || "none"} onValueChange={(v) => setP1(i, { expertConfidence: v === "none" ? "" : v })}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {EXPERT_CONFIDENCE.map((c) => <SelectItem key={c} value={c}>{EXPERT_CONFIDENCE_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
        {value.p1.length < CAPTURE_SHAPE.p1Max && (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ p1: [...value.p1, emptyP1()] })} data-testid="add-p1-entry">
            <Plus className="w-4 h-4 mr-1" /> Add a third place
          </Button>
        )}
      </section>

      {/* P2 — composed daypart */}
      <section className="space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">2. One {daypart.replace("_", " ")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{CLAIM_PROMPTS.p2(neighborhoodName, daypart)}</p>
        </div>
        {value.p2.items.map((it, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3" data-testid={`p2-item-${i}`}>
            <span className="text-sm font-medium text-foreground">Stop {i + 1}</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label>Where</Label>
                <Input className={inputCls} disabled={disabled} value={it.name} onChange={(ev) => setItem(i, { name: ev.target.value })} />
              </div>
              <div>
                <Label>How long (minutes)</Label>
                <Input className={inputCls} disabled={disabled} inputMode="numeric" value={it.durationMin} onChange={(ev) => setItem(i, { durationMin: ev.target.value.replace(/[^0-9]/g, "") })} />
              </div>
            </div>
            {i > 0 && it.transition && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>How you'd get here from stop {i}</Label>
                  <Select disabled={disabled} value={it.transition.mode} onValueChange={(v) => setItem(i, { transition: { ...it.transition!, mode: v } })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{TRANSITION_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Minutes between</Label>
                  <Input className={inputCls} disabled={disabled} inputMode="numeric" value={it.transition.minutes} onChange={(ev) => setItem(i, { transition: { ...it.transition!, minutes: ev.target.value.replace(/[^0-9]/g, "") } })} />
                </div>
              </div>
            )}
          </div>
        ))}
        <div>
          <Label>Why that order and not another</Label>
          <Textarea className={inputCls} disabled={disabled} rows={2} value={value.p2.orderReason} onChange={(ev) => set({ p2: { ...value.p2, orderReason: ev.target.value } })} />
        </div>
        <div className="space-y-2">
          <Label>Anything that can't move — a last entry, a reservation window, a closure day, a last train</Label>
          {value.p2.hardConstraints.map((h, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" data-testid={`p2-constraint-${i}`}>
              <div>
                <Select disabled={disabled} value={h.kind || "none"} onValueChange={(v) => setHC(i, { kind: v === "none" ? "" : v })}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Kind" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick one</SelectItem>
                    {HARD_CONSTRAINT_KINDS.map((k) => <SelectItem key={k} value={k}>{HARD_CONSTRAINT_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Input className={inputCls} disabled={disabled} value={h.detail} onChange={(ev) => setHC(i, { detail: ev.target.value })} placeholder="e.g. last entry 18:30" />
                {value.p2.hardConstraints.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="mt-1" disabled={disabled} onClick={() => set({ p2: { ...value.p2, hardConstraints: value.p2.hardConstraints.filter((_, j) => j !== i) } })} aria-label="Remove">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {value.p2.hardConstraints.length < 6 && (
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ p2: { ...value.p2, hardConstraints: [...value.p2.hardConstraints, { kind: "", detail: "" }] } })}>
              <Plus className="w-4 h-4 mr-1" /> Add another
            </Button>
          )}
        </div>
      </section>

      {/* P3 — contingency */}
      <section className="space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">3. When it goes sideways</h3>
          <p className="text-sm text-muted-foreground mt-1">{CLAIM_PROMPTS.p3(daypart)}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Pick one</Label>
            <Select disabled={disabled} value={value.p3.trigger || "none"} onValueChange={(v) => setP3({ trigger: v === "none" ? "" : v })}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="What happens" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">What happens</SelectItem>
                {CONTINGENCY_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{CONTINGENCY_TRIGGER_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Which stop changes</Label>
            <Select disabled={disabled} value={value.p3.replacesPosition || "all"} onValueChange={(v) => setP3({ replacesPosition: v })}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">The whole plan changes</SelectItem>
                {value.p2.items.map((_, i) => <SelectItem key={i} value={String(i + 1)}>Stop {i + 1}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <span className="text-sm font-medium text-foreground">Instead, they go to…</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>Where</Label>
              <Input className={inputCls} disabled={disabled} value={value.p3.alternate.name} onChange={(ev) => setP3({ alternate: { ...value.p3.alternate, name: ev.target.value } })} />
            </div>
            <div>
              <Label>How long (minutes)</Label>
              <Input className={inputCls} disabled={disabled} inputMode="numeric" value={value.p3.alternate.durationMin} onChange={(ev) => setP3({ alternate: { ...value.p3.alternate, durationMin: ev.target.value.replace(/[^0-9]/g, "") } })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Getting there</Label>
              <Select disabled={disabled} value={value.p3.alternate.transition?.mode || "walk"} onValueChange={(v) => setP3({ alternate: { ...value.p3.alternate, transition: { mode: v, minutes: value.p3.alternate.transition?.minutes ?? "" } } })}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>{TRANSITION_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Minutes</Label>
              <Input className={inputCls} disabled={disabled} inputMode="numeric" value={value.p3.alternate.transition?.minutes ?? ""} onChange={(ev) => setP3({ alternate: { ...value.p3.alternate, transition: { mode: value.p3.alternate.transition?.mode || "walk", minutes: ev.target.value.replace(/[^0-9]/g, "") } } })} />
            </div>
          </div>
        </div>
        <div>
          <Label>What changes, and why</Label>
          <Textarea className={inputCls} disabled={disabled} rows={2} value={value.p3.reason} onChange={(ev) => setP3({ reason: ev.target.value })} />
        </div>
      </section>

      {/* P4 — access (optional; held) */}
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-foreground">4. Optional — a door that's usually closed</h3>
          <p className="text-sm text-muted-foreground mt-1">{CLAIM_PROMPTS.p4(neighborhoodName)}</p>
          <p className="text-xs text-muted-foreground mt-1">We keep this to ourselves until we've been able to check it with you.</p>
        </div>
        {value.p4.map((a, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end rounded-lg border border-border p-3" data-testid={`p4-entry-${i}`}>
            <div>
              <Label>Where</Label>
              <Input className={inputCls} disabled={disabled} value={a.venue} onChange={(ev) => setP4(i, { venue: ev.target.value })} />
            </div>
            <div>
              <Label>What you can get</Label>
              <Select disabled={disabled} value={a.accessType || "none"} onValueChange={(v) => setP4(i, { accessType: v === "none" ? "" : v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pick one</SelectItem>
                  {ACCESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <div className="flex-1">
                <Label>How come</Label>
                <Input className={inputCls} disabled={disabled} value={a.relationshipBasis} onChange={(ev) => setP4(i, { relationshipBasis: ev.target.value })} placeholder="One line is enough" />
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-6" disabled={disabled} onClick={() => set({ p4: value.p4.filter((_, j) => j !== i) })} aria-label="Remove">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {(!compact || value.p4.length > 0) && value.p4.length < CAPTURE_SHAPE.p4Max && (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ p4: [...value.p4, { venue: "", accessType: "", relationshipBasis: "" }] })} data-testid="add-p4-entry">
            <Plus className="w-4 h-4 mr-1" /> Add one
          </Button>
        )}
        {compact && value.p4.length === 0 && (
          <Button type="button" variant="ghost" size="sm" className="px-0" disabled={disabled} onClick={() => set({ p4: [{ venue: "", accessType: "", relationshipBasis: "" }] })}>
            I have one
          </Button>
        )}
      </section>
    </div>
  );
}
