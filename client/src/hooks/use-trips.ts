import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import type { InsertTrip, Trip, GeneratedItinerary } from "@shared/schema";
import { useToast } from "./use-toast";

// === TRIPS ===

export function useTrips() {
  return useQuery({
    queryKey: [api.trips.list.path],
    queryFn: async () => {
      const res = await fetch(api.trips.list.path, { credentials: "include" });
      if (res.status === 401) return null; // Handle unauthorized gracefully
      if (!res.ok) throw new Error("Failed to fetch trips");
      return api.trips.list.responses[200].parse(await res.json());
    },
  });
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: [api.trips.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.trips.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch trip");
      return api.trips.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertTrip) => {
      const res = await fetch(api.trips.create.path, {
        method: api.trips.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to create trip");
      }
      return api.trips.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({
        title: "Trip Created",
        description: "Your new adventure awaits!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<InsertTrip>) => {
      const url = buildUrl(api.trips.update.path, { id });
      const res = await fetch(url, {
        method: api.trips.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update trip");
      return api.trips.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.trips.get.path, variables.id] });
      toast({
        title: "Trip Updated",
        description: "Changes saved successfully.",
      });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const url = buildUrl(api.trips.delete.path, { id });
      const res = await fetch(url, { 
        method: api.trips.delete.method,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete trip");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({
        title: "Trip Deleted",
        description: "Trip removed from your dashboard.",
      });
    },
  });
}

export function useGenerateItinerary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tripId: string) => {
      const url = buildUrl(api.trips.generateItinerary.path, { id: tripId });
      const res = await fetch(url, {
        method: api.trips.generateItinerary.method,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to generate itinerary");
      return api.trips.generateItinerary.responses[201].parse(await res.json());
    },
    onSuccess: (_, tripId) => {
      queryClient.invalidateQueries({ queryKey: [api.trips.get.path, tripId] });
      toast({
        title: "Itinerary Generating",
        description: "Your custom plan is being created...",
      });
    },
  });
}
