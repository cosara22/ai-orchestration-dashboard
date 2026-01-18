"use client";

import { useState, useEffect, useCallback } from "react";
import { api, Task } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import {
  Plus,
  Circle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronUp,
  ChevronDown,
  Trash2,
  X,
} from "lucide-react";

interface TaskPanelProps {
  selectedProject: string | null;
}

const priorityConfig = {
  low: { color: "text-gray-400", bgColor: "bg-gray-400/10", label: "Low" },
  medium: { color: "text-yellow-400", bgColor: "bg-yellow-400/10", label: "Medium" },
  high: { color: "text-red-400", bgColor: "bg-red-400/10", label: "High" },
};

const statusConfig = {
  pending: { icon: Circle, color: "text-gray-400", label: "Pending" },
  in_progress: { icon: Clock, color: "text-blue-400", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Completed" },
  cancelled: { icon: XCircle, color: "text-red-400", label: "Cancelled" },
};

export function TaskPanel({ selectedProject }: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.getTasks({
        limit: 20,
        project: selectedProject || undefined,
      });
      setTasks(res.tasks);
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.createTask({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        priority: formData.priority,
        project: selectedProject || undefined,
      });
      setTasks((prev) => [res.task, ...prev]);
      setFormData({ title: "", description: "", priority: "medium" });
      setShowForm(false);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const updatedTask = await api.updateTask(taskId, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.task_id === taskId ? updatedTask : t))
      );
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0f0f0f]">
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">Tasks</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showForm ? "bg-gray-700 text-white" : "hover:bg-gray-800 text-gray-400"
          )}
          title={showForm ? "Close form" : "Add task"}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Task Creation Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 pb-4 border-b border-gray-800">
            <div>
              <input
                type="text"
                placeholder="Task title..."
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <textarea
                placeholder="Description (optional)..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Priority:</span>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      priority: e.target.value as "low" | "medium" | "high",
                    }))
                  }
                  className="px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !formData.title.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Creating..." : "Create Task"}
              </button>
            </div>
          </form>
        )}

        {/* Task List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Circle className="h-12 w-12 mb-4 opacity-30" />
            <p>No tasks yet</p>
            <p className="text-sm opacity-60">Click + to create a task</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {tasks.map((task) => {
              const priority = priorityConfig[task.priority];
              const status = statusConfig[task.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={task.task_id}
                  className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3 hover:bg-gray-900 transition-colors group"
                >
                  <button
                    onClick={() => {
                      const nextStatus =
                        task.status === "pending"
                          ? "in_progress"
                          : task.status === "in_progress"
                          ? "completed"
                          : "pending";
                      handleStatusChange(task.task_id, nextStatus);
                    }}
                    className={cn("mt-0.5 p-0.5 rounded", status.color, "hover:bg-gray-700")}
                    title={`Status: ${status.label}`}
                  >
                    <StatusIcon className="h-4 w-4" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          task.status === "completed"
                            ? "line-through text-gray-500"
                            : "text-white"
                        )}
                      >
                        {task.title}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          priority.bgColor,
                          priority.color
                        )}
                      >
                        {priority.label}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="text-xs text-gray-600 mt-1">
                      Created {formatRelativeTime(task.created_at)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(task.task_id)}
                    className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
