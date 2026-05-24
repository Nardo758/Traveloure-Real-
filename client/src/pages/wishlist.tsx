import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MapPin, Star, Trash2, ShoppingCart, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WishlistItem {
  id: string;
  userId: string;
  serviceId: string;
  createdAt: string;
  serviceName: string | null;
  shortDescription: string | null;
  price: string | null;
  location: string | null;
  averageRating: string | null;
  reviewCount: number | null;
  categoryId: string | null;
  deliveryMethod: string | null;
}

function WishlistCard({ item, onRemove }: { item: WishlistItem; onRemove: (serviceId: string) => void }) {
  const rating = parseFloat(item.averageRating || "0") || 0;
  const price = parseFloat(item.price || "0") || 0;
  const reviewCount = item.reviewCount || 0;

  const addToCartMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/cart", { serviceId: item.serviceId, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  return (
    <div
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row"
      data-testid={`card-wishlist-${item.serviceId}`}
    >
      {/* Color accent strip */}
      <div className="w-full sm:w-2 h-2 sm:h-auto bg-rose-400 shrink-0" />

      <div className="p-5 flex flex-col sm:flex-row gap-4 flex-1 min-w-0">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={`/services/${item.serviceId}`}>
            <h3
              className="font-semibold text-base hover:text-primary transition-colors line-clamp-2 cursor-pointer"
              data-testid={`text-wishlist-name-${item.serviceId}`}
            >
              {item.serviceName || "Unnamed Service"}
            </h3>
          </Link>

          {item.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate" data-testid={`text-wishlist-location-${item.serviceId}`}>{item.location}</span>
            </div>
          )}

          {item.shortDescription && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{item.shortDescription}</p>
          )}

          <div className="flex items-center gap-3 mt-3">
            {rating > 0 && (
              <div className="flex items-center gap-1" data-testid={`stat-wishlist-rating-${item.serviceId}`}>
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                {reviewCount > 0 && (
                  <span className="text-xs text-muted-foreground">({reviewCount})</span>
                )}
              </div>
            )}
            {item.deliveryMethod && (
              <Badge variant="secondary" className="text-xs">{item.deliveryMethod}</Badge>
            )}
          </div>
        </div>

        {/* Price + Actions */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-between gap-3 shrink-0">
          <div className="text-xl font-bold" data-testid={`text-wishlist-price-${item.serviceId}`}>
            ${price.toFixed(0)}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              onClick={() => addToCartMutation.mutate()}
              disabled={addToCartMutation.isPending}
              data-testid={`button-wishlist-cart-${item.serviceId}`}
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
              {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              onClick={() => onRemove(item.serviceId)}
              data-testid={`button-wishlist-remove-${item.serviceId}`}
              aria-label="Remove from wishlist"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WishlistPage() {
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
  });

  const removeMutation = useMutation({
    mutationFn: async (serviceId: string) => apiRequest("DELETE", `/api/wishlist/${serviceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/ids"] });
      toast({ title: "Removed from wishlist", description: "Service removed from your saved list" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove from wishlist", variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="heading-wishlist">My Wishlist</h1>
              <p className="text-sm text-muted-foreground">Services you've saved for later</p>
            </div>
          </div>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="badge-wishlist-count">
              {items.length} saved
            </Badge>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20" data-testid="empty-wishlist">
            <Heart className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No saved services yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tap the heart icon on any service to save it here for later.
            </p>
            <Button asChild>
              <Link href="/discover">
                Browse Services
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="wishlist-list">
            {items.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                onRemove={(serviceId) => removeMutation.mutate(serviceId)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
