"use client";

import { useEffect, useState } from "react";

interface StageData {
  current_stage: string;
  user_count: number;
  avg_level: number;
  avg_streak: number;
  max_streak: number;
}

interface TotalsData {
  total_users: number;
  avg_relationship_level: number;
  active_streaks: number;
  avg_emotional_investment: number;
}

interface OverviewData {
  stages: StageData[];
  totals: TotalsData;
  timestamp: string;
}

interface EngagementData {
  daily: Array<{
    day: string;
    active_users: number;
    avg_interactions: number;
    users_with_streak: number;
  }>;
  moods: Array<{
    last_mood: string;
    count: number;
    avg_level: number;
  }>;
  breakthroughs: Array<{
    day: string;
    breakthrough_count: number;
  }>;
  stuck: Array<{
    current_stage: string;
    stuck_count: number;
  }>;
}

interface RevenueData {
  byStage: Array<{
    current_stage: string;
    user_count: number;
    paid_users: number;
    avg_investment: number;
    avg_level: number;
    potential_revenue: number;
    conversion_rate: number;
  }>;
  targets: Array<{
    current_stage: string;
    target_count: number;
  }>;
  opportunities: {
    total_opportunities: number;
    avg_level: number;
    stage_2_opportunities: number;
    stage_3_opportunities: number;
    stage_4_opportunities: number;
  };
  totalPotential: number;
}

