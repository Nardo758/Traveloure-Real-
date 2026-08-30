import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MapPin,
  Plane,
  PartyPopper,
  Globe,
  Edit,
  Package,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface AdminTemplate {
  id: string;
  title: string;
  description: string | null;
  price: string;
  sortOrder: number | null;
  createdAt: string;
  targetRoles: string[];
}

const ROLE_OPTIONS = [
  {
    value: "local_expert",
    label: "Local Expert",
    icon: <MapPin className="w-4 h-4" />,
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  {
    value: "travel_expert",
    label: "Trip Planner",
    icon: <Plane className="w-4 h-4" />,
    color: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    value: "event_planner",
    label: "Event Planner",
    icon: <PartyPopper className="w-4 h-4" />,
    color: "bg-purple-100 text-purple-800 border-purple-200",
  },
  {
    value: "executive_assistant",
    label: "Executive Assistant",
    icon: <Globe className="w-4 h-4" />,
    color: "bg-amber-100 text-amber-800 border-amber-200",
  },
] as const;

const TAB_FILTERS = [
  { key: "all", label: "All Templates", icon: <Globe className="w-4 h-4" /> },
  { key: "local_expert", label: "Local Expert", icon: <MapPin className="w-4 h-4" /> },
  { key: "travel_expert", label: "Trip Planner", icon: <Plane className="w-4 h-4" /> },
  { key: "event_planner", label: "Event Planner", icon: <PartyPopper className="w-4 h-4" /> },
] as const;

type TabKey = (typeof TAB_FILTERS)[number]["key"];

function getRoleBadge(role: string) {
  const opt = ROLE_OPTIONS.find((o) => o.value === role);
  return opt ?? null;
}

export default function AdminExpertTemplates() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [editingTemplate, setEditingTemplate] = useState<AdminTemplate | null>(null);
  const [pendingRoles, setPendingRoles] = useState<string[]>([]);

  const { data: templates = [], isLoading } = useQuery<AdminTemplate[]>({
    queryKey: ["/api/admin/expert-templates"],
  });

  const updateRolesMutation = useMutation({
    mutationFn: async ({ id, targetRoles }: { id: string; targetRoles: string[] }) => {
      return apiRequest("PATCH", `/api/admin/expert-templates/${id}/roles`, { targetRoles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expert-templates"] });
      toast({ title: "Template roles updated" });
      setEditingTemplate(null);
    },
    onError: () => {
      toast({ title: "Failed to update template roles", variant: "destructive" });
    },
  });

  const filteredTemplates =
    activeTab === "all"
      ? templates
      : templates.filter(
          (t) =>
            t.targetRoles.length === 0 ||
            t.targetRoles.includes(activeTab)
        );

  const counts = TAB_FILTERS.reduce<Record<string, number>>((acc, tab) => {
    if (tab.key === "all") {
      acc.all = templates.length;
    } else {
      acc[tab.key] = templates.filter(
        (t) => t.targetRoles.length === 0 || t.targetRoles.includes(tab.key)
      ).length;
    }
    return acc;
  }, {});

  const openEditDialog = (tpl: AdminTemplate) => {
    setEditingTemplate(tpl);
    setPendingRoles([...tpl.targetRoles]);
  };

  const toggleRole = (role: string) => {
    setPendingRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <AdminLayout title="Ready Made Trips">
      <div className="p-6 space-y-6">
        <AdminTabNav tabs={[{ label: "Catalog", href: "/admin/expert-templates" }, { label: "Approvals", href: "/admin/template-approvals" }]} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-expert-templates-title">
            Expert Service Templates
          </h1>
          <p className="text-gray-600">
            Platform templates shown to experts when they browse the service library.
            Use role tags to control which expert types see each template.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-gray-900" data-testid="text-total-templates">
                {templates.length}
              </div>
              <p className="text-sm text-gray-500">Total Templates</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-emerald-700" data-testid="text-local-expert-count">
                {templates.filter((t) => t.targetRoles.includes("local_expert")).length}
              </div>
              <p className="text-sm text-emerald-600">Local Expert</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-blue-700" data-testid="text-travel-advisor-count">
                {templates.filter((t) => t.targetRoles.includes("travel_expert")).length}
              </div>
              <p className="text-sm text-blue-600">Trip Planner</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-purple-700" data-testid="text-event-planner-count">
                {templates.filter((t) => t.targetRoles.includes("event_planner")).length}
              </div>
              <p className="text-sm text-purple-600">Event Planner</p>
            </CardContent>
          </Card>
        </div>

        {/* Role Tabs */}
        <div className="flex gap-2 flex-wrap" role="tablist">
          {TAB_FILTERS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              {tab.icon}
              {tab.label}
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {counts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No templates for this role yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((tpl) => (
              <Card key={tpl.id} className="border-gray-200" data-testid={`card-template-${tpl.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{tpl.title}</CardTitle>
                    <span className="text-sm font-medium text-gray-500 whitespace-nowrap">
                      ${tpl.price}
                    </span>
                  </div>
                  <CardDescription className="line-clamp-2 text-xs">
                    {tpl.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Role badges */}
                  <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                    {tpl.targetRoles.length === 0 ? (
                      <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">
                        All roles
                      </Badge>
                    ) : (
                      tpl.targetRoles.map((role) => {
                        const opt = getRoleBadge(role);
                        return opt ? (
                          <Badge
                            key={role}
                            variant="outline"
                            className={`text-xs ${opt.color} flex items-center gap-1`}
                            data-testid={`badge-role-${tpl.id}-${role}`}
                          >
                            {opt.icon}
                            {opt.label}
                          </Badge>
                        ) : null;
                      })
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => openEditDialog(tpl)}
                    data-testid={`button-edit-roles-${tpl.id}`}
                  >
                    <Edit className="w-3.5 h-3.5 mr-1.5" />
                    Edit Roles
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Roles Dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Target Roles</DialogTitle>
            </DialogHeader>
            {editingTemplate && (
              <div className="space-y-4 py-2">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{editingTemplate.title}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Select which expert roles should see this template.
                  Leave all unchecked to show it to every role.
                </p>
                <div className="space-y-3">
                  {ROLE_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-3">
                      <Checkbox
                        id={`role-${opt.value}`}
                        checked={pendingRoles.includes(opt.value)}
                        onCheckedChange={() => toggleRole(opt.value)}
                        data-testid={`checkbox-role-${opt.value}`}
                      />
                      <Label
                        htmlFor={`role-${opt.value}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${opt.color}`}>
                          {opt.icon}
                          {opt.label}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>

                {pendingRoles.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    No roles selected — this template will be visible to all expert types.
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingTemplate(null)}
                    data-testid="button-cancel-roles"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={() =>
                      updateRolesMutation.mutate({
                        id: editingTemplate.id,
                        targetRoles: pendingRoles,
                      })
                    }
                    disabled={updateRolesMutation.isPending}
                    data-testid="button-save-roles"
                  >
                    {updateRolesMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
