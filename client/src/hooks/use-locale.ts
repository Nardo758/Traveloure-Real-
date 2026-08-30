/**
 * use-locale.ts — the ONE place the ruling-60 chrome locale is resolved and changed.
 *
 * Resolution order (ruling 60, exactly): authenticated user's saved preference → guest's chosen
 * locale (localStorage) → Accept-Language → en. Steps 2-4 run at module load in lib/i18n.ts;
 * step 1 lands here, because the account preference only exists once the session resolves.
 *
 * Persistence, both paths:
 *   - ALWAYS localStorage (so a signed-out reload, and the next guest visit, keep the choice).
 *   - ADDITIONALLY, when signed in, PATCH /api/me/preferences → users.preferences.settings
 *     .language. That endpoint is the EXISTING shallow-merge machinery with a strict zod
 *     allow-list (storefront.routes.ts) — no raw body into jsonb, no new column, no migration.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_LOCALE,
  applyDocumentLang,
  isSupportedLocale,
  normalizeLocale,
  resolveLocale,
  writeStoredLocale,
  type SupportedLocale,
} from "@/lib/i18n";

/** Reads step 1 out of the session user: users.preferences.settings.language. */
export function accountLocaleOf(user: unknown): SupportedLocale | null {
  const prefs = (user as any)?.preferences;
  return normalizeLocale(prefs?.settings?.language);
}

export function useLocale() {
  const { i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const accountLocale = accountLocaleOf(user);

  // Step 1 applied once the session resolves. Deliberately NOT re-run on every render: a user
  // who switches locale in the menu without saving (or whose save is in flight) must not have
  // the stale account value yanked back under them, so this fires only when the account value
  // itself changes.
  const lastAppliedAccount = useRef<string | null>(null);
  useEffect(() => {
    if (accountLocale && accountLocale !== lastAppliedAccount.current) {
      lastAppliedAccount.current = accountLocale;
      if (i18n.language !== accountLocale) {
        void i18n.changeLanguage(accountLocale);
      }
      applyDocumentLang(accountLocale);
    }
  }, [accountLocale, i18n]);

  // Keep <html lang> honest for every other way the language can change.
  useEffect(() => {
    const onChanged = (lng: string) => {
      applyDocumentLang(isSupportedLocale(lng) ? lng : DEFAULT_LOCALE);
    };
    i18n.on("languageChanged", onChanged);
    return () => {
      i18n.off("languageChanged", onChanged);
    };
  }, [i18n]);

  const locale: SupportedLocale = isSupportedLocale(i18n.language)
    ? i18n.language
    : resolveLocale(accountLocale);

  const setLocale = useCallback(
    async (next: SupportedLocale): Promise<{ persistedToAccount: boolean }> => {
      // 1. Switch the UI first — the selector must feel instant and must not depend on a
      //    network round-trip that may fail.
      await i18n.changeLanguage(next);
      applyDocumentLang(next);

      // 2. Device copy, always.
      writeStoredLocale(next);

      // 3. Account copy when signed in, via the existing allow-listed shallow-merge PATCH.
      if (!isAuthenticated) return { persistedToAccount: false };

      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      if (!res.ok) throw new Error(`Failed to save language (${res.status})`);

      lastAppliedAccount.current = next;
      // The session user carries preferences.settings.language (step 1's source), so it has to
      // be refetched or a reload would resolve to the stale value.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/preferences"] });
      return { persistedToAccount: true };
    },
    [i18n, isAuthenticated, queryClient],
  );

  return { locale, setLocale, isAuthenticated };
}
