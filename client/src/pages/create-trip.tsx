import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTripSchema } from "@shared/schema";
import { z } from "zod";
import { useCreateTrip } from "@/hooks/use-trips";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Loader2, MapPin, Users, Calendar, Sparkles, Check, ArrowLeft, ArrowRight, Mountain, Palmtree, Landmark, UtensilsCrossed, TreePine, Moon, Heart, Plane, Gift, Briefcase, Star, PartyPopper } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const eventTypes = [
  { id: "vacation", label: "Vacation", icon: Plane, description: "Leisure travel and exploration" },
  { id: "wedding", label: "Wedding", icon: Heart, description: "Destination wedding planning" },
  { id: "honeymoon", label: "Honeymoon", icon: Heart, description: "Romantic getaway for newlyweds" },
  { id: "proposal", label: "Proposal", icon: Gift, description: "Plan the perfect proposal" },
  { id: "anniversary", label: "Anniversary", icon: Star, description: "Celebrate your special day" },
  { id: "birthday", label: "Birthday", icon: PartyPopper, description: "Birthday celebration trip" },
  { id: "corporate", label: "Corporate", icon: Briefcase, description: "Business travel and retreats" },
  { id: "adventure", label: "Adventure", icon: Mountain, description: "Thrill-seeking experiences" },
];

