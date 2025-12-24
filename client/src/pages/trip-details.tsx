import { useTrip, useGenerateItinerary } from "@/hooks/use-trips";
import { useParams } from "wouter";
import { Loader2, Calendar, MapPin, Sparkles, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

export default function TripDetails() {
  const { id } = useParams();
  const { data: trip, isLoading } = useTrip(id || "");
  const generateItinerary = useGenerateItinerary();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return <div>Trip not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Hero Header */}
      <div className="relative h-[40vh] min-h-[300px]">
        {/* trip destination hero image */}
        <img 
          src={`https://source.unsplash.com/1600x900/?${encodeURIComponent(trip.destination)},travel`}
          alt={trip.destination}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-10 text-white">
          <div className="max-w-4xl">
             <div className="flex items-center gap-2 mb-2 text-white/80 uppercase tracking-wider text-sm font-semibold">
               <MapPin className="w-4 h-4" /> {trip.destination}
             </div>
             <h1 className="text-4xl md:text-6xl font-display font-bold mb-4">{trip.title}</h1>
             <div className="flex flex-wrap gap-6 text-white/90">
               <div className="flex items-center gap-2">
                 <Calendar className="w-5 h-5" />
                 {format(new Date(trip.startDate), "MMMM d")} - {format(new Date(trip.endDate), "MMMM d, yyyy")}
               </div>
               <div className="flex items-center gap-2">
                 <User className="w-5 h-5" />
                 {trip.numberOfTravelers} Traveler{trip.numberOfTravelers !== 1 ? 's' : ''}
               </div>
             </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6 md:p-8">
           <Tabs defaultValue="itinerary">
             <div className="flex justify-between items-center mb-6">
               <TabsList>
                 <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                 <TabsTrigger value="bookings">Bookings</TabsTrigger>
                 <TabsTrigger value="expert">Ask an Expert</TabsTrigger>
               </TabsList>

               <Button 
                 onClick={() => generateItinerary.mutate(trip.id)}
                 disabled={generateItinerary.isPending}
                 className="hidden md:flex"
               >
                 {generateItinerary.isPending ? (
                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                 ) : (
                   <Sparkles className="w-4 h-4 mr-2" />
                 )}
                 Regenerate Plan
               </Button>
             </div>

             <TabsContent value="itinerary" className="space-y-6">
               {/* This is where the itinerary content would go. 
                   For now, we'll show a placeholder state or the generated data if available. 
                   Assuming trip would have generatedItinerary relationship loaded or separate fetch.
               */}
               <Card>
                 <CardContent className="pt-6 text-center py-16">
                   <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                     <Sparkles className="w-8 h-8" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">Your AI Itinerary</h3>
                   <p className="text-slate-600 max-w-md mx-auto mb-6">
                     We can generate a day-by-day plan based on your preferences.
                   </p>
                   <Button onClick={() => generateItinerary.mutate(trip.id)} disabled={generateItinerary.isPending}>
                     Generate Itinerary
                   </Button>
                 </CardContent>
               </Card>
             </TabsContent>

             <TabsContent value="bookings">
               <div className="grid gap-4">
                  <div className="p-4 border rounded-lg bg-gray-50 text-center text-slate-500">
                    No bookings added yet.
                  </div>
               </div>
             </TabsContent>

             <TabsContent value="expert">
               <div className="grid md:grid-cols-2 gap-8 items-center">
                 <div>
                   <h3 className="text-2xl font-bold text-slate-900 mb-4">Connect with a Local Expert</h3>
                   <p className="text-slate-600 mb-6">
                     Get personalized advice, hidden gems, and real-time support from someone who lives in {trip.destination}.
                   </p>
                   <Button variant="outline" className="gap-2">
                     Find an Expert <ArrowRight className="w-4 h-4" />
                   </Button>
                 </div>
                 <div className="bg-slate-100 rounded-2xl h-64 flex items-center justify-center">
                    <span className="text-slate-400">Expert Profiles Preview</span>
                 </div>
               </div>
             </TabsContent>
           </Tabs>
        </div>
      </div>
    </div>
  );
}
