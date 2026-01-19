"use client";

import { useState, useEffect, useCallback } from "react";
import { api, QueueTask, QueueStats } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Plus,
  ListTodo,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  X,
  Zap,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TaskQueuePanelProps {
  projectId?: string;
}

const priorityConfig = {
  0: { label: "Critical", color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500" },
  1: { label: "High", color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500" },
  2: { label: "Medium", color: "text-yellow-500", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500" },
  3: { label: "Low", color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500" },
  4: { label: "Background", color: "text-gray-500", bgColor: "bg-gray-500/10", borderColor: "border-gray-500" },
};

const statusConfig = {
  pending: { icon: Clock, color: "text-gray-400", label: "Pending" },
  assigned: { icon: Zap, color: "text-blue-400", label: "Assigned" },
  in_progress: { icon: Loader2, color: "text-yellow-400", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  cancelled: { icon: Trash2, color: "text-gray-500", label: "Cancelled" },
};

export function TaskQueuePanel({ projectId }: TaskQueuePanelProps) {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: 2,
    required_capabilities: "",
    estimated_minutes: "",
  });
  const toast = useToast();

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tasksRes, statsRes] = await Promise.all([
        api.getQueueTasks({
          project_id: projectId,
          status: statusFilter || undefined,
          limit: 50,
        }),
        api.getQueueStats(projectId),
      ]);
      setTasks(tasksRes.tasks);
      setStats(statsRes);
    } catch (error) {
      console.error("Failed to fetch queue:", error);
      toast.error("Failed to load queue", "Could not fetch task queue data");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, statusFilter, toast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !projectId) return;

    setIsSubmitting(true);
    try {
      const capabilities = formData.required_capabilities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.enqueueTask({
        project_id: projectId,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        priority: formData.priority,
        required_capabilities: capabilities.length > 0 ? capabilities : undefined,
        estimated_minutes: formData.estimated_minutes ? parseInt(formData.estimated_minutes) : undefined,
      });

      setTasks([res.task, ...tasks]);
      setFormData({ title: "", description: "", priority: 2, required_capabilities: "", estimated_minutes: "" });
      setShowForm(false);
      toast.success("Task enqueued", `"${res.task.title}" added to queue`);
      fetchTasks(); // Refresh stats
    } catch (error) {
      console.error("Failed to enqueue task:", error);
      toast.error("Failed to enqueue", "Could not add task to queue");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatch = async () => {
    setIsDispatching(true);
    try {
      const res = await api.dispatchTasks(projectId, 10);
      toast.success(
        "Dispatch complete",
        `Assigned ${res.summary.assigned} tasks, ${res.summary.skipped} skipped`
      );
      fetchTasks();
    } catch (error) {
      console.error("Failed to dispatch:", error);
      toast.error("Dispatch failed", "Could not auto-assign tasks");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await api.retryTask(taskId);
      toast.success("Task reset", "Task has been reset for retry");
      fetchTasks();
    } catch (error: any) {
      toast.error("Retry failed", error.message || "Could not retry task");
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await api.cancelTask(taskId);
      toast.success("Task cancelled", "Task has been removed from queue");
      fetchTasks();
    } catch (error) {
      toast.error("Cancel failed", "Could not cancel task");
    }
  };

  const totalTasks = stats
    ? stats.by_status.pending +
      stats.by_status.assigned +
      stats.by_status.in_progress +
      stats.by_status.completed +
      stats.by_status.failed
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-white">Task Queue</h2>
          {stats && (
            <span className="text-xs text-gray-400">
              ({stats.by_status.pending} pending, {stats.by_status.in_progress} running)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDispatch}
            disabled={isDispatching || !stats?.by_status.pending}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
          >
            {isDispatching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Auto-Assign
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 rounded transition-colors"
          >
            {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showForm ? "Cancel" : "Add Task"}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="flex gap-2 p-2 border-b border-gray-700 bg-gray-800/50 overflow-x-auto">
          {Object.entries(statusConfig).map(([status, config]) => {
            const count = stats.by_status[status as keyof typeof stats.by_status] || 0;
            const Icon = config.icon;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs rounded whitespace-nowrap transition-colors",
                  statusFilter === status
                    ? "bg-gray-600 text-white"
                    : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"
                )}
              >
                <Icon className={cn("w-3 h-3", config.color)} />
                <span>{config.label}</span>
                <span className="ml-1 px-1 bg-gray-800 rounded text-xs">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Add Task Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-gray-700 bg-gray-800/50 space-y-3">
          <div>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Task title..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description (optional)..."
              rows={2}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
              >
                {Object.entries(priorityConfig).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Est. Minutes</label>
              <input
                type="number"
                value={formData.estimated_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_minutes: e.target.value })}
                placeholder="30"
                min="1"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Capabilities</label>
              <input
                type="text"
                value={formData.required_capabilities}
                onChange={(e) => setFormData({ ...formData, required_capabilities: e.target.value })}
                placeholder="react, api"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!formData.title.trim() || !projectId || isSubmitting}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {isSubmitting ? "Adding..." : "Add to Queue"}
          </button>
        </form>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <ListTodo className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">No tasks in queue</p>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="mt-2 text-xs text-purple-400 hover:text-purple-300"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {tasks.map((task) => {
              const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig[2];
              const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = status.icon;
              const isExpanded = expandedTaskId === task.id;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "p-3 hover:bg-gray-800/50 transition-colors",
                    task.status === "failed" && "bg-red-900/10"
                  )}
                >
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div className={cn("mt-0.5", status.color)}>
                      <StatusIcon
                        className={cn("w-4 h-4", task.status === "in_progress" && "animate-spin")}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-white truncate">{task.title}</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 text-xs rounded border",
                            priority.color,
                            priority.bgColor,
                            priority.borderColor
                          )}
                        >
                          {priority.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>{status.label}</span>
                        {task.assigned_to && (
                          <>
                            <span>•</span>
                            <span className="text-blue-400">Assigned</span>
                          </>
                        )}
                        {task.retry_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-orange-400">Retry {task.retry_count}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{formatRelativeTime(task.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pl-7 space-y-2">
                      {task.description && (
                        <p className="text-sm text-gray-300">{task.description}</p>
                      )}

                      {task.required_capabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {task.required_capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      )}

                      {task.error_message && (
                        <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800 rounded text-sm">
                          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          <span className="text-red-300">{task.error_message}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        {task.status === "failed" && task.retry_count < 3 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(task.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-600 hover:bg-orange-500 rounded"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        )}
                        {(task.status === "pending" || task.status === "assigned") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(task.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        )}
                        {task.estimated_minutes && (
                          <span className="text-xs text-gray-400">
                            Est: {task.estimated_minutes}min
                          </span>
                        )}
                        {task.actual_minutes && (
                          <span className="text-xs text-green-400">
                            Actual: {task.actual_minutes}min
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
