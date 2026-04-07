import { useState } from "react";
import {
  ArrowLeft, TrendingUp, DollarSign, Clock, Heart, Footprints,
  BarChart3, PieChart, Leaf, Users, Calendar, Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  TRIP, DAYS, DAY_COLORS, formatDuration,
  type Activity,
} from "./shared-data";

const allActivities: Activity[] = DAYS.flatMap(d => d.activities);
const totalCost = allActivities.reduce((s, a) => s + a.cost, 0);
const totalTransitMins = DAYS.flatMap(d => d.transports).reduce((s, t) => s + t.duration, 0);
const totalActivityMins = allActivities.reduce((s, a) => s + (a.duration || 60), 0);
const freeMins = DAYS.length * 14 * 60 - totalActivityMins - totalTransitMins;

const SCORE_CATEGORIES = [
  { label: "Planning", score: 90, color: "#3b82f6" },
  { label: "Budget", score: 85, color: "#22c55e" },
  { label: "Timing", score: 88, color: "#f59e0b" },
  { label: "Wellness", score: 82, color: "#ec4899" },
];

const BUDGET_CATEGORIES = [
  { label: "Accommodation", amount: 1225, color: "#3b82f6" },
  { label: "Activities", amount: 1548, color: "#8b5cf6" },
  { label: "Transport", amount: 511, color: "#f59e0b" },
  { label: "Dining", amount: 536, color: "#ef4444" },
];

const budgetTotal = BUDGET_CATEGORIES.reduce((s, c) => s + c.amount, 0);

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3b82f6" strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central"
        className="fill-gray-900 font-bold" fontSize={size * 0.28} transform={`rotate(90, ${size / 2}, ${size / 2})`}>
        {score}
      </text>
    </svg>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-700 font-medium">{label}</span>
        <span className="text-[12px] text-gray-500 font-semibold">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const dayCosts = DAYS.map(d => ({
  day: d.dayNum,
  label: d.label,
  cost: d.activities.reduce((s, a) => s + a.cost, 0) + d.transports.reduce((s, t) => s + t.cost, 0),
}));
const maxDayCost = Math.max(...dayCosts.map(d => d.cost), 1);

export function TripStatsPage() {
  const perPerson = Math.round(TRIP.spent / TRIP.numberOfTravelers);
  const perDay = Math.round(TRIP.spent / DAYS.length);

  return (
    <div className="w-[520px] bg-gray-50 min-h-screen font-['Inter',sans-serif]">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Trip Stats & Analytics</h1>
          <p className="text-[11px] text-gray-500">{TRIP.title}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={TRIP.score} />
            <div className="flex-1 space-y-2">
              <div className="text-[13px] font-bold text-gray-900">Overall Trip Score</div>
              <div className="text-[11px] text-gray-500">Based on planning completeness, budget efficiency, timing optimization, and wellness balance.</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {SCORE_CATEGORIES.map(cat => (
              <div key={cat.label} className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-bold text-white" style={{ backgroundColor: cat.color }}>
                  {cat.score}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-800">{cat.label}</div>
                  <div className="h-1.5 w-16 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${cat.score}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-[13px] font-bold text-gray-900">Budget Analysis</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <div className="text-[18px] font-bold text-green-700">${TRIP.spent.toLocaleString()}</div>
              <div className="text-[10px] text-green-600 font-medium">Total Spent</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-center">
              <div className="text-[18px] font-bold text-blue-700">${perPerson}</div>
              <div className="text-[10px] text-blue-600 font-medium">Per Person</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5 text-center">
              <div className="text-[18px] font-bold text-amber-700">${perDay}</div>
              <div className="text-[10px] text-amber-600 font-medium">Per Day</div>
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-gray-500">Budget Progress</span>
              <span className="text-[11px] font-semibold text-gray-700">${TRIP.spent.toLocaleString()} / ${TRIP.budget.toLocaleString()}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                style={{ width: `${Math.round((TRIP.spent / TRIP.budget) * 100)}%` }} />
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200/60 rounded-lg px-3 py-2 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-[12px] font-semibold text-emerald-700">Savings: ${TRIP.savings}</span>
            <span className="text-[10px] text-emerald-600 ml-auto">Under budget</span>
          </div>

          <div className="text-[11px] font-semibold text-gray-700 mb-2">Category Breakdown</div>
          <div className="space-y-2.5">
            {BUDGET_CATEGORIES.map(cat => (
              <div key={cat.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-gray-700">{cat.label}</span>
                  <span className="text-[12px] font-semibold text-gray-800">${cat.amount}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((cat.amount / budgetTotal) * 100)}%`, backgroundColor: cat.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="text-[13px] font-bold text-gray-900">Time Allocation</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-blue-700">{formatDuration(totalActivityMins)}</div>
              <div className="text-[10px] text-blue-600 font-medium">Activities</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-amber-700">{formatDuration(totalTransitMins)}</div>
              <div className="text-[10px] text-amber-600 font-medium">Transit</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-green-700">{formatDuration(Math.max(freeMins, 0))}</div>
              <div className="text-[10px] text-green-600 font-medium">Free Time</div>
            </div>
          </div>
          <div className="space-y-2">
            <BarRow label="Activities" value={totalActivityMins} max={totalActivityMins + totalTransitMins + Math.max(freeMins, 0)} color="#3b82f6" />
            <BarRow label="Transit" value={totalTransitMins} max={totalActivityMins + totalTransitMins + Math.max(freeMins, 0)} color="#f59e0b" />
            <BarRow label="Free Time" value={Math.max(freeMins, 0)} max={totalActivityMins + totalTransitMins + Math.max(freeMins, 0)} color="#22c55e" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-pink-600" />
            <span className="text-[13px] font-bold text-gray-900">Wellness Metrics</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-pink-50 rounded-lg p-2.5 text-center">
              <Footprints className="w-5 h-5 text-pink-500 mx-auto mb-1" />
              <div className="text-[14px] font-bold text-pink-700">{TRIP.wellnessMinutes}m</div>
              <div className="text-[10px] text-pink-600 font-medium">Walking</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <Leaf className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <div className="text-[14px] font-bold text-green-700">5</div>
              <div className="text-[10px] text-green-600 font-medium">Nature Activities</div>
            </div>
            <div className="bg-indigo-50 rounded-lg p-2.5 text-center">
              <Clock className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
              <div className="text-[14px] font-bold text-indigo-700">3</div>
              <div className="text-[10px] text-indigo-600 font-medium">Rest Periods</div>
            </div>
          </div>
          <div className="mt-3 bg-pink-50/50 border border-pink-200/40 rounded-lg px-3 py-2">
            <div className="text-[11px] text-pink-700">
              <span className="font-semibold">Wellness tip:</span> Day 2 includes yoga and coastal walks, which balances the more intense sightseeing on Day 1.
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span className="text-[13px] font-bold text-gray-900">Day-by-Day Cost</span>
          </div>
          <div className="space-y-2">
            {dayCosts.map(d => (
              <div key={d.day} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: DAY_COLORS[(d.day - 1) % DAY_COLORS.length] }}>
                  D{d.day}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-600 truncate">{d.label}</span>
                    <span className="text-[11px] font-semibold text-gray-800">${d.cost}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((d.cost / maxDayCost) * 100)}%`,
                        backgroundColor: DAY_COLORS[(d.day - 1) % DAY_COLORS.length],
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
