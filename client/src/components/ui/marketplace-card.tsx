import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, 
  Star, 
  Heart, 
  Plus,
  Check,
  Clock,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MarketplaceItem {
  id: string;
  title: string;
  location: string;
  image: string;
  rating: number;
  reviewCount: number;
  price: number;
  originalPrice?: number;
  currency: string;
  category: string;
  duration?: string;
  groupSize?: string;
  tags?: string[];
  isNew?: boolean;
  isPopular?: boolean;
}

interface MarketplaceCardProps {
  item: MarketplaceItem;
  onAddToCart?: (item: MarketplaceItem) => void;
  onFavorite?: (item: MarketplaceItem) => void;
  onSelect?: (item: MarketplaceItem) => void;
  isFavorite?: boolean;
  index?: number;
}

export function MarketplaceCard({ 
  item, 
  onAddToCart, 
  onFavorite,
  onSelect,
  isFavorite = false,
  index = 0 
}: MarketplaceCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdded(true);
    onAddToCart?.(item);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite?.(item);
  };

  const discount = item.originalPrice 
    ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.5, 
        delay: index * 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect?.(item)}
      className="group relative bg-card dark:bg-card rounded-2xl overflow-hidden card-lift cursor-pointer"
      data-testid={`marketplace-card-${item.id}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 skeleton" data-testid={`skeleton-${item.id}`} />
        )}
        
        <img
          src={item.image}
          alt={item.title}
          onLoad={() => setImageLoaded(true)}
          className={cn(
            "w-full h-full object-cover",
            !imageLoaded && 'opacity-0'
          )}
          data-testid={`img-${item.id}`}
        />
        
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300",
          isHovered ? 'opacity-100' : 'opacity-0'
        )} />

        <div className="absolute top-3 left-3 flex flex-wrap gap-2" data-testid={`badges-container-${item.id}`}>
          {item.isNew && (
            <Badge className="bg-nature-500 dark:bg-nature-600 text-white border-0 text-xs" data-testid={`badge-new-${item.id}`}>
              New
            </Badge>
          )}
          {item.isPopular && (
            <Badge className="bg-sunset-500 dark:bg-sunset-600 text-white border-0 text-xs" data-testid={`badge-popular-${item.id}`}>
              Popular
            </Badge>
          )}
          {discount && (
            <Badge className="bg-ocean-500 dark:bg-ocean-600 text-white border-0 text-xs" data-testid={`badge-discount-${item.id}`}>
              -{discount}%
            </Badge>
          )}
        </div>

        {onFavorite && (
          <Button
            size="icon"
            variant={isFavorite ? "destructive" : "outline"}
            onClick={handleFavorite}
            className="absolute top-3 right-3 rounded-full"
            data-testid={`button-favorite-${item.id}`}
          >
            <Heart className={cn("w-4 h-4", isFavorite && 'fill-current')} />
          </Button>
        )}

        {onAddToCart && (
          <div
            className={cn(
              "absolute bottom-3 left-3 right-3 transition-opacity duration-300",
              isHovered ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Button
              onClick={handleAddToCart}
              disabled={isAdded}
              variant={isAdded ? "default" : "outline"}
              className="w-full"
              data-testid={`button-add-cart-${item.id}`}
            >
              {isAdded ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Added
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Itinerary
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-foreground line-clamp-2 flex-1 min-w-0" data-testid={`text-title-${item.id}`}>
            {item.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm mb-3">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate" data-testid={`text-location-${item.id}`}>{item.location}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
          {item.duration && (
            <div className="flex flex-wrap items-center gap-1">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span data-testid={`text-duration-${item.id}`}>{item.duration}</span>
            </div>
          )}
          {item.groupSize && (
            <div className="flex flex-wrap items-center gap-1">
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span data-testid={`text-groupsize-${item.id}`}>{item.groupSize}</span>
            </div>
          )}
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.tags.slice(0, 3).map((tag, index) => (
              <Badge 
                key={tag} 
                variant="secondary" 
                className="text-xs font-normal"
                data-testid={`badge-tag-${item.id}-${index}`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex flex-wrap items-center gap-1">
            <Star className="w-4 h-4 fill-current text-sunset-400 dark:text-sunset-300 flex-shrink-0" />
            <span className="font-medium text-foreground" data-testid={`text-rating-${item.id}`}>{item.rating}</span>
            <span className="text-muted-foreground text-sm" data-testid={`text-reviews-${item.id}`}>({item.reviewCount})</span>
          </div>
          
          <div className="text-right">
            {item.originalPrice && (
              <span className="text-sm text-muted-foreground line-through mr-2">
                {item.currency}{item.originalPrice}
              </span>
            )}
            <span className="text-lg font-bold text-foreground" data-testid={`text-price-${item.id}`}>
              {item.currency}{item.price}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
