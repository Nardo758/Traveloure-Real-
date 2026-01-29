import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, 
  Quote, 
  ChevronLeft, 
  ChevronRight,
  MapPin,
  Calendar
} from 'lucide-react';

interface Testimonial {
  id: string;
  name: string;
  avatar: string;
  location: string;
  trip: string;
  rating: number;
  text: string;
  date: string;
  images: string[];
}

const testimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Sarah Mitchell',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    location: 'San Francisco, CA',
    trip: 'Honeymoon in Santorini',
    rating: 5,
    text: 'Traveloure made planning our honeymoon absolutely effortless. The AI recommendations were spot-on, and we discovered hidden gems we never would have found on our own. The sunset sailing experience was magical!',
    date: 'October 2025',
    images: [
      'https://images.unsplash.com/photo-1613395877344-13d4c79e4284?w=400&q=80',
      'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=400&q=80',
    ],
  },
  {
    id: '2',
    name: 'Michael Chen',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    location: 'New York, NY',
    trip: 'Family Trip to Japan',
    rating: 5,
    text: 'Planning a trip for 6 people seemed impossible until we found Traveloure. The group collaboration feature let everyone vote on activities, and the AI optimized our itinerary perfectly. Best family vacation ever!',
    date: 'September 2025',
    images: [
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&q=80',
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&q=80',
    ],
  },
  {
    id: '3',
    name: 'Emma Rodriguez',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
    location: 'London, UK',
    trip: 'Solo Adventure in Bali',
    rating: 5,
    text: 'As a solo traveler, safety was my top priority. Traveloure not only found amazing experiences but also provided local insights and 24/7 support. I felt confident exploring Bali on my own!',
    date: 'November 2025',
    images: [
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400&q=80',
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=400&q=80',
    ],
  },
  {
    id: '4',
    name: 'David Park',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80',
    location: 'Toronto, Canada',
    trip: 'Corporate Retreat in Costa Rica',
    rating: 5,
    text: 'Organizing a corporate retreat for 50 people was daunting, but Traveloure handled everything flawlessly. From team-building activities to accommodations, everything was perfectly coordinated.',
    date: 'August 2025',
    images: [
      'https://images.unsplash.com/photo-1518259102261-b40117eabbc9?w=400&q=80',
    ],
  },
];

export function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const current = testimonials[currentIndex];

  return (
    <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium mb-6">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            Traveler Stories
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Loved by Travelers Worldwide
          </h2>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            See what our community of 2 million+ travelers has to say about their experiences.
          </p>
        </motion.div>

        {/* Testimonial Card */}
        <div className="relative max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="grid md:grid-cols-2">
                {/* Images Side */}
                <div className="relative h-64 md:h-auto">
                  <div className="absolute inset-0 grid grid-cols-2 gap-1">
                    {current.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Trip photo ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent md:bg-gradient-to-r" />
                  <div className="absolute bottom-4 left-4 text-white">
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="w-4 h-4" />
                      {current.trip}
                    </div>
                  </div>
                </div>

                {/* Content Side */}
                <div className="p-8 md:p-10">
                  {/* Quote Icon */}
                  <Quote className="w-10 h-10 text-ocean-200 mb-4" />

                  {/* Rating */}
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(current.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>

                  {/* Text */}
                  <p className="text-gray-700 text-lg leading-relaxed mb-6">
                    "{current.text}"
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-4">
                    <img
                      src={current.avatar}
                      alt={current.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">{current.name}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="w-3 h-3" />
                        {current.location}
                        <span>•</span>
                        <Calendar className="w-3 h-3" />
                        {current.date}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={prev}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Dots */}
            <div className="flex items-center gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentIndex ? 'w-8 bg-white' : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Trust Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center"
        >
          {[
            { value: '4.9/5', label: 'Average Rating' },
            { value: '50K+', label: 'Reviews' },
            { value: '98%', label: 'Would Recommend' },
            { value: '2M+', label: 'Happy Travelers' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-white">{stat.value}</div>
              <div className="text-slate-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default Testimonials;
