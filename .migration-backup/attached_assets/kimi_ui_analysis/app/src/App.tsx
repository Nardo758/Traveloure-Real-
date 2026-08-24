import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  SlidersHorizontal, 
  Filter, 
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navigation } from '@/components/ui/custom/Navigation';
import { HeroSection } from '@/components/ui/custom/HeroSection';
import { ExperienceTypes } from '@/components/ui/custom/ExperienceTypes';
import { TrendingCities } from '@/components/ui/custom/TrendingCities';
import { FeaturesShowcase } from '@/components/ui/custom/FeaturesShowcase';
import { HowItWorks } from '@/components/ui/custom/HowItWorks';
import { Testimonials } from '@/components/ui/custom/Testimonials';
import { MarketplaceCard, type MarketplaceItem } from '@/components/ui/custom/MarketplaceCard';
import { CartPanel, type CartItem } from '@/components/ui/custom/CartPanel';
import { FilterSidebar, type FilterState } from '@/components/ui/custom/FilterSidebar';
import { Footer } from '@/components/ui/custom/Footer';
import { Toaster, toast } from 'sonner';

// Sample marketplace data with seasonal themes
const sampleItems: MarketplaceItem[] = [
  {
    id: '1',
    title: 'Sunset Sailing Experience in Santorini',
    location: 'Santorini, Greece',
    image: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80',
    rating: 4.9,
    reviewCount: 328,
    price: 89,
    originalPrice: 120,
    currency: '$',
    category: 'Experience',
    duration: '3 hours',
    groupSize: 'Up to 8',
    tags: ['Boat Tour', 'Sunset', 'Photography'],
    isPopular: true,
  },
  {
    id: '2',
    title: 'Traditional Tea Ceremony in Kyoto',
    location: 'Kyoto, Japan',
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&q=80',
    rating: 4.8,
    reviewCount: 256,
    price: 65,
    currency: '$',
    category: 'Cultural',
    duration: '2 hours',
    groupSize: 'Small group',
    tags: ['Culture', 'History', 'Food'],
    isNew: true,
  },
  {
    id: '3',
    title: 'Northern Lights Tour in Iceland',
    location: 'Reykjavik, Iceland',
    image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80',
    rating: 4.7,
    reviewCount: 189,
    price: 145,
    originalPrice: 180,
    currency: '$',
    category: 'Adventure',
    duration: '4 hours',
    groupSize: 'Up to 12',
    tags: ['Nature', 'Photography', 'Winter'],
    isPopular: true,
  },
  {
    id: '4',
    title: 'Bali Rice Terrace Trekking',
    location: 'Ubud, Bali',
    image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80',
    rating: 4.9,
    reviewCount: 412,
    price: 45,
    currency: '$',
    category: 'Activity',
    duration: '5 hours',
    groupSize: 'Up to 6',
    tags: ['Hiking', 'Nature', 'Culture'],
  },
  {
    id: '5',
    title: 'Swiss Alps Helicopter Tour',
    location: 'Interlaken, Switzerland',
    image: 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80',
    rating: 5.0,
    reviewCount: 89,
    price: 350,
    currency: '$',
    category: 'Experience',
    duration: '1 hour',
    groupSize: 'Private',
    tags: ['Luxury', 'Scenic', 'Adventure'],
    isNew: true,
  },
  {
    id: '6',
    title: 'Moroccan Cooking Class',
    location: 'Marrakech, Morocco',
    image: 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800&q=80',
    rating: 4.6,
    reviewCount: 178,
    price: 55,
    originalPrice: 75,
    currency: '$',
    category: 'Dining',
    duration: '3 hours',
    groupSize: 'Up to 10',
    tags: ['Cooking', 'Food', 'Culture'],
  },
  {
    id: '7',
    title: 'Great Barrier Reef Diving',
    location: 'Cairns, Australia',
    image: 'https://images.unsplash.com/photo-1582967788606-a171f1080ca8?w=800&q=80',
    rating: 4.8,
    reviewCount: 234,
    price: 180,
    currency: '$',
    category: 'Adventure',
    duration: '6 hours',
    groupSize: 'Up to 8',
    tags: ['Diving', 'Marine Life', 'Nature'],
    isPopular: true,
  },
  {
    id: '8',
    title: 'Paris Gourmet Food Tour',
    location: 'Paris, France',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
    rating: 4.9,
    reviewCount: 567,
    price: 95,
    currency: '$',
    category: 'Dining',
    duration: '4 hours',
    groupSize: 'Small group',
    tags: ['Food', 'Walking', 'History'],
  },
];

