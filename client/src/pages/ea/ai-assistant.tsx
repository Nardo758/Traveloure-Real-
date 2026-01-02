import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Bot, 
  Send, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  X, 
  Edit,
  ArrowRight,
  Star
} from "lucide-react";

export default function EAAIAssistant() {
  const pendingTasks = [
    {
      id: 1,
      type: "Hotel Research",
      executive: "Sarah Chen",
      task: "Find hotels in Tokyo for 3 nights (Mar 17-20)",
      options: [
        { name: "Park Hyatt Tokyo", rating: 4.9, price: "$650/night", matchScore: 98 },
        { name: "Aman Tokyo", rating: 4.9, price: "$900/night", matchScore: 95 },
        { name: "Four Seasons Tokyo", rating: 4.8, price: "$720/night", matchScore: 92 },
      ],
      confidence: 96,
    },
    {
      id: 2,
      type: "Draft Communication",
      executive: "James Anderson",
      task: "Thank you note for Paris dinner guests",
      draft: `Dear Mr. Smith,

Thank you for joining us for dinner at Le Jules Verne last evening. It was a pleasure discussing the partnership opportunities, and I look forward to our continued collaboration.

Best regards,
James Anderson`,
      confidence: 94,
    },
    {
      id: 3,
      type: "Gift Recommendation",
      executive: "Michael Torres",
      task: "Anniversary gift for spouse (10th anniversary)",
      options: [
        { name: "Cartier Love Bracelet", price: "$6,900", matchScore: 95 },
        { name: "Weekend at The Ritz-Carlton", price: "$3,500", matchScore: 92 },
        { name: "Tiffany & Co. Necklace", price: "$4,200", matchScore: 88 },
      ],
      confidence: 91,
    },
  ];

  const completedTasks = [
    { text: "Researched 5 hotel options for Sarah's Tokyo leg", time: "1 hour ago" },
    { text: "Drafted thank-you notes for James (3 clients)", time: "2 hours ago" },
    { text: "Coordinated restaurant confirmation for Michael", time: "3 hours ago" },
    { text: "Updated calendar conflicts for 4 executives", time: "5 hours ago" },
    { text: "Researched anniversary gift options (15 curated)", time: "6 hours ago" },
  ];

  const aiStats = {
    tasksDelegated: 245,
    tasksCompleted: 238,
    completionRate: 97,
    timeSaved: 52,
    avgQualityScore: 9.3,
    editRate: 12,
    topStrengths: [
      { skill: "Vendor research", rate: 98 },
      { skill: "Timeline optimization", rate: 95 },
      { skill: "Client communication", rate: 92 },
    ],
  };

  return (
    <EALayout title="AI Assistant">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-ai-title">
              AI Assistant
            </h1>
            <p className="text-gray-600">Delegate tasks and review AI work</p>
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
              Delegate Task to AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input 
                placeholder="Describe the task... (e.g., 'Research venues for Sarah's Tokyo dinner meeting')" 
                className="flex-1"
                data-testid="input-delegate-task"
              />
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-delegate">
                <Send className="w-4 h-4 mr-2" /> Delegate
              </Button>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Quick Templates:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Research hotels in [city] for [executive]",
                  "Draft thank-you note for [executive]'s [event]",
                  "Find gift options for [executive]'s [occasion]",
                  "Coordinate travel for [executive]'s [trip]",
                  "Research restaurants in [city]",
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
                  <div key={task.id} className="p-4 rounded-lg border border-gray-200" data-testid={`pending-task-${task.id}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge variant="outline" className="mb-2">{task.type}</Badge>
                        <p className="font-medium text-gray-900">{task.executive}</p>
                        <p className="text-sm text-gray-600">{task.task}</p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-700">
                        {task.confidence}% Confidence
                      </Badge>
                    </div>
                    
                    {task.draft && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-sm text-gray-700 whitespace-pre-line">{task.draft}</p>
                      </div>
                    )}

                    {task.options && (
                      <div className="mt-3 space-y-2">
                        {task.options.map((option, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{option.name}</span>
                              <Badge variant="secondary" className="text-xs">Match: {option.matchScore}%</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500 mt-1">
                              {"rating" in option && option.rating && (
                                <>
                                  <Star className="w-3 h-3 text-yellow-500" />
                                  <span>{option.rating}</span>
                                  <span className="mx-1">•</span>
                                </>
                              )}
                              <span>{option.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" data-testid={`button-approve-${task.id}`}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Approve
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
                  <span className="font-medium text-green-600">{aiStats.editRate}%</span>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Top AI Strengths:</p>
                  {aiStats.topStrengths.map((strength, idx) => (
                    <div key={idx} className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{strength.skill}</span>
                      <span className="text-green-600">{strength.rate}% approval</span>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" className="w-full text-[#FF385C]" data-testid="button-view-analytics">
                  View Detailed Analytics <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
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
              </CardContent>
            </Card>

            {/* AI Settings */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">AI Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" data-testid="button-preferences">
                  Configure Preferences
                </Button>
                <Button variant="outline" className="w-full justify-start" data-testid="button-training">
                  Training Mode
                </Button>
                <Button variant="outline" className="w-full justify-start" data-testid="button-help">
                  View Help
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
