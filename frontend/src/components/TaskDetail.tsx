"use client";

import { useState, useEffect } from "react";
import { Task, api } from "@/lib/api";
import { Modal } from "./Modal";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "./Toast";
import { Circle, CheckCircle2, Clock, XCircle, Save, Trash2 } from "lucide-react";

interface TaskDetailProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (taskId: string) => void;
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

export function TaskDetail({ task, isOpen, onClose, onUpdate, onDelete }: TaskDetailProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    status: "pending" as "pending" | "in_progress" | "completed" | "cancelled",
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        status: task.status,
      });
      setIsEditing(false);
    }
  }, [task]);

  if (!task) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedTask = await api.updateTask(task.task_id, {
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        status: formData.status,
      });
      onUpdate(updatedTask);
      setIsEditing(false);
      toast.success("Task updated", "Changes have been saved");
    } catch (error) {
      console.error("Failed to update task:", error);
      toast.error("Failed to update task", "Please try again");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await api.deleteTask(task.task_id);
      onDelete(task.task_id);
      onClose();
      toast.info("Task deleted", `"${task.title}" has been removed`);
    } catch (error) {
      console.error("Failed to delete task:", error);
      toast.error("Failed to delete task", "Please try again");
    }
  };

  const StatusIcon = statusConfig[task.status].icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Task Details" size="md">
      <div className="space-y-6">
        {/* Task Header */}
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-2", statusConfig[task.status].color.replace("text-", "bg-") + "/10")}>
            <StatusIcon className={cn("h-6 w-6", statusConfig[task.status].color)} />
          </div>
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 text-lg font-medium bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
              />
            ) : (
              <h3 className="text-lg font-medium text-white">{task.title}</h3>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
              <span>Created {formatRelativeTime(task.created_at)}</span>
              {task.updated_at !== task.created_at && (
                <span>| Updated {formatRelativeTime(task.updated_at)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Status & Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            {isEditing ? (
              <select
                value={formData.status}
                onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            ) : (
              <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm", statusConfig[task.status].color)}>
                <StatusIcon className="h-4 w-4" />
                {statusConfig[task.status].label}
              </span>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            {isEditing ? (
              <select
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            ) : (
              <span className={cn("inline-block px-2 py-1 rounded text-sm", priorityConfig[task.priority].bgColor, priorityConfig[task.priority].color)}>
                {priorityConfig[task.priority].label}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          {isEditing ? (
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              placeholder="Add a description..."
              className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          ) : (
            <p className="text-sm text-gray-300 p-3 bg-gray-900/50 rounded-md min-h-[60px]">
              {task.description || <span className="text-gray-500 italic">No description</span>}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setFormData({
                      title: task.title,
                      description: task.description || "",
                      priority: task.priority,
                      status: task.status,
                    });
                    setIsEditing(false);
                  }}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.title.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors"
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
