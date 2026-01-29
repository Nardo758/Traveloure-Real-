import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Plane, 
  Heart, 
  Gem, 
  Sparkles, 
  Cake, 
  PartyPopper, 
  Users, 
  Building2,
  Tent,
  Baby,
  GraduationCap,
  Gift,
  Home,
  Wine,
  Trophy,
  PlaneTakeoff,
  TreePine
} from 'lucide-react';

interface ExperienceType {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const experienceTypes: ExperienceType[] = [
  { id: 'travel', label: 'Travel', icon: Plane, color: 'text-blue-500', bgColor: 'bg-blue-50 hover:bg-blue-100' },
  { id: 'wedding', label: 'Wedding', icon: Heart, color: 'text-pink-500', bgColor: 'bg-pink-50 hover:bg-pink-100' },
  { id: 'proposal', label: 'Proposal', icon: Gem, color: 'text-purple-500', bgColor: 'bg-purple-50 hover:bg-purple-100' },
  { id: 'date-night', label: 'Date Night', icon: Sparkles, color: 'text-rose-500', bgColor: 'bg-rose-50 hover:bg-rose-100' },
  { id: 'birthday', label: 'Birthday', icon: Cake, color: 'text-orange-500', bgColor: 'bg-orange-50 hover:bg-orange-100' },
  { id: 'bachelor', label: 'Bachelor/Bachelorette', icon: PartyPopper, color: 'text-violet-500', bgColor: 'bg-violet-50 hover:bg-violet-100' },
  { id: 'anniversary', label: 'Anniversary Trip', icon: Heart, color: 'text-red-500', bgColor: 'bg-red-50 hover:bg-red-100' },
  { id: 'corporate', label: 'Corporate Events', icon: Building2, color: 'text-slate-500', bgColor: 'bg-slate-50 hover:bg-slate-100' },
  { id: 'reunion', label: 'Reunions', icon: Users, color: 'text-cyan-500', bgColor: 'bg-cyan-50 hover:bg-cyan-100' },
  { id: 'wedding-anniversary', label: 'Wedding Anniversaries', icon: Gift, color: 'text-amber-500', bgColor: 'bg-amber-50 hover:bg-amber-100' },
  { id: 'retreats', label: 'Retreats', icon: Tent, color: 'text-emerald-500', bgColor: 'bg-emerald-50 hover:bg-emerald-100' },
  { id: 'baby-shower', label: 'Baby Shower', icon: Baby, color: 'text-sky-500', bgColor: 'bg-sky-50 hover:bg-sky-100' },
  { id: 'graduation', label: 'Graduation Party', icon: GraduationCap, color: 'text-indigo-500', bgColor: 'bg-indigo-50 hover:bg-indigo-100' },
  { id: 'engagement', label: 'Engagement Party', icon: Gem, color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-50 hover:bg-fuchsia-100' },
  { id: 'housewarming', label: 'Housewarming Party', icon: Home, color: 'text-teal-500', bgColor: 'bg-teal-50 hover:bg-teal-100' },
  { id: 'retirement', label: 'Retirement Party', icon: Wine, color: 'text-wine-500', bgColor: 'bg-rose-50 hover:bg-rose-100' },
  { id: 'career', label: 'Career Achievement', icon: Trophy, color: 'text-yellow-500', bgColor: 'bg-yellow-50 hover:bg-yellow-100' },
  { id: 'farewell', label: 'Farewell Party', icon: PlaneTakeoff, color: 'text-lime-500', bgColor: 'bg-lime-50 hover:bg-lime-100' },
  { id: 'holiday', label: 'Holiday Party', icon: TreePine, color: 'text-green-500', bgColor: 'bg-green-50 hover:bg-green-100' },
];

interface ExperienceTypesProps {
  onSelect?: (type: string) => void;
}

export function ExperienceTypes({ onSelect }: ExperienceTypesProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelectedType(id);
    onSelect?.(id);
  };

  return (
    <section className="py-16 bg-gradient-to-br from-teal-700 via-teal-800 to-teal-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Choose Your Experience
            </h2>
          </div>
          <p className="text-teal-100 text-lg">
            Start planning with our templates. Choose your experience type to get personalized recommendations.
          </p>
        </motion.div>

        {/* Experience Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {experienceTypes.map((type, index) => (
            <motion.button
              key={type.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.03 }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelect(type.id)}
              className={`
                flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm
                transition-all duration-300 border-2
                ${selectedType === type.id 
                  ? 'bg-white border-white text-teal-800 shadow-lg' 
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }
              `}
            >
              <type.icon className={`w-4 h-4 ${selectedType === type.id ? 'text-teal-600' : ''}`} />
              {type.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Selected Type Indicator */}
        {selectedType && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 text-center"
          >
            <p className="text-teal-200">
              Showing recommendations for <span className="text-white font-semibold">
                {experienceTypes.find(t => t.id === selectedType)?.label}
              </span>
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}

export default ExperienceTypes;
