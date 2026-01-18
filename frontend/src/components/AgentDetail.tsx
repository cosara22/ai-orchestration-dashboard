"use client";

import { useState, useEffect } from "react";
import { Agent, api } from "@/lib/api";
import { Modal } from "./Modal";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "./Toast";
import {
  Bot,
  CircleDot,
  Circle,
  AlertCircle,
  Save,
  Trash2,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";

interface AgentDetailProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (agent: Agent) => void;
  onDelete: (agentId: string) => void;
}

const statusConfig = {
  active: {
    icon: CircleDot,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
    label: "Active",
  },
  idle: {
    icon: Circle,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
    label: "Idle",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    label: "Error",
  },
};

const typeConfig: Record<string, { icon: typeof Bot; label: string }> = {
  default: { icon: Bot, label: "Default" },
  explore: { icon: Activity, label: "Explorer" },
  worker: { icon: CheckCircle2, label: "Worker" },
};

export function AgentDetail({ agent, isOpen, onClose, onUpdate, onDelete }: AgentDetailProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    status: "idle" as "active" | "idle" | "error",
  });

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        status: agent.status,
      });
      setIsEditing(false);
    }
  }, [agent]);

  if (!agent) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.updateAgent(agent.agent_id, {
        name: formData.name,
        status: formData.status,
      });
      onUpdate(res.agent);
      setIsEditing(false);
      toast.success("Agent updated", "Changes have been saved");
    } catch (error) {
      console.error("Failed to update agent:", error);
      toast.error("Failed to update agent", "Please try again");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove this agent?")) return;

    try {
      await api.deleteAgent(agent.agent_id);
      onDelete(agent.agent_id);
      onClose();
      toast.info("Agent removed", `"${agent.name}" has been removed`);
    } catch (error) {
      console.error("Failed to delete agent:", error);
      toast.error("Failed to delete agent", "Please try again");
    }
  };

  const StatusIcon = statusConfig[agent.status].icon;
  const typeInfo = typeConfig[agent.type] || typeConfig.default;
  const TypeIcon = typeInfo.icon;
  const metrics = agent.metrics || {};

  const successRate =
    metrics.tasks_completed !== undefined && metrics.tasks_failed !== undefined
      ? metrics.tasks_completed + metrics.tasks_failed > 0
        ? Math.round(
            (metrics.tasks_completed / (metrics.tasks_completed + metrics.tasks_failed)) * 100
          )
        : 100
      : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agent Details" size="md">
      <div className="space-y-6">
        {/* Agent Header */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "rounded-full p-3",
              statusConfig[agent.status].bgColor
            )}
          >
            <Bot className={cn("h-8 w-8", statusConfig[agent.status].color)} />
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
              <h3 className="text-lg font-medium text-theme-primary">{agent.name}</h3>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm",
                  statusConfig[agent.status].bgColor,
                  statusConfig[agent.status].color
                )}
              >
                <StatusIcon className="h-4 w-4" />
                {statusConfig[agent.status].label}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-theme-secondary">
                <TypeIcon className="h-4 w-4" />
                {typeInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Status & Type (editable) */}
        {isEditing && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as "active" | "idle" | "error",
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:border-blue-500"
              >
                <option value="idle">Idle</option>
                <option value="active">Active</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        )}

        {/* Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-theme-secondary" />
            <label className="text-sm font-medium text-theme-primary">Performance Metrics</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-theme-primary border border-theme rounded-lg">
              <div className="flex items-center gap-2 text-xs text-theme-secondary mb-1">
                <CheckCircle2 className="h-3 w-3 text-green-400" />
                Tasks Completed
              </div>
              <div className="text-xl font-semibold text-theme-primary">
                {metrics.tasks_completed ?? 0}
              </div>
            </div>
            <div className="p-3 bg-theme-primary border border-theme rounded-lg">
              <div className="flex items-center gap-2 text-xs text-theme-secondary mb-1">
                <XCircle className="h-3 w-3 text-red-400" />
                Tasks Failed
              </div>
              <div className="text-xl font-semibold text-theme-primary">
                {metrics.tasks_failed ?? 0}
              </div>
            </div>
            <div className="p-3 bg-theme-primary border border-theme rounded-lg">
              <div className="flex items-center gap-2 text-xs text-theme-secondary mb-1">
                <Activity className="h-3 w-3 text-blue-400" />
                Success Rate
              </div>
              <div className="text-xl font-semibold text-theme-primary">
                {successRate !== null ? `${successRate}%` : "N/A"}
              </div>
            </div>
            <div className="p-3 bg-theme-primary border border-theme rounded-lg">
              <div className="flex items-center gap-2 text-xs text-theme-secondary mb-1">
                <Clock className="h-3 w-3 text-yellow-400" />
                Avg Duration
              </div>
              <div className="text-xl font-semibold text-theme-primary">
                {metrics.avg_duration ? `${metrics.avg_duration}ms` : "N/A"}
              </div>
            </div>
          </div>
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs text-theme-secondary mb-1">Created</label>
            <span className="text-theme-primary">
              {formatRelativeTime(agent.created_at)}
            </span>
          </div>
          <div>
            <label className="block text-xs text-theme-secondary mb-1">Last Heartbeat</label>
            <span className="text-theme-primary">
              {formatRelativeTime(agent.last_heartbeat)}
            </span>
          </div>
        </div>

        {/* Agent ID */}
        <div>
          <label className="block text-xs text-theme-secondary mb-1">Agent ID</label>
          <code className="block text-xs text-theme-secondary bg-theme-primary p-2 rounded border border-theme font-mono">
            {agent.agent_id}
          </code>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-theme">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setFormData({
                      name: agent.name,
                      status: agent.status,
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
