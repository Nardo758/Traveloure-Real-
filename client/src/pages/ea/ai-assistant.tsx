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

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface EaAiTask {
  id: string; type: string; executiveName?: string; task: string;
  status: string; confidence?: number; draft?: string;
  options?: Array<{ name: string; price: string; matchScore: number; rating?: number }>;
  createdAt?: string; approvedAt?: string;
}

export default function EAAIAssistant() {
  const { data: allTasks = [] } = useQuery<EaAiTask[]>({
    queryKey: ["/api/ea/ai-tasks"],
  });

  const pendingTasks = allTasks.filter(t => t.status === "pending");
  const completedTasks = allTasks
    .filter(t => t.status === "approved" || t.status === "rejected")
    .map(t => ({
      text: `${t.type}: ${t.task}`,
      time: t.approvedAt ? new Date(t.approvedAt).toLocaleDateString() : "recently",
    }));

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ea/ai-tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ea/ai-tasks"] }),
  });

  const aiStats = {
    tasksDelegated: allTasks.length,
    tasksCompleted: allTasks.filter(t => t.status === "approved").length,
    completionRate: allTasks.length > 0 ? Math.round(allTasks.filter(t => t.status === "approved").length / allTasks.length * 100) : 0,
    timeSaved: 0,
    avgQualityScore: 0,
    editRate: 0,
    topStrengths: [] as Array<{ skill: string; rate: number }>,
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
                {pendingTasks.length === 0 && (
                  <div className="text-center py-8">
                    <Bot className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                    <p className="font-medium text-[#1A1A18]">No tasks pending review</p>
                    <p className="text-sm text-[#7A7A72] mt-1">Ask the AI assistant to research, draft, or recommend anything</p>
                  </div>
                )}
                {pendingTasks.map((task) => (
                  <div key={task.id} className="p-4 rounded-lg border border-gray-200" data-testid={`pending-task-${task.id}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge variant="outline" className="mb-2">{task.type}</Badge>
                        <p className="font-medium text-gray-900">{task.executiveName}</p>
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
                  {completedTasks.length === 0 && (
                    <p className="text-center text-sm text-[#7A7A72] py-4">No completed tasks yet</p>
                  )}
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
