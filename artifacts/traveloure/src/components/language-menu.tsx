/**
 * language-menu.tsx — ruling 60's ONE selector, entry point (b): the compact 🌐 menu in the
 * shared top bar / nav.
 *
 * "ONE selector serving providers, experts and travelers" — this component is mounted by both
 * the traveler navbar (client/src/components/layout.tsx) and the back-office shell
 * (components/backoffice/backoffice-shell.tsx), so there is a single implementation and a
 * single persistence path (useLocale) rather than a per-console copy.
 *
 * Guests: persists to localStorage (honored ahead of Accept-Language on the next visit).
 * Signed in: ALSO writes users.preferences.settings.language via PATCH /api/me/preferences.
 */
import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/use-locale";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n";

interface LanguageMenuProps {
  /** "console" tightens the trigger to the 34px back-office header rhythm. */
  variant?: "default" | "console";
  className?: string;
}

export function LanguageMenu({ variant = "default", className }: LanguageMenuProps) {
  const { t } = useTranslation("common");
  const { locale, setLocale } = useLocale();
  const { toast } = useToast();

  const onPick = async (next: SupportedLocale) => {
    if (next === locale) return;
    try {
      const { persistedToAccount } = await setLocale(next);
      toast({
        description: persistedToAccount
          ? t("language.savedToAccount")
          : t("language.savedForDevice"),
      });
    } catch {
      // The UI language already changed and the device copy is written; only the account write
      // failed. Say so honestly rather than silently reverting the user's visible choice.
      toast({ description: t("language.saveFailed"), variant: "destructive" });
    }
  };

  const triggerClass =
    variant === "console"
      ? "h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
      : "h-9 w-9 rounded-lg text-muted-foreground";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`${triggerClass} ${className ?? ""}`}
          style={variant === "console" ? { border: "1px solid #E8E8E2" } : undefined}
          aria-label={t("language.ariaLabel")}
          title={t("language.menuLabel")}
          data-testid="button-language-menu"
        >
          <Globe className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide">
          {t("language.menuLabel")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => void onPick(code)}
            className="flex items-center justify-between gap-2 cursor-pointer"
            data-testid={`language-option-${code}`}
          >
            {/* Each locale's own endonym, deliberately NOT translated — a user looking for
                their language recognises "日本語", not "Japanese". */}
            <span>{t(`language.${code}`, { lng: code })}</span>
            {code === locale && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
