"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
  user: {
    user_id: string;
    relationship_level: number;
    current_stage: string;
    streak_days: number;
    longest_streak: number;
    total_interactions: number;
    emotional_investment: number;
    last_interaction: string;
    last_mood: string;
  } | null;
  events: Array<{
    event_type: string;
    description?: string;
    created_at: string;
  }>;
  breakthroughs: Array<{
    moment_type: string;
    unlocked_at: string;
  }>;
  emotions: Array<{
    emotion_type: string;
    intensity: number;
    created_at: string;
  }>;
}

interface ActiveUser {
  user_id: string;
  relationship_level: number;
  current_stage: string;
  last_interaction: string;
  streak_days: number;
  emotional_investment: number;
  last_mood: string;
  message_count: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [addiction, setAddiction] = useState<AddictionData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [streakRecovery, setStreakRecovery] = useState<StreakRecovery | null>(null);
  const [messageAnalysis, setMessageAnalysis] = useState<MessageAnalysis | null>(null);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  
  // Chat View States
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatViewOpen, setIsChatViewOpen] = useState(false);
  
  // Manual Override States
  const [overrideUserId, setOverrideUserId] = useState<string | null>(null);
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  const [manualResponseText, setManualResponseText] = useState("");
  
  // Typing indicator ref
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchUserId, setSearchUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "activity" | "recovery" | "analysis">("overview");

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, engagementRes, revenueRes, addictionRes, streakRes, analysisRes, forecastRes] = await Promise.all([
        fetch("/api/analytics/overview"),
        fetch("/api/analytics/engagement"),
        fetch("/api/analytics/revenue"),
        fetch("/api/analytics/addiction"),
        fetch("/api/analytics/streak-recovery"),
        fetch("/api/analytics/message-analysis"),
        fetch("/api/analytics/forecast"),
      ]);

      if (!overviewRes.ok || !engagementRes.ok || !revenueRes.ok || !addictionRes.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const [overviewData, engagementData, revenueData, addictionData, streakData, analysisData, forecastData] = await Promise.all([
        overviewRes.json(),
        engagementRes.json(),
        revenueRes.json(),
        addictionRes.json(),
        streakRes.json(),
        analysisRes.json(),
        forecastRes.json(),
      ]);

      setOverview(overviewData);
      setEngagement(engagementData);
      setRevenue(revenueData);
      setAddiction(addictionData);
      setStreakRecovery(streakData);
      setMessageAnalysis(analysisData);
      setForecast(forecastData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const res = await fetch("/api/analytics/active-users");
      if (!res.ok) throw new Error("Failed to fetch active users");
      const data = await res.json();
      setActiveUsers(data.users || []);
    } catch (err) {
      console.error("Error fetching active users:", err);
    }
  };

  const searchUser = async () => {
    if (!searchUserId.trim()) {
      alert("Please enter a user ID");
      return;
    }

    try {
      const res = await fetch(`/api/analytics/user/${searchUserId}`);
      if (!res.ok) {
        alert("User not found");
        return;
      }
      const data = await res.json();
      setUserProfile(data);
    } catch (err) {
      alert("Error fetching user profile");
      console.error(err);
    }
  };

  // View Chat Functions
  const openChatView = async (userId: string) => {
    setViewingUserId(userId);
    setIsChatViewOpen(true);
    await fetchChatMessages(userId);
    startMessagePolling(userId);
  };

  const fetchChatMessages = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/chat-view/messages/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch (err) {
      console.error("Error fetching chat messages:", err);
      setChatMessages([]);
    }
  }, []);

  const closeChatView = () => {
    setIsChatViewOpen(false);
    setViewingUserId(null);
    setChatMessages([]);
    stopMessagePolling();
  };

  // Manual Override Functions
  const startManualOverride = async (userId: string) => {
    try {
      const res = await fetch("/api/manual-override/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!res.ok) {
        const error = await res.json();
        
        // Handle "already in override" case
        if (error.error && error.error.includes("already in manual override")) {
          const shouldClear = confirm(
            "This user is already in manual override mode (possibly stale session). " +
            "Do you want to force-clear and restart?"
          );
          
          if (shouldClear) {
            // Force clear the session
            await fetch("/api/manual-override/force-clear", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId }),
            });
            
            // Try starting again
            await startManualOverride(userId);
            return;
          }
        } else {
          alert(error.error || "Failed to start manual override");
        }
        return;
      }

      setOverrideUserId(userId);
      setIsOverrideActive(true);
      
      // If not already viewing, open chat view
      if (!isChatViewOpen) {
        setViewingUserId(userId);
        setIsChatViewOpen(true);
        await fetchChatMessages(userId);
        startMessagePolling(userId);
      }
    } catch (err) {
      alert("Error starting manual override");
      console.error(err);
    }
  };


  // Send typing status to server
  const updateTypingStatus = async (isTyping: boolean) => {
    if (!overrideUserId) return;

    try {
      await fetch("/api/manual-override/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: overrideUserId,
          is_typing: isTyping,
        }),
      });
    } catch (err) {
      console.error("Failed to update typing status:", err);
    }
  };

  // Handle typing in manual response textarea
  const handleManualResponseChange = (text: string) => {
    setManualResponseText(text);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (text.trim()) {
      // User is typing - send typing=true
      updateTypingStatus(true);

      // Set timeout to send typing=false after 2 seconds of no typing
      typingTimeoutRef.current = setTimeout(() => {
        updateTypingStatus(false);
      }, 2000);
    } else {
      // Textarea is empty - send typing=false immediately
      updateTypingStatus(false);
    }
  };

  const sendManualResponse = async () => {
    if (!manualResponseText.trim() || !overrideUserId) {
      return;
    }

    try {
      const res = await fetch("/api/manual-override/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: overrideUserId,
          message: manualResponseText,
        }),
      });

      if (!res.ok) {
        alert("Failed to send message");
        return;
      }

      // Refresh chat messages
      await fetchChatMessages(overrideUserId);
      setManualResponseText("");
      
      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
    } catch (err) {
      alert("Error sending message");
      console.error(err);
    }
  };

  const endManualOverride = async () => {
    if (!overrideUserId) return;

    try {
      const res = await fetch("/api/manual-override/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: overrideUserId }),
      });

      if (!res.ok) {
        alert("Failed to end manual override");
        return;
      }

      setIsOverrideActive(false);
      setOverrideUserId(null);
      setManualResponseText("");
      
      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
      
      alert("Manual override ended. API will resume normal operation.");
    } catch (err) {
      alert("Error ending manual override");
      console.error(err);
    }
  };

  // Message polling
  const messagePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopMessagePolling = useCallback(() => {
    if (messagePollingIntervalRef.current) {
      clearInterval(messagePollingIntervalRef.current);
      messagePollingIntervalRef.current = null;
    }
  }, []);

  const startMessagePolling = useCallback((userId: string) => {
    stopMessagePolling(); // Clear any existing interval
    messagePollingIntervalRef.current = setInterval(async () => {
      if (userId) {
        await fetchChatMessages(userId);
      }
    }, 2000); // Poll every 2 seconds
  }, [stopMessagePolling, fetchChatMessages]);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "activity") {
      fetchActiveUsers();
      const interval = setInterval(fetchActiveUsers, 5000); // Refresh every 5s
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    // Cleanup polling on unmount
    return () => {
      stopMessagePolling();
    };
  }, [stopMessagePolling]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-xl mb-4">Error: {error}</p>
          <button
            onClick={fetchAnalytics}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
            🎯 Ellie Analytics Dashboard
          </h1>
          <p className="text-gray-400 mt-2">Progressive Relationship Intelligence & Live Monitoring</p>
        </header>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-800 pb-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded ${
              activeTab === "overview"
                ? "bg-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded ${
              activeTab === "users"
                ? "bg-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            👤 User Lookup
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-4 py-2 rounded ${
              activeTab === "activity"
                ? "bg-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            🔴 Live Activity
          </button>
          <button
            onClick={() => setActiveTab("recovery")}
            className={`px-4 py-2 rounded ${
              activeTab === "recovery"
                ? "bg-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            💔 Streak Recovery
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`px-4 py-2 rounded ${
              activeTab === "analysis"
                ? "bg-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            💬 Message Analysis
          </button>
        </div>

        {/* Content */}
        <div className="space-y-8">
          {/* Overview Tab */}
          {activeTab === "overview" && overview && (
            <>
              {/* Stage Distribution */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h2 className="text-2xl font-bold mb-4">Relationship Stage Distribution</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {overview.stages.map((stage) => (
                    <div key={stage.current_stage} className="bg-gray-800 rounded p-4 border-l-4 border-blue-500">
                      <div className="text-sm text-gray-400">{STAGE_LABELS[stage.current_stage]}</div>
                      <div className="text-3xl font-bold">{stage.user_count}</div>
                      <div className="text-sm text-gray-400 mt-2">
                        Avg Level: {(Number(stage.avg_level) || 0).toFixed(1)}
                      </div>
                      <div className="text-sm text-gray-400">
                        Max Streak: {stage.max_streak} days
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <div className="text-sm text-gray-400">Total Users</div>
                  <div className="text-3xl font-bold text-blue-500">{overview.totals.total_users}</div>
                </div>
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <div className="text-sm text-gray-400">Avg Relationship Level</div>
                  <div className="text-3xl font-bold text-purple-500">
                    {(Number(overview.totals.avg_relationship_level) || 0).toFixed(1)}
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <div className="text-sm text-gray-400">Active Streaks</div>
                  <div className="text-3xl font-bold text-pink-500">{overview.totals.active_streaks}</div>
                </div>
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <div className="text-sm text-gray-400">Avg Emotional Investment</div>
                  <div className="text-3xl font-bold text-red-500">
                    {((Number(overview.totals.avg_emotional_investment) || 0) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Addiction Metrics */}
              {addiction && (
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-2xl font-bold mb-4">🔥 Addiction & Retention Metrics</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Week+ Streaks</div>
                      <div className="text-2xl font-bold">{addiction.metrics.week_plus_streaks}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Month+ Streaks</div>
                      <div className="text-2xl font-bold">{addiction.metrics.month_plus_streaks}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Heavy Users</div>
                      <div className="text-2xl font-bold">{addiction.metrics.heavy_users}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Daily Active</div>
                      <div className="text-2xl font-bold">{addiction.metrics.daily_active_users}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Revenue Forecast */}
              {forecast && (
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-2xl font-bold mb-4">💰 Revenue Forecast</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Current Month</div>
                      <div className="text-2xl font-bold text-green-500">
                        ${(Number(forecast.current_month.projected_revenue) || 0).toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400 mt-2">
                        {forecast.current_month.projected_conversions} conversions
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Next Month</div>
                      <div className="text-2xl font-bold text-green-500">
                        ${(Number(forecast.next_month.projected_revenue) || 0).toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400 mt-2">
                        {forecast.next_month.projected_conversions} conversions
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">6 Month Projection</div>
                      <div className="text-2xl font-bold text-green-500">
                        ${(Number(forecast.six_months.projected_revenue) || 0).toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400 mt-2">
                        {forecast.six_months.projected_conversions} conversions
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* User Lookup Tab */}
          {activeTab === "users" && (
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-2xl font-bold mb-4">👤 User Profile Lookup</h2>
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  placeholder="Enter User ID"
                  value={searchUserId}
                  onChange={(e) => setSearchUserId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUser()}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
                />
                <button
                  onClick={searchUser}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
                >
                  Search
                </button>
              </div>

              {userProfile?.user && (
                <div className="space-y-6">
                  {/* User Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">User ID</div>
                      <div className="font-mono text-sm">{userProfile.user.user_id}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Stage</div>
                      <div className="font-bold">{STAGE_LABELS[userProfile.user.current_stage]}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Level</div>
                      <div className="text-2xl font-bold">{userProfile.user.relationship_level}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-4">
                      <div className="text-sm text-gray-400">Streak</div>
                      <div className="text-2xl font-bold text-orange-500">
                        {userProfile.user.streak_days} days
                      </div>
                    </div>
                  </div>

                  {/* Emotional Investment */}
                  <div>
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

          {/* Live Activity Tab - Active Users with Actions */}
          {activeTab === "activity" && (
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-2xl font-bold mb-4">🔴 Live Active Users (Last 30 Minutes)</h2>
              <div className="text-xs text-gray-500 mb-3">Auto-refreshes every 5 seconds</div>
              <div className="space-y-3 max-h-[700px] overflow-y-auto">
                {activeUsers.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p>No active users in the last 30 minutes</p>
                    <p className="text-sm mt-2">Users appear here when they send messages</p>
                  </div>
                ) : (
                  activeUsers.map((user) => (
                    <div key={user.user_id} className="bg-gray-800 rounded p-4 border-l-4 border-green-500">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="font-mono text-sm">{user.user_id}</span>
                            <span className={`text-xs px-2 py-1 rounded ${STAGE_COLORS[user.current_stage]}`}>
                              {STAGE_LABELS[user.current_stage]}
                            </span>
                            <span className="text-xs bg-purple-900 px-2 py-1 rounded">
                              Level {user.relationship_level}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-400">
                            <div>
                              <span className="text-gray-500">Streak:</span> {user.streak_days} days
                            </div>
                            <div>
                              <span className="text-gray-500">Messages:</span> {user.message_count}
                            </div>
                            <div>
                              <span className="text-gray-500">Investment:</span> {((Number(user.emotional_investment) || 0) * 100).toFixed(0)}%
                            </div>
                            <div>
                              <span className="text-gray-500">Last Active:</span>{" "}
                              {new Date(user.last_interaction).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => openChatView(user.user_id)}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
                          >
                            👁️ View Chat
                          </button>
                          <button
                            onClick={() => startManualOverride(user.user_id)}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-medium"
                          >
                            🎮 Manual Override
                          </button>
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
                              {((Number(user.emotional_investment) || 0) * 100).toFixed(0)}% invested
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

        {/* Chat View Modal */}
        {isChatViewOpen && viewingUserId && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg w-full max-w-6xl max-h-[95vh] flex flex-col border border-gray-700">
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-800">
                <div>
                  <h3 className="text-2xl font-bold">
                    {isOverrideActive ? "🎮 Manual Override Active" : "👁️ Viewing Chat"}
                  </h3>
                  <p className="text-sm text-gray-400">User: {viewingUserId}</p>
                </div>
                <div className="flex gap-2">
                  {isOverrideActive ? (
                    <button
                      onClick={endManualOverride}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium"
                    >
                      End Override
                    </button>
                  ) : (
                    <button
                      onClick={() => startManualOverride(viewingUserId)}
                      className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded font-medium"
                    >
                      Take Over (Manual Override)
                    </button>
                  )}
                  <button
                    onClick={() => {
                      closeChatView();
                      if (isOverrideActive) {
                        endManualOverride();
                      }
                    }}
                    className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[400px]">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                    <p className="text-lg">📭 No messages in history yet</p>
                    <p className="text-sm text-gray-500">
                      All conversations will appear here once the conversation_history table is created.
                    </p>
                    <p className="text-xs text-gray-600">
                      Run the migration SQL to enable full chat history tracking.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-4 ${
                          msg.role === 'user'
                            ? 'bg-blue-900/50 border border-blue-800'
                            : 'bg-purple-900/50 border border-purple-800'
                        }`}
                      >
                        <div className="text-xs text-gray-400 mb-1">
                          {msg.role === 'user' ? '👤 User' : '💬 Ellie'}
                        </div>
                        <div className="text-white whitespace-pre-wrap">{msg.content}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Manual Response Input (only when override active) */}
              {isOverrideActive && (
                <div className="p-6 border-t border-gray-800 bg-gray-800/50">
                  <div className="flex gap-2">
                    <textarea
                      placeholder="Type your manual response as Ellie..."
                      value={manualResponseText}
                      onChange={(e) => handleManualResponseChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendManualResponse();
                        }
                      }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-3 text-white resize-none focus:outline-none focus:border-purple-500"
                      rows={3}
                    />
                    <button
                      onClick={sendManualResponse}
                      disabled={!manualResponseText.trim()}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 rounded font-bold"
                    >
                      SEND
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Press Enter to send • Shift+Enter for new line • Messages stored as normal API responses
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}