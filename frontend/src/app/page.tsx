"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Event, Session, MetricsSummary, Agent, AgentCounts } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { StatusCard } from "@/components/StatusCard";
import { EventList } from "@/components/EventList";
import { SessionList } from "@/components/SessionList";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { TimelineChart } from "@/components/TimelineChart";
import { ProjectSelector } from "@/components/ProjectSelector";
import { TaskPanel } from "@/components/TaskPanel";
import { AgentPanel } from "@/components/AgentPanel";
import { AlertPanel } from "@/components/AlertPanel";
import { ExportButton } from "@/components/ExportButton";
import { SettingsModal } from "@/components/SettingsModal";
import { SearchModal } from "@/components/SearchModal";
import { DashboardCustomizer, PanelConfig, loadPanelConfig } from "@/components/DashboardCustomizer";
import { CCPMPanel } from "@/components/CCPMPanel";
import { FeverChart } from "@/components/FeverChart";
import { TaskQueuePanel } from "@/components/TaskQueuePanel";
import MultiAgentView from "@/components/MultiAgentView";
import { Activity, RefreshCw, AlertTriangle, X, Settings, Search, LayoutGrid, Users } from "lucide-react";
import { CCPMProject } from "@/lib/api";
import { useToast } from "@/components/Toast";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

