"use client";

import { useState, useEffect } from "react";

interface SystemMetrics {
  timestamp: string;
  agents: {
    total: number;
    active: number;
    idle: number;
    busy: number;
    inactive: number;
  };
  tasks: {
    total: number;
    pending: number;
    queued: number;
    in_progress: number;
    completed: number;
    failed: number;
    avg_completion_time_minutes: number | null;
  };
  locks: {
    total_active: number;
    avg_hold_time_minutes: number | null;
    conflicts_today: number;
  };
  context: {
    total_entries: number;
    decisions: number;
    blockers: number;
    learnings: number;
  };
  alerts: {
    total_unread: number;
    high_severity: number;
    medium_severity: number;
    low_severity: number;
  };
  performance: {
    avg_task_wait_time_minutes: number | null;
    avg_task_execution_time_minutes: number | null;
    task_success_rate: number | null;
    agent_utilization_percent: number | null;
  };
}

interface SchedulerStatus {
  running: boolean;
  jobs: {
    dispatch: boolean;
    timeout: boolean;
    health: boolean;
    lockCleanup: boolean;
  };
}

interface Alert {
  alert_id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  read: boolean;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch health/scheduler status
      const healthRes = await fetch(`${API_BASE}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setSchedulerStatus(healthData.schedulers);
      }

      // Fetch metrics
      const metricsRes = await fetch(`${API_BASE}/api/metrics/system`);
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }

      // Fetch recent alerts
      const alertsRes = await fetch(`${API_BASE}/api/alerts?limit=10&unresolved_only=true`);
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }

      setError(null);
    } catch (err) {
      setError("Failed to fetch monitoring data");
      console.error("Monitoring fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const formatMinutes = (minutes: number | null) => {
    if (minutes === null || minutes === undefined) return "-";
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    return `${(minutes / 60).toFixed(1)}h`;
  };

  const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          System Monitoring
        </h2>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 transition"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Scheduler Status */}
      {schedulerStatus && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
            Scheduler Status
          </h3>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${schedulerStatus.running ? "text-green-600" : "text-red-600"}`}>
              <span className={`w-2 h-2 rounded-full ${schedulerStatus.running ? "bg-green-500" : "bg-red-500"}`} />
              {schedulerStatus.running ? "Running" : "Stopped"}
            </div>
            <div className="flex gap-3 text-sm">
              {Object.entries(schedulerStatus.jobs).map(([job, active]) => (
                <span
                  key={job}
                  className={`px-2 py-1 rounded ${
                    active
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  {job}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Agents Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Agents</h4>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.agents.total}
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                {metrics.agents.active} active
              </span>
              <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                {metrics.agents.busy} busy
              </span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                {metrics.agents.inactive} inactive
              </span>
            </div>
          </div>

          {/* Tasks Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Tasks</h4>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.tasks.total}
            </div>
            <div className="mt-2 flex gap-2 text-xs flex-wrap">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                {metrics.tasks.pending} pending
              </span>
              <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded">
                {metrics.tasks.in_progress} running
              </span>
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                {metrics.tasks.completed} done
              </span>
              {metrics.tasks.failed > 0 && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                  {metrics.tasks.failed} failed
                </span>
              )}
            </div>
          </div>

          {/* Locks Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">File Locks</h4>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.locks.total_active}
            </div>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <div>Avg hold time: {formatMinutes(metrics.locks.avg_hold_time_minutes)}</div>
              <div>Conflicts today: {metrics.locks.conflicts_today}</div>
            </div>
          </div>

          {/* Alerts Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Alerts</h4>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics.alerts.total_unread}
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              {metrics.alerts.high_severity > 0 && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                  {metrics.alerts.high_severity} high
                </span>
              )}
              {metrics.alerts.medium_severity > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                  {metrics.alerts.medium_severity} medium
                </span>
              )}
              {metrics.alerts.low_severity > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  {metrics.alerts.low_severity} low
                </span>
              )}
              {metrics.alerts.total_unread === 0 && (
                <span className="text-green-600 dark:text-green-400">All clear</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {metrics && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Performance (Last 7 Days)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Task Wait Time</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatMinutes(metrics.performance.avg_task_wait_time_minutes)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Execution Time</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatMinutes(metrics.performance.avg_task_execution_time_minutes)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Success Rate</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatPercent(metrics.performance.task_success_rate)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Agent Utilization</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatPercent(metrics.performance.agent_utilization_percent)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared Context Stats */}
      {metrics && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Shared Context
          </h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.context.total_entries}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {metrics.context.decisions}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Decisions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {metrics.context.blockers}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Blockers</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {metrics.context.learnings}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Learnings</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Recent Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  alert.read
                    ? "bg-gray-50 dark:bg-gray-700/50"
                    : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600"
                }`}
              >
                <span className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${getSeverityColor(alert.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {alert.title}
                    </span>
                    <span className={`px-1.5 py-0.5 text-xs rounded ${getSeverityColor(alert.severity)} text-white`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {alert.message}
                  </p>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
