"use client";

import { useState, useEffect } from "react";
import { Alert, AlertHistory, api } from "@/lib/api";
import { Modal } from "./Modal";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "./Toast";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  Save,
  Trash2,
  Play,
  History,
  CheckCircle,
  Clock,
} from "lucide-react";

interface AlertDetailProps {
  alert: Alert | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (alert: Alert) => void;
  onDelete: (alertId: string) => void;
}

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

const operatorLabels: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  eq: "=",
  ne: "!=",
  contains: "contains",
};

export function AlertDetail({ alert, isOpen, onClose, onUpdate, onDelete }: AlertDetailProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    severity: "warning" as "info" | "warning" | "critical",
    enabled: true,
    cooldown_minutes: 5,
  });

  useEffect(() => {
    if (alert) {
      setFormData({
        name: alert.name,
        description: alert.description || "",
        severity: alert.severity,
        enabled: alert.enabled,
        cooldown_minutes: alert.cooldown_minutes,
      });
      setIsEditing(false);
      setShowHistory(false);
      // Fetch history
      api.getAlertHistory(alert.alert_id, { limit: 10 })
        .then((res) => setHistory(res.history))
        .catch(console.error);
    }
  }, [alert]);

  if (!alert) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.updateAlert(alert.alert_id, {
        name: formData.name,
        description: formData.description || undefined,
        severity: formData.severity,
        enabled: formData.enabled,
        cooldown_minutes: formData.cooldown_minutes,
      });
      onUpdate(res.alert);
      setIsEditing(false);
      toast.success("Alert updated", "Changes have been saved");
    } catch (error) {
      console.error("Failed to update alert:", error);
      toast.error("Failed to update alert", "Please try again");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this alert?")) return;

    try {
      await api.deleteAlert(alert.alert_id);
      onDelete(alert.alert_id);
      onClose();
      toast.info("Alert deleted", `"${alert.name}" has been removed`);
    } catch (error) {
      console.error("Failed to delete alert:", error);
      toast.error("Failed to delete alert", "Please try again");
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await api.testAlert(alert.alert_id);
      toast.success("Alert triggered", `Test triggered at ${new Date(res.triggered_at).toLocaleTimeString()}`);
      // Refresh history
      const historyRes = await api.getAlertHistory(alert.alert_id, { limit: 10 });
      setHistory(historyRes.history);
    } catch (error) {
      console.error("Failed to test alert:", error);
      toast.error("Failed to test alert", "Please try again");
    } finally {
      setIsTesting(false);
    }
  };

  const config = severityConfig[alert.severity];
  const SeverityIcon = config.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Alert Details" size="md">
      <div className="space-y-6">
        {/* Alert Header */}
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-3", config.bgColor)}>
            <Bell className={cn("h-8 w-8", config.color)} />
          </div>
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-lg font-medium bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:border-blue-500"
              />
            ) : (
              <h3 className="text-lg font-medium text-theme-primary">{alert.name}</h3>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm",
                  config.bgColor,
                  config.color
                )}
              >
                <SeverityIcon className="h-4 w-4" />
                {config.label}
              </span>
              <span
                className={cn(
                  "px-2 py-1 rounded text-sm",
                  alert.enabled
                    ? "bg-green-500/10 text-green-400"
                    : "bg-gray-500/10 text-gray-400"
                )}
              >
                {alert.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>

        {/* Condition Display */}
        <div className="p-4 bg-theme-primary rounded-lg border border-theme">
          <div className="text-xs text-theme-secondary mb-2">Trigger Condition</div>
          <div className="flex items-center gap-2 text-sm text-theme-primary">
            <span className="font-medium">{alert.target}</span>
            <span className="text-theme-secondary">{alert.condition.field}</span>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
              {operatorLabels[alert.condition.operator] || alert.condition.operator}
            </span>
            <span className="font-medium">{String(alert.condition.value)}</span>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary placeholder:text-theme-secondary focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-theme-secondary mb-1">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      severity: e.target.value as "info" | "warning" | "critical",
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-theme-secondary mb-1">Cooldown (min)</label>
                <input
                  type="number"
                  min={1}
                  value={formData.cooldown_minutes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cooldown_minutes: parseInt(e.target.value) || 5 }))
                  }
                  className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="rounded border-theme"
              />
              <label htmlFor="enabled" className="text-sm text-theme-primary">
                Enabled
              </label>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <label className="block text-xs text-theme-secondary mb-1">Triggered</label>
            <span className="text-theme-primary font-medium">{alert.trigger_count} times</span>
          </div>
          <div>
            <label className="block text-xs text-theme-secondary mb-1">Last Triggered</label>
            <span className="text-theme-primary">
              {alert.last_triggered ? formatRelativeTime(alert.last_triggered) : "Never"}
            </span>
          </div>
          <div>
            <label className="block text-xs text-theme-secondary mb-1">Created</label>
            <span className="text-theme-primary">{formatRelativeTime(alert.created_at)}</span>
          </div>
        </div>

        {/* History Toggle */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
          >
            <History className="h-4 w-4" />
            {showHistory ? "Hide History" : "Show History"}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-xs text-theme-secondary py-2">No trigger history</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-2 bg-theme-primary rounded border border-theme"
                  >
                    <div className="flex items-center gap-2">
                      {h.status === "resolved" ? (
                        <CheckCircle className="h-3 w-3 text-green-400" />
                      ) : h.status === "acknowledged" ? (
                        <Clock className="h-3 w-3 text-yellow-400" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-red-400" />
                      )}
                      <span className="text-xs text-theme-primary capitalize">{h.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.status === "active" && (
                        <button
                          onClick={async () => {
                            try {
                              await api.resolveAlert(h.id);
                              setHistory((prev) =>
                                prev.map((item) =>
                                  item.id === h.id ? { ...item, status: "resolved" as const } : item
                                )
                              );
                              toast.success("Alert resolved", "The alert has been marked as resolved");
                            } catch (error) {
                              console.error("Failed to resolve alert:", error);
                              toast.error("Failed to resolve", "Please try again");
                            }
                          }}
                          className="px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                      <span className="text-[10px] text-theme-secondary">
                        {formatRelativeTime(h.triggered_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Alert ID */}
        <div>
          <label className="block text-xs text-theme-secondary mb-1">Alert ID</label>
          <code className="block text-xs text-theme-secondary bg-theme-primary p-2 rounded border border-theme font-mono">
            {alert.alert_id}
          </code>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-theme">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-3 py-2 text-sm text-theme-secondary hover:text-theme-primary hover:bg-theme-primary rounded-md transition-colors disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {isTesting ? "Testing..." : "Test"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setFormData({
                      name: alert.name,
                      description: alert.description || "",
                      severity: alert.severity,
                      enabled: alert.enabled,
                      cooldown_minutes: alert.cooldown_minutes,
                    });
                    setIsEditing(false);
                  }}
                  className="px-3 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-sm bg-theme-card border border-theme text-theme-primary rounded-md hover:bg-theme-primary transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
