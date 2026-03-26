import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  MapPin, 
  Star, 
  Calendar, 
  Users, 
  ArrowRight, 
  Zap, 
  Trophy, 
  Sparkles,
  Heart,
  TrendingUp,
  Gem
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TripPackageCardProps {
  id: number;
  title: string;
  destination: string;
  duration: string;
  travelers: string;
  category: string;
  rating: number;
  reviews: number;
  price: number;
  originalPrice?: number;
  highlights: string[];
  expertPick?: boolean;
  expertName?: string;
  expertAvatar?: string;
  expertRating?: number;
  salesCount?: number;
  heatScore?: number;
  status?: "Best Seller" | "New" | "Limited" | "Hot";
  image?: string;
  onFavorite?: (id: number) => void;
  isFavorite?: boolean;
  delay?: number;
}

const getStatusColor = (rating: number) => {
  if (rating >= 4.8) return { text: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" };
  if (rating >= 4.5) return { text: "text-yellow-500 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" };
  return { text: "text-green-500 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" };
};

const getStatusBadge = (status?: string) => {
  switch (status) {
    case "Best Seller":
      return { icon: Trophy, label: "Best Seller", bgColor: "bg-amber-500 dark:bg-amber-600" };
    case "New":
      return { icon: Sparkles, label: "New", bgColor: "bg-green-500 dark:bg-green-600" };
    case "Limited":
      return { icon: Zap, label: "Limited", bgColor: "bg-red-500 dark:bg-red-600" };
    case "Hot":
      return { icon: Zap, label: "Hot", bgColor: "bg-[#FF385C]" };
    default:
      return null;
  }
};

export function TripPackageCard({
  id,
  title,
  destination,
  duration,
  travelers,
  category,
  rating,
  reviews,
  price,
  originalPrice,
  highlights,
  expertPick,
  expertName = "Local Expert",
  expertAvatar,
  expertRating = 5.0,
  salesCount = 0,
  heatScore = 85,
  status,
  image,
  onFavorite,
  isFavorite = false,
  delay = 0,
}: TripPackageCardProps) {
  const statusColor = getStatusColor(rating);
  const statusBadge = getStatusBadge(status);
  const StatusIcon = statusBadge?.icon;
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  // Generate image based on category if not provided
  const getDefaultImage = (category: string) => {
    const imageMap: Record<string, string> = {
      cultural: "https://images.unsplash.com/photo-1549144511-f099e773c147?w=600&q=80",
      romantic: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=600&q=80",
      relaxation: "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=600&q=80",
      adventure: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=80",
      family: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=600&q=80",
    };
    return imageMap[category] || "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80";
  };

  const displayImage = image || getDefaultImage(category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group"
    >
      <div 
        className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 border border-border h-full flex flex-col"
        data-testid={`card-trip-${id}`}
      >
        {/* Image Header with Overlay */}
        <div className="relative h-48 overflow-hidden">
          <img
            src={displayImage}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          {/* Heat Score Badge - Top Right */}
          <div 
            className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
            data-testid={`badge-heat-score-${id}`}
          >
            <span className={cn(
              "text-lg font-bold",
              heatScore >= 90 ? "text-[#FF385C]" : heatScore >= 80 ? "text-orange-500 dark:text-orange-400" : "text-amber-500 dark:text-amber-400"
            )}>
              {heatScore}
            </span>
          </div>
          
          {/* Status/Hot Badge - Top Left */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {StatusIcon && (
              <span 
                className={cn(
                  "px-2.5 py-1 rounded-lg text-white text-xs font-bold flex items-center gap-1 shadow-lg",
                  statusBadge.bgColor
                )}
                data-testid={`badge-status-${id}`}
              >
                <StatusIcon className="w-3 h-3 fill-white" />
                {statusBadge.label}
              </span>
            )}
            {salesCount > 50 && (
              <span 
                className="px-2 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-medium flex items-center gap-1 shadow-sm"
                data-testid={`badge-sales-${id}`}
              >
                <Users className="w-3 h-3" />
                {salesCount}
              </span>
            )}
          </div>

          {/* Favorite Button */}
          <button
            onClick={() => onFavorite?.(id)}
            className="absolute top-3 right-16 p-2 bg-white/90 dark:bg-white/80 rounded-full shadow-lg hover:scale-110 transition-transform"
            data-testid={`button-favorite-${id}`}
          >
            <Heart
              className={cn(
                "w-5 h-5",
                isFavorite
                  ? "fill-[#FF385C] text-[#FF385C]"
                  : "text-gray-700"
              )}
            />
          </button>

          {/* Title & Location */}
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-xl font-bold text-white line-clamp-1 mb-1">{title}</h3>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <MapPin className="w-3 h-3" />
              <span>{destination}</span>
              {expertPick && (
                <Badge className="bg-amber-500/90 text-white border-0 ml-auto">
                  <Star className="w-3 h-3 mr-1 fill-white" />
                  Expert Pick
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Category Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {duration}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {travelers}
            </span>
          </div>

          {/* Price and Discount */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">${price}</span>
              {originalPrice && (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    ${originalPrice}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {discount}% off
                  </span>
                </>
              )}
            </div>
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              statusColor.text,
              statusColor.bg
            )}>
              {rating >= 4.8 ? "Highly Rated" : rating >= 4.5 ? "Popular" : "Great Value"}
            </span>
          </div>

          {/* Expert Info */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center overflow-hidden">
              {expertAvatar ? (
                <img src={expertAvatar} alt={expertName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">{expertName.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{expertName}</p>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="text-xs text-muted-foreground">{expertRating.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Highlights */}
          <div className="flex-1 mb-3">
            <div className="flex flex-wrap gap-1">
              {highlights.slice(0, 2).map((highlight, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {highlight}
                </Badge>
              ))}
              {highlights.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{highlights.length - 2} more
                </Badge>
              )}
            </div>
          </div>

          {/* Green Tip Section */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-2">
                {expertPick 
                  ? "Expertly curated package with exclusive local access and insider tips included."
                  : "All accommodations, transfers, and main activities included in this package."}
              </p>
            </div>
          </div>

          {/* Bottom Stats Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border mb-3" data-testid={`stats-footer-${id}`}>
            <div className="flex items-center gap-1" data-testid={`stat-rating-${id}`}>
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-medium">{rating.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1" data-testid={`stat-reviews-${id}`}>
              <Users className="w-3 h-3" />
              {reviews} reviews
            </div>
            <div className="flex items-center gap-1" data-testid={`stat-duration-${id}`}>
              <Calendar className="w-3 h-3" />
              {duration}
            </div>
          </div>

          {/* CTA Button */}
          <Button className="w-full mt-auto" data-testid={`button-view-trip-${id}`}>
            View Details
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