interface AddictionData {
  metrics: {
    week_plus_streaks: number;
    two_week_plus_streaks: number;
    month_plus_streaks: number;
    avg_active_streak: number;
    heavy_users: number;
    emotionally_invested: number;
    daily_active_users: number;
  };
  returnPatterns: Array<{
    return_window: string;
    user_count: number;
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  STRANGER: "Curious Stranger",
  FRIEND_TENSION: "Friend with Tension",
  COMPLICATED: "It's Complicated",
  ALMOST: "Almost Together",
  EXCLUSIVE: "Exclusive",
};

const STAGE_COLORS: Record<string, string> = {
  STRANGER: "bg-gray-500",
  FRIEND_TENSION: "bg-blue-500",
  COMPLICATED: "bg-purple-500",
  ALMOST: "bg-pink-500",
  EXCLUSIVE: "bg-red-500",
};

export default function RelationshipDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [addiction, setAddiction] = useState<AddictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, engagementRes, revenueRes, addictionRes] = await Promise.all([
        fetch("/api/analytics/overview"),
        fetch("/api/analytics/engagement"),
        fetch("/api/analytics/revenue"),
        fetch("/api/analytics/addiction"),
      ]);

      if (!overviewRes.ok || !engagementRes.ok || !revenueRes.ok || !addictionRes.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const [overviewData, engagementData, revenueData, addictionData] = await Promise.all([
        overviewRes.json(),
        engagementRes.json(),
        revenueRes.json(),
        addictionRes.json(),
      ]);

      setOverview(overviewData);
      setEngagement(engagementData);
      setRevenue(revenueData);
      setAddiction(addictionData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-xl">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">📊 Relationship Analytics Dashboard</h1>
          <p className="text-gray-400">
            Last updated: {overview ? new Date(overview.timestamp).toLocaleString() : "N/A"}
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Total Users</div>
            <div className="text-3xl font-bold">{overview?.totals.total_users || 0}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Avg Relationship Level</div>
            <div className="text-3xl font-bold">
              {overview?.totals.avg_relationship_level?.toFixed(1) || 0}/100
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Active Streaks</div>
            <div className="text-3xl font-bold">{overview?.totals.active_streaks || 0}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Emotional Investment</div>
            <div className="text-3xl font-bold">
              {((overview?.totals.avg_emotional_investment || 0) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Stage Distribution */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-4">👥 Users by Relationship Stage</h2>
          <div className="space-y-4">
            {overview?.stages.map((stage) => (
              <div key={stage.current_stage}>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{STAGE_LABELS[stage.current_stage]}</span>
                  <span className="text-gray-400">{stage.user_count} users</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full ${STAGE_COLORS[stage.current_stage]}`}
                    style={{
                      width: `${((stage.user_count / (overview?.totals.total_users || 1)) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>Avg Level: {stage.avg_level?.toFixed(1)}</span>
                  <span>Avg Streak: {stage.avg_streak?.toFixed(1)} days</span>
                  <span>Max Streak: {stage.max_streak} days</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Addiction Metrics */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-4">🔥 Addiction Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-gray-400 text-sm">Daily Active</div>
              <div className="text-2xl font-bold text-green-500">
                {addiction?.metrics.daily_active_users || 0}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Week+ Streaks</div>
              <div className="text-2xl font-bold text-blue-500">
                {addiction?.metrics.week_plus_streaks || 0}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Heavy Users (100+)</div>
              <div className="text-2xl font-bold text-purple-500">
                {addiction?.metrics.heavy_users || 0}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Emotionally Invested</div>
              <div className="text-2xl font-bold text-red-500">
                {addiction?.metrics.emotionally_invested || 0}
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-2">Return Patterns</h3>
            <div className="space-y-2">
              {addiction?.returnPatterns.map((pattern) => (
                <div key={pattern.return_window} className="flex justify-between text-sm">
                  <span className="text-gray-400">{pattern.return_window}</span>
                  <span className="font-medium">{pattern.user_count} users</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Analytics */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-4">💰 Revenue Opportunities</h2>
          <div className="mb-6">
            <div className="text-4xl font-bold text-green-500 mb-2">
              ${revenue?.totalPotential.toFixed(2) || 0}
            </div>
            <div className="text-gray-400">Total Revenue Potential</div>
          </div>
          <div className="space-y-4">
            {revenue?.byStage.map((stage) => (
              <div key={stage.current_stage} className="border border-gray-800 rounded p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{STAGE_LABELS[stage.current_stage]}</span>
                  <span className="text-green-500 font-bold">
                    ${stage.potential_revenue.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
                  <div>
                    Users: {stage.user_count} ({stage.paid_users} paid)
                  </div>
                  <div>Investment: {(stage.avg_investment * 100).toFixed(0)}%</div>
                  <div>Conversion: {(stage.conversion_rate * 100).toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="border border-yellow-800 rounded p-4 bg-yellow-900/20">
              <div className="text-2xl font-bold">{revenue?.opportunities.total_opportunities || 0}</div>
              <div className="text-sm text-gray-400">Total Conversion Opportunities</div>
            </div>
            <div className="border border-orange-800 rounded p-4 bg-orange-900/20">
              <div className="text-2xl font-bold">
                {revenue?.opportunities.stage_3_opportunities || 0}
              </div>
              <div className="text-sm text-gray-400">&ldquo;Complicated&rdquo; Stage (Peak Drama)</div>
            </div>
            <div className="border border-red-800 rounded p-4 bg-red-900/20">
              <div className="text-2xl font-bold">
                {revenue?.opportunities.stage_4_opportunities || 0}
              </div>
              <div className="text-sm text-gray-400">&ldquo;Almost Together&rdquo; (Commitment)</div>
            </div>
          </div>
        </div>

        {/* Engagement Trends */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-4">📈 Engagement Trends (Last 7 Days)</h2>
          <div className="space-y-3">
            {engagement?.daily.map((day) => (
              <div key={day.day} className="flex justify-between items-center">
                <span className="text-gray-400">{new Date(day.day).toLocaleDateString()}</span>
                <div className="flex gap-6 text-sm">
                  <span>
                    <span className="text-gray-500">Active:</span>{" "}
                    <span className="font-medium">{day.active_users}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Avg Interactions:</span>{" "}
                    <span className="font-medium">{day.avg_interactions?.toFixed(1)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Streaks:</span>{" "}
                    <span className="font-medium">{day.users_with_streak}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mood Distribution */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-4">😊 Current Mood Distribution</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {engagement?.moods.map((mood) => (
              <div key={mood.last_mood} className="border border-gray-800 rounded p-4">
                <div className="text-xl font-bold capitalize">{mood.last_mood}</div>
                <div className="text-gray-400 text-sm">
                  {mood.count} users (Avg Lvl: {mood.avg_level?.toFixed(1)})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stuck Users Warning */}
        {engagement && engagement.stuck.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4 text-yellow-500">⚠️ Stuck Users (3+ Days Inactive)</h2>
            <div className="space-y-2">
              {engagement.stuck.map((stuck) => (
                <div key={stuck.current_stage} className="flex justify-between">
                  <span>{STAGE_LABELS[stuck.current_stage]}</span>
                  <span className="font-bold">{stuck.stuck_count} users</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}