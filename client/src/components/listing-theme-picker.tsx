/**
 * The creator's single theme pick. The catalog comes from GET /api/experience-themes.
 * "Other" collects a suggestion. It does not publish a theme.
 */
import React from "react";
import {
  THEME_OTHER_LABEL,
  THEME_PICKER_LABEL,
  THEME_SUGGESTED_NOTE,
  THEME_SUGGESTION_PROMPT,
  THEME_SUGGESTION_SAVED_NOTE,
} from "@shared/experience-themes";

export interface ListingThemeOption {
  id: string;
  slug: string;
  label: string;
}

export function ListingThemePicker({
  themes,
  choice,
  themeId,
  suggestion,
  suggested,
  onSelectCatalog,
  onSelectOther,
  onSuggestionChange,
}: {
  themes: ListingThemeOption[];
  choice: "" | "catalog" | "other";
  themeId: string;
  suggestion: string;
  suggested: boolean;
  onSelectCatalog: (theme: ListingThemeOption) => void;
  onSelectOther: () => void;
  onSuggestionChange: (value: string) => void;
}) {
  return (
    <fieldset className="mt-4" data-testid="listing-theme-picker">
      <legend className="text-sm font-medium">{THEME_PICKER_LABEL}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {themes.map((theme) => {
          const pressed = choice === "catalog" && themeId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={pressed}
              data-testid={`theme-option-${theme.slug}`}
              onClick={() => onSelectCatalog(theme)}
              className={
                pressed
                  ? "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                  : "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)]"
              }
            >
              {theme.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={choice === "other"}
          data-testid="theme-option-other"
          onClick={onSelectOther}
          className={
            choice === "other"
              ? "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
              : "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)]"
          }
        >
          {THEME_OTHER_LABEL}
        </button>
      </div>
      {suggested && choice === "catalog" && (
        <p className="text-xs text-muted-foreground mt-2" data-testid="theme-suggested-note">
          {THEME_SUGGESTED_NOTE}
        </p>
      )}
      {choice === "other" && (
        <div className="mt-3">
          <label htmlFor="theme-suggestion" className="text-sm font-medium">
            {THEME_SUGGESTION_PROMPT}
          </label>
          <textarea
            id="theme-suggestion"
            value={suggestion}
            onChange={(event) => onSuggestionChange(event.target.value)}
            className="mt-2 w-full min-h-[72px] rounded-md border px-3 py-2 text-sm"
            data-testid="theme-suggestion-input"
          />
          <p className="text-xs text-muted-foreground mt-1">{THEME_SUGGESTION_SAVED_NOTE}</p>
        </div>
      )}
    </fieldset>
  );
}
