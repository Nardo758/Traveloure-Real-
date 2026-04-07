import {
  ArrowLeft, Check, X, CheckCircle2, XCircle, Clock, AlertCircle,
  Filter, History, ChevronRight, Lightbulb,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EXPERT_CHANGES, CHANGELOG, TRIP, DAY_COLORS,
  type ExpertChange, type ChangeEntry,
} from "./shared-data";

type FilterTab = "all" | "pending" | "accepted" | "rejected";

const CHANGE_TYPE_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  replace: { label: "Swap", bg: "bg-blue-100", fg: "text-blue-700" },
  time: { label: "Time Change", bg: "bg-amber-100", fg: "text-amber-700" },
  add: { label: "New", bg: "bg-green-100", fg: "text-green-700" },
  remove: { label: "Remove", bg: "bg-red-100", fg: "text-red-700" },
};

const CHANGE_DOT: Record<string, string> = {
  expert: "bg-blue-500",
  ai: "bg-green-500",
  owner: "bg-amber-500",
};

function SummaryBanner({ pending, accepted, rejected }: { pending: number; accepted: number; rejected: number }) {
  return (
    <div className="mx-4 mt-4 mb-3 grid grid-cols-3 gap-2">
      <Card className="p-3 text-center" data-testid="stat-pending">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-1.5">
          <Clock className="w-4 h-4 text-amber-600" />
        </div>
        <div className="text-[18px] font-bold text-gray-900">{pending}</div>
        <div className="text-[10px] text-gray-500 font-medium">Pending</div>
      </Card>
      <Card className="p-3 text-center" data-testid="stat-accepted">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        </div>
        <div className="text-[18px] font-bold text-gray-900">{accepted}</div>
        <div className="text-[10px] text-gray-500 font-medium">Accepted</div>
      </Card>
      <Card className="p-3 text-center" data-testid="stat-rejected">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-1.5">
          <XCircle className="w-4 h-4 text-red-600" />
        </div>
        <div className="text-[18px] font-bold text-gray-900">{rejected}</div>
        <div className="text-[10px] text-gray-500 font-medium">Rejected</div>
      </Card>
    </div>
  );
}

