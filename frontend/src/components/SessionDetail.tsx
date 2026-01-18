"use client";

import { useState, useEffect } from "react";
import { Session, Event, api } from "@/lib/api";
import { Modal } from "./Modal";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Circle, CheckCircle2, XCircle, Clock, Activity } from "lucide-react";

interface SessionDetailProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
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

export function SessionDetail({ session, isOpen, onClose }: SessionDetailProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session && isOpen) {
      setIsLoading(true);
      api
        .getEvents({ session_id: session.session_id, limit: 50 })
        .then((res) => setEvents(res.events))
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [session, isOpen]);

  if (!session) return null;

  const config = statusConfig[session.status];
  const StatusIcon = config.icon;

  const duration = session.end_time
    ? new Date(session.end_time).getTime() - new Date(session.start_time).getTime()
    : Date.now() - new Date(session.start_time).getTime();

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Session Details" size="lg">
      <div className="space-y-6">
        {/* Session Info */}
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-2", config.bgColor)}>
            <StatusIcon className={cn("h-6 w-6", config.color)} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-white">{session.session_id}</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  config.bgColor,
                  config.color
                )}
              >
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Started {formatRelativeTime(session.start_time)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                <span>Duration: {formatDuration(duration)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Session Timeline</h3>
            <span className="text-xs text-gray-500">{events.length} events</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No events in this session</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {events.map((event) => (
                <div
                  key={event.event_id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/50 border border-gray-800"
                >
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-white">
                        {event.event_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div className="mt-1 text-xs text-gray-400">
                        {event.payload.tool_name && (
                          <span className="inline-block px-1.5 py-0.5 bg-gray-800 rounded mr-2">
                            Tool: {event.payload.tool_name}
                          </span>
                        )}
                        {event.payload.message && (
                          <span className="text-gray-500 line-clamp-1">
                            {event.payload.message}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metadata */}
        {session.metadata && Object.keys(session.metadata).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white">Metadata</h3>
            <pre className="p-3 bg-gray-900 rounded-lg text-xs text-gray-400 overflow-x-auto">
              {JSON.stringify(session.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
}
