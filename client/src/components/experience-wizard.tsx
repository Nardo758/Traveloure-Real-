import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, ArrowRight, Check, ChevronRight, MapPin, Calendar,
  Plane, Heart, Gem, PartyPopper, Briefcase, Users, Sparkles, Save,
  Building2, Camera, Music, Cake, Car, Hotel, Utensils, Flower,
  Lightbulb, CircleDot, Wine, Star, Search, Plus, X, Clock
} from "lucide-react";
import type { ExperienceType, ExperienceTemplateStep, UserExperience, UserExperienceItem } from "@shared/schema";

const iconMap: Record<string, any> = {
  plane: Plane,
  heart: Heart,
  gem: Gem,
  "party-popper": PartyPopper,
  briefcase: Briefcase,
  users: Users,
  sparkles: Sparkles,
  calendar: Calendar,
  building: Building2,
  camera: Camera,
  music: Music,
  cake: Cake,
  car: Car,
  hotel: Hotel,
  utensils: Utensils,
  flower: Flower,
  lightbulb: Lightbulb,
  ring: CircleDot,
  wine: Wine,
  star: Star,
  "map-pin": MapPin,
  clock: Clock,
};

interface WizardProps {
  experienceType: ExperienceType;
  steps: ExperienceTemplateStep[];
  existingExperience?: UserExperience;
}

interface StepData {
  selections: Array<{
    id: string;
    type: "provider" | "custom";
    providerId?: string;
    name: string;
    description?: string;
    price?: number;
    location?: string;
    date?: string;
    notes?: string;
  }>;
  notes?: string;
  budget?: number;
}

