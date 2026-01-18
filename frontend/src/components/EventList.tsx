"use client";

import { Event } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Activity, FileCode, Terminal, GitBranch, MessageSquare } from "lucide-react";

interface EventListProps {
  events: Event[];
}

const eventTypeIcons: Record<string, typeof Activity> = {
  tool_execution: Terminal,
  file_edit: FileCode,
  git_operation: GitBranch,
  message: MessageSquare,
  default: Activity,
};

const eventTypeColors: Record<string, string> = {
  tool_execution: "text-purple-400 bg-purple-400/10",
  file_edit: "text-blue-400 bg-blue-400/10",
  git_operation: "text-orange-400 bg-orange-400/10",
  message: "text-green-400 bg-green-400/10",
  default: "text-gray-400 bg-gray-400/10",
};

export function EventList({ events }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Activity className="h-12 w-12 mb-4 opacity-30" />
        <p>No events yet</p>
        <p className="text-sm opacity-60">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const Icon = eventTypeIcons[event.event_type] || eventTypeIcons.default;
        const colorClass = eventTypeColors[event.event_type] || eventTypeColors.default;

        return (
          <div
            key={event.event_id}
            className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3 hover:bg-gray-900 transition-colors"
          >
            <div className={`rounded-md p-2 ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">
                  {event.event_type}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              {event.payload?.message && (
                <p className="text-sm text-gray-400 mt-1 truncate">
                  {event.payload.message}
                </p>
              )}
              {event.session_id && (
                <p className="text-xs text-gray-600 mt-1">
                  Session: {event.session_id.slice(0, 8)}...
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
