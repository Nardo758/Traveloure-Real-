import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plane, Heart, Gem, Diamond, HeartHandshake, Cake, Briefcase, Users, Sparkles, Calendar,
  ArrowRight, Star, MapPin, Clock, ChevronRight
} from "lucide-react";
import type { ExperienceType } from "@shared/schema";

// Step counts per experience type
const stepCounts: Record<string, number> = {
  "travel": 5,
  "wedding": 14,
  "proposal": 10,
  "romance": 5,
  "birthday": 8,
  "corporate": 7,
  "boys-trip": 8,
  "girls-trip": 11,
};

const iconMap: Record<string, any> = {
  Plane: Plane,
  Heart: Heart,
  Gem: Gem,
  Diamond: Diamond,
  HeartHandshake: HeartHandshake,
  Cake: Cake,
  Briefcase: Briefcase,
  Users: Users,
  Sparkles: Sparkles,
  Calendar: Calendar,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function Experiences() {
  const { data: experienceTypes, isLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
  });

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background py-16 sm:py-24">
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <div className="container mx-auto px-4">
            <motion.div 
              className="max-w-3xl mx-auto text-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="secondary" className="mb-4">
                <Sparkles className="h-3 w-3 mr-1" />
                Experience Planning
              </Badge>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                Plan Your Perfect Experience
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Choose from 8 curated experience templates. Our guided wizards help you plan every detail,
                connect with expert providers, and create unforgettable moments.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>Interactive Maps</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 text-primary" />
                  <span>Expert Providers</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>Step-by-Step Guidance</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="p-6">
                    <Skeleton className="h-12 w-12 rounded-full mb-4" />
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-4" />
                    <Skeleton className="h-4 w-1/2" />
                  </Card>
                ))}
              </div>
            ) : (
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {experienceTypes?.map((type) => {
                  const IconComponent = type.icon ? iconMap[type.icon] || Sparkles : Sparkles;
                  const typeColor = type.color || "#FF385C";
                  const totalSteps = stepCounts[type.slug] || 5;
                  return (
                    <motion.div key={type.id} variants={cardVariants}>
                      <Link href={`/experiences/${type.slug}/new`}>
                        <Card 
                          className="group relative overflow-visible h-full cursor-pointer transition-all duration-300 hover-elevate"
                          data-testid={`card-experience-${type.slug}`}
                        >
                          <div className="p-6">
                            <div 
                              className="h-12 w-12 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                              style={{ backgroundColor: `${typeColor}20` }}
                            >
                              <IconComponent 
                                className="h-6 w-6" 
                                style={{ color: typeColor }}
                              />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                              {type.name}
                              <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 text-muted-foreground" />
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                              {type.description}
                            </p>
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">
                                {totalSteps} steps
                              </Badge>
                              <ArrowRight 
                                className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                                style={{ color: typeColor }}
                              />
                            </div>
                          </div>
                          <div 
                            className="absolute bottom-0 left-0 right-0 h-1 opacity-0 transition-opacity group-hover:opacity-100"
                            style={{ backgroundColor: typeColor }}
                          />
                        </Card>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            <motion.div 
              className="mt-16 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Card className="p-8 bg-muted/50">
                <h2 className="text-xl font-semibold mb-2">Need Help Deciding?</h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  Connect with our travel experts who specialize in different experience types.
                  They can help you choose and plan the perfect experience.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/experts">
                    <Button data-testid="button-find-expert">
                      Find an Expert
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/help-me-decide">
                    <Button variant="outline" data-testid="button-help-decide">
                      Explore Packages
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
