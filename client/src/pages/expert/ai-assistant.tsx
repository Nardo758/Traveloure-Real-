import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Send, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  X, 
  Edit,
  Star,
  ArrowRight
} from "lucide-react";

export default function ExpertAIAssistant() {
  const pendingTasks = [
    {
      id: 1,
      type: "Client Message Draft",
      client: "Sarah & Mike",
      task: "Draft follow-up message about Tokyo restaurant options",
      confidence: 94,
      qualityScore: 9.2,
      draft: `Hi Sarah & Mike! Hope you're enjoying Tokyo so far! I've found 3 amazing restaurants for tonight that match your preferences:

1. Sushi Saito (Roppongi) - Michelin 3-star, intimate setting, $200/person
2. Narisawa (Minato) - Farm-to-table, creative Japanese, $150/person
3. Ukai-tei (Omotesando) - Traditional teppanyaki, great views, $120/person

All three have availability tonight. Which sounds best?

Best,
Yuki`
    },
    {
      id: 2,
      type: "Vendor Research",
      client: "Jennifer's Proposal",
      task: "Find romantic proposal venues in Paris with Eiffel Tower views",
      venues: [
        { name: "Shangri-La Paris - Eiffel Suite", rating: 4.9, reviews: 247, price: "€800/night", matchScore: 98 },
        { name: "Le Jules Verne Restaurant", rating: 4.8, reviews: 1240, price: "€200/person", matchScore: 95 },
        { name: "Trocadéro Gardens Gazebo", rating: 4.7, reviews: 89, price: "€300 permit", matchScore: 92 },
      ]
    }
  ];

  const completedTasks = [
    { text: "Updated Sarah & Mike's Tokyo itinerary", time: "2 hours ago" },
    { text: "Researched vegetarian restaurants", time: "4 hours ago" },
    { text: "Optimized Jennifer's timeline", time: "6 hours ago" },
    { text: "Created budget comparison for David", time: "8 hours ago" },
    { text: "Found backup photographer options", time: "Yesterday" },
  ];

  const aiStats = {
    tasksDelegated: 124,
    tasksCompleted: 118,
    completionRate: 95,
    timeSaved: 38,
    avgQualityScore: 9.1,
    editRate: 15,
  };

  return (
    <ExpertLayout title="AI Assistant">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-ai-assistant-title">
              AI Assistant
            </h1>
            <p className="text-gray-600">Your productivity partner - delegate tasks and review AI work</p>
          </div>
          <Badge className="bg-green-100 text-green-700 border-green-200" data-testid="badge-ai-status">
            <Bot className="w-4 h-4 mr-1" /> GPT-4 Active
          </Badge>
        </div>

        {/* Quick Delegate */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#FF385C]" />
              Quick Delegate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input 
                placeholder="Type task or choose template..." 
                className="flex-1"
                data-testid="input-delegate-task"
              />
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-delegate-task">
                <Send className="w-4 h-4 mr-2" /> Delegate
              </Button>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Quick Templates:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Research venues for [client] in [location]",
                  "Draft message to [client] about [topic]",
                  "Optimize itinerary for [client's trip]",
                  "Find backup options for [service type]",
                ].map((template, index) => (
                  <Button 
                    key={index} 
                    variant="outline" 
                    size="sm"
                    className="text-xs"
                    data-testid={`button-template-${index}`}
                  >
                    {template}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Tasks */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  <CardTitle className="text-lg">Pending Your Review ({pendingTasks.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="p-4 rounded-lg border border-gray-200" data-testid={`card-pending-task-${task.id}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge variant="outline" className="mb-2">{task.type}</Badge>
                        <p className="font-medium text-gray-900">{task.client}</p>
                        <p className="text-sm text-gray-600">{task.task}</p>
                      </div>
                    </div>
                    
                    {task.draft && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-sm text-gray-700 whitespace-pre-line">{task.draft}</p>
                      </div>
                    )}

                    {task.venues && (
                      <div className="mt-3 space-y-2">
                        {task.venues.map((venue, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{venue.name}</span>
                              <Badge variant="secondary" className="text-xs">Match: {venue.matchScore}%</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500 mt-1">
                              <Star className="w-3 h-3 text-yellow-500" />
                              <span>{venue.rating} ({venue.reviews} reviews)</span>
                              <span className="mx-1">•</span>
                              <span>{venue.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        {task.confidence && <span>AI Confidence: {task.confidence}%</span>}
                        {task.qualityScore && <span className="ml-3">Quality: {task.qualityScore}/10</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" data-testid={`button-send-${task.id}`}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Send As-Is
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`button-edit-${task.id}`}>
                          <Edit className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`button-regenerate-${task.id}`}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" data-testid={`button-reject-${task.id}`}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* AI Stats */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Your AI Stats (This Month)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tasks Delegated</span>
                  <span className="font-medium">{aiStats.tasksDelegated}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tasks Completed</span>
                  <span className="font-medium">{aiStats.tasksCompleted} ({aiStats.completionRate}%)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Time Saved</span>
                  <span className="font-medium">{aiStats.timeSaved} hours</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Quality Score</span>
                  <span className="font-medium">{aiStats.avgQualityScore}/10</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Your Edit Rate</span>
                  <span className="font-medium text-green-600">{aiStats.editRate}% (Lower = AI is learning!)</span>
                </div>
              </CardContent>
            </Card>

            {/* Completed Tasks */}
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <CardTitle className="text-lg">Recently Completed</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {completedTasks.map((task, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm" data-testid={`completed-task-${index}`}>
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-gray-700">{task.text}</span>
                        <span className="text-gray-400 ml-2">({task.time})</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" className="w-full mt-3 text-[#FF385C]" data-testid="button-view-all-completed">
                  View All Completed Tasks <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
