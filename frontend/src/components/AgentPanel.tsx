"use client";

import { useState, useEffect, useCallback } from "react";
import { api, Agent, AgentCounts } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { AgentDetail } from "@/components/AgentDetail";
import {
  Plus,
  Bot,
  CircleDot,
  Circle,
  AlertCircle,
  Trash2,
  X,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface AgentPanelProps {
  agents: Agent[];
  counts: AgentCounts;
  onAgentsChange: (agents: Agent[]) => void;
}

const statusConfig = {
  active: {
    icon: CircleDot,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
    pulseColor: "bg-green-400",
    label: "Active",
  },
  idle: {
    icon: Circle,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
    pulseColor: "bg-gray-400",
    label: "Idle",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    pulseColor: "bg-red-400",
    label: "Error",
  },
};

const typeConfig: Record<string, { icon: typeof Bot; label: string }> = {
  default: { icon: Bot, label: "Default" },
  explore: { icon: Activity, label: "Explorer" },
  worker: { icon: CheckCircle2, label: "Worker" },
};

export function AgentPanel({ agents, counts, onAgentsChange }: AgentPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "default",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const toast = useToast();

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getAgents({ limit: 50, status: statusFilter || undefined });
      onAgentsChange(res.agents);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, onAgentsChange]);

  useEffect(() => {
    if (agents.length === 0) {
      fetchAgents();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.createAgent({
        name: formData.name.trim(),
        type: formData.type,
      });
      onAgentsChange([res.agent, ...agents]);
      setFormData({ name: "", type: "default" });
      setShowForm(false);
      toast.success("Agent registered", `"${res.agent.name}" has been added`);
    } catch (error) {
      console.error("Failed to create agent:", error);
      toast.error("Failed to register agent", "Please try again");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (agentId: string, newStatus: "active" | "idle" | "error") => {
    try {
      const res = await api.updateAgent(agentId, { status: newStatus });
      onAgentsChange(agents.map((a) => (a.agent_id === agentId ? res.agent : a)));
      toast.success("Agent updated", `Status changed to ${newStatus}`);
    } catch (error) {
      console.error("Failed to update agent:", error);
      toast.error("Failed to update agent", "Please try again");
    }
  };

  const handleDelete = async (agentId: string) => {
    const agent = agents.find((a) => a.agent_id === agentId);
    try {
      await api.deleteAgent(agentId);
      onAgentsChange(agents.filter((a) => a.agent_id !== agentId));
      toast.info("Agent removed", agent ? `"${agent.name}" has been removed` : undefined);
    } catch (error) {
      console.error("Failed to delete agent:", error);
      toast.error("Failed to delete agent", "Please try again");
    }
  };

  const filteredAgents = statusFilter
    ? agents.filter((a) => a.status === statusFilter)
    : agents;

  return (
    <div className="rounded-lg border border-theme bg-theme-card">
      <div className="border-b border-theme px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-theme-secondary" />
          <h2 className="font-semibold text-theme-primary">Agents</h2>
          <span className="text-xs text-theme-secondary">({counts.total})</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showForm
              ? "bg-theme-primary text-theme-primary"
              : "hover:bg-theme-primary text-theme-secondary"
          )}
          title={showForm ? "Close form" : "Register agent"}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* Status Filter Pills */}
      <div className="px-4 py-2 border-b border-theme flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter(null)}
          className={cn(
            "px-2 py-0.5 text-xs rounded-full transition-colors",
            !statusFilter
              ? "bg-blue-500/20 text-blue-400"
              : "text-theme-secondary hover:bg-theme-primary"
          )}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter("active")}
          className={cn(
            "px-2 py-0.5 text-xs rounded-full transition-colors flex items-center gap-1",
            statusFilter === "active"
              ? "bg-green-500/20 text-green-400"
              : "text-theme-secondary hover:bg-theme-primary"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          Active ({counts.active})
        </button>
        <button
          onClick={() => setStatusFilter("idle")}
          className={cn(
            "px-2 py-0.5 text-xs rounded-full transition-colors flex items-center gap-1",
            statusFilter === "idle"
              ? "bg-gray-500/20 text-gray-400"
              : "text-theme-secondary hover:bg-theme-primary"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Idle ({counts.idle})
        </button>
        <button
          onClick={() => setStatusFilter("error")}
          className={cn(
            "px-2 py-0.5 text-xs rounded-full transition-colors flex items-center gap-1",
            statusFilter === "error"
              ? "bg-red-500/20 text-red-400"
              : "text-theme-secondary hover:bg-theme-primary"
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Error ({counts.error})
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Agent Registration Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 pb-4 border-b border-theme">
            <div>
              <input
                type="text"
                placeholder="Agent name..."
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-theme-secondary">Type:</span>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                  className="px-2 py-1 text-xs bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:border-blue-500"
                >
                  <option value="default">Default</option>
                  <option value="explore">Explorer</option>
                  <option value="worker">Worker</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !formData.name.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Registering..." : "Register Agent"}
              </button>
            </div>
          </form>
        )}

        {/* Agent List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-theme-secondary">
            <Bot className="h-12 w-12 mb-4 opacity-30" />
            <p>No agents registered</p>
            <p className="text-sm opacity-60">Click + to register an agent</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredAgents.map((agent) => {
              const status = statusConfig[agent.status];
              const StatusIcon = status.icon;
              const typeInfo = typeConfig[agent.type] || typeConfig.default;
              const TypeIcon = typeInfo.icon;
              const metrics = agent.metrics || {};
              const successRate =
                metrics.tasks_completed && metrics.tasks_failed !== undefined
                  ? Math.round(
                      (metrics.tasks_completed /
                        (metrics.tasks_completed + metrics.tasks_failed)) *
                        100
                    )
                  : null;

              return (
                <div
                  key={agent.agent_id}
                  onClick={() => setSelectedAgent(agent)}
                  className="flex items-start gap-3 rounded-lg border border-theme bg-theme-primary p-3 hover:bg-theme-card transition-colors group cursor-pointer"
                >
                  {/* Status Indicator */}
                  <div className="relative mt-0.5">
                    <StatusIcon className={cn("h-4 w-4", status.color)} />
                    {agent.status === "active" && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-theme-primary">
                        {agent.name}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded flex items-center gap-1",
                          status.bgColor,
                          status.color
                        )}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-theme-secondary">
                      <span className="flex items-center gap-1">
                        <TypeIcon className="h-3 w-3" />
                        {typeInfo.label}
                      </span>
                      {successRate !== null && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-400" />
                          {successRate}%
                        </span>
                      )}
                      {metrics.tasks_completed !== undefined && (
                        <span>{metrics.tasks_completed} tasks</span>
                      )}
                    </div>

                    <div className="text-xs text-theme-secondary opacity-70 mt-1">
                      Last seen {formatRelativeTime(agent.last_heartbeat)}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(agent.agent_id);
                    }}
                    className="p-1 text-theme-secondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove agent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Detail Modal */}
      <AgentDetail
        agent={selectedAgent}
        isOpen={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onUpdate={(updatedAgent) => {
          onAgentsChange(
            agents.map((a) => (a.agent_id === updatedAgent.agent_id ? updatedAgent : a))
          );
          setSelectedAgent(null);
        }}
        onDelete={(agentId) => {
          onAgentsChange(agents.filter((a) => a.agent_id !== agentId));
        }}
      />
    </div>
  );
}