const formSchema = insertTripSchema.extend({
  title: z.string().min(1, "Title is required"),
  destination: z.string().min(1, "Destination is required"),
  eventType: z.string().default("vacation"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  numberOfTravelers: z.coerce.number().min(1, "At least 1 traveler required"),
  budget: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const travelStyles = [
  { id: "adventure", label: "Adventure", icon: Mountain },
  { id: "relaxation", label: "Relaxation", icon: Palmtree },
  { id: "culture", label: "Culture & History", icon: Landmark },
  { id: "food", label: "Food & Culinary", icon: UtensilsCrossed },
  { id: "nature", label: "Nature & Wildlife", icon: TreePine },
  { id: "nightlife", label: "Nightlife", icon: Moon },
];

const budgetOptions = [
  { id: "budget", label: "Budget", description: "$50-100/day" },
  { id: "moderate", label: "Moderate", description: "$100-250/day" },
  { id: "luxury", label: "Luxury", description: "$250+/day" },
];

const steps = [
  { id: 1, title: "Event Type", description: "What kind of trip is this?" },
  { id: 2, title: "Destination", description: "Where do you want to go?" },
  { id: 3, title: "Dates", description: "When are you traveling?" },
  { id: 4, title: "Preferences", description: "Customize your experience" },
  { id: 5, title: "Review", description: "Confirm your trip details" },
];

export default function CreateTrip() {
  const [, setLocation] = useLocation();
  const createTrip = useCreateTrip();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string>("moderate");
  const [selectedEventType, setSelectedEventType] = useState<string>("vacation");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      destination: "",
      eventType: "vacation",
      numberOfTravelers: 1,
      status: "draft",
      budget: "moderate",
    },
  });

  const destination = form.watch("destination");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const travelers = form.watch("numberOfTravelers");
  const title = form.watch("title");

  const toggleStyle = (styleId: string) => {
    setSelectedStyles(prev => 
      prev.includes(styleId) 
        ? prev.filter(s => s !== styleId)
        : [...prev, styleId]
    );
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedEventType && selectedEventType.length > 0;
      case 2:
        return destination && destination.length > 0;
      case 3:
        return startDate && endDate;
      case 4:
        return true;
      case 5:
        return title && title.length > 0;
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (currentStep < 5 && canProceed()) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  function onSubmit(data: FormValues) {
    createTrip.mutate(
      {
        ...data,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
      },
      {
        onSuccess: (trip) => {
          setLocation(`/trip/${trip.id}`);
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/dashboard")}
            className="mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
            Plan Your Perfect Trip
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Let's create an amazing travel experience tailored just for you.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div 
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all",
                      currentStep > step.id 
                        ? "bg-accent text-white" 
                        : currentStep === step.id 
                          ? "bg-primary text-white" 
                          : "bg-muted text-gray-600 dark:text-gray-400"
                    )}
                  >
                    {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
                  </div>
                  <span className="text-xs mt-2 text-gray-600 dark:text-gray-400 hidden md:block">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div 
                    className={cn(
                      "h-1 w-16 md:w-24 mx-2 rounded-full transition-all",
                      currentStep > step.id ? "bg-accent" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Card */}
        <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <CardContent className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <AnimatePresence mode="wait">
                  {/* Step 1: Event Type */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center mb-8">
                        <Sparkles className="w-12 h-12 mx-auto text-primary mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What kind of trip is this?</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">Select your event type for personalized recommendations</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {eventTypes.map((event) => {
                          const IconComponent = event.icon;
                          return (
                            <div
                              key={event.id}
                              onClick={() => {
                                setSelectedEventType(event.id);
                                form.setValue("eventType", event.id);
                              }}
                              className={cn(
                                "p-4 rounded-lg border-2 cursor-pointer transition-all text-center",
                                selectedEventType === event.id
                                  ? "border-primary bg-primary/10"
                                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700"
                              )}
                              data-testid={`card-event-${event.id}`}
                            >
                              <IconComponent className={cn(
                                "w-8 h-8 mx-auto mb-2",
                                selectedEventType === event.id ? "text-primary" : "text-gray-600 dark:text-gray-400"
                              )} />
                              <h3 className="font-semibold text-sm">{event.label}</h3>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{event.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Destination */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center mb-8">
                        <MapPin className="w-12 h-12 mx-auto text-primary mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Where do you want to go?</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">Enter your dream destination</p>
                      </div>

                      <FormField
                        control={form.control}
                        name="destination"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Destination</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Tokyo, Japan" 
                                {...field} 
                                className="bg-white dark:bg-gray-700 text-lg py-6"
                                data-testid="input-destination"
                              />
                            </FormControl>
                            <FormDescription>Enter a city, country, or region</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="numberOfTravelers"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of Travelers</FormLabel>
                            <FormControl>
                              <div className="flex items-center gap-4">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => field.onChange(Math.max(1, Number(field.value) - 1))}
                                  data-testid="button-decrease-travelers"
                                >
                                  -
                                </Button>
                                <span className="text-2xl font-bold w-12 text-center">{field.value}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => field.onChange(Number(field.value) + 1)}
                                  data-testid="button-increase-travelers"
                                >
                                  +
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {/* Step 3: Dates */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center mb-8">
                        <Calendar className="w-12 h-12 mx-auto text-primary mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">When are you traveling?</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">Select your travel dates</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="startDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Start Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full pl-3 text-left font-normal bg-white dark:bg-gray-700 py-6",
                                        !field.value && "text-gray-600 dark:text-gray-400"
                                      )}
                                      data-testid="button-start-date"
                                    >
                                      {field.value ? (
                                        format(field.value, "PPP")
                                      ) : (
                                        <span>Pick a date</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) =>
                                      date < new Date(new Date().setHours(0, 0, 0, 0))
                                    }
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="endDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>End Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full pl-3 text-left font-normal bg-white dark:bg-gray-700 py-6",
                                        !field.value && "text-gray-600 dark:text-gray-400"
                                      )}
                                      data-testid="button-end-date"
                                    >
                                      {field.value ? (
                                        format(field.value, "PPP")
                                      ) : (
                                        <span>Pick a date</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) =>
                                      date < new Date(new Date().setHours(0, 0, 0, 0)) ||
                                      (startDate && date < startDate)
                                    }
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Step 4: Preferences */}
                  {currentStep === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-8"
                    >
                      <div className="text-center mb-8">
                        <Sparkles className="w-12 h-12 mx-auto text-primary mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customize Your Experience</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">Tell us what you enjoy</p>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Travel Style (select all that apply)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {travelStyles.map((style) => (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => toggleStyle(style.id)}
                              className={cn(
                                "p-4 rounded-xl border-2 text-center transition-all",
                                selectedStyles.includes(style.id)
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50"
                              )}
                              data-testid={`button-style-${style.id}`}
                            >
                              <div className={cn(
                                "w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center",
                                selectedStyles.includes(style.id) ? "bg-primary text-white" : "bg-muted text-gray-600 dark:text-gray-400"
                              )}>
                                <style.icon className="w-5 h-5" />
                              </div>
                              <span className="text-sm font-medium">{style.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Budget Range</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {budgetOptions.map((budget) => (
                            <button
                              key={budget.id}
                              type="button"
                              onClick={() => {
                                setSelectedBudget(budget.id);
                                form.setValue("budget", budget.id);
                              }}
                              className={cn(
                                "p-4 rounded-xl border-2 text-center transition-all",
                                selectedBudget === budget.id
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50"
                              )}
                              data-testid={`button-budget-${budget.id}`}
                            >
                              <span className="font-medium block">{budget.label}</span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">{budget.description}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 5: Review */}
                  {currentStep === 5 && (
                    <motion.div
                      key="step5"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center mb-8">
                        <Check className="w-12 h-12 mx-auto text-accent mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Review Your Trip</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">Almost there! Give your trip a name and confirm.</p>
                      </div>

                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trip Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={`My ${destination || 'Amazing'} Adventure`} 
                                {...field} 
                                className="bg-white dark:bg-gray-700 text-lg py-6"
                                data-testid="input-title"
                              />
                            </FormControl>
                            <FormDescription>Give your trip a memorable name</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="bg-muted/50 rounded-xl p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Trip Summary</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Event Type</span>
                            <p className="font-medium capitalize">{selectedEventType}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Destination</span>
                            <p className="font-medium">{destination || "Not set"}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Travelers</span>
                            <p className="font-medium">{travelers} {travelers === 1 ? 'person' : 'people'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Dates</span>
                            <p className="font-medium">
                              {startDate && endDate 
                                ? `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`
                                : "Not set"}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Budget</span>
                            <p className="font-medium capitalize">{selectedBudget}</p>
                          </div>
                        </div>
                        {selectedStyles.length > 0 && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400 text-sm">Travel Styles</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {selectedStyles.map(styleId => {
                                const style = travelStyles.find(s => s.id === styleId);
                                const IconComponent = style?.icon;
                                return (
                                  <span key={styleId} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm flex items-center gap-1">
                                    {IconComponent && <IconComponent className="w-3 h-3" />}
                                    {style?.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8 pt-6 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    disabled={currentStep === 1}
                    data-testid="button-prev-step"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>

                  {currentStep < 5 ? (
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={!canProceed()}
                      data-testid="button-next-step"
                    >
                      Next
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      disabled={createTrip.isPending || !canProceed()}
                      className="bg-accent hover:bg-accent/90"
                      data-testid="button-create-trip"
                    >
                      {createTrip.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Create Trip
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
