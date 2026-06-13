import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import {
  MapPin,
  Plus,
  Loader2,
  Plane,
  Heart,
  Gem,
  Moon,
  Cake,
  Building2,
  Users,
  TreePine,
  Briefcase,
  LogIn,
} from "lucide-react";

interface Trip {
  id: string;
  title: string;
  destination: string;
  status: string;
  startDate?: string;
  endDate?: string;
}

interface ExperienceItem {
  city?: string;
  title: string;
  description?: string;
  type: "gem" | "neighborhood" | "hotel" | "activity" | "event";
  scheduledDate?: string | null;
}

interface AddToExperienceDialogProps {
  item: ExperienceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const experienceTemplates = [
  { slug: "travel", name: "Travel", icon: "Plane" },
  { slug: "wedding", name: "Wedding", icon: "Heart" },
  { slug: "proposal", name: "Proposal", icon: "Gem" },
  { slug: "date-night", name: "Date Night", icon: "Moon" },
  { slug: "birthday", name: "Birthday", icon: "Cake" },
  { slug: "corporate", name: "Corporate Event", icon: "Briefcase" },
  { slug: "retreat", name: "Retreat", icon: "TreePine" },
  { slug: "reunion", name: "Reunion", icon: "Users" },
];

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Plane,
  Heart,
  Gem,
  Moon,
  Cake,
  Building2,
  Users,
  TreePine,
  Briefcase,
};

export function AddToExperienceDialog({
  item,
  open,
  onOpenChange,
}: AddToExperienceDialogProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<"trips" | "templates">("trips");

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    enabled: open && isAuthenticated,
  });

  const addToTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      if (!item) return;

      // Compute dayNumber from scheduledDate and trip startDate when available.
      // dayNumber is 1-based relative to the trip start date.
      const trip = trips?.find((t) => t.id === tripId);
      let dayNumber = 1;
      if (item.scheduledDate && trip?.startDate) {
        const tripStart = new Date(trip.startDate + "T00:00:00");
        const itemDate = new Date(item.scheduledDate + "T00:00:00");
        const diffMs = itemDate.getTime() - tripStart.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        dayNumber = Math.max(1, diffDays + 1);
      }

      const res = await fetch(`/api/trips/${tripId}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          description: item.description || "",
          itemType: item.type || "experience",
          dayNumber,
          status: "planned",
          notes: `Added from ${item.city || "destination"}`,
          ...(item.scheduledDate ? { scheduledDate: item.scheduledDate } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to add item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Added to trip",
        description: `"${item?.title}" has been added to your itinerary.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to add",
        description: "Could not add this item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addToExperienceMutation = useMutation({
    mutationFn: async (templateSlug: string) => {
      if (!item) return;
      // Navigate to experience builder with the item pre-selected
      const destination = item.city || "destination";
      const templateUrl = `/experiences/${templateSlug}/new?destination=${encodeURIComponent(destination)}&source=${encodeURIComponent(item.title)}`;
      window.location.href = templateUrl;
    },
  });

  const activeTripStatuses = ["planning", "draft", "confirmed"];
  const activeTrips = trips?.filter((t) => activeTripStatuses.includes(t.status)) || [];

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              Sign in to add "{item?.title}" to a trip or create an experience.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                window.location.href = "/auth";
              }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
        <DialogHeader>
          <DialogTitle>Add to a Trip or Experience</DialogTitle>
          <DialogDescription>
            Choose where to add "{item?.title}".
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={selectedTab}
          onValueChange={(v) => setSelectedTab(v as "trips" | "templates")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trips">My Plans</TabsTrigger>
            <TabsTrigger value="templates">Experience Type</TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="space-y-3">
            {tripsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="text-center py-8">
                <Plane className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No active trips found.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a trip first to add items.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = "/my-trips";
                  }}
                >
                  Go to My Plans
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeTrips.map((trip) => (
                  <button
                    key={trip.id}
                    className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => addToTripMutation.mutate(trip.id)}
                    disabled={addToTripMutation.isPending}
                    data-testid={`button-select-trip-${trip.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {trip.title || "Untitled Trip"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {trip.destination}
                        </p>
                      </div>
                      {addToTripMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-3">
            <p className="text-xs text-muted-foreground mb-3">
              Create a new experience based on a template
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {experienceTemplates.map((template) => {
                const IconComponent =
                  templateIcons[template.icon] || Plane;
                return (
                  <button
                    key={template.slug}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() =>
                      addToExperienceMutation.mutate(template.slug)
                    }
                    disabled={addToExperienceMutation.isPending}
                    data-testid={`button-template-${template.slug}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-foreground" />
                    </div>
                    <span className="text-xs font-medium text-center">
                      {template.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