export default function DashboardPage() {
  const toast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "unknown">("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentCounts, setAgentCounts] = useState<AgentCounts>({ active: 0, idle: 0, error: 0, total: 0 });
  const [panelConfig, setPanelConfig] = useState<PanelConfig[]>([]);
  const [selectedCCPMProject, setSelectedCCPMProject] = useState<CCPMProject | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "multiagent">("dashboard");

  // Load panel config on mount
  useEffect(() => {
    setPanelConfig(loadPanelConfig());
  }, []);

  const isPanelVisible = useCallback((panelId: string) => {
    const panel = panelConfig.find((p) => p.id === panelId);
    return panel ? panel.visible : true;
  }, [panelConfig]);

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
    } else if (message.type === "agent") {
      if (message.action === "created") {
        setAgents((prev) => [message.data, ...prev]);
        setAgentCounts((prev) => ({
          ...prev,
          [message.data.status]: prev[message.data.status as keyof AgentCounts] + 1,
          total: prev.total + 1,
        }));
      } else if (message.action === "updated") {
        setAgents((prev) =>
          prev.map((a) =>
            a.agent_id === message.data.agent_id ? message.data : a
          )
        );
      } else if (message.action === "deleted") {
        setAgents((prev) => prev.filter((a) => a.agent_id !== message.data.agent_id));
      }
    } else if (message.type === "alert_triggered") {
      // Show toast notification for triggered alerts
      const severity = message.data.severity as string;
      const toastType = severity === "critical" ? "error" : severity === "warning" ? "warning" : "info";
      toast[toastType](
        `Alert: ${message.data.name}`,
        `Severity: ${severity}`
      );
    }
  }, [toast]);

  const { isConnected } = useWebSocket(WS_URL, {
    onMessage: handleWSMessage,
  });

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, sessionsRes, metricsRes, agentsRes] = await Promise.all([
        api.getEvents({ limit: 50, project: selectedProject || undefined }),
        api.getSessions({ limit: 20, project: selectedProject || undefined }),
        api.getMetricsSummary(),
        api.getAgents({ limit: 50 }),
      ]);

      setEvents(eventsRes.events);
      setSessions(sessionsRes.sessions);
      setMetrics(metricsRes);
      setAgents(agentsRes.agents);
      setAgentCounts(agentsRes.counts);
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

  // Keyboard shortcut for search (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return "";
    return lastUpdated.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-theme-primary">
      {/* Error Banner */}
      {showError && errorMessage && (
        <div className="bg-red-900/50 dark:bg-red-900/50 light:bg-red-100 border-b border-red-800 dark:border-red-800 light:border-red-300">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 dark:text-red-400 light:text-red-600" />
                <span className="text-red-200 dark:text-red-200 light:text-red-700">{errorMessage}</span>
              </div>
              <button
                onClick={() => setShowError(false)}
                className="p-1 hover:bg-red-800/50 dark:hover:bg-red-800/50 light:hover:bg-red-200 rounded"
              >
                <X className="h-4 w-4 text-red-400 dark:text-red-400 light:text-red-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-theme bg-theme-secondary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-bold text-theme-primary">
                AI Orchestration Dashboard
              </h1>
              {/* View Toggle */}
              <div className="flex ml-4 bg-theme-primary rounded-lg p-1">
                <button
                  onClick={() => setActiveView("dashboard")}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    activeView === "dashboard"
                      ? "bg-blue-500 text-white"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveView("multiagent")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors ${
                    activeView === "multiagent"
                      ? "bg-indigo-500 text-white"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Multi-Agent
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-theme-card border border-theme hover:bg-theme-primary transition-colors"
                title="Search (Ctrl+K)"
              >
                <Search className="h-4 w-4 text-theme-secondary" />
                <span className="text-sm text-theme-secondary hidden sm:inline">Search...</span>
                <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-theme-primary rounded border border-theme text-theme-secondary">
                  Ctrl+K
                </kbd>
              </button>
              <ProjectSelector
                selectedProject={selectedProject}
                onProjectChange={setSelectedProject}
              />
              <ExportButton selectedProject={selectedProject} />
              {lastUpdated && (
                <span className="text-xs text-theme-secondary">
                  Updated: {formatLastUpdated()}
                </span>
              )}
              <ConnectionStatus isConnected={isConnected} apiStatus={apiStatus} />
              <button
                onClick={fetchData}
                className="p-2 rounded-md hover:bg-theme-card transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 text-theme-secondary" />
              </button>
              <button
                onClick={() => setShowCustomizer(true)}
                className="p-2 rounded-md hover:bg-theme-card transition-colors"
                title="Customize Layout"
              >
                <LayoutGrid className="h-4 w-4 text-theme-secondary" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-md hover:bg-theme-card transition-colors"
                title="Settings"
              >
                <Settings className="h-4 w-4 text-theme-secondary" />
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
        ) : activeView === "multiagent" ? (
          /* Multi-Agent View */
          <MultiAgentView projectId={selectedProject || undefined} />
        ) : (
          <div className="space-y-6">
            {/* Metrics Grid */}
            {isPanelVisible("metrics") && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatusCard
                  title="Active Sessions"
                  value={metrics?.sessions.active || 0}
                  subtitle="currently running"
                  status="success"
                  icon="activity"
                />
                <StatusCard
                  title="Active Agents"
                  value={agentCounts.active}
                  subtitle={`${agentCounts.total} registered`}
                  status={agentCounts.active > 0 ? "success" : "info"}
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
            )}

            {/* Timeline Chart */}
            {isPanelVisible("timeline") && <TimelineChart />}

            {/* Main panels - 3 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Events Panel */}
              {isPanelVisible("events") && (
                <div className="rounded-lg border border-theme bg-theme-card">
                  <div className="border-b border-theme px-4 py-3">
                    <h2 className="font-semibold text-theme-primary">Recent Events</h2>
                  </div>
                  <div className="p-4 max-h-[500px] overflow-y-auto">
                    <EventList events={events} />
                  </div>
                </div>
              )}

              {/* Sessions Panel */}
              {isPanelVisible("sessions") && (
                <div className="rounded-lg border border-theme bg-theme-card">
                  <div className="border-b border-theme px-4 py-3">
                    <h2 className="font-semibold text-theme-primary">Sessions</h2>
                  </div>
                  <div className="p-4 max-h-[500px] overflow-y-auto">
                    <SessionList sessions={sessions} />
                  </div>
                </div>
              )}

              {/* Tasks Panel */}
              {isPanelVisible("tasks") && <TaskPanel selectedProject={selectedProject} />}
            </div>

            {/* Secondary panels - 2 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Agents Panel */}
              {isPanelVisible("agents") && (
                <AgentPanel
                  agents={agents}
                  counts={agentCounts}
                  onAgentsChange={(newAgents) => {
                    setAgents(newAgents);
                    const counts = { active: 0, idle: 0, error: 0, total: newAgents.length };
                    newAgents.forEach((a) => {
                      if (a.status in counts) {
                        counts[a.status as keyof typeof counts]++;
                      }
                    });
                    setAgentCounts(counts);
                  }}
                />
              )}

              {/* Task Queue Panel */}
              {isPanelVisible("taskQueue") && (
                <div className="rounded-lg border border-theme bg-theme-card max-h-[600px]">
                  <TaskQueuePanel projectId={selectedProject || undefined} />
                </div>
              )}
            </div>

            {/* Tertiary panels - Alerts */}
            <div className="grid grid-cols-1 gap-6">
              {/* Alerts Panel */}
              {isPanelVisible("alerts") && <AlertPanel />}
            </div>

            {/* CCPM Panel */}
            {isPanelVisible("ccpm") && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CCPMPanel onSelectProject={setSelectedCCPMProject} />
                {selectedCCPMProject && (
                  <FeverChart
                    projectId={selectedCCPMProject.project_id}
                    onRefresh={() => {}}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-theme mt-auto">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-theme-secondary">
            AI Orchestration Dashboard v1.0.0 - Monitoring Claude Code Sessions
          </p>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Search Modal */}
      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />

      {/* Dashboard Customizer */}
      <DashboardCustomizer
        isOpen={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        currentConfig={panelConfig}
        onSave={(config) => setPanelConfig(config)}
      />
    </div>
  );
}
