/**
 * plus-occasions.tsx — the Plus intake surface (ledger 2026-08-27-plus-is-delivery).
 *
 * Where a member sets their home city and manages the occasions Plus schedules drafts against.
 * Reads GET /api/plus/config (sales flag, my Plus status, template/recurrence vocab, markets),
 * GET /api/me/home-city, and GET /api/occasions; writes via the owner-gated CRUD. Non-Plus members
 * can still set things up in anticipation — a banner explains drafts only fire for active Plus.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalendarHeart, Trash2, Loader2 } from "lucide-react";

interface PlusConfig {
  salesEnabled: boolean;
  isPlus: boolean;
  templates: { key: string; label: string }[];
  recurrences: string[];
  markets: string[];
}
interface Occasion {
  id: string;
  templateKey: string;
  occasionDate: string;
  recurrence: string;
  label: string | null;
  active: boolean;
}

const RECURRENCE_LABEL: Record<string, string> = {
  none: "One-off",
  annual: "Every year",
  biweekly: "Every 2 weeks",
};

export default function PlusOccasionsPage() {
  const { toast } = useToast();

  const configQ = useQuery<PlusConfig>({ queryKey: ["/api/plus/config"] });
  const homeCityQ = useQuery<{ homeCity: string | null; markets: string[] }>({ queryKey: ["/api/me/home-city"] });
  const occasionsQ = useQuery<Occasion[]>({ queryKey: ["/api/occasions"] });

  const [form, setForm] = useState({ templateKey: "", occasionDate: "", recurrence: "none", label: "" });

  const setHomeCity = useMutation({
    mutationFn: (homeCity: string) => apiRequest("PATCH", "/api/me/home-city", { homeCity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/home-city"] });
      toast({ title: "Home city saved" });
    },
    onError: () => toast({ title: "Couldn't save home city", variant: "destructive" }),
  });

  const addOccasion = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/occasions", {
        templateKey: form.templateKey,
        occasionDate: form.occasionDate,
        recurrence: form.recurrence,
        label: form.label || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/occasions"] });
      setForm({ templateKey: "", occasionDate: "", recurrence: "none", label: "" });
      toast({ title: "Occasion added" });
    },
    onError: () => toast({ title: "Couldn't add occasion", description: "Check the fields and try again.", variant: "destructive" }),
  });

  const deleteOccasion = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/occasions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/occasions"] });
      toast({ title: "Occasion removed" });
    },
    onError: () => toast({ title: "Couldn't remove occasion", variant: "destructive" }),
  });

  const config = configQ.data;
  const templates = config?.templates ?? [];
  const recurrences = config?.recurrences ?? ["none", "annual", "biweekly"];
  const markets = homeCityQ.data?.markets ?? config?.markets ?? [];
  const homeCity = homeCityQ.data?.homeCity ?? null;
  const canSubmit = form.templateKey && form.occasionDate && !addOccasion.isPending;

  if (configQ.isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" data-testid="loader-plus-occasions" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <CalendarHeart className="w-6 h-6 text-rose-500" />
        <h1 className="text-2xl font-semibold text-gray-900">Your occasions</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Tell us the dates that matter. Two weeks before each one, Plus drafts a plan built for your
        home city and sends it to you.
      </p>

      {config && !config.isPlus && (
        <div
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          data-testid="banner-not-plus"
        >
          You can set these up now, but scheduled drafts only arrive for active Plus members.
          {config.salesEnabled ? " Join Plus to turn them on." : " Plus is coming soon for your city."}
        </div>
      )}

      {/* Home city */}
      <section className="mb-8 rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Home city</h2>
        <p className="text-xs text-gray-500 mb-3">Drafts are built from this city's own places.</p>
        <select
          value={homeCity ?? ""}
          onChange={(e) => setHomeCity.mutate(e.target.value)}
          data-testid="select-home-city"
          className="w-full sm:w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select your city…</option>
          {markets.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      {/* Add occasion */}
      <section className="mb-8 rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Add an occasion</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600">
            Occasion
            <select
              value={form.templateKey}
              onChange={(e) => setForm((f) => ({ ...f, templateKey: e.target.value }))}
              data-testid="select-occasion-template"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Date
            <input
              type="date"
              value={form.occasionDate}
              onChange={(e) => setForm((f) => ({ ...f, occasionDate: e.target.value }))}
              data-testid="input-occasion-date"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            Repeats
            <select
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
              data-testid="select-occasion-recurrence"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {recurrences.map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABEL[r] ?? r}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Label (optional)
            <input
              type="text"
              maxLength={200}
              value={form.label}
              placeholder="e.g. Our anniversary"
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              data-testid="input-occasion-label"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          disabled={!canSubmit}
          onClick={() => addOccasion.mutate()}
          data-testid="button-add-occasion"
          className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold bg-rose-500 text-white disabled:opacity-40 hover:opacity-90 transition"
        >
          {addOccasion.isPending ? "Adding…" : "Add occasion"}
        </button>
      </section>

      {/* Occasion list */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Scheduled occasions</h2>
        {occasionsQ.isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        ) : (occasionsQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400" data-testid="text-no-occasions">No occasions yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden" data-testid="list-occasions">
            {occasionsQ.data!.map((o) => {
              const tmpl = templates.find((t) => t.key === o.templateKey);
              return (
                <li key={o.id} className="flex items-center justify-between px-4 py-3" data-testid={`occasion-${o.id}`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {o.label?.trim() || tmpl?.label || o.templateKey}
                    </div>
                    <div className="text-xs text-gray-500">
                      {o.occasionDate} · {RECURRENCE_LABEL[o.recurrence] ?? o.recurrence}
                      {!o.active && " · paused"}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteOccasion.mutate(o.id)}
                    data-testid={`button-delete-occasion-${o.id}`}
                    className="text-gray-400 hover:text-rose-500 transition"
                    aria-label="Remove occasion"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
