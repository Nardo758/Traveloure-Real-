/**
 * CN-1c-UI: the listing-type choice on /services and the city page. The parent owns the value and the URL.
 * Every label comes from `SERVICE_TYPE_FILTER_CHOICES`; the error line is the server's own message.
 */
import React from "react";
import { SERVICE_TYPE_FILTER_CHOICES } from "@/lib/service-type-filter";

export function ServiceTypeFilter({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
}) {
  return (
    <div className="mb-4" data-testid="service-type-filter">
      <div className="flex flex-wrap gap-2">
        {SERVICE_TYPE_FILTER_CHOICES.map((choice) => {
          const pressed = value === choice.value;
          return (
            <button
              key={choice.value || "all"}
              type="button"
              aria-pressed={pressed}
              data-testid={`service-type-filter-${choice.value || "all"}`}
              onClick={() => onChange(choice.value)}
              className={
                pressed
                  ? "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                  : "px-3 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)]"
              }
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-sm text-destructive mt-2" data-testid="text-service-type-filter-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
