"use client";

import { Session } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Circle, CheckCircle2, XCircle } from "lucide-react";

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
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Circle className="h-12 w-12 mb-4 opacity-30" />
        <p>No sessions yet</p>
        <p className="text-sm opacity-60">Sessions will appear here when created</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const config = statusConfig[session.status];
        const Icon = config.icon;

        return (
          <div
            key={session.session_id}
            className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3 hover:bg-gray-900 transition-colors cursor-pointer"
          >
            <div className={cn("rounded-full p-1", config.bgColor)}>
              <Icon className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm truncate">
                  {session.session_id.slice(0, 12)}...
                </span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full", config.bgColor, config.color)}>
                  {config.label}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
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
  );
}
