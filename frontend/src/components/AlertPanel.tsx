"use client";

import { useState, useEffect, useCallback } from "react";
import { Alert, AlertCounts, AlertHistory, api } from "@/lib/api";
import { AlertDetail } from "./AlertDetail";
import { useToast } from "./Toast";
import { formatRelativeTime, cn } from "@/lib/utils";
import {
  Bell,
  Plus,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  Power,
  PowerOff,
  X,
} from "lucide-react";

interface AlertPanelProps {
  className?: string;
}

type FilterType = "all" | "enabled" | "critical" | "warning" | "info";

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    label: "Critical",
  },
  warning: {
    icon: AlertCircle,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    label: "Info",
  },
};

const targetLabels: Record<string, string> = {
  sessions: "Sessions",
  events: "Events",
  tasks: "Tasks",
  agents: "Agents",
};

export function AlertPanel({ className }: AlertPanelProps) {
  const toast = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<AlertCounts>({ total: 0, enabled: 0, critical: 0, warning: 0, info: 0 });
  const [activeAlerts, setActiveAlerts] = useState<AlertHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // New alert form
  const [newAlert, setNewAlert] = useState({
    name: "",
    type: "threshold" as "threshold" | "pattern" | "anomaly",
    target: "events" as "sessions" | "events" | "tasks" | "agents",
    severity: "warning" as "info" | "warning" | "critical",
    field: "count",
    operator: "gt" as "gt" | "lt" | "eq" | "gte" | "lte",
    value: "100",
  });

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsRes, activeRes] = await Promise.all([
        api.getAlerts({ limit: 50 }),
        api.getActiveAlerts(10),
      ]);
      setAlerts(alertsRes.alerts);
      setCounts(alertsRes.counts);
      setActiveAlerts(activeRes.active_alerts);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleCreateAlert = async () => {
    if (!newAlert.name.trim()) {
      toast.warning("Name required", "Please enter an alert name");
      return;
    }

    try {
      const res = await api.createAlert({
        name: newAlert.name.trim(),
        type: newAlert.type,
        target: newAlert.target,
        severity: newAlert.severity,
        condition: {
          field: newAlert.field,
          operator: newAlert.operator,
          value: isNaN(Number(newAlert.value)) ? newAlert.value : Number(newAlert.value),
        },
      });
      setAlerts((prev) => [res.alert, ...prev]);
      setCounts((prev) => ({
        ...prev,
        total: prev.total + 1,
        enabled: prev.enabled + 1,
        [res.alert.severity]: prev[res.alert.severity as keyof AlertCounts] + 1,
      }));
      setNewAlert({
        name: "",
        type: "threshold",
        target: "events",
        severity: "warning",
        field: "count",
        operator: "gt",
        value: "100",
      });
      setShowForm(false);
      toast.success("Alert created", `"${res.alert.name}" has been created`);
    } catch (error) {
      console.error("Failed to create alert:", error);
      toast.error("Failed to create alert", "Please try again");
    }
  };

  const handleToggleEnabled = async (alert: Alert, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.updateAlert(alert.alert_id, { enabled: !alert.enabled });
      setAlerts((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? res.alert : a))
      );
      setCounts((prev) => ({
        ...prev,
        enabled: res.alert.enabled ? prev.enabled + 1 : prev.enabled - 1,
      }));
      toast.info(
        res.alert.enabled ? "Alert enabled" : "Alert disabled",
        `"${alert.name}" is now ${res.alert.enabled ? "active" : "inactive"}`
      );
    } catch (error) {
      console.error("Failed to toggle alert:", error);
      toast.error("Failed to update alert", "Please try again");
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === "all") return true;
    if (filter === "enabled") return alert.enabled;
    return alert.severity === filter;
  });

  const filterLabels: Record<FilterType, string> = {
    all: `All (${counts.total})`,
    enabled: `Enabled (${counts.enabled})`,
    critical: `Critical (${counts.critical})`,
    warning: `Warning (${counts.warning})`,
    info: `Info (${counts.info})`,
  };

  return (
    <div className={cn("rounded-lg border border-theme bg-theme-card", className)}>
      {/* Header */}
      <div className="border-b border-theme px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-theme-secondary" />
            <h2 className="font-semibold text-theme-primary">Alerts</h2>
            {activeAlerts.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                {activeAlerts.length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-theme-primary border border-theme text-theme-secondary hover:text-theme-primary transition-colors"
              >
                {filter === "all" ? "All" : filterLabels[filter].split(" ")[0]}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 mt-1 w-36 bg-theme-card border border-theme rounded-lg shadow-lg z-10">
                  {(Object.keys(filterLabels) as FilterType[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setFilter(key);
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs hover:bg-theme-primary transition-colors first:rounded-t-lg last:rounded-b-lg",
                        filter === key ? "text-blue-400 bg-blue-500/10" : "text-theme-primary"
                      )}
                    >
                      {filterLabels[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="p-1 rounded hover:bg-theme-primary transition-colors"
              title="Add Alert"
            >
              <Plus className="h-4 w-4 text-theme-secondary" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="border-b border-theme p-4 bg-theme-primary/50">
          <div className="space-y-3">
            <input
              type="text"
              value={newAlert.name}
              onChange={(e) => setNewAlert((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Alert name..."
              className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary placeholder:text-theme-secondary focus:outline-none focus:border-blue-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newAlert.target}
                onChange={(e) => setNewAlert((prev) => ({ ...prev, target: e.target.value as any }))}
                className="px-2 py-1.5 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary"
              >
                <option value="events">Events</option>
                <option value="sessions">Sessions</option>
                <option value="tasks">Tasks</option>
                <option value="agents">Agents</option>
              </select>
              <select
                value={newAlert.severity}
                onChange={(e) => setNewAlert((prev) => ({ ...prev, severity: e.target.value as any }))}
                className="px-2 py-1.5 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newAlert.field}
                onChange={(e) => setNewAlert((prev) => ({ ...prev, field: e.target.value }))}
                placeholder="Field"
                className="px-2 py-1.5 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary"
              />
              <select
                value={newAlert.operator}
                onChange={(e) => setNewAlert((prev) => ({ ...prev, operator: e.target.value as any }))}
                className="px-2 py-1.5 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary"
              >
                <option value="gt">&gt;</option>
                <option value="gte">&gt;=</option>
                <option value="lt">&lt;</option>
                <option value="lte">&lt;=</option>
                <option value="eq">=</option>
              </select>
              <input
                type="text"
                value={newAlert.value}
                onChange={(e) => setNewAlert((prev) => ({ ...prev, value: e.target.value }))}
                placeholder="Value"
                className="px-2 py-1.5 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs text-theme-secondary hover:text-theme-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlert}
                disabled={!newAlert.name.trim()}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="border-b border-theme p-3 bg-red-500/5">
          <div className="text-xs font-medium text-red-400 mb-2">Active Alerts</div>
          <div className="space-y-2">
            {activeAlerts.slice(0, 3).map((history) => (
              <div
                key={history.id}
                className="flex items-center justify-between p-2 bg-red-500/10 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  <span className="text-xs text-theme-primary">{history.alert_name}</span>
                </div>
                <span className="text-[10px] text-theme-secondary">
                  {formatRelativeTime(history.triggered_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts List */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-sm text-theme-secondary py-8">Loading...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center text-sm text-theme-secondary py-8">
            {filter === "all" ? "No alerts configured" : `No ${filter} alerts`}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlerts.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;
              return (
                <div
                  key={alert.alert_id}
                  onClick={() => {
                    setSelectedAlert(alert);
                    setShowDetail(true);
                  }}
                  className="w-full p-3 text-left rounded-lg border border-theme hover:bg-theme-primary transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <div className={cn("rounded p-1", config.bgColor)}>
                        <Icon className={cn("h-3 w-3", config.color)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-theme-primary">
                            {alert.name}
                          </span>
                          {!alert.enabled && (
                            <span className="text-[10px] px-1 py-0.5 bg-gray-500/20 text-gray-400 rounded">
                              disabled
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-theme-secondary">
                            {targetLabels[alert.target]}
                          </span>
                          <span className="text-[10px] text-theme-secondary">
                            Triggered {alert.trigger_count}x
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleToggleEnabled(alert, e)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        alert.enabled
                          ? "text-green-400 hover:bg-green-500/20"
                          : "text-gray-400 hover:bg-gray-500/20"
                      )}
                      title={alert.enabled ? "Disable" : "Enable"}
                    >
                      {alert.enabled ? (
                        <Power className="h-3 w-3" />
                      ) : (
                        <PowerOff className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AlertDetail
        alert={selectedAlert}
        isOpen={showDetail}
        onClose={() => {
          setShowDetail(false);
          setSelectedAlert(null);
        }}
        onUpdate={(updated) => {
          setAlerts((prev) =>
            prev.map((a) => (a.alert_id === updated.alert_id ? updated : a))
          );
        }}
        onDelete={(alertId) => {
          setAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
          setCounts((prev) => ({ ...prev, total: prev.total - 1 }));
        }}
      />
    </div>
  );
}
