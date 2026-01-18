"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Event, Session, MetricsSummary } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { StatusCard } from "@/components/StatusCard";
import { EventList } from "@/components/EventList";
import { SessionList } from "@/components/SessionList";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { TimelineChart } from "@/components/TimelineChart";
import { ProjectSelector } from "@/components/ProjectSelector";
import { TaskPanel } from "@/components/TaskPanel";
import { ExportButton } from "@/components/ExportButton";
import { Activity, RefreshCw, AlertTriangle, X } from "lucide-react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

export default function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "unknown">("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const handleWSMessage = useCallback((message: any) => {
    if (message.type === "event") {
      setEvents((prev) => [message.data, ...prev].slice(0, 50));
    } else if (message.type === "session") {
      if (message.action === "created") {
        setSessions((prev) => [message.data, ...prev].slice(0, 20));
      } else if (message.action === "updated") {
        setSessions((prev) =>
          prev.map((s) =>
            s.session_id === message.data.session_id ? message.data : s
          )
        );
      }
    }
  }, []);

  const { isConnected } = useWebSocket(WS_URL, {
    onMessage: handleWSMessage,
  });

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, sessionsRes, metricsRes] = await Promise.all([
        api.getEvents({ limit: 50, project: selectedProject || undefined }),
        api.getSessions({ limit: 20, project: selectedProject || undefined }),
        api.getMetricsSummary(),
      ]);

      setEvents(eventsRes.events);
      setSessions(sessionsRes.sessions);
      setMetrics(metricsRes);
      setApiStatus("ok");
      setLastUpdated(new Date());
      setShowError(false);
      setErrorMessage(null);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setApiStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to connect to API. Is the backend running?"
      );
      setShowError(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return "";
    return lastUpdated.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Error Banner */}
      {showError && errorMessage && (
        <div className="bg-red-900/50 border-b border-red-800">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <span className="text-red-200">{errorMessage}</span>
              </div>
              <button
                onClick={() => setShowError(false)}
                className="p-1 hover:bg-red-800/50 rounded"
              >
                <X className="h-4 w-4 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0f0f0f]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-bold text-white">
                AI Orchestration Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <ProjectSelector
                selectedProject={selectedProject}
                onProjectChange={setSelectedProject}
              />
              <ExportButton selectedProject={selectedProject} />
              {lastUpdated && (
                <span className="text-xs text-gray-500">
                  Updated: {formatLastUpdated()}
                </span>
              )}
              <ConnectionStatus isConnected={isConnected} apiStatus={apiStatus} />
              <button
                onClick={fetchData}
                className="p-2 rounded-md hover:bg-gray-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard
                title="Active Sessions"
                value={metrics?.sessions.active || 0}
                subtitle="currently running"
                status="success"
                icon="activity"
              />
              <StatusCard
                title="Total Events"
                value={metrics?.events.total || 0}
                subtitle="all time"
                status="info"
                icon="activity"
              />
              <StatusCard
                title="Completed Sessions"
                value={metrics?.sessions.completed || 0}
                subtitle="successfully finished"
                status="info"
                icon="check"
              />
              <StatusCard
                title="Failed Sessions"
                value={metrics?.sessions.failed || 0}
                subtitle="with errors"
                status={metrics?.sessions.failed ? "error" : "info"}
                icon="error"
              />
            </div>

            {/* Timeline Chart */}
            <TimelineChart />

            {/* Three-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Events Panel */}
              <div className="rounded-lg border border-gray-800 bg-[#0f0f0f]">
                <div className="border-b border-gray-800 px-4 py-3">
                  <h2 className="font-semibold text-white">Recent Events</h2>
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  <EventList events={events} />
                </div>
              </div>

              {/* Sessions Panel */}
              <div className="rounded-lg border border-gray-800 bg-[#0f0f0f]">
                <div className="border-b border-gray-800 px-4 py-3">
                  <h2 className="font-semibold text-white">Sessions</h2>
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  <SessionList sessions={sessions} />
                </div>
              </div>

              {/* Tasks Panel */}
              <TaskPanel selectedProject={selectedProject} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-gray-500">
            AI Orchestration Dashboard v1.0.0 - Monitoring Claude Code Sessions
          </p>
        </div>
      </footer>
    </div>
  );
}