function ChangeCard({
  change,
  decision,
  onAccept,
  onReject,
}: {
  change: ExpertChange;
  decision?: "accepted" | "rejected";
  onAccept: () => void;
  onReject: () => void;
}) {
  const typeInfo = CHANGE_TYPE_LABELS[change.type] || CHANGE_TYPE_LABELS.replace;

  if (decision === "accepted") {
    return (
      <Card className="overflow-hidden opacity-90" data-testid={`change-card-${change.id}`}>
        <div className="px-4 py-3 bg-green-50 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-green-800 font-semibold">{change.title}</span>
            {change.dayNum && (
              <span className="text-[10px] text-green-600 ml-2">Day {change.dayNum}</span>
            )}
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]">Accepted</Badge>
        </div>
      </Card>
    );
  }

  if (decision === "rejected") {
    return (
      <Card className="overflow-hidden opacity-60" data-testid={`change-card-${change.id}`}>
        <div className="px-4 py-3 bg-red-50 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-red-800 font-semibold line-through">{change.title}</span>
            {change.dayNum && (
              <span className="text-[10px] text-red-500 ml-2">Day {change.dayNum}</span>
            )}
          </div>
          <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">Rejected</Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" data-testid={`change-card-${change.id}`}>
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold text-gray-800">{change.title}</span>
          <Badge variant="secondary" className={`${typeInfo.bg} ${typeInfo.fg} text-[10px] border-0`}>
            {typeInfo.label}
          </Badge>
        </div>
        {change.dayNum && (
          <div className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: DAY_COLORS[(change.dayNum - 1) % DAY_COLORS.length] }}
            >
              {change.dayNum}
            </div>
            <span className="text-[11px] text-gray-500">Day {change.dayNum}</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {change.removeLine && (
          <div className="flex items-start gap-2.5 bg-red-50/60 rounded-lg px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <span className="text-[12px] text-red-700 line-through">{change.removeLine}</span>
          </div>
        )}
        <div className="flex items-start gap-2.5 bg-green-50/60 rounded-lg px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
          <span className="text-[12px] text-green-700 font-medium">{change.addLine}</span>
        </div>
        {change.reason && (
          <div className="flex items-start gap-2 ml-1 mt-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <span className="text-[11px] text-gray-500 italic">"{change.reason}"</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          className="bg-green-600 hover:bg-green-700 text-[12px] gap-1"
          onClick={onAccept}
          data-testid={`button-accept-${change.id}`}
        >
          <Check className="w-3.5 h-3.5" /> Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-red-700 border-red-200 text-[12px] gap-1"
          onClick={onReject}
          data-testid={`button-reject-${change.id}`}
        >
          <X className="w-3.5 h-3.5" /> Reject
        </Button>
      </div>
    </Card>
  );
}

function ChangeHistoryTimeline() {
  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-gray-500" />
        <h4 className="text-[13px] font-bold text-gray-800">Change History</h4>
      </div>
      <div className="relative ml-2">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
        <div className="space-y-3">
          {CHANGELOG.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 relative" data-testid={`changelog-${entry.id}`}>
              <div className={`w-[15px] h-[15px] rounded-full ${CHANGE_DOT[entry.role] || "bg-gray-400"} flex-shrink-0 z-10 border-2 border-white`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-gray-800">{entry.who}</span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    {entry.type}
                  </Badge>
                  <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{entry.when}</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5">{entry.what}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReviewChangesPage() {
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const pendingCount = EXPERT_CHANGES.filter(c => !decisions[c.id] && (c.status !== "accepted" && c.status !== "rejected")).length;
  const acceptedCount = EXPERT_CHANGES.filter(c => decisions[c.id] === "accepted" || c.status === "accepted").length;
  const rejectedCount = EXPERT_CHANGES.filter(c => decisions[c.id] === "rejected" || c.status === "rejected").length;

  const getEffectiveStatus = (change: ExpertChange): "pending" | "accepted" | "rejected" => {
    if (decisions[change.id]) return decisions[change.id];
    if (change.status === "accepted" || change.status === "rejected") return change.status;
    return "pending";
  };

  const filtered = EXPERT_CHANGES.filter(change => {
    if (activeTab === "all") return true;
    return getEffectiveStatus(change) === activeTab;
  });

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: EXPERT_CHANGES.length },
    { key: "pending", label: "Pending", count: pendingCount },
    { key: "accepted", label: "Accepted", count: acceptedCount },
    { key: "rejected", label: "Rejected", count: rejectedCount },
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-gray-900" data-testid="text-page-title">Review Changes</h2>
          <p className="text-[11px] text-gray-500 truncate">{TRIP.title}</p>
        </div>
        <Filter className="w-4 h-4 text-gray-400" />
      </div>

      <SummaryBanner pending={pendingCount} accepted={acceptedCount} rejected={rejectedCount} />

      <div className="mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
            <span className={`text-[10px] ${activeTab === tab.key ? "text-gray-300" : "text-gray-400"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {pendingCount > 0 && activeTab !== "accepted" && activeTab !== "rejected" && (
        <div className="mx-4 mb-3 flex gap-2 justify-end">
          <Button
            size="sm"
            variant="default"
            className="bg-green-600 hover:bg-green-700 text-[11px] gap-1"
            onClick={() => {
              const d: Record<string, "accepted"> = {};
              EXPERT_CHANGES.forEach(c => { if (!decisions[c.id]) d[c.id] = "accepted"; });
              setDecisions(prev => ({ ...prev, ...d }));
            }}
            data-testid="button-accept-all"
          >
            <Check className="w-3.5 h-3.5" /> Accept All
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200 text-[11px] gap-1"
            onClick={() => {
              const d: Record<string, "rejected"> = {};
              EXPERT_CHANGES.forEach(c => { if (!decisions[c.id]) d[c.id] = "rejected"; });
              setDecisions(prev => ({ ...prev, ...d }));
            }}
            data-testid="button-reject-all"
          >
            <X className="w-3.5 h-3.5" /> Reject All
          </Button>
        </div>
      )}

      <div className="mx-4 mb-4 space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">No changes in this category</p>
          </Card>
        ) : (
          filtered.map(change => (
            <ChangeCard
              key={change.id}
              change={change}
              decision={decisions[change.id]}
              onAccept={() => setDecisions(prev => ({ ...prev, [change.id]: "accepted" }))}
              onReject={() => setDecisions(prev => ({ ...prev, [change.id]: "rejected" }))}
            />
          ))
        )}
      </div>

      <div className="mx-4 my-3 border-t border-gray-200" />

      <ChangeHistoryTimeline />
    </div>
  );
}
