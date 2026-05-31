import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Lock, CheckCircle, Clock, AlertCircle, Send } from "lucide-react";

interface PublishPanelProps {
  content: {
    title: string;
    status: string;
    visibility: string;
    platforms?: string[];
    coverImage?: string;
    description?: string;
    destination?: string;
    tags?: string[];
  };
  onUpdate: (updates: Partial<PublishPanelProps["content"]>) => void;
  onPublish: () => void;
  isPublished: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  draft: { label: "Draft", icon: Clock, color: "bg-gray-100 text-gray-700" },
  published: { label: "Published", icon: CheckCircle, color: "bg-green-100 text-green-700" },
  scheduled: { label: "Scheduled", icon: Clock, color: "bg-blue-100 text-blue-700" },
  archived: { label: "Archived", icon: AlertCircle, color: "bg-yellow-100 text-yellow-700" },
};

const PLATFORMS = [
  { id: "traveloure", label: "Traveloure Platform" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter/X" },
];

export function PublishPanel({ content, onUpdate, onPublish, isPublished }: PublishPanelProps) {
  const status = content.status || "draft";
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  const togglePlatform = (platformId: string) => {
    const current = content.platforms || [];
    const updated = current.includes(platformId)
      ? current.filter((p) => p !== platformId)
      : [...current, platformId];
    onUpdate({ platforms: updated });
  };

  const checklist = [
    { label: "Title added", done: !!content.title?.trim() },
    { label: "Description written", done: !!content.description?.trim() },
    { label: "Destination set", done: !!content.destination?.trim() },
    { label: "Cover image provided", done: !!content.coverImage?.trim() },
    { label: "Tags added", done: (content.tags?.length ?? 0) > 0 },
  ];
  const readyCount = checklist.filter((c) => c.done).length;
  const isReady = readyCount >= 3;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StatusIcon className="w-5 h-5" />
            Publication Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Current status</span>
            <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
          </div>

          <div>
            <Label className="text-sm">Change Status</Label>
            <Select
              value={status}
              onValueChange={(val) => onUpdate({ status: val })}
            >
              <SelectTrigger className="mt-1" data-testid="select-publish-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-2 border-t">
            <div className="flex items-center gap-2">
              {content.visibility === "premium" ? (
                <Lock className="w-4 h-4 text-amber-500" />
              ) : (
                <Globe className="w-4 h-4 text-green-500" />
              )}
              <span className="text-sm">
                {content.visibility === "premium" ? "Premium content" : "Free content"}
              </span>
            </div>
            <Switch
              checked={content.visibility === "premium"}
              onCheckedChange={(checked) =>
                onUpdate({ visibility: checked ? "premium" : "free" })
              }
              data-testid="switch-premium"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pre-publish Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {checklist.map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <CheckCircle
                  className={`w-4 h-4 ${done ? "text-green-500" : "text-gray-300"}`}
                />
                <span className={done ? "text-gray-900" : "text-gray-400"}>{label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {readyCount}/{checklist.length} items complete
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribution Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PLATFORMS.map(({ id, label }) => (
            <div key={id} className="flex items-center justify-between">
              <Label htmlFor={`platform-${id}`} className="text-sm cursor-pointer">
                {label}
              </Label>
              <Switch
                id={`platform-${id}`}
                checked={(content.platforms || []).includes(id)}
                onCheckedChange={() => togglePlatform(id)}
                data-testid={`switch-platform-${id}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button
        onClick={onPublish}
        className="w-full"
        variant={isPublished ? "outline" : "default"}
        disabled={!isReady && !isPublished}
        data-testid="button-publish-content"
        type="button"
      >
        <Send className="w-4 h-4 mr-2" />
        {isPublished ? "Update Published Content" : "Publish Content"}
      </Button>

      {!isReady && !isPublished && (
        <p className="text-xs text-center text-gray-500">
          Complete at least 3 checklist items to publish
        </p>
      )}
    </div>
  );
}
