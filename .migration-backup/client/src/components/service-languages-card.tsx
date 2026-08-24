// Ruling 115 — the Languages card on Listing Home (docs/DECISIONS.md ledger row 115).
//
// The ruling-60 provider-content translation rails (GET/PUT/approve/draft
// /api/provider/services/:id/translations/:locale) existed with NO console surface — a provider
// had no way to author, review, or approve a translation. This card is that surface. It sits on
// the Listing Home settings rail (beside Pricing & fees / Availability / Photos — the Q7 cards)
// and owns exactly the translation lifecycle:
//   per target locale: status chip (none / AI draft — review / Live) → editor drawer with the
//   original beside each field → Save (stores approved/human), Generate AI draft (labeled,
//   degrades HONESTLY to a visible "unavailable" state when no provider is configured — never a
//   fabricated translation, §13), Approve (flips a reviewed draft live).
//
// Target locales are the shipped content set MINUS the listing's own declared source language
// (source_locale, ruling 115 — NULL = en). Status/source are never sent from here (§19 — the
// server derives them from the path taken).
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Languages, Sparkles, CheckCircle } from "lucide-react";

const CONTENT_LOCALES = ["en", "ja"] as const;
type ContentLocale = (typeof CONTENT_LOCALES)[number];

const LOCALE_LABEL: Record<ContentLocale, string> = {
  en: "English",
  ja: "日本語 (Japanese)",
};

interface TranslationRow {
  serviceName: string | null;
  shortDescription: string | null;
  description: string | null;
  meetingPoint: string | null;
  status: "draft" | "approved";
  source: "human" | "ai_draft";
  updatedAt?: string;
}

interface OriginalContent {
  serviceName: string | null;
  shortDescription: string | null;
  description: string | null;
  meetingPoint: string | null;
}

const FIELDS: { key: keyof OriginalContent; label: string; multiline: boolean }[] = [
  { key: "serviceName", label: "Service name", multiline: false },
  { key: "shortDescription", label: "Short description", multiline: false },
  { key: "description", label: "Description", multiline: true },
  { key: "meetingPoint", label: "Meeting point", multiline: true },
];

function statusChip(t: TranslationRow | null | undefined): { label: string; tone: "live" | "draft" | "none" } {
  if (!t) return { label: "Not translated", tone: "none" };
  if (t.status === "approved") return { label: t.source === "human" ? "Live" : "Live (AI, reviewed)", tone: "live" };
  return { label: "AI draft — review", tone: "draft" };
}

