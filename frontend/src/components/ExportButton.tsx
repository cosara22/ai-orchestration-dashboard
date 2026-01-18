"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, Event, Task, Session } from "@/lib/api";
import { useToast } from "./Toast";

type ExportType = "events" | "tasks" | "sessions";

interface ExportButtonProps {
  selectedProject?: string | null;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toISOString().replace("T", " ").slice(0, 19);
}

function escapeCSV(value: string | undefined | null): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function eventsToCSV(events: Event[]): string {
  const headers = ["event_id", "event_type", "session_id", "timestamp", "payload", "created_at"];
  const rows = events.map((e) => [
    escapeCSV(e.event_id),
    escapeCSV(e.event_type),
    escapeCSV(e.session_id),
    formatDate(e.timestamp),
    escapeCSV(JSON.stringify(e.payload)),
    formatDate(e.created_at),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function tasksToCSV(tasks: Task[]): string {
  const headers = ["task_id", "title", "description", "status", "priority", "project", "created_at", "updated_at"];
  const rows = tasks.map((t) => [
    escapeCSV(t.task_id),
    escapeCSV(t.title),
    escapeCSV(t.description),
    escapeCSV(t.status),
    escapeCSV(t.priority),
    escapeCSV(t.project),
    formatDate(t.created_at),
    formatDate(t.updated_at),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function sessionsToCSV(sessions: Session[]): string {
  const headers = ["session_id", "status", "start_time", "end_time", "metadata", "created_at", "updated_at"];
  const rows = sessions.map((s) => [
    escapeCSV(s.session_id),
    escapeCSV(s.status),
    formatDate(s.start_time),
    s.end_time ? formatDate(s.end_time) : "",
    escapeCSV(JSON.stringify(s.metadata)),
    formatDate(s.created_at),
    formatDate(s.updated_at),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportButton({ selectedProject }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  const handleExport = async (type: ExportType) => {
    setIsExporting(true);
    setIsOpen(false);

    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      let filename = "";
      let content = "";

      switch (type) {
        case "events": {
          const res = await api.getEvents({ limit: 1000, project: selectedProject || undefined });
          content = eventsToCSV(res.events);
          filename = `events_${timestamp}.csv`;
          break;
        }
        case "tasks": {
          const res = await api.getTasks({ limit: 1000, project: selectedProject || undefined });
          content = tasksToCSV(res.tasks);
          filename = `tasks_${timestamp}.csv`;
          break;
        }
        case "sessions": {
          const res = await api.getSessions({ limit: 1000, project: selectedProject || undefined });
          content = sessionsToCSV(res.sessions);
          filename = `sessions_${timestamp}.csv`;
          break;
        }
      }

      downloadCSV(content, filename);
      toast.success("Export complete", `${filename} has been downloaded`);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Export failed", "Please try again");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
          "bg-gray-800 text-gray-200 hover:bg-gray-700",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Download className="h-4 w-4" />
        {isExporting ? "Exporting..." : "Export"}
        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-gray-700 bg-gray-900 shadow-lg">
            <div className="py-1">
              <button
                onClick={() => handleExport("events")}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
              >
                Export Events
              </button>
              <button
                onClick={() => handleExport("tasks")}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
              >
                Export Tasks
              </button>
              <button
                onClick={() => handleExport("sessions")}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
              >
                Export Sessions
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
