"use client";

import { useState, useEffect, useCallback } from "react";
import {
  api,
  ConductorProjectStatus,
  ConductorBottleneck,
  ConductorRisk,
  ConductorDecision,
  ConductorBlockedTask,
} from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileWarning,
  Gauge,
  GitBranch,
  Hand,
  ListTodo,
  Lock,
  MessageSquare,
  RefreshCw,
  Scroll,
  Shield,
  Target,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

interface ConductorPanelProps {
  projectId?: string;
}

const healthConfig = {
  good: { color: "text-green-500", bgColor: "bg-green-500", label: "Healthy" },
  warning: { color: "text-yellow-500", bgColor: "bg-yellow-500", label: "Warning" },
  critical: { color: "text-red-500", bgColor: "bg-red-500", label: "Critical" },
};

const severityConfig = {
  low: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
  medium: { color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  high: { color: "text-orange-500", bgColor: "bg-orange-500/10" },
  critical: { color: "text-red-500", bgColor: "bg-red-500/10" },
};

const bottleneckIcons: Record<string, any> = {
  agent_overload: Users,
  capability_gap: Target,
  dependency_chain: GitBranch,
  lock_contention: Lock,
  queue_stall: Clock,
  communication_gap: MessageSquare,
};

export function ConductorPanel({ projectId }: ConductorPanelProps) {
  const [status, setStatus] = useState<ConductorProjectStatus | null>(null);
  const [decisions, setDecisions] = useState<ConductorDecision[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showBottlenecks, setShowBottlenecks] = useState(true);
  const [showRisks, setShowRisks] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const [statusRes, decisionsRes] = await Promise.all([
        api.getConductorStatus(projectId),
        api.getConductorDecisions({ project_id: projectId, limit: 20 }),
      ]);
      setStatus(statusRes);
      setDecisions(decisionsRes.decisions);
    } catch (error) {
      console.error("Failed to fetch conductor data:", error);
      toast.error("Failed to load", "Could not fetch conductor data");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleEscalate = async (bottleneck: ConductorBottleneck) => {
    if (!projectId) return;

    try {
      await api.escalateIssue({
        project_id: projectId,
        issue_type: "blocker",
        description: bottleneck.description,
        severity: bottleneck.severity,
        suggested_actions: [bottleneck.suggested_action],
      });
      toast.success("Escalated", "Issue has been escalated");
      fetchData();
    } catch (error) {
      console.error("Failed to escalate:", error);
      toast.error("Failed to escalate", "Could not escalate the issue");
    }
  };

  const handleRequestIntervention = async () => {
    if (!projectId) return;

    const description = prompt("Describe the intervention needed:");
    if (!description) return;

    try {
      await api.requestIntervention({
        project_id: projectId,
        request_type: "manual_review",
        description,
        urgency: "urgent",
      });
      toast.success("Intervention requested", "A human review has been requested");
      fetchData();
    } catch (error) {
      console.error("Failed to request intervention:", error);
      toast.error("Failed", "Could not request intervention");
    }
  };

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">Select a project to view conductor status</p>
      </div>
    );
  }

  if (!status && !isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">No status data available</p>
      </div>
    );
  }

  const health = status ? healthConfig[status.health] : healthConfig.good;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conductor</h2>
            {status && (
              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", health.bgColor, "text-white")}>
                {health.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestIntervention}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded transition-colors"
            >
              <Hand className="w-3 h-3" />
              Request Intervention
            </button>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {status && (
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {status.project_name}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      {status && (
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Gauge className="w-4 h-4 text-blue-500" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {status.overall_progress}%
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Progress</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="w-4 h-4 text-green-500" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {status.active_agents.length}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Active Agents</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <ListTodo className="w-4 h-4 text-yellow-500" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {status.queued_tasks + status.in_progress_tasks}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending Tasks</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {status.completed_tasks}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {status && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500 dark:text-gray-400">Overall Progress</span>
            <span className="text-gray-700 dark:text-gray-300">{status.overall_progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                status.health === "critical" ? "bg-red-500" :
                status.health === "warning" ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${status.overall_progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Collapsible Sections */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {/* Bottlenecks Section */}
        {status && status.bottlenecks.length > 0 && (
          <div>
            <button
              onClick={() => setShowBottlenecks(!showBottlenecks)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Bottlenecks ({status.bottlenecks.length})
                </span>
              </div>
              {showBottlenecks ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            {showBottlenecks && (
              <div className="px-3 pb-3 space-y-2">
                {status.bottlenecks.map((bottleneck, idx) => {
                  const Icon = bottleneckIcons[bottleneck.type] || AlertTriangle;
                  const severity = severityConfig[bottleneck.severity];
                  return (
                    <div
                      key={idx}
                      className={cn("p-3 rounded-lg border", severity.bgColor, "border-gray-200 dark:border-gray-600")}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <Icon className={cn("w-4 h-4 mt-0.5", severity.color)} />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {bottleneck.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {bottleneck.description}
                            </div>
                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              💡 {bottleneck.suggested_action}
                            </div>
                            {bottleneck.metrics && Object.keys(bottleneck.metrics).length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {Object.entries(bottleneck.metrics).map(([key, value]) => (
                                  <span key={key} className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                                    {key}: {value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEscalate(bottleneck)}
                          className="px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded"
                        >
                          Escalate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Blocked Tasks Section */}
        {status && status.blocked_tasks.length > 0 && (
          <div>
            <button
              onClick={() => setShowBlocked(!showBlocked)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Blocked Tasks ({status.blocked_tasks.length})
                </span>
              </div>
              {showBlocked ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            {showBlocked && (
              <div className="px-3 pb-3 space-y-2">
                {status.blocked_tasks.map((task) => (
                  <div
                    key={task.task_id}
                    className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Blocked by: {task.blocked_by}
                    </div>
                    {task.blocked_reason && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {task.blocked_reason}
                      </div>
                    )}
                    {task.agent_name && (
                      <div className="text-xs text-gray-400 mt-1">
                        Assigned to: {task.agent_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Risks Section */}
        {status && status.risks.length > 0 && (
          <div>
            <button
              onClick={() => setShowRisks(!showRisks)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Risks ({status.risks.length})
                </span>
              </div>
              {showRisks ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            {showRisks && (
              <div className="px-3 pb-3 space-y-2">
                {status.risks.map((risk, idx) => {
                  const impactConfig = severityConfig[risk.impact] || severityConfig.medium;
                  return (
                    <div
                      key={idx}
                      className={cn("p-3 rounded-lg border", impactConfig.bgColor, "border-gray-200 dark:border-gray-600")}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium capitalize", impactConfig.color)}>
                          {risk.type} Risk
                        </span>
                        <span className="text-xs text-gray-500">
                          P: {risk.probability} / I: {risk.impact}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {risk.description}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Mitigation: {risk.mitigation}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Agents Section */}
        {status && status.active_agents.length > 0 && (
          <div className="p-3">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Active Agents
            </div>
            <div className="grid grid-cols-2 gap-2">
              {status.active_agents.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="relative">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    <div
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                        agent.status === "active" ? "bg-green-500" : "bg-gray-400"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {agent.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Workload: {agent.current_workload}/3
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decisions Section */}
        <div>
          <button
            onClick={() => setShowDecisions(!showDecisions)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-2">
              <Scroll className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Recent Decisions ({decisions.length})
              </span>
            </div>
            {showDecisions ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {showDecisions && (
            <div className="px-3 pb-3 space-y-2 max-h-60 overflow-y-auto">
              {decisions.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No decisions recorded yet
                </div>
              ) : (
                decisions.map((decision) => (
                  <div
                    key={decision.decision_id}
                    className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {decision.decision_type.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(decision.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {decision.description}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        {status && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700/30">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>🔒 Locks: {status.active_locks}</span>
              <span>⚠️ Conflicts: {status.unresolved_conflicts}</span>
              <span>💬 Contexts: {status.recent_contexts}</span>
              <span>❌ Failed: {status.failed_tasks}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
