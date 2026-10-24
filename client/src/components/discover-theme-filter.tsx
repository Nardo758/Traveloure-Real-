/**
 * Multi-select theme chips for Discover. The parent owns the selection and the URL.
 * With nothing selected, the idle line says untagged services stay in the list.
 */
import React from "react";
import {
  THEME_FILTER_CLEAR,
  THEME_FILTER_HEADING,
  THEME_FILTER_IDLE,
} from "@shared/experience-themes";

export function DiscoverThemeFilter({
  themes,
  selected,
  onChange,
}: {
  themes: { slug: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const toggle = (slug: string) => {
    if (selectedSet.has(slug)) onChange(selected.filter((item) => item !== slug));
    else onChange([...selected, slug]);
  };

  return (
    <div className="mb-4" data-testid="discover-theme-filter">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-sm font-medium">{THEME_FILTER_HEADING}</h2>
        {selected.length > 0 && (
          <button
            type="button"
            className="text-xs underline"
            data-testid="discover-theme-clear"
            onClick={() => onChange([])}
          >
            {THEME_FILTER_CLEAR}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {themes.map((theme) => {
          const pressed = selectedSet.has(theme.slug);
          return (
            <button
              key={theme.slug}
              type="button"
              aria-pressed={pressed}
              data-testid={`discover-theme-chip-${theme.slug}`}
              onClick={() => toggle(theme.slug)}
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
      </div>
      {selected.length === 0 && (
        <p className="text-[12px] text-muted-foreground mt-2" data-testid="text-theme-filter-idle">
          {THEME_FILTER_IDLE}
        </p>
      )}
    </div>
  );
}
