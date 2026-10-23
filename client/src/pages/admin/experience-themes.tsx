/**
 * Admin catalog for experience themes, plus suggestions waiting for review.
 * "Untagged" is the label for listings whose theme_id is null. It is not shown
 * on public Discover cards.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  THEME_OTHER_LABEL,
  UNTAGGED_ADMIN_LABEL,
} from "@shared/experience-themes";

interface AdminTheme {
  id: string;
  slug: string;
  label: string;
  sortOrder: number | null;
  active: boolean | null;
}

interface AdminSuggestion {
  id: string;
  label: string;
  status: string;
  serviceName: string | null;
  suggestedByEmail: string | null;
  suggestedByHandle: string | null;
}

interface AdminPayload {
  themes: AdminTheme[];
  suggestions: AdminSuggestion[];
  untagged: { count: number; names: string[] };
}

export default function AdminExperienceThemesPage() {
  const { data, isLoading } = useQuery<AdminPayload>({
    queryKey: ["/api/admin/experience-themes"],
  });
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/experience-themes"] });

  const addTheme = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/experience-themes", { label, active: true });
    },
    onSuccess: () => {
      setLabel("");
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const setActive = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      await apiRequest("PATCH", `/api/admin/experience-themes/${input.id}`, { active: input.active });
    },
    onSuccess: () => refresh(),
  });

  const accept = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/experience-theme-suggestions/${id}/accept`);
    },
    onSuccess: () => refresh(),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/experience-theme-suggestions/${id}/dismiss`);
    },
    onSuccess: () => refresh(),
  });

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl" data-testid="admin-experience-themes">
        <h1 className="text-2xl font-semibold mb-1">Themes</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Listings pick one theme. {THEME_OTHER_LABEL} stays here until you accept it. Accepting does not tag the listing.
        </p>

        <form
          className="flex flex-wrap items-end gap-3 mb-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (label.trim()) addTheme.mutate();
          }}
        >
          <div>
            <Label htmlFor="theme-label">Theme label</Label>
            <Input
              id="theme-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-1 w-72"
              data-testid="admin-theme-label"
            />
          </div>
          <Button type="submit" disabled={addTheme.isPending} data-testid="admin-add-theme">
            Add a theme
          </Button>
        </form>
        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading themes…</p>
        ) : (
          <>
            <ul className="divide-y border rounded-md mb-8">
              {data.themes.map((theme) => (
                <li key={theme.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    {theme.label}
                    <span className="text-xs text-muted-foreground ml-2">{theme.slug}</span>
                  </span>
                  <label className="text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={theme.active !== false}
                      onChange={(event) => setActive.mutate({ id: theme.id, active: event.target.checked })}
                    />
                    Active
                  </label>
                </li>
              ))}
            </ul>

            <h2 className="text-lg font-medium mb-2">Suggestions awaiting review</h2>
            {data.suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-8">No suggestions waiting.</p>
            ) : (
              <ul className="divide-y border rounded-md mb-8">
                {data.suggestions.map((suggestion) => (
                  <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <span>
                      {suggestion.label}
                      {suggestion.serviceName ? ` · ${suggestion.serviceName}` : ""}
                      {suggestion.suggestedByHandle ? ` · @${suggestion.suggestedByHandle}` : ""}
                      {!suggestion.suggestedByHandle && suggestion.suggestedByEmail ? ` · ${suggestion.suggestedByEmail}` : ""}
                    </span>
                    <span className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => accept.mutate(suggestion.id)}>Accept</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => dismiss.mutate(suggestion.id)}>Dismiss</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="text-lg font-medium mb-2">
              {UNTAGGED_ADMIN_LABEL}
              <span className="text-sm font-normal text-muted-foreground ml-2">{data.untagged.count}</span>
            </h2>
            <ul className="text-sm text-muted-foreground list-disc pl-5">
              {data.untagged.names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