function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [filteredItems, setFilteredItems] = useState(sampleItems);

  // Scroll animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleAddToCart = (item: MarketplaceItem) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: item.id,
          title: item.title,
          image: item.image,
          price: item.price,
          currency: item.currency,
          quantity: 1,
        },
      ];
    });
    toast.success(`${item.title} added to cart!`, {
      description: 'View your itinerary to continue booking.',
    });
  };

  const handleRemoveFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
    toast.info('Item removed from cart');
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    if (quantity === 0) {
      handleRemoveFromCart(id);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const handleFavorite = (item: MarketplaceItem) => {
    setFavorites((prev) => {
      if (prev.includes(item.id)) {
        toast.info('Removed from favorites');
        return prev.filter((id) => id !== item.id);
      }
      toast.success('Added to favorites!');
      return [...prev, item.id];
    });
  };

  const handleSearch = (searchData: {
    destination: string;
    dates: string;
    guests: number;
  }) => {
    toast.success('Searching destinations...', {
      description: `Looking for experiences in ${searchData.destination || 'all destinations'}`,
    });
  };

  const handleApplyFilters = (filters: FilterState) => {
    let filtered = sampleItems;

    // Apply price filter
    filtered = filtered.filter(
      (item) => item.price >= filters.priceRange[0] && item.price <= filters.priceRange[1]
    );

    // Apply category filter
    if (filters.categories.length > 0) {
      filtered = filtered.filter((item) =>
        filters.categories.some(
          (cat) => item.category.toLowerCase() === cat.toLowerCase()
        )
      );
    }

    // Apply rating filter
    if (filters.ratings.length > 0) {
      const minRating = Math.min(...filters.ratings.map((r) => parseInt(r)));
      filtered = filtered.filter((item) => item.rating >= minRating);
    }

    setFilteredItems(filtered);
    toast.success(`Found ${filtered.length} experiences`);
  };

  const handleClearFilters = () => {
    setFilteredItems(sampleItems);
    toast.info('Filters cleared');
  };

  const handleOptimizeWithAI = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'AI is optimizing your itinerary...',
        success: 'Your itinerary has been optimized!',
        error: 'Optimization failed. Please try again.',
      }
    );
  };

  const handleCheckout = () => {
    toast.success('Proceeding to checkout...');
  };

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" richColors />

      {/* Navigation */}
      <Navigation
        cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => setIsCartOpen(true)}
      />

      {/* Hero Section */}
      <HeroSection onSearch={handleSearch} />

      {/* Experience Types Selector */}
      <ExperienceTypes />

      {/* Trending Cities - Rich Cards */}
      <TrendingCities />

      {/* How It Works */}
      <HowItWorks />

      {/* Features Showcase */}
      <FeaturesShowcase />

      {/* Testimonials */}
      <Testimonials />

      {/* Curated Experiences Marketplace */}
      <section className="section-padding bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10"
          >
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ocean-100 text-ocean-700 text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4" />
                Curated for You
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                Trending Experiences
              </h2>
              <p className="mt-2 text-gray-600">
                Handpicked activities and experiences loved by travelers worldwide.
              </p>
            </div>

            {/* Filter Toggle - Mobile */}
            <Button
              variant="outline"
              className="lg:hidden flex items-center gap-2"
              onClick={() => setIsFilterOpen(true)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </Button>
          </motion.div>

          {/* Content Grid */}
          <div className="flex gap-8">
            {/* Filter Sidebar - Desktop */}
            <div className="hidden lg:block flex-shrink-0">
              <div className="sticky top-24">
                <FilterSidebar
                  isOpen={true}
                  onClose={() => {}}
                  onApplyFilters={handleApplyFilters}
                  onClearFilters={handleClearFilters}
                />
              </div>
            </div>

            {/* Filter Sidebar - Mobile */}
            <FilterSidebar
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              onApplyFilters={handleApplyFilters}
              onClearFilters={handleClearFilters}
            />

            {/* Results Grid */}
            <div className="flex-1">
              {/* Results Count */}
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{filteredItems.length}</span> experiences
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Sort by:</span>
                  <select className="text-sm border-gray-200 rounded-lg px-3 py-1.5 focus:border-ocean-500 focus:ring-ocean-500">
                    <option>Recommended</option>
                    <option>Price: Low to High</option>
                    <option>Price: High to Low</option>
                    <option>Top Rated</option>
                  </select>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredItems.map((item, index) => (
                  <MarketplaceCard
                    key={item.id}
                    item={item}
                    onAddToCart={handleAddToCart}
                    onFavorite={handleFavorite}
                    isFavorite={favorites.includes(item.id)}
                    index={index}
                  />
                ))}
              </div>

              {/* Load More */}
              {filteredItems.length > 0 && (
                <div className="mt-10 text-center">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-xl border-2 border-gray-200 hover:border-ocean-500 hover:text-ocean-600 transition-colors"
                  >
                    Load More Experiences
                  </Button>
                </div>
              )}

              {/* Empty State */}
              {filteredItems.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                    <Filter className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No experiences found
                  </h3>
                  <p className="text-gray-500 mb-6">
                    Try adjusting your filters to see more results.
                  </p>
                  <Button onClick={handleClearFilters} className="btn-primary">
                    Clear Filters
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-ocean-600 via-ocean-700 to-ocean-800 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
              Ready to Start Your Adventure?
            </h2>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              Join millions of travelers who trust Traveloure to plan their perfect journeys. 
              Sign up today and get personalized recommendations powered by AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="bg-white text-ocean-700 hover:bg-gray-100 font-semibold rounded-xl px-8 h-14"
              >
                Get Started Free
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-white/30 text-white hover:bg-white/10 font-semibold rounded-xl px-8 h-14"
              >
                See How It Works
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Cart Panel */}
      <CartPanel
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={handleRemoveFromCart}
        onUpdateQuantity={handleUpdateQuantity}
        onOptimizeWithAI={handleOptimizeWithAI}
        onCheckout={handleCheckout}
      />
    </div>
  );
}

export default App;
