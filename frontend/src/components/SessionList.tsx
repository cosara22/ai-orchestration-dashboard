"use client";

import { useState, useMemo } from "react";
import { Session } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Circle, CheckCircle2, XCircle, X } from "lucide-react";
import { SessionDetail } from "./SessionDetail";

interface SessionListProps {
  sessions: Session[];
}

const statusConfig = {
  active: {
    icon: Circle,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
    label: "Active",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    label: "Failed",
  },
};

export function SessionList({ sessions }: SessionListProps) {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    if (!selectedStatus) return sessions;
    return sessions.filter((s) => s.status === selectedStatus);
  }, [sessions, selectedStatus]);

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      <div className="flex gap-2">
        <select
          value={selectedStatus || ""}
          onChange={(e) => setSelectedStatus(e.target.value || null)}
          className="px-3 py-1.5 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:border-blue-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        {selectedStatus && (
          <button
            onClick={() => setSelectedStatus(null)}
            className="px-2 py-1.5 text-sm text-theme-secondary hover:text-theme-primary flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      {selectedStatus && (
        <p className="text-xs text-theme-secondary">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </p>
      )}

      {/* Session List */}
      {filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-theme-secondary">
          <Circle className="h-12 w-12 mb-4 opacity-30" />
          <p>{selectedStatus ? "No matching sessions" : "No sessions yet"}</p>
          <p className="text-sm opacity-60">
            {selectedStatus ? "Try adjusting your filter" : "Sessions will appear here when created"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session) => {
            const config = statusConfig[session.status];
            const Icon = config.icon;

            return (
              <div
                key={session.session_id}
                onClick={() => setSelectedSession(session)}
                className="flex items-center gap-3 rounded-lg border border-theme bg-theme-primary p-3 hover:bg-theme-card transition-colors cursor-pointer"
              >
                <div className={cn("rounded-full p-1", config.bgColor)}>
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-theme-primary truncate">
                      {session.session_id.slice(0, 12)}...
                    </span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-theme-secondary">
                    <span>Started {formatRelativeTime(session.start_time)}</span>
                    {session.end_time && (
                      <span>Ended {formatRelativeTime(session.end_time)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Detail Modal */}
      <SessionDetail
        session={selectedSession}
        isOpen={!!selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
