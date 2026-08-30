import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

export function useTouristPlaceSearch(query: string) {
  return useQuery({
    queryKey: [api.touristPlaces.search.path, query],
    queryFn: async () => {
      // Pass query as query param properly
      const url = `${api.touristPlaces.search.path}?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search places");
      return api.touristPlaces.search.responses[200].parse(await res.json());
    },
    enabled: query.length > 2, // Only search if query has 3+ chars
  });
}

// Help Guide Trips (Premade packages)
export function useHelpGuideTrips() {
  return useQuery({
    queryKey: [api.helpGuideTrips.list.path],
    queryFn: async () => {
      const res = await fetch(api.helpGuideTrips.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch help guide trips");
      return api.helpGuideTrips.list.responses[200].parse(await res.json());
    },
  });
}

export function useHelpGuideTrip(id: string) {
  return useQuery({
    queryKey: [api.helpGuideTrips.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.helpGuideTrips.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch trip details");
      return api.helpGuideTrips.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}
