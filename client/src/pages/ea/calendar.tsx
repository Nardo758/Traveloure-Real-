import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  AlertCircle,
  Bot,
  ChevronLeft,
  ChevronRight,
  CheckCircle
} from "lucide-react";

export default function EACalendar() {
  const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  
  const executives = [
    { name: "James A.", events: ["D", "", "G", "B", "", "W", ""] },
    { name: "Sarah C.", events: ["", "", "F", "", "", "", ""] },
    { name: "Michael T.", events: ["", "C", "", "C", "D", "", ""] },
    { name: "Lisa P.", events: ["M", "", "", "P", "", "", ""] },
    { name: "Robert K.", events: ["", "", "T", "", "", "", ""] },
  ];

  const legend = [
    { code: "D", meaning: "Dinner" },
    { code: "M", meaning: "Meeting" },
    { code: "G", meaning: "Gift" },
    { code: "B", meaning: "Board" },
    { code: "W", meaning: "Weekend" },
    { code: "F", meaning: "Flight" },
    { code: "C", meaning: "Call" },
    { code: "P", meaning: "Presentation" },
    { code: "T", meaning: "Travel" },
  ];

  const todayEvents = [
    {
      id: 1,
      time: "6:00 PM",
      executive: "James Anderson",
      event: "Paris Client Dinner",
      venue: "Le Jules Verne (Eiffel Tower)",
      guests: 4,
      issue: "Menu change needed (dietary restriction discovered)",
      status: "Awaiting restaurant confirmation",
      urgent: true,
    },
    {
      id: 2,
      time: "10:00 AM",
      executive: "Lisa Parker",
      event: "Monthly Board Presentation Prep",
      task: "Review slides, prepare materials",
      status: "Complete",
      done: true,
    },
    {
      id: 3,
      time: "2:00 PM",
      executive: "Michael Torres",
      event: "Client Call",
      task: "Dial-in details sent, briefing document prepared",
      status: "Ready",
      done: true,
    },
    {
      id: 4,
      time: "4:00 PM",
      executive: "Sarah Chen",
      event: "Hotel Approval Deadline",
      trip: "London → Tokyo → Singapore",
      status: "Pending your review (3 options per city)",
      needsReview: true,
    },
  ];

  return (
    <EALayout title="Multi-Event Coordination">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-calendar-title">
              Multi-Event Coordination
            </h1>
            <p className="text-gray-600">Manage all executive events in one view</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-testid="button-resolve-conflicts">
              Resolve Conflicts
            </Button>
            <Button variant="outline" data-testid="button-export-calendar">
              Export
            </Button>
          </div>
        </div>

        {/* Calendar Matrix */}
        <Card className="border border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" data-testid="button-prev-week">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg">This Week</CardTitle>
                <Button variant="ghost" size="icon" data-testid="button-next-week">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Badge className="bg-red-100 text-red-700">3 conflicts detected</Badge>
                <Badge className="bg-yellow-100 text-yellow-700">5 items need approval</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-sm font-medium text-gray-500 border-b">Executive</th>
                    {weekDays.map((day) => (
                      <th key={day} className="p-3 text-center text-sm font-medium text-gray-500 border-b min-w-16">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {executives.map((exec, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50" data-testid={`calendar-row-${idx}`}>
                      <td className="p-3 text-sm font-medium text-gray-900">{exec.name}</td>
                      {exec.events.map((event, eventIdx) => (
                        <td key={eventIdx} className="p-3 text-center">
                          {event && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${event === "D" || event === "F" ? "bg-[#FF385C]/10 text-[#FF385C] border-[#FF385C]" : ""}`}
                            >
                              {event}
                            </Badge>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-2">Legend:</p>
              <div className="flex flex-wrap gap-3">
                {legend.map((item) => (
                  <span key={item.code} className="text-xs text-gray-600">
                    <Badge variant="outline" className="mr-1">{item.code}</Badge>={item.meaning}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Events */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#FF385C]" />
              Today's Events ({todayEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayEvents.map((event) => (
              <div 
                key={event.id} 
                className={`p-4 rounded-lg border ${event.urgent ? "border-red-200 bg-red-50" : "border-gray-200"}`}
                data-testid={`today-event-${event.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-gray-600">{event.time}</span>
                      {event.urgent && <Badge className="bg-red-500 text-white">URGENT</Badge>}
                      {event.done && <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Complete</Badge>}
                      {event.needsReview && <Badge className="bg-yellow-100 text-yellow-700">Needs Review</Badge>}
                    </div>
                    <p className="font-semibold text-gray-900">{event.executive} - {event.event}</p>
                    
                    {event.venue && (
                      <p className="text-sm text-gray-600 mt-1">Venue: {event.venue}</p>
                    )}
                    {event.guests && (
                      <p className="text-sm text-gray-600">Guests: {event.guests}</p>
                    )}
                    {event.task && (
                      <p className="text-sm text-gray-600 mt-1">Task: {event.task}</p>
                    )}
                    {event.trip && (
                      <p className="text-sm text-gray-600 mt-1">Trip: {event.trip}</p>
                    )}
                    {event.issue && (
                      <p className="text-sm text-red-600 mt-1">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {event.issue}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">Status: {event.status}</p>
                  </div>

                  {!event.done && (
                    <div className="flex flex-col gap-2">
                      {event.urgent && (
                        <>
                          <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-contact-${event.id}`}>
                            Contact Restaurant
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-update-exec-${event.id}`}>
                            Update James
                          </Button>
                        </>
                      )}
                      {event.needsReview && (
                        <>
                          <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-review-${event.id}`}>
                            Review Options
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-approve-all-${event.id}`}>
                            Approve All
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`button-ai-rec-${event.id}`}>
                            <Bot className="w-3 h-3 mr-1" /> AI Recommendation
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" data-testid={`button-view-details-${event.id}`}>
                        View Details
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Coordination */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="w-5 h-5 text-green-600" />
              AI Coordination Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">I can help coordinate multiple executives simultaneously:</p>
            <ul className="space-y-2 text-sm text-gray-600 mb-4">
              <li>• Detect calendar conflicts across all executives</li>
              <li>• Suggest optimal meeting times for groups</li>
              <li>• Coordinate multi-city travel logistics</li>
              <li>• Track gifts, preferences, and important dates</li>
              <li>• Draft communications on your behalf</li>
              <li>• Research venues, restaurants, hotels in bulk</li>
            </ul>
            <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-delegate-task">
              <Bot className="w-4 h-4 mr-2" /> Delegate Task to AI
            </Button>
          </CardContent>
        </Card>
      </div>
    </EALayout>
  );
}
