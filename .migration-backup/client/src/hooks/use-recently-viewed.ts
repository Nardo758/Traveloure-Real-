import { useState, useEffect } from "react";

export type RecentCity = { slug: string; name: string };

const STORAGE_KEY = "traveloure_recently_viewed";
const MAX_ITEMS = 3;

function readStorage(): RecentCity[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentCity[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: RecentCity[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function trackCityView(slug: string, name: string) {
  const existing = readStorage().filter((c) => c.slug !== slug);
  const updated = [{ slug, name }, ...existing].slice(0, MAX_ITEMS);
  writeStorage(updated);
  window.dispatchEvent(new CustomEvent("recentlyViewedChanged"));
}

export function useRecentlyViewed(): RecentCity[] {
  const [cities, setCities] = useState<RecentCity[]>(readStorage);

  useEffect(() => {
    const handler = () => setCities(readStorage());
    window.addEventListener("recentlyViewedChanged", handler);
    return () => window.removeEventListener("recentlyViewedChanged", handler);
  }, []);

  return cities;
}