export function ServiceLanguagesCard({
  serviceId,
  sourceLocale,
  original,
}: {
  serviceId: string;
  sourceLocale: ContentLocale;
  original: OriginalContent;
}) {
  const { toast } = useToast();
  const targets = CONTENT_LOCALES.filter((l) => l !== sourceLocale);
  const [openLocale, setOpenLocale] = useState<ContentLocale | null>(null);
  const [fields, setFields] = useState<OriginalContent>({
    serviceName: null,
    shortDescription: null,
    description: null,
    meetingPoint: null,
  });
  // §13: the AI-unavailable state is shown where it happened, not swallowed into a toast the
  // provider may miss.
  const [draftUnavailable, setDraftUnavailable] = useState(false);

  const translationKey = (locale: string) => [`/api/provider/services/${serviceId}/translations/${locale}`];

  const queries = targets.map((locale) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `targets` is derived from a stable
    // 2-locale constant + a prop that never changes during a mount, so the hook order is fixed.
    useQuery<{ locale: string; translation: TranslationRow | null }>({
      queryKey: translationKey(locale),
      enabled: !!serviceId,
    }),
  );

  const openEditor = (locale: ContentLocale, existing: TranslationRow | null | undefined) => {
    setDraftUnavailable(false);
    setFields({
      serviceName: existing?.serviceName ?? null,
      shortDescription: existing?.shortDescription ?? null,
      description: existing?.description ?? null,
      meetingPoint: existing?.meetingPoint ?? null,
    });
    setOpenLocale(locale);
  };

  const invalidate = (locale: string) =>
    queryClient.invalidateQueries({ queryKey: translationKey(locale) });

  const saveMutation = useMutation({
    mutationFn: async (locale: string) => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/translations/${locale}`, fields);
      return res.json();
    },
    onSuccess: (_d, locale) => {
      invalidate(locale);
      toast({ title: "Translation saved", description: "Live for travelers in that language." });
      setOpenLocale(null);
    },
    onError: (e: Error) => toast({ title: "Could not save translation", description: e.message, variant: "destructive" }),
  });

  const draftMutation = useMutation({
    mutationFn: async (locale: string) => {
      const res = await apiRequest("POST", `/api/provider/services/${serviceId}/translations/${locale}/draft`);
      return res.json();
    },
    onSuccess: (data, locale) => {
      invalidate(locale);
      const t = data?.translation as TranslationRow | undefined;
      if (t) {
        setFields({
          serviceName: t.serviceName,
          shortDescription: t.shortDescription,
          description: t.description,
          meetingPoint: t.meetingPoint,
        });
      }
      toast({ title: "AI draft ready", description: "Machine-generated — review and approve before travelers see it." });
    },
    onError: (e: Error) => {
      // The bench-honest path: 503 AI_DRAFT_UNAVAILABLE when no translation provider is
      // configured. Shown inline, never a fabricated draft.
      if (e.message.startsWith("503")) {
        setDraftUnavailable(true);
      } else {
        toast({ title: "AI draft failed", description: e.message, variant: "destructive" });
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (locale: string) => {
      const res = await apiRequest("POST", `/api/provider/services/${serviceId}/translations/${locale}/approve`);
      return res.json();
    },
    onSuccess: (_d, locale) => {
      invalidate(locale);
      toast({ title: "Translation approved", description: "Now live for travelers in that language." });
      setOpenLocale(null);
    },
    onError: (e: Error) => toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  const openIdx = openLocale ? targets.indexOf(openLocale) : -1;
  const openRow = openIdx >= 0 ? queries[openIdx].data?.translation ?? null : null;

  return (
    <>
      <Card data-testid="card-listing-languages">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <Languages className="w-4 h-4" /> Languages
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Written in {LOCALE_LABEL[sourceLocale]}. Travelers can switch languages — add a
                translation so they see your words, not a fallback label.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {targets.map((locale, i) => {
              const row = queries[i].data?.translation ?? null;
              const chip = statusChip(row);
              return (
                <div
                  key={locale}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  data-testid={`row-language-${locale}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium">{LOCALE_LABEL[locale]}</span>
                    <Badge
                      variant={chip.tone === "live" ? "default" : chip.tone === "draft" ? "secondary" : "outline"}
                      className="text-xs"
                      data-testid={`chip-translation-status-${locale}`}
                    >
                      {chip.tone === "live" && <CheckCircle className="w-3 h-3 mr-1" />}
                      {chip.label}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditor(locale, row)}
                    data-testid={`button-edit-translation-${locale}`}
                  >
                    {row ? "Edit" : "Add translation"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Sheet open={openLocale !== null} onOpenChange={(o) => !o && setOpenLocale(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="panel-translation-editor">
          {openLocale && (
            <>
              <SheetHeader>
                <SheetTitle>Translation — {LOCALE_LABEL[openLocale]}</SheetTitle>
                <SheetDescription>
                  Your original ({LOCALE_LABEL[sourceLocale]}) is shown beside each field. Saving
                  publishes the translation for travelers reading in {LOCALE_LABEL[openLocale]}.
                </SheetDescription>
              </SheetHeader>
              {openRow?.status === "draft" && openRow.source === "ai_draft" && (
                <div
                  className="mt-4 p-3 rounded-lg border text-sm bg-amber-50 border-amber-200 text-amber-900"
                  data-testid="banner-ai-draft-review"
                >
                  Machine-generated first draft — review each field, then Approve. Travelers never
                  see it until you do.
                </div>
              )}
              {draftUnavailable && (
                <div
                  className="mt-4 p-3 rounded-lg border text-sm bg-secondary/60 text-muted-foreground"
                  data-testid="banner-ai-draft-unavailable"
                >
                  AI draft unavailable — no translation provider is configured. You can still write
                  the translation yourself below.
                </div>
              )}
              <div className="mt-4 space-y-5">
                {FIELDS.map(({ key, label, multiline }) => (
                  <div key={key}>
                    <Label htmlFor={`tr-${key}`}>{label}</Label>
                    {original[key] ? (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap border-l-2 pl-2">
                        {original[key]}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1 italic">— not set on the original —</p>
                    )}
                    {multiline ? (
                      <Textarea
                        id={`tr-${key}`}
                        className="mt-2"
                        rows={key === "description" ? 6 : 3}
                        value={fields[key] ?? ""}
                        onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value || null }))}
                        data-testid={`input-translation-${key}`}
                      />
                    ) : (
                      <Input
                        id={`tr-${key}`}
                        className="mt-2"
                        value={fields[key] ?? ""}
                        onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value || null }))}
                        data-testid={`input-translation-${key}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => saveMutation.mutate(openLocale)}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-translation"
                >
                  {saveMutation.isPending ? "Saving…" : "Save translation"}
                </Button>
                {openRow?.status === "draft" && (
                  <Button
                    variant="secondary"
                    onClick={() => approveMutation.mutate(openLocale)}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve-translation"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {approveMutation.isPending ? "Approving…" : "Approve draft as-is"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => draftMutation.mutate(openLocale)}
                  disabled={draftMutation.isPending}
                  data-testid="button-generate-ai-draft"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  {draftMutation.isPending ? "Drafting…" : "Draft with AI"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                An AI draft is stored labeled and stays hidden from travelers until you approve it.
                Saving your own text publishes immediately.
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