export function ExperienceWizard({ experienceType, steps, existingExperience }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [experienceName, setExperienceName] = useState(existingExperience?.title || "");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stepData, setStepData] = useState<Record<string, StepData>>({});
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const typeColor = experienceType.color || "#FF385C";
  const TypeIcon = experienceType.icon ? iconMap[experienceType.icon] || Sparkles : Sparkles;
  
  // Include intro step
  const totalSteps = steps.length + 1;
  const progress = ((currentStep + 1) / totalSteps) * 100;
  const currentTemplateStep = currentStep > 0 ? steps[currentStep - 1] : null;

  const createExperienceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/user-experiences", data);
      return response.json();
    },
    onSuccess: (newExperience) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      toast({ title: "Experience saved!", description: "Your experience plan has been created." });
      navigate(`/experiences/my-experiences`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save experience.", variant: "destructive" });
    }
  });

  const updateExperienceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/user-experiences/${existingExperience?.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      toast({ title: "Experience updated!", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update experience.", variant: "destructive" });
    }
  });

  const handleNext = () => {
    if (currentStep === 0) {
      if (!experienceName.trim()) {
        toast({ title: "Name required", description: "Please give your experience a name.", variant: "destructive" });
        return;
      }
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSave = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to save your experience.", variant: "destructive" });
      return;
    }

    const experienceData = {
      experienceTypeId: experienceType.id,
      name: experienceName,
      destination,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      preferences: { stepData },
      status: "draft" as const,
    };

    if (existingExperience) {
      updateExperienceMutation.mutate(experienceData);
    } else {
      createExperienceMutation.mutate(experienceData);
    }
  };

  const addCustomSelection = (stepId: string) => {
    setStepData(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        selections: [
          ...(prev[stepId]?.selections || []),
          { id: crypto.randomUUID(), type: "custom", name: "", description: "" }
        ]
      }
    }));
  };

  const updateSelection = (stepId: string, selectionId: string, updates: Partial<StepData["selections"][0]>) => {
    setStepData(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        selections: (prev[stepId]?.selections || []).map(s =>
          s.id === selectionId ? { ...s, ...updates } : s
        )
      }
    }));
  };

  const removeSelection = (stepId: string, selectionId: string) => {
    setStepData(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        selections: (prev[stepId]?.selections || []).filter(s => s.id !== selectionId)
      }
    }));
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div 
          className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"
        >
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link href="/experiences">
                  <Button variant="ghost" size="icon" data-testid="button-back-experiences">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div 
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${typeColor}20` }}
                >
                  <TypeIcon className="h-5 w-5" style={{ color: typeColor }} />
                </div>
                <div>
                  <h1 className="font-semibold text-foreground">{experienceType.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Step {currentStep + 1} of {totalSteps}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleSave}
                  disabled={createExperienceMutation.isPending || updateExperienceMutation.isPending}
                  data-testid="button-save-experience"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1">
                <Card className="p-4 sticky top-32">
                  <h3 className="font-medium mb-3 text-sm">Steps</h3>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-1">
                      <button
                        onClick={() => setCurrentStep(0)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                          currentStep === 0 
                            ? "bg-primary/10 text-primary" 
                            : "hover:bg-muted"
                        }`}
                        data-testid="step-intro"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Getting Started</span>
                        {experienceName && (
                          <Check className="h-3 w-3 ml-auto text-green-500" />
                        )}
                      </button>
                      {steps.map((step, index) => {
                        const StepIcon = step.icon ? iconMap[step.icon] || Star : Star;
                        const hasData = stepData[step.id]?.selections?.length > 0;
                        return (
                          <button
                            key={step.id}
                            onClick={() => setCurrentStep(index + 1)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                              currentStep === index + 1
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted text-muted-foreground"
                            }`}
                            data-testid={`step-${step.stepNumber}`}
                          >
                            <StepIcon className="h-4 w-4" />
                            <span className="truncate">{step.name}</span>
                            {hasData && (
                              <Check className="h-3 w-3 ml-auto text-green-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </Card>
              </div>

              <div className="lg:col-span-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    {currentStep === 0 ? (
                      <Card className="p-6">
                        <h2 className="text-2xl font-bold mb-2">Let's Plan Your {experienceType.name}</h2>
                        <p className="text-muted-foreground mb-6">
                          {experienceType.description || "Start by giving your experience a name and basic details."}
                        </p>
                        
                        <div className="space-y-6">
                          <div>
                            <Label htmlFor="experience-name">Experience Name</Label>
                            <Input
                              id="experience-name"
                              placeholder={`My ${experienceType.name} Experience`}
                              value={experienceName}
                              onChange={(e) => setExperienceName(e.target.value)}
                              className="mt-1"
                              data-testid="input-experience-name"
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="destination">Destination</Label>
                            <div className="relative mt-1">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="destination"
                                placeholder="Where is this experience?"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                className="pl-10"
                                data-testid="input-destination"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="start-date">Start Date</Label>
                              <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  id="start-date"
                                  type="date"
                                  value={startDate}
                                  onChange={(e) => setStartDate(e.target.value)}
                                  className="pl-10"
                                  data-testid="input-start-date"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="end-date">End Date</Label>
                              <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  id="end-date"
                                  type="date"
                                  value={endDate}
                                  onChange={(e) => setEndDate(e.target.value)}
                                  className="pl-10"
                                  data-testid="input-end-date"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ) : currentTemplateStep ? (
                      <StepContent 
                        step={currentTemplateStep}
                        typeColor={typeColor}
                        data={stepData[currentTemplateStep.id] || { selections: [] }}
                        onAddCustom={() => addCustomSelection(currentTemplateStep.id)}
                        onUpdateSelection={(selectionId, updates) => updateSelection(currentTemplateStep.id, selectionId, updates)}
                        onRemoveSelection={(selectionId) => removeSelection(currentTemplateStep.id, selectionId)}
                      />
                    ) : null}

                    <div className="flex justify-between mt-6">
                      <Button
                        variant="outline"
                        onClick={handlePrevious}
                        disabled={currentStep === 0}
                        data-testid="button-previous-step"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Previous
                      </Button>
                      {currentStep < totalSteps - 1 ? (
                        <Button
                          onClick={handleNext}
                          data-testid="button-next-step"
                        >
                          Next
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSave}
                          disabled={createExperienceMutation.isPending || updateExperienceMutation.isPending}
                          data-testid="button-complete-experience"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Complete & Save
                        </Button>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface StepContentProps {
  step: ExperienceTemplateStep;
  typeColor: string;
  data: StepData;
  onAddCustom: () => void;
  onUpdateSelection: (selectionId: string, updates: any) => void;
  onRemoveSelection: (selectionId: string) => void;
}

function StepContent({ step, typeColor, data, onAddCustom, onUpdateSelection, onRemoveSelection }: StepContentProps) {
  const StepIcon = step.icon ? iconMap[step.icon] || Star : Star;
  
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <div 
          className="h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${typeColor}20` }}
        >
          <StepIcon className="h-6 w-6" style={{ color: typeColor }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">{step.name}</h2>
          <p className="text-muted-foreground mt-1">
            {step.description || `Add ${step.name.toLowerCase()} options for your experience.`}
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Your Selections</h3>
          <Button 
            variant="outline" 
            size="sm"
            onClick={onAddCustom}
            data-testid="button-add-custom"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Custom
          </Button>
        </div>

        {data.selections.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <div 
              className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${typeColor}10` }}
            >
              <Plus className="h-6 w-6" style={{ color: typeColor }} />
            </div>
            <h4 className="font-medium mb-2">No selections yet</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Add providers or custom options for {step.name.toLowerCase()}.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" data-testid="button-browse-providers">
                <Search className="h-4 w-4 mr-1" />
                Browse Providers
              </Button>
              <Button size="sm" onClick={onAddCustom} data-testid="button-add-custom-empty">
                <Plus className="h-4 w-4 mr-1" />
                Add Custom
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.selections.map((selection, index) => (
              <Card key={selection.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={selection.type === "provider" ? "default" : "secondary"}>
                        {selection.type === "provider" ? "Provider" : "Custom"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Option {index + 1}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Name</Label>
                        <Input
                          placeholder="Enter name..."
                          value={selection.name}
                          onChange={(e) => onUpdateSelection(selection.id, { name: e.target.value })}
                          className="mt-1"
                          data-testid={`input-selection-name-${index}`}
                        />
                      </div>
                      <div>
                        <Label>Estimated Price</Label>
                        <Input
                          type="number"
                          placeholder="$0.00"
                          value={selection.price || ""}
                          onChange={(e) => onUpdateSelection(selection.id, { price: parseFloat(e.target.value) || 0 })}
                          className="mt-1"
                          data-testid={`input-selection-price-${index}`}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Add notes..."
                        value={selection.notes || ""}
                        onChange={(e) => onUpdateSelection(selection.id, { notes: e.target.value })}
                        className="mt-1 resize-none"
                        rows={2}
                        data-testid={`input-selection-notes-${index}`}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveSelection(selection.id)}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-selection-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
