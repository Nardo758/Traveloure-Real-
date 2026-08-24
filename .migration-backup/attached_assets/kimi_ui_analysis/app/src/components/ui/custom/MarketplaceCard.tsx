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
  isFavorite?: boolean;
  index?: number;
}

export function MarketplaceCard({ 
  item, 
  onAddToCart, 
  onFavorite, 
  isFavorite = false,
  index = 0 
}: MarketplaceCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleAddToCart = () => {
    setIsAdded(true);
    onAddToCart?.(item);
    setTimeout(() => setIsAdded(false), 2000);
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
      className="group relative bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 card-lift"
    >
      {/* Image Container */}
      <div className="relative aspect-[16/10] overflow-hidden">
        {/* Loading Skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 skeleton" />
        )}
        
        <img
          src={item.image}
          alt={item.title}
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-transform duration-700 ${
            isHovered ? 'scale-110' : 'scale-100'
          }`}
        />
        
        {/* Gradient Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`} />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          {item.isNew && (
            <Badge className="bg-nature-500 text-white border-0 text-xs">
              New
            </Badge>
          )}
          {item.isPopular && (
            <Badge className="bg-sunset-500 text-white border-0 text-xs">
              Popular
            </Badge>
          )}
          {discount && (
            <Badge className="bg-ocean-500 text-white border-0 text-xs">
              -{discount}%
            </Badge>
          )}
        </div>

        {/* Favorite Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onFavorite?.(item)}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
            isFavorite 
              ? 'bg-red-500 text-white' 
              : 'bg-white/90 backdrop-blur-sm text-gray-600 hover:text-red-500'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </motion.button>

        {/* Quick Add Button - Shows on Hover */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 20 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-3 left-3 right-3"
        >
          <Button
            onClick={handleAddToCart}
            disabled={isAdded}
            className={`w-full transition-all duration-300 ${
              isAdded 
                ? 'bg-nature-500 text-white' 
                : 'bg-white/95 backdrop-blur-sm text-gray-900 hover:bg-white'
            }`}
          >
            {isAdded ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Added to Cart
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart
              </>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Category & Rating */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-ocean-600 uppercase tracking-wide">
            {item.category}
          </span>
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-sunset-400 fill-sunset-400" />
            <span className="text-sm font-medium text-gray-700">{item.rating}</span>
            <span className="text-xs text-gray-400">({item.reviewCount})</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-ocean-600 transition-colors">
          {item.title}
        </h3>

        {/* Location */}
        <div className="flex items-center gap-1 text-gray-500 mb-3">
          <MapPin className="w-3.5 h-3.5" />
          <span className="text-sm truncate">{item.location}</span>
        </div>

        {/* Meta Info */}
        {(item.duration || item.groupSize) && (
          <div className="flex items-center gap-4 mb-3 text-gray-500">
            {item.duration && (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs">{item.duration}</span>
              </div>
            )}
            {item.groupSize && (
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs">{item.groupSize}</span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.tags.slice(0, 3).map((tag) => (
              <span 
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-gray-900">
            {item.currency}{item.price}
          </span>
          {item.originalPrice && (
            <span className="text-sm text-gray-400 line-through">
              {item.currency}{item.originalPrice}
            </span>
          )}
          <span className="text-xs text-gray-500">/person</span>
        </div>
      </div>
    </motion.div>
  );
}

export default MarketplaceCard;
