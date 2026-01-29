import { motion } from 'framer-motion';
import { 
  Search, 
  Sparkles, 
  Calendar, 
  CreditCard, 
  Plane,
  ArrowRight
} from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Tell Us Your Dream',
    description: 'Share your destination, dates, budget, and travel style. Our AI learns your preferences.',
    icon: Search,
    color: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    number: '02',
    title: 'Get AI Recommendations',
    description: 'Receive personalized itineraries with hotels, activities, and dining tailored just for you.',
    icon: Sparkles,
    color: 'from-violet-500 to-violet-600',
    bgColor: 'bg-violet-50',
  },
  {
    number: '03',
    title: 'Customize Your Trip',
    description: 'Fine-tune your itinerary. Swap activities, adjust dates, and add experiences you love.',
    icon: Calendar,
    color: 'from-rose-500 to-rose-600',
    bgColor: 'bg-rose-50',
  },
  {
    number: '04',
    title: 'Book Everything',
    description: 'Reserve hotels, tours, and restaurants in one place with secure, instant confirmation.',
    icon: CreditCard,
    color: 'from-emerald-500 to-emerald-600',
    bgColor: 'bg-emerald-50',
  },
  {
    number: '05',
    title: 'Enjoy Your Journey',
    description: 'Access your itinerary offline, get real-time updates, and 24/7 support while traveling.',
    icon: Plane,
    color: 'from-orange-500 to-orange-600',
    bgColor: 'bg-orange-50',
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-nature-100 text-nature-700 text-sm font-medium mb-6">
            Simple Process
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            How Traveloure Works
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Plan your perfect trip in 5 simple steps. From inspiration to booking, we've got you covered.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connection Line - Desktop */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-200 via-violet-200 to-emerald-200" />

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                {/* Step Card */}
                <div className="text-center">
                  {/* Icon Circle */}
                  <div className={`relative inline-flex items-center justify-center w-20 h-20 rounded-2xl ${step.bgColor} mb-6`}>
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${step.color} opacity-10`} />
                    <step.icon className={`w-8 h-8 bg-gradient-to-br ${step.color} bg-clip-text`} style={{ color: 'inherit' }} />
                    <div className={`absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white text-sm font-bold`}>
                      {step.number}
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Arrow - Mobile/Tablet */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center my-6">
                    <ArrowRight className="w-6 h-6 text-gray-300 rotate-90" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-20 flex flex-wrap justify-center gap-8"
        >
          {[
            { label: 'Free to Use', desc: 'No hidden fees' },
            { label: 'Best Price Guarantee', desc: 'Or we refund the difference' },
            { label: '24/7 Support', desc: 'Always here to help' },
            { label: 'Secure Booking', desc: 'PCI compliant' },
          ].map((badge) => (
            <div key={badge.label} className="text-center">
              <div className="text-sm font-semibold text-gray-900">{badge.label}</div>
              <div className="text-xs text-gray-500">{badge.desc}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default HowItWorks;
