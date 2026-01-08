import { useState } from "react";
import { Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export default function LayoutMock() {
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [activeTab, setActiveTab] = useState("activities");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[#FF385C]">TRAVELOURE</span>
          <span className="text-xs bg-[#FF385C] text-white px-2 py-0.5 rounded">BETA</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2">
            <span className="text-amber-500">0 Credits</span>
            <span>+</span>
          </Button>
          <Button className="bg-[#FF385C] hover:bg-[#E02D50]">
            Generate Itinerary
          </Button>
        </div>
      </header>

      {/* Hero Section - responsive height matching original */}
      <div className="relative h-56 md:h-72 lg:h-80 overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600" 
          alt="Trip cover" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Trip Details Card - negative margin overlay */}
      <div className="bg-white rounded-xl shadow-md border p-4 sm:p-6 w-full max-w-xl mx-auto mt-[-200px] z-20 relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Trip Details</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Users className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Destination Input */}
          <div>
            <label className="text-sm font-medium">Trip to:</label>
            <Input
              className="mt-1"
              placeholder="Eg: Paris, New York, Japan"
            />
          </div>

          {/* Travel Dates */}
          <div>
            <label className="text-sm font-medium">Travel Dates:</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-sm text-muted-foreground">From</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-1 justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {startDate?.toLocaleDateString() || "Start Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">To</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-1 justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {endDate?.toLocaleDateString() || "End Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <Button className="w-full bg-[#FF385C] hover:bg-[#E02D50]">
            Submit Trip Details
          </Button>
        </div>
      </div>

      {/* Tabs - positioned below card */}
      <div className="px-4 mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent gap-2 p-0 h-auto">
            <TabsTrigger 
              value="activities"
              className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-full px-4 py-2 border"
            >
              Activities
            </TabsTrigger>
            <TabsTrigger 
              value="hotels"
              className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-full px-4 py-2 border"
            >
              Hotels
            </TabsTrigger>
            <TabsTrigger 
              value="services"
              className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-full px-4 py-2 border"
            >
              Services
            </TabsTrigger>
            <TabsTrigger 
              value="ai"
              className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-full px-4 py-2 border"
            >
              AI Optimization
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activities" className="mt-6">
            <div className="text-muted-foreground">Activities content goes here...</div>
          </TabsContent>
          <TabsContent value="hotels" className="mt-6">
            <div className="text-muted-foreground">Hotels content goes here...</div>
          </TabsContent>
          <TabsContent value="services" className="mt-6">
            <div className="text-muted-foreground">Services content goes here...</div>
          </TabsContent>
          <TabsContent value="ai" className="mt-6">
            <div className="text-muted-foreground">AI Optimization content goes here...</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
