import { motion } from "framer-motion";
import { 
  MapPin, 
  Users, 
  Eye, 
  Heart, 
  Bookmark, 
  ExternalLink, 
  CheckCircle,
  Star,
  TrendingUp,
  Sparkles,
  Instagram,
  Youtube,
  Music,
  FileText,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ContentType = 
  | "travel-guide" 
  | "hidden-gem" 
  | "photo-collection" 
  | "restaurant-review" 
  | "hotel-review" 
  | "activity-recommendation" 
  | "packing-list" 
  | "budget-breakdown" 
  | "safety-tips" 
  | "day-itinerary";

export type Platform = "instagram" | "youtube" | "tiktok" | "blog";

interface InfluencerContentCardProps {
  id: number;
  title: string;
  contentType: ContentType;
  platform: Platform;
  creator: {
    name: string;
    avatar?: string;
    followers: string;
    isVerified: boolean;
  };
  destination: string;
  engagement: {
    views?: number;
    likes?: number;
    saves?: number;
  };
  price: "free" | number;
  preview: string;
  thumbnail?: string;
  tags?: string[];
  isPremium?: boolean;
  rating?: number;
  delay?: number;
}

const platformIcons = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music,
  blog: FileText,
};

const platformColors = {
  instagram: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-600 dark:text-pink-400" },
  youtube: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
  tiktok: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" },
  blog: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
};

const contentTypeLabels: Record<ContentType, string> = {
  "travel-guide": "Travel Guide",
  "hidden-gem": "Hidden Gem",
  "photo-collection": "Photo Collection",
  "restaurant-review": "Restaurant Review",
  "hotel-review": "Hotel Review",
  "activity-recommendation": "Activity Guide",
  "packing-list": "Packing List",
  "budget-breakdown": "Budget Guide",
  "safety-tips": "Safety Tips",
  "day-itinerary": "Day Itinerary",
};

const contentTypeColors: Record<ContentType, { bg: string; text: string }> = {
  "travel-guide": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  "hidden-gem": { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" },
  "photo-collection": { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-600 dark:text-pink-400" },
  "restaurant-review": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400" },
  "hotel-review": { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-400" },
  "activity-recommendation": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" },
  "packing-list": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  "budget-breakdown": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400" },
  "safety-tips": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
  "day-itinerary": { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-600 dark:text-cyan-400" },
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export function InfluencerContentCard({
  id,
  title,
  contentType,
  platform,
  creator,
  destination,
  engagement,
  price,
  preview,
  thumbnail,
  tags = [],
  isPremium = false,
  rating,
  delay = 0,
}: InfluencerContentCardProps) {
  const PlatformIcon = platformIcons[platform];
  const platformColor = platformColors[platform];
  const contentTypeLabel = contentTypeLabels[contentType];
  const contentTypeColor = contentTypeColors[contentType];

  // Generate thumbnail based on content type if not provided
  const getDefaultThumbnail = (type: ContentType, platform: Platform) => {
    if (platform === "instagram" || platform === "tiktok") {
      return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80";
    }
    if (platform === "youtube") {
      return "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80";
    }
    return "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80";
  };

  const displayThumbnail = thumbnail || getDefaultThumbnail(contentType, platform);

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
        data-testid={`card-influencer-${id}`}
      >
        {/* Content Preview Image */}
        <div className="relative h-48 overflow-hidden">
          <img
            src={displayThumbnail}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          {/* Platform Badge - Top Right */}
          <div 
            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-white/90 shadow-lg flex items-center gap-1.5"
            data-testid={`badge-platform-${id}`}
          >
            <PlatformIcon className={cn("w-4 h-4", platformColor.text)} />
            <span className={cn("text-xs font-bold capitalize", platformColor.text)}>
              {platform}
            </span>
          </div>
          
          {/* Premium/Free Badge - Top Left */}
          <div className="absolute top-3 left-3">
            {isPremium || price !== "free" ? (
              <span 
                className="px-2.5 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                data-testid={`badge-premium-${id}`}
              >
                <Star className="w-3 h-3 fill-white" />
                Premium
              </span>
            ) : (
              <span 
                className="px-2.5 py-1 rounded-lg bg-green-500 dark:bg-green-600 text-white text-xs font-bold shadow-lg"
                data-testid={`badge-free-${id}`}
              >
                Free
              </span>
            )}
          </div>

          {/* Engagement Stats Overlay */}
          {engagement.views && engagement.views > 10000 && (
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {formatNumber(engagement.views)}
            </div>
          )}

          {/* Title */}
          <div className="absolute bottom-3 right-3 left-24">
            <h3 className="text-lg font-bold text-white line-clamp-2">{title}</h3>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Creator Info */}
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center overflow-hidden flex-shrink-0">
              {creator.avatar ? (
                <img src={creator.avatar} alt={creator.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-sm font-bold">{creator.name.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-foreground truncate">{creator.name}</p>
                {creator.isVerified && (
                  <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" data-testid={`icon-verified-${id}`} />
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {creator.followers} followers
              </div>
            </div>
          </div>

          {/* Content Type & Location */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium",
                contentTypeColor.bg,
                contentTypeColor.text
              )}
            >
              {contentTypeLabel}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {destination}
            </span>
            {tags.slice(0, 1).map((tag, idx) => (
              <span key={idx} className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted dark:bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>

          {/* Preview Snippet */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
            {preview}
          </p>

          {/* Engagement Metrics */}
          <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
            {engagement.views && (
              <div className="flex items-center gap-1" data-testid={`stat-views-${id}`}>
                <Eye className="w-3 h-3" />
                {formatNumber(engagement.views)}
              </div>
            )}
            {engagement.likes && (
              <div className="flex items-center gap-1" data-testid={`stat-likes-${id}`}>
                <Heart className="w-3 h-3" />
                {formatNumber(engagement.likes)}
              </div>
            )}
            {engagement.saves && (
              <div className="flex items-center gap-1" data-testid={`stat-saves-${id}`}>
                <Bookmark className="w-3 h-3" />
                {formatNumber(engagement.saves)}
              </div>
            )}
            {rating && (
              <div className="flex items-center gap-1 ml-auto" data-testid={`stat-rating-${id}`}>
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                {rating.toFixed(1)}
              </div>
            )}
          </div>

          {/* Green Tip Section */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-2">
                {creator.isVerified 
                  ? `Verified creator with authentic, firsthand experience in ${destination}.`
                  : `Curated content from experienced traveler with local insights.`}
              </p>
            </div>
          </div>

          {/* Price & CTA */}
          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <div className="flex-1">
              {price === "free" ? (
                <span className="text-lg font-bold text-green-600 dark:text-green-400">Free</span>
              ) : (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-lg font-bold text-foreground">{price}</span>
                </div>
              )}
            </div>
            <Button size="sm" className="flex-shrink-0" data-testid={`button-view-content-${id}`}>
              View Content
              <ExternalLink className="w-3 h-3 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
