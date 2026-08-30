import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Heart, X, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";

interface SavedItem {
  id: string;
  contentType: string;
  contentId: string;
  contentName: string;
  contentImage: string | null;
  city: string | null;
  createdAt: string;
}

export function WishlistSection() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [addDialogItem, setAddDialogItem] = useState<any>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: savedItems, isLoading } = useQuery<SavedItem[]>({
    queryKey: ["/api/saved-items"],
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/saved-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-items"] });
      toast({ title: "Removed from saved" });
    },
    onError: () => {
      toast({ title: "Failed to remove item", variant: "destructive" });
    },
  });

  if (isLoading || !savedItems || savedItems.length === 0) return null;

  return (
    <section className="mb-[22px]" data-testid="wishlist-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5" style={{ color: "#1A1A18" }}>
        <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
        <span>Saved places</span>
        <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F3EE", color: "#7A7A72" }}>
          {savedItems.length}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {savedItems.map((item) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-[160px] rounded-xl border bg-white overflow-hidden"
            style={{ border: "0.5px solid #E8E8E2" }}
            data-testid={`wishlist-card-${item.id}`}
          >
            {/* Image or placeholder */}
            <div className="relative h-[80px] bg-muted overflow-hidden">
              {item.contentImage ? (
                <img
                  src={item.contentImage}
                  alt={item.contentName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
                  <Heart className="h-6 w-6 text-rose-200" />
                </div>
              )}
              {/* Remove button */}
              <button
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 hover:bg-white shadow-sm transition-colors"
                onClick={() => removeMutation.mutate(item.id)}
                disabled={removeMutation.isPending}
                data-testid={`button-remove-saved-${item.id}`}
                aria-label="Remove from saved"
              >
                {removeMutation.isPending && removeMutation.variables === item.id ? (
                  <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                ) : (
                  <X className="h-3 w-3 text-gray-500" />
                )}
              </button>
            </div>

            <div className="p-2">
              <p className="text-[12px] font-semibold leading-snug line-clamp-2" style={{ color: "#1A1A18" }}>
                {item.contentName}
              </p>
              {item.city && (
                <p className="text-[10px] mt-0.5 flex items-center gap-0.5" style={{ color: "#7A7A72" }}>
                  <MapPin className="h-2.5 w-2.5" />{item.city}
                </p>
              )}
              <div className="flex gap-1 mt-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => {
                    setAddDialogItem({
                      title: item.contentName,
                      type: item.contentType,
                      city: item.city ?? undefined,
                    });
                    setAddDialogOpen(true);
                  }}
                  data-testid={`button-add-to-trip-${item.id}`}
                >
                  + Trip
                </Button>
                {item.city && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-6 px-2 flex-shrink-0"
                    onClick={() => navigate(`/discover/location/${encodeURIComponent(item.city!)}`)}
                    data-testid={`button-explore-city-${item.id}`}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AddToExperienceDialog
        item={addDialogItem}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </section>
  );
}
