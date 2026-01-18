"use client";

import { useState, useMemo } from "react";
import { Event } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Activity, FileCode, Terminal, GitBranch, MessageSquare, X } from "lucide-react";

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
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Get unique event types
  const eventTypes = useMemo(() => {
    const types = new Set(events.map((e) => e.event_type));
    return Array.from(types).sort();
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesType = !selectedType || event.event_type === selectedType;
      const matchesSearch =
        !searchQuery ||
        event.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.payload?.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.payload?.tool_name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [events, selectedType, searchQuery]);

  const hasFilters = selectedType || searchQuery;

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[150px]">
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-secondary hover:text-theme-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <select
          value={selectedType || ""}
          onChange={(e) => setSelectedType(e.target.value || null)}
          className="px-3 py-1.5 text-sm bg-theme-primary border border-theme rounded-md text-theme-primary focus:outline-none focus:border-blue-500"
        >
          <option value="">All types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSelectedType(null);
              setSearchQuery("");
            }}
            className="px-2 py-1.5 text-sm text-theme-secondary hover:text-theme-primary flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      {hasFilters && (
        <p className="text-xs text-theme-secondary">
          Showing {filteredEvents.length} of {events.length} events
        </p>
      )}

      {/* Event List */}
      {filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-theme-secondary">
          <Activity className="h-12 w-12 mb-4 opacity-30" />
          <p>{hasFilters ? "No matching events" : "No events yet"}</p>
          <p className="text-sm opacity-60">
            {hasFilters ? "Try adjusting your filters" : "Events will appear here in real-time"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((event) => {
            const Icon = eventTypeIcons[event.event_type] || eventTypeIcons.default;
            const colorClass = eventTypeColors[event.event_type] || eventTypeColors.default;

            return (
              <div
                key={event.event_id}
                className="flex items-start gap-3 rounded-lg border border-theme bg-theme-primary p-3 hover:bg-theme-card transition-colors"
              >
                <div className={`rounded-md p-2 ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-theme-primary truncate">
                      {event.event_type}
                    </span>
                    <span className="text-xs text-theme-secondary whitespace-nowrap">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                  {event.payload?.tool_name && (
                    <p className="text-sm text-blue-400 mt-1">
                      Tool: {event.payload.tool_name}
                    </p>
                  )}
                  {event.payload?.message && (
                    <p className="text-sm text-theme-secondary mt-1 truncate">
                      {event.payload.message}
                    </p>
                  )}
                  {event.session_id && (
                    <p className="text-xs text-theme-secondary opacity-70 mt-1">
                      Session: {event.session_id.slice(0, 8)}...
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
