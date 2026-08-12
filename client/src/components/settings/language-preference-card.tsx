/**
 * language-preference-card.tsx — ruling 60's ONE selector, entry point (a): the Settings →
 * Preferences card (mockup §06 frame A).
 *
 * Writes the EXISTING `users.preferences.settings` namespace through the EXISTING shallow-merge
 * PATCH /api/me/preferences (storefront.routes.ts) — strict zod allow-list, never raw body into
 * jsonb, no new column and no migration. The write itself goes through useLocale so this card
 * and the topbar 🌐 menu share ONE persistence path.
 *
 * Chrome only: the help text says so out loud, because a provider seeing "Display language"
 * would otherwise reasonably expect their LISTINGS to be translated — which is ruling 60's
 * system (B) and is not built (Phase B).
 */
import { useState } from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/use-locale";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n";

export function LanguagePreferenceCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { locale, setLocale } = useLocale();
  const { toast } = useToast();
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = pending ?? locale;
  const dirty = selected !== locale;

  const onSave = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const { persistedToAccount } = await setLocale(selected);
      setPending(null);
      toast({
        description: persistedToAccount
          ? t("common:language.savedToAccount")
          : t("common:language.savedForDevice"),
      });
    } catch {
      toast({ description: t("common:language.saveFailed"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-language-preference">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-console-mid" aria-hidden="true" />
          {t("settings:preferences.title")}
        </CardTitle>
        <CardDescription>{t("settings:preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("settings:preferences.languageLabel")}</Label>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LOCALES.map((code) => (
              <Button
                key={code}
                type="button"
                variant={selected === code ? "default" : "outline"}
                size="sm"
                onClick={() => setPending(code)}
                data-testid={`button-language-${code}`}
                aria-pressed={selected === code}
              >
                {/* Endonym, untranslated on purpose — see language-menu.tsx. */}
                {t(`common:language.${code}`, { lng: code })}
              </Button>
            ))}
          </div>
          <p className="text-xs text-console-mid">{t("settings:preferences.languageHelp")}</p>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => void onSave()}
            disabled={!dirty || saving}
            data-testid="button-save-language"
          >
            {saving ? t("settings:preferences.saving") : t("settings:preferences.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
