import { useState } from "react";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Send, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  X, 
  Edit,
  ArrowRight,
  Loader2,
  Sparkles,
  AlertCircle
} from "lucide-react";

interface AiTask {
  id: string;
  taskType: string;
  status: string;
  clientName: string | null;
  taskDescription: string;
  context: Record<string, any>;
  aiResult: { content?: string; alternativeVersions?: string[]; suggestions?: string[]; error?: string } | null;
  confidence: number | null;
  qualityScore: string | null;
  editedContent: string | null;
  wasEdited: boolean;
  tokensUsed: number | null;
  costEstimate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AiStats {
  tasksDelegated: number;
  tasksCompleted: number;
  completionRate: number;
  timeSaved: number;
  avgQualityScore: string;
  editRate: number;
  tokensUsed: number;
}

export default function ExpertAIAssistant() {
  const { toast } = useToast();
  const [taskInput, setTaskInput] = useState("");
  const [taskType, setTaskType] = useState<string>("client_message");
  const [clientName, setClientName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: pendingTasks = [], isLoading: loadingPending } = useQuery<AiTask[]>({
    queryKey: ["/api/expert/ai-tasks", { status: "pending" }],
    queryFn: async () => {
      const res = await fetch("/api/expert/ai-tasks?status=pending", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending tasks");
      return res.json();
    },
  });

  const { data: completedTasks = [], isLoading: loadingCompleted } = useQuery<AiTask[]>({
    queryKey: ["/api/expert/ai-tasks", { status: "completed" }],
    queryFn: async () => {
      const res = await fetch("/api/expert/ai-tasks?status=completed", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch completed tasks");
      return res.json();
    },
  });

  const { data: aiStats } = useQuery<AiStats>({
    queryKey: ["/api/expert/ai-stats"],
  });

  const delegateMutation = useMutation({
    mutationFn: async (data: { taskType: string; taskDescription: string; clientName?: string }) => {
      const response = await apiRequest("POST", "/api/expert/ai-tasks/delegate", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-stats"] });
      setTaskInput("");
      setClientName("");
      toast({ title: "Task delegated to AI", description: "The AI is working on your request." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delegate task", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ taskId, editedContent }: { taskId: string; editedContent?: string }) => {
      const response = await apiRequest("POST", `/api/expert/ai-tasks/${taskId}/approve`, { editedContent });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-stats"] });
      setEditingTaskId(null);
      setEditContent("");
      toast({ title: "Task approved", description: "The content has been approved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", `/api/expert/ai-tasks/${taskId}/reject`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-stats"] });
      toast({ title: "Task rejected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", `/api/expert/ai-tasks/${taskId}/regenerate`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/ai-tasks"] });
      toast({ title: "Regenerating content", description: "The AI is creating a new version." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to regenerate", description: error.message, variant: "destructive" });
    },
  });

  const handleDelegate = () => {
    if (!taskInput.trim() || taskInput.length < 10) {
      toast({ title: "Task description too short", description: "Please provide more details (at least 10 characters).", variant: "destructive" });
      return;
    }
    delegateMutation.mutate({
      taskType,
      taskDescription: taskInput,
      clientName: clientName || undefined,
    });
  };

  const handleApprove = (taskId: string, withEdit?: boolean) => {
    if (withEdit && editingTaskId === taskId) {
      approveMutation.mutate({ taskId, editedContent: editContent });
    } else {
      approveMutation.mutate({ taskId });
    }
  };

  const startEditing = (task: AiTask) => {
    setEditingTaskId(task.id);
    setEditContent(task.aiResult?.content || "");
  };

  const getTaskTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      client_message: "Client Message",
      vendor_research: "Vendor Research",
      itinerary_update: "Itinerary Update",
      content_draft: "Content Draft",
      response_draft: "Response Draft",
    };
    return labels[type] || type;
  };

  const templates = [
    { label: "Draft message to client", type: "client_message", template: "Draft a message to {client} about" },
    { label: "Research vendors", type: "vendor_research", template: "Research venues/vendors in {location} for" },
    { label: "Update itinerary", type: "itinerary_update", template: "Update itinerary for {client}'s trip to" },
    { label: "Write bio/description", type: "content_draft", template: "Write a professional description for" },
  ];

  const activeTasks = pendingTasks.filter(t => t.status === "pending" || t.status === "in_progress" || t.status === "regenerating");
  const recentCompleted = completedTasks.filter(t => t.status === "completed").slice(0, 5);

  return (
    <ExpertLayout title="AI Assistant">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-ai-assistant-title">
              AI Assistant
            </h1>
            <p className="text-gray-600 dark:text-gray-400">Your productivity partner - delegate tasks and review AI work</p>
          </div>
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400" data-testid="badge-ai-status">
            <Sparkles className="w-4 h-4 mr-1" /> Grok Active
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#FF385C]" />
              Quick Delegate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="w-48" data-testid="select-task-type">
                  <SelectValue placeholder="Task type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_message">Client Message</SelectItem>
                  <SelectItem value="vendor_research">Vendor Research</SelectItem>
                  <SelectItem value="itinerary_update">Itinerary Update</SelectItem>
                  <SelectItem value="content_draft">Content Draft</SelectItem>
                  <SelectItem value="response_draft">Response Draft</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Client name (optional)"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-40"
                data-testid="input-client-name"
              />
            </div>
            <div className="flex gap-3">
              <Textarea
                placeholder="Describe what you need the AI to do..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                className="flex-1 min-h-[80px]"
                data-testid="input-delegate-task"
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex flex-wrap gap-2">
                {templates.map((tmpl, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setTaskType(tmpl.type);
                      setTaskInput(tmpl.template);
                    }}
                    data-testid={`button-template-${idx}`}
                  >
                    {tmpl.label}
                  </Button>
                ))}
              </div>
              <Button
                onClick={handleDelegate}
                disabled={delegateMutation.isPending || taskInput.length < 10}
                className="bg-[#FF385C]"
                data-testid="button-delegate-task"
              >
                {delegateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Delegate
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  <CardTitle className="text-lg">Pending Your Review ({activeTasks.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPending ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : activeTasks.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No pending tasks. Delegate something to get started!</p>
                  </div>
                ) : (
                  activeTasks.map((task) => (
                    <div key={task.id} className="p-4 rounded-lg border" data-testid={`card-pending-task-${task.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Badge variant="outline" className="mb-2">{getTaskTypeLabel(task.taskType)}</Badge>
                          {task.clientName && (
                            <p className="font-medium text-gray-900 dark:text-gray-100">{task.clientName}</p>
                          )}
                          <p className="text-sm text-gray-600 dark:text-gray-400">{task.taskDescription}</p>
                        </div>
                        {task.status === "in_progress" || task.status === "regenerating" ? (
                          <Badge variant="secondary" className="shrink-0">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            {task.status === "regenerating" ? "Regenerating..." : "Processing..."}
                          </Badge>
                        ) : null}
                      </div>

                      {task.aiResult?.error ? (
                        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{task.aiResult.error}</span>
                          </div>
                        </div>
                      ) : task.aiResult?.content ? (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                          {editingTaskId === task.id ? (
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="min-h-[120px]"
                              data-testid={`textarea-edit-${task.id}`}
                            />
                          ) : (
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{task.aiResult.content}</p>
                          )}
                        </div>
                      ) : null}

                      {task.status === "pending" && task.aiResult?.content && (
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-sm text-gray-500 flex items-center gap-4">
                            {task.confidence && <span>Confidence: {task.confidence}%</span>}
                            {task.qualityScore && <span>Quality: {task.qualityScore}/10</span>}
                          </div>
                          <div className="flex gap-2">
                            {editingTaskId === task.id ? (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-green-600"
                                  onClick={() => handleApprove(task.id, true)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-save-edit-${task.id}`}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" /> Save & Send
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingTaskId(null)}
                                  data-testid={`button-cancel-edit-${task.id}`}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-green-600"
                                  onClick={() => handleApprove(task.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-send-${task.id}`}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" /> Send As-Is
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditing(task)}
                                  data-testid={`button-edit-${task.id}`}
                                >
                                  <Edit className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => regenerateMutation.mutate(task.id)}
                                  disabled={regenerateMutation.isPending}
                                  data-testid={`button-regenerate-${task.id}`}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-red-600"
                                  onClick={() => rejectMutation.mutate(task.id)}
                                  disabled={rejectMutation.isPending}
                                  aria-label="Reject task"
                                  data-testid={`button-reject-${task.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your AI Stats (This Month)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Tasks Delegated</span>
                  <span className="font-medium">{aiStats?.tasksDelegated ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Tasks Completed</span>
                  <span className="font-medium">{aiStats?.tasksCompleted ?? 0} ({aiStats?.completionRate ?? 0}%)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Time Saved</span>
                  <span className="font-medium">{aiStats?.timeSaved ?? 0} hours</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Avg Quality Score</span>
                  <span className="font-medium">{aiStats?.avgQualityScore ?? "0.0"}/10</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Your Edit Rate</span>
                  <span className="font-medium text-green-600">{aiStats?.editRate ?? 0}% (Lower = AI is learning!)</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <CardTitle className="text-lg">Recently Completed</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCompleted ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : recentCompleted.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No completed tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {recentCompleted.map((task) => (
                      <div key={task.id} className="flex items-start gap-2 text-sm" data-testid={`completed-task-${task.id}`}>
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-gray-700 dark:text-gray-300">{task.taskDescription.substring(0, 50)}...</span>
                          <span className="text-gray-400 ml-2">
                            ({new Date(task.completedAt || task.createdAt).toLocaleDateString()})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
