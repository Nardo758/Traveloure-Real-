import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { 
  ArrowRight,
  Rocket,
  Plane,
  Heart,
  Gem,
  Cake,
  Building2,
  Sparkles,
  Star,
  Globe,
  Users,
  CalendarHeart,
  Mountain,
  Baby,
  GraduationCap,
  Diamond,
  Home,
  PartyPopper,
  Trophy,
  HandHeart,
  TreePine,
  Bot,
  UserCheck,
  Wine,
  HeartHandshake,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.jpg";

const experienceCategories = [
  { icon: Plane, label: "Travel", slug: "travel", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { icon: Heart, label: "Wedding", slug: "wedding", color: "text-pink-500", bgColor: "bg-pink-500/10" },
  { icon: Gem, label: "Proposal", slug: "proposal", color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { icon: Sparkles, label: "Date Night", slug: "date-night", color: "text-red-500", bgColor: "bg-red-500/10" },
  { icon: Cake, label: "Birthday", slug: "birthday", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  { icon: PartyPopper, label: "Bachelor/Bachelorette", slug: "bachelor-bachelorette", color: "text-pink-600", bgColor: "bg-pink-600/10" },
  { icon: HeartHandshake, label: "Anniversary", slug: "anniversary-trip", color: "text-rose-600", bgColor: "bg-rose-600/10" },
  { icon: Building2, label: "Corporate", slug: "corporate-events", color: "text-slate-600", bgColor: "bg-slate-600/10" },
  { icon: Users, label: "Reunions", slug: "reunions", color: "text-indigo-500", bgColor: "bg-indigo-500/10" },
  { icon: Mountain, label: "Retreats", slug: "retreats", color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  { icon: Baby, label: "Baby Shower", slug: "baby-shower", color: "text-sky-400", bgColor: "bg-sky-400/10" },
  { icon: GraduationCap, label: "Graduation", slug: "graduation-party", color: "text-amber-500", bgColor: "bg-amber-500/10" },
];

export default function LandingMockups() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-gray-900 text-white py-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Landing Page Hero Mockups</h1>
        <p className="text-gray-300 mt-1">Scroll down to see all three options</p>
      </div>

      {/* OPTION A: Split Hero Layout */}
      <section className="border-b-8 border-amber-500">
        <div className="bg-amber-500 text-white py-3 px-6">
          <h2 className="text-xl font-bold">OPTION A: Split Hero Layout</h2>
          <p className="text-amber-100">Content on left, experience grid on right</p>
        </div>
        <div 
          className="relative min-h-[650px] flex items-center"
          style={{
            backgroundImage: `url(${lakeImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
          
          <div className="container mx-auto px-6 max-w-7xl relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Content */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium mb-6">
                  <Rocket className="w-4 h-4" />
                  BETA VERSION
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
                  Plan Your Perfect<br />
                  <span className="text-[#FF385C]">Life Experiences</span>
                </h1>
                
                <p className="text-lg text-white/90 leading-relaxed mb-8 max-w-lg">
                  From dream vacations to unforgettable celebrations — plan it yourself with AI or get personalized help from experts.
                </p>

                <div className="flex flex-wrap gap-4">
                  <Button 
                    size="lg"
                    className="bg-[#FF385C] hover:bg-[#E23350] text-white font-semibold px-8"
                  >
                    <Bot className="w-5 h-5 mr-2" />
                    Start with AI
                  </Button>
                  <Button 
                    size="lg"
                    variant="outline"
                    className="border-white/40 text-white hover:bg-white/10 backdrop-blur-sm font-semibold px-8"
                  >
                    <UserCheck className="w-5 h-5 mr-2" />
                    Find an Expert
                  </Button>
                </div>
              </motion.div>

              {/* Right: Experience Grid */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20"
              >
                <h3 className="text-white font-semibold mb-4 text-lg">What are you planning?</h3>
                <div className="grid grid-cols-3 gap-3">
                  {experienceCategories.map((cat) => (
                    <button
                      key={cat.slug}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/10 hover:border-white/30 group"
                    >
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", cat.bgColor)}>
                        <cat.icon className={cn("w-5 h-5", cat.color)} />
                      </div>
                      <span className="text-white text-xs font-medium text-center">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* OPTION B: Centered Flow */}
      <section className="border-b-8 border-emerald-500">
        <div className="bg-emerald-500 text-white py-3 px-6">
          <h2 className="text-xl font-bold">OPTION B: Centered Flow with Prominent Experience Selector</h2>
          <p className="text-emerald-100">Everything centered, experiences as main focus</p>
        </div>
        <div 
          className="relative min-h-[700px] flex items-center"
          style={{
            backgroundImage: `url(${lakeImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />
          
          <div className="container mx-auto px-6 max-w-5xl relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium mb-6">
                <Rocket className="w-4 h-4" />
                BETA VERSION
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-4">
                What's Your Next<br />
                <span className="text-[#FF385C]">Adventure?</span>
              </h1>
              
              <p className="text-lg text-white/90 leading-relaxed max-w-2xl mx-auto mb-10">
                Choose your experience and let AI or local experts help you plan
              </p>

              {/* Experience Grid - Larger, More Prominent */}
              <div className="grid grid-cols-4 md:grid-cols-6 gap-4 mb-10 max-w-4xl mx-auto">
                {experienceCategories.map((cat) => (
                  <button
                    key={cat.slug}
                    className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/95 hover:bg-white transition-all shadow-lg hover:shadow-xl hover:scale-105 group"
                  >
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", cat.bgColor)}>
                      <cat.icon className={cn("w-6 h-6", cat.color)} />
                    </div>
                    <span className="text-gray-800 text-xs font-semibold text-center">{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Two CTAs */}
              <div className="flex flex-wrap justify-center gap-4">
                <Button 
                  size="lg"
                  className="bg-[#FF385C] hover:bg-[#E23350] text-white font-semibold px-8"
                >
                  <Bot className="w-5 h-5 mr-2" />
                  Plan with AI
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button 
                  size="lg"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8"
                >
                  <UserCheck className="w-5 h-5 mr-2" />
                  Talk to an Expert
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* OPTION C: Full-Width Experience Showcase */}
      <section>
        <div className="bg-purple-600 text-white py-3 px-6">
          <h2 className="text-xl font-bold">OPTION C: Full-Width Experience Showcase</h2>
          <p className="text-purple-200">Horizontal carousel with larger visual tiles</p>
        </div>
        <div 
          className="relative min-h-[700px] flex flex-col justify-center"
          style={{
            backgroundImage: `url(${lakeImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
          
          <div className="relative z-10">
            {/* Top: Headline */}
            <div className="text-center px-6 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium mb-4">
                  <Rocket className="w-4 h-4" />
                  BETA VERSION
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white leading-[1.1] tracking-tight mb-3">
                  Plan Unforgettable <span className="text-[#FF385C]">Experiences</span>
                </h1>
                <p className="text-lg text-white/90 max-w-xl mx-auto">
                  Pick an experience to get started
                </p>
              </motion.div>
            </div>

            {/* Middle: Horizontal Scrolling Cards */}
            <div className="overflow-x-auto pb-4 px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex gap-4 min-w-max mx-auto justify-center"
              >
                {experienceCategories.map((cat) => (
                  <button
                    key={cat.slug}
                    className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/95 hover:bg-white transition-all shadow-xl hover:shadow-2xl hover:scale-105 min-w-[140px] group"
                  >
                    <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", cat.bgColor)}>
                      <cat.icon className={cn("w-8 h-8", cat.color)} />
                    </div>
                    <span className="text-gray-800 text-sm font-bold text-center">{cat.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#FF385C] transition-colors" />
                  </button>
                ))}
              </motion.div>
            </div>

            {/* Bottom: Pathway Options Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 px-6"
            >
              <div className="max-w-3xl mx-auto bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                  <div className="flex items-center gap-3 text-white">
                    <Bot className="w-6 h-6 text-[#FF385C]" />
                    <span className="font-medium">Plan with AI</span>
                  </div>
                  <div className="hidden md:block w-px h-8 bg-white/30" />
                  <div className="text-white/60">or</div>
                  <div className="hidden md:block w-px h-8 bg-white/30" />
                  <div className="flex items-center gap-3 text-white">
                    <UserCheck className="w-6 h-6 text-emerald-400" />
                    <span className="font-medium">Get Expert Help</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Navigation Footer */}
      <div className="bg-gray-900 text-white py-6 px-6 text-center sticky bottom-0">
        <p className="text-gray-300 mb-4">Which layout do you prefer?</p>
        <div className="flex justify-center gap-4 flex-wrap">
          <span className="px-4 py-2 bg-amber-500 rounded-lg font-bold">A: Split</span>
          <span className="px-4 py-2 bg-emerald-500 rounded-lg font-bold">B: Centered</span>
          <span className="px-4 py-2 bg-purple-600 rounded-lg font-bold">C: Carousel</span>
        </div>
        <Link href="/">
          <Button variant="outline" className="mt-4 border-gray-600 text-gray-300 hover:bg-gray-800">
            Back to Current Landing Page
          </Button>
        </Link>
      </div>
    </div>
  );
}
