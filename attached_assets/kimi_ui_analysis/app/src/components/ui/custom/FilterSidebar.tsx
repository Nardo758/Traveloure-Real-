import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SlidersHorizontal, 
  X, 
  ChevronDown, 
  Star,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

interface FilterGroup {
  id: string;
  title: string;
  icon?: React.ElementType;
  options: FilterOption[];
}

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters?: (filters: FilterState) => void;
  onClearFilters?: () => void;
}

export interface FilterState {
  priceRange: [number, number];
  ratings: string[];
  categories: string[];
  amenities: string[];
  activityTypes: string[];
}

const filterGroups: FilterGroup[] = [
  {
    id: 'categories',
    title: 'Categories',
    options: [
      { id: 'hotels', label: 'Hotels', count: 2453 },
      { id: 'activities', label: 'Activities', count: 1820 },
      { id: 'dining', label: 'Dining', count: 1240 },
      { id: 'experiences', label: 'Experiences', count: 890 },
      { id: 'tours', label: 'Tours', count: 650 },
    ],
  },
  {
    id: 'activityTypes',
    title: 'Activity Type',
    options: [
      { id: 'adventure', label: 'Adventure', count: 420 },
      { id: 'relaxation', label: 'Relaxation', count: 380 },
      { id: 'cultural', label: 'Cultural', count: 290 },
      { id: 'wildlife', label: 'Wildlife', count: 180 },
      { id: 'water-sports', label: 'Water Sports', count: 150 },
    ],
  },
  {
    id: 'amenities',
    title: 'Amenities',
    options: [
      { id: 'wifi', label: 'Free WiFi', count: 2100 },
      { id: 'pool', label: 'Swimming Pool', count: 1200 },
      { id: 'parking', label: 'Free Parking', count: 980 },
      { id: 'spa', label: 'Spa & Wellness', count: 650 },
      { id: 'gym', label: 'Fitness Center', count: 540 },
      { id: 'restaurant', label: 'Restaurant', count: 890 },
    ],
  },
];

const ratingOptions = [
  { value: '5', label: '5 Stars', count: 450 },
  { value: '4', label: '4+ Stars', count: 1200 },
  { value: '3', label: '3+ Stars', count: 2100 },
];

export function FilterSidebar({
  isOpen,
  onClose,
  onApplyFilters,
  onClearFilters
}: FilterSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    filterGroups.map(g => g.id)
  );
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleSelection = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev =>
      prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const getActiveFilterCount = () => {
    return (
      selectedRatings.length +
      selectedCategories.length +
      selectedAmenities.length +
      selectedActivityTypes.length +
      (priceRange[0] > 0 || priceRange[1] < 1000 ? 1 : 0)
    );
  };

  const handleApplyFilters = () => {
    onApplyFilters?.({
      priceRange,
      ratings: selectedRatings,
      categories: selectedCategories,
      amenities: selectedAmenities,
      activityTypes: selectedActivityTypes,
    });
  };

  const handleClearFilters = () => {
    setPriceRange([0, 1000]);
    setSelectedRatings([]);
    setSelectedCategories([]);
    setSelectedAmenities([]);
    setSelectedActivityTypes([]);
    onClearFilters?.();
  };

  const activeCount = getActiveFilterCount();

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`fixed lg:sticky top-0 left-0 h-screen w-80 bg-white border-r border-gray-100 z-50 lg:z-auto flex flex-col ${
          isOpen ? 'shadow-2xl lg:shadow-none' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ocean-100 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5 text-ocean-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              {activeCount > 0 && (
                <Badge variant="secondary" className="mt-0.5 bg-ocean-100 text-ocean-700">
                  {activeCount} active
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-gray-500 hover:text-red-500"
              >
                Clear
              </Button>
            )}
            <button
              onClick={onClose}
              className="lg:hidden w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Content */}
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">
            {/* Price Range */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Price Range</h3>
              <div className="px-2">
                <Slider
                  value={priceRange}
                  onValueChange={(value) => setPriceRange(value as [number, number])}
                  max={1000}
                  step={10}
                  className="mb-4"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-700">
                    ${priceRange[0]}
                  </span>
                  <span className="text-gray-400">to</span>
                  <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-700">
                    ${priceRange[1]}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Rating */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Rating</h3>
              <div className="space-y-2">
                {ratingOptions.map((rating) => (
                  <label
                    key={rating.value}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedRatings.includes(rating.value)}
                      onCheckedChange={() =>
                        toggleSelection(rating.value, setSelectedRatings)
                      }
                    />
                    <div className="flex items-center gap-1 flex-1">
                      <Star className="w-4 h-4 text-sunset-400 fill-sunset-400" />
                      <span className="text-sm text-gray-700">{rating.label}</span>
                    </div>
                    <span className="text-xs text-gray-400">({rating.count})</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Filter Groups */}
            {filterGroups.map((group) => (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between py-2 group"
                >
                  <h3 className="font-semibold text-gray-900">{group.title}</h3>
                  <motion.div
                    animate={{ rotate: expandedGroups.includes(group.id) ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {expandedGroups.includes(group.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-1 pt-2">
                        {group.options.map((option) => {
                          const isSelected =
                            group.id === 'categories'
                              ? selectedCategories.includes(option.id)
                              : group.id === 'amenities'
                              ? selectedAmenities.includes(option.id)
                              : selectedActivityTypes.includes(option.id);

                          const toggleFn =
                            group.id === 'categories'
                              ? () => toggleSelection(option.id, setSelectedCategories)
                              : group.id === 'amenities'
                              ? () => toggleSelection(option.id, setSelectedAmenities)
                              : () => toggleSelection(option.id, setSelectedActivityTypes);

                          return (
                            <label
                              key={option.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <Checkbox checked={isSelected} onCheckedChange={toggleFn} />
                              <span className="text-sm text-gray-700 flex-1">{option.label}</span>
                              {option.count && (
                                <span className="text-xs text-gray-400">({option.count})</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 space-y-3">
          <Button
            onClick={handleApplyFilters}
            className="w-full btn-primary"
          >
            <Check className="w-4 h-4 mr-2" />
            Apply Filters
          </Button>
        </div>
      </motion.aside>
    </>
  );
}

export default FilterSidebar;
