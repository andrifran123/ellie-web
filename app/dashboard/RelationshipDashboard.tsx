"use client";

import { useEffect, useState } from "react";

// ============================================
// INTERFACES
// ============================================

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

interface UserProfile {
  user: any;
  events: any[];
  breakthroughs: any[];
  emotions: any[];
}

interface ActivityEvent {
  type: string;
  user_id: string;
  level: number;
  stage: string;
  message?: string;
  timestamp: string;
}

interface StreakRecovery {
  broken_today: number;
  broken_this_week: number;
  recovery_potential: number;
  users: Array<{
    user_id: string;
    level: number;
    days_since_broken: number;
    emotional_investment: number;
  }>;
}

interface MessageAnalysis {
  total_messages: number;
  avg_length: number;
  top_words: Array<{ word: string; count: number }>;
  top_topics: Array<{ topic: string; count: number }>;
  emotional_words: Array<{ word: string; count: number }>;
  question_rate: number;
}

interface RevenueForecast {
  current_month: {
    projected_users: number;
    projected_conversions: number;
    projected_revenue: number;
  };
  next_month: {
    projected_users: number;
    projected_conversions: number;
    projected_revenue: number;
  };
  six_months: {
    projected_users: number;
    projected_conversions: number;
    projected_revenue: number;
  };
  assumptions: {
    growth_rate: number;
    conversion_rate: number;
    avg_revenue_per_user: number;
  };
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

export default function RelationshipDashboardEnhanced() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [addiction, setAddiction] = useState<AddictionData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [streakRecovery, setStreakRecovery] = useState<StreakRecovery | null>(null);
  const [messageAnalysis, setMessageAnalysis] = useState<MessageAnalysis | null>(null);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchUserId, setSearchUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "activity" | "recovery" | "analysis">("overview");

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, engagementRes, revenueRes, addictionRes, activityRes, streakRes, analysisRes, forecastRes] = await Promise.all([
        fetch("/api/analytics/overview"),
        fetch("/api/analytics/engagement"),
        fetch("/api/analytics/revenue"),
        fetch("/api/analytics/addiction"),
        fetch("/api/analytics/activity-feed"),
        fetch("/api/analytics/streak-recovery"),
        fetch("/api/analytics/message-analysis"),
        fetch("/api/analytics/forecast"),
      ]);

      if (!overviewRes.ok || !engagementRes.ok || !revenueRes.ok || !addictionRes.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const [overviewData, engagementData, revenueData, addictionData, activityData, streakData, analysisData, forecastData] = await Promise.all([
        overviewRes.json(),
        engagementRes.json(),
        revenueRes.json(),
        addictionRes.json(),
        activityRes.ok ? activityRes.json() : { feed: [] },
        streakRes.ok ? streakRes.json() : null,
        analysisRes.ok ? analysisRes.json() : null,
        forecastRes.ok ? forecastRes.json() : null,
      ]);

      setOverview(overviewData);
      setEngagement(engagementData);
      setRevenue(revenueData);
      setAddiction(addictionData);
      setActivityFeed(activityData.feed || []);
      setStreakRecovery(streakData);
      setMessageAnalysis(analysisData);
      setForecast(forecastData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const searchUser = async () => {
    if (!searchUserId.trim()) return;
    
    try {
      const res = await fetch(`/api/analytics/user/${searchUserId}`);
      if (!res.ok) throw new Error("User not found");
      
      const data = await res.json();
      setUserProfile(data);
      setActiveTab("users");
    } catch (err) {
      alert("User not found or error fetching user data");
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
        {/* Header with Search */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">📊 Analytics Dashboard</h1>
            <p className="text-gray-400">
              Last updated: {overview ? new Date(overview.timestamp).toLocaleString() : "N/A"}
            </p>
          </div>
          
          {/* User Search */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search User ID..."
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && searchUser()}
              className="bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white"
            />
            <button
              onClick={searchUser}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-medium"
            >
              Search
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-gray-800">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-6 py-3 font-medium ${
              activeTab === "overview"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 font-medium ${
              activeTab === "users"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            👤 User Profiles
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-6 py-3 font-medium ${
              activeTab === "activity"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            🔴 Live Activity
          </button>
          <button
            onClick={() => setActiveTab("recovery")}
            className={`px-6 py-3 font-medium ${
              activeTab === "recovery"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            💔 Streak Recovery
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`px-6 py-3 font-medium ${
              activeTab === "analysis"
                ? "border-b-2 border-blue-500 text-blue-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            💬 Message Analysis
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Total Users</div>
                <div className="text-3xl font-bold">{Number(overview?.totals.total_users) || 0}</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Avg Relationship Level</div>
                <div className="text-3xl font-bold">
                  {Number(overview?.totals.avg_relationship_level).toFixed(1) || 0}/100
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Active Streaks</div>
                <div className="text-3xl font-bold">{Number(overview?.totals.active_streaks) || 0}</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Emotional Investment</div>
                <div className="text-3xl font-bold">
                  {((Number(overview?.totals.avg_emotional_investment) || 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Revenue Forecast */}
            {forecast && (
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
                <h2 className="text-2xl font-bold mb-4">📈 Revenue Forecast</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400 mb-2">Current Month</div>
                    <div className="text-3xl font-bold text-green-500 mb-2">
                      ${Number(forecast.current_month.projected_revenue).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {Number(forecast.current_month.projected_users)} users →{" "}
                      {Number(forecast.current_month.projected_conversions)} conversions
                    </div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400 mb-2">Next Month</div>
                    <div className="text-3xl font-bold text-blue-500 mb-2">
                      ${Number(forecast.next_month.projected_revenue).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {Number(forecast.next_month.projected_users)} users →{" "}
                      {Number(forecast.next_month.projected_conversions)} conversions
                    </div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400 mb-2">6 Months</div>
                    <div className="text-3xl font-bold text-purple-500 mb-2">
                      ${Number(forecast.six_months.projected_revenue).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {Number(forecast.six_months.projected_users)} users →{" "}
                      {Number(forecast.six_months.projected_conversions)} conversions
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
                  <span>Assumptions:</span>{" "}
                  <span className="text-white">{(Number(forecast.assumptions.growth_rate) * 100).toFixed(0)}%</span> monthly growth,{" "}
                  <span className="text-white">{(Number(forecast.assumptions.conversion_rate) * 100).toFixed(0)}%</span> conversion rate,{" "}
                  <span className="text-white">${Number(forecast.assumptions.avg_revenue_per_user).toFixed(2)}</span> ARPU
                </div>
              </div>
            )}

            {/* Stage Distribution */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-8">
              <h2 className="text-2xl font-bold mb-4">👥 Users by Relationship Stage</h2>
              <div className="space-y-4">
                {overview?.stages.map((stage) => (
                  <div key={stage.current_stage}>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{STAGE_LABELS[stage.current_stage]}</span>
                      <span className="text-gray-400">{Number(stage.user_count)} users</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full ${STAGE_COLORS[stage.current_stage]}`}
                        style={{
                          width: `${((Number(stage.user_count) / (Number(overview?.totals.total_users) || 1)) * 100).toFixed(1)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>Avg Level: {Number(stage.avg_level).toFixed(1)}</span>
                      <span>Avg Streak: {Number(stage.avg_streak).toFixed(1)} days</span>
                      <span>Max Streak: {Number(stage.max_streak)} days</span>
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
                    {Number(addiction?.metrics.daily_active_users) || 0}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Week+ Streaks</div>
                  <div className="text-2xl font-bold text-blue-500">
                    {Number(addiction?.metrics.week_plus_streaks) || 0}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Heavy Users (100+)</div>
                  <div className="text-2xl font-bold text-purple-500">
                    {Number(addiction?.metrics.heavy_users) || 0}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Emotionally Invested</div>
                  <div className="text-2xl font-bold text-red-500">
                    {Number(addiction?.metrics.emotionally_invested) || 0}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-2">Return Patterns</h3>
                <div className="space-y-2">
                  {addiction?.returnPatterns.map((pattern) => (
                    <div key={pattern.return_window} className="flex justify-between text-sm">
                      <span className="text-gray-400">{pattern.return_window}</span>
                      <span className="font-medium">{Number(pattern.user_count)} users</span>
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
                  ${Number(revenue?.totalPotential).toFixed(2) || 0}
                </div>
                <div className="text-gray-400">Total Revenue Potential</div>
              </div>
              <div className="space-y-4">
                {revenue?.byStage.map((stage) => (
                  <div key={stage.current_stage} className="border border-gray-800 rounded p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{STAGE_LABELS[stage.current_stage]}</span>
                      <span className="text-green-500 font-bold">
                        ${Number(stage.potential_revenue).toFixed(2)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
                      <div>
                        Users: {Number(stage.user_count)} ({Number(stage.paid_users)} paid)
                      </div>
                      <div>Investment: {(Number(stage.avg_investment) * 100).toFixed(0)}%</div>
                      <div>Conversion: {(Number(stage.conversion_rate) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* User Profile Tab */}
        {activeTab === "users" && (
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-bold mb-4">👤 User Profile</h2>
            
            {!userProfile ? (
              <div className="text-center py-12 text-gray-400">
                <p>Search for a user ID above to view their profile</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* User Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Relationship Level</div>
                    <div className="text-2xl font-bold">{userProfile.user?.relationship_level || 0}</div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Current Stage</div>
                    <div className="text-xl font-medium">
                      {STAGE_LABELS[userProfile.user?.current_stage] || "Unknown"}
                    </div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Streak</div>
                    <div className="text-2xl font-bold">{userProfile.user?.streak_days || 0} days</div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Total Interactions</div>
                    <div className="text-2xl font-bold">{userProfile.user?.total_interactions || 0}</div>
                  </div>
                </div>

                {/* Emotional Investment */}
                <div className="border border-gray-800 rounded p-4">
                  <div className="text-sm text-gray-400 mb-2">Emotional Investment</div>
                  <div className="w-full bg-gray-800 rounded-full h-4">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-red-500 rounded-full"
                      style={{ width: `${((userProfile.user?.emotional_investment || 0) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right text-sm mt-1">
                    {((userProfile.user?.emotional_investment || 0) * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Recent Events */}
                <div>
                  <h3 className="font-bold mb-3">Recent Events</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {userProfile.events.map((event, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{event.event_type}</span>
                          <span className="text-gray-400">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>
                        {event.description && (
                          <div className="text-gray-400 mt-1">{event.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Breakthrough Moments */}
                <div>
                  <h3 className="font-bold mb-3">🎯 Breakthrough Moments</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {userProfile.breakthroughs.map((bt, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-3">
                        <div className="font-medium">{bt.moment_type}</div>
                        <div className="text-sm text-gray-400">
                          Unlocked: {new Date(bt.unlocked_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Real-Time Activity Feed */}
        {activeTab === "activity" && (
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-bold mb-4">🔴 Live Activity Feed</h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {activityFeed.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>No recent activity</p>
                </div>
              ) : (
                activityFeed.map((event, idx) => (
                  <div key={idx} className="bg-gray-800 rounded p-4 border-l-4 border-blue-500">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{event.type}</span>
                          <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                            User: {event.user_id}
                          </span>
                          <span className="text-xs bg-purple-900 px-2 py-1 rounded">
                            Level {event.level}
                          </span>
                        </div>
                        {event.message && (
                          <div className="text-sm text-gray-400">{event.message}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Streak Recovery Dashboard */}
        {activeTab === "recovery" && (
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-bold mb-4">💔 Streak Recovery Opportunities</h2>
            
            {!streakRecovery ? (
              <div className="text-center py-12 text-gray-400">
                <p>Loading streak recovery data...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-red-900/20 border border-red-800 rounded p-6">
                    <div className="text-sm text-gray-400">Broken Today</div>
                    <div className="text-3xl font-bold text-red-500">
                      {Number(streakRecovery.broken_today) || 0}
                    </div>
                  </div>
                  <div className="bg-orange-900/20 border border-orange-800 rounded p-6">
                    <div className="text-sm text-gray-400">Broken This Week</div>
                    <div className="text-3xl font-bold text-orange-500">
                      {Number(streakRecovery.broken_this_week) || 0}
                    </div>
                  </div>
                  <div className="bg-green-900/20 border border-green-800 rounded p-6">
                    <div className="text-sm text-gray-400">Recovery Revenue Potential</div>
                    <div className="text-3xl font-bold text-green-500">
                      ${Number(streakRecovery.recovery_potential).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold mb-3">Users to Re-Engage</h3>
                  <div className="space-y-3">
                    {streakRecovery.users.map((user, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-4 flex justify-between items-center">
                        <div>
                          <div className="font-medium">User: {user.user_id}</div>
                          <div className="text-sm text-gray-400">
                            Level {user.level} • {user.days_since_broken} days ago •{" "}
                            {(user.emotional_investment * 100).toFixed(0)}% invested
                          </div>
                        </div>
                        <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
                          Send Re-Engagement
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Message Content Analysis */}
        {activeTab === "analysis" && (
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-bold mb-4">💬 Message Content Analysis</h2>
            
            {!messageAnalysis ? (
              <div className="text-center py-12 text-gray-400">
                <p>Loading message analysis...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Total Messages</div>
                    <div className="text-3xl font-bold">{Number(messageAnalysis.total_messages)}</div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Avg Message Length</div>
                    <div className="text-3xl font-bold">{Number(messageAnalysis.avg_length).toFixed(0)} chars</div>
                  </div>
                  <div className="border border-gray-800 rounded p-4">
                    <div className="text-sm text-gray-400">Question Rate</div>
                    <div className="text-3xl font-bold">{(Number(messageAnalysis.question_rate) * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Top Words */}
                  <div>
                    <h3 className="font-bold mb-3">Most Used Words</h3>
                    <div className="space-y-2">
                      {messageAnalysis.top_words.map((item, idx) => (
                        <div key={idx} className="flex justify-between bg-gray-800 rounded p-2">
                          <span>{item.word}</span>
                          <span className="text-gray-400">{item.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Topics */}
                  <div>
                    <h3 className="font-bold mb-3">Top Topics</h3>
                    <div className="space-y-2">
                      {messageAnalysis.top_topics.map((item, idx) => (
                        <div key={idx} className="flex justify-between bg-gray-800 rounded p-2">
                          <span>{item.topic}</span>
                          <span className="text-gray-400">{item.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Emotional Words */}
                  <div>
                    <h3 className="font-bold mb-3">Emotional Words</h3>
                    <div className="space-y-2">
                      {messageAnalysis.emotional_words.map((item, idx) => (
                        <div key={idx} className="flex justify-between bg-gray-800 rounded p-2">
                          <span>{item.word}</span>
                          <span className="text-gray-400">{item.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}