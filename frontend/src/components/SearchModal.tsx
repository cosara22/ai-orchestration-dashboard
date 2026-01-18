"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Modal } from "./Modal";
import { api, Event, Session, Task } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import {
  Search,
  X,
  Loader2,
  Calendar,
  FileText,
  Activity,
  ListTodo,
  ChevronDown,
  Filter,
} from "lucide-react";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEvent?: (event: Event) => void;
  onSelectSession?: (session: Session) => void;
  onSelectTask?: (task: Task) => void;
}

type SearchType = "all" | "events" | "sessions" | "tasks";

interface SearchResult {
  events: Array<Event & { _type: "event" }>;
  sessions: Array<Session & { _type: "session" }>;
  tasks: Array<Task & { _type: "task" }>;
}

const typeConfig: Record<
  SearchType,
  { label: string; icon: typeof Search; color: string }
> = {
  all: { label: "All", icon: Search, color: "text-theme-secondary" },
  events: { label: "Events", icon: Activity, color: "text-blue-400" },
  sessions: { label: "Sessions", icon: Calendar, color: "text-green-400" },
  tasks: { label: "Tasks", icon: ListTodo, color: "text-purple-400" },
};

export function SearchModal({
  isOpen,
  onClose,
  onSelectEvent,
  onSelectSession,
  onSelectTask,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [totals, setTotals] = useState<{ events: number; sessions: number; tasks: number } | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setQuery("");
      setResults(null);
      setTotals(null);
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTypeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults(null);
      setTotals(null);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.search({
        q: query.trim(),
        type: searchType,
        limit: 20,
      });
      setResults(res.results);
      setTotals(res.total);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [query, searchType]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        handleSearch();
      } else {
        setResults(null);
        setTotals(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchType, handleSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const TypeIcon = typeConfig[searchType].icon;
  const totalResults = totals ? totals.events + totals.sessions + totals.tasks : 0;

  const renderResultItem = (
    item: (Event & { _type: "event" }) | (Session & { _type: "session" }) | (Task & { _type: "task" })
  ) => {
    if (item._type === "event") {
      return (
        <button
          key={`event-${item.id}`}
          onClick={() => {
            onSelectEvent?.(item);
            onClose();
          }}
          className="w-full p-3 text-left hover:bg-theme-primary rounded-lg transition-colors"
        >
          <div className="flex items-start gap-3">
            <Activity className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-theme-primary truncate">
                  {item.event_type}
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                  Event
                </span>
              </div>
              <div className="text-xs text-theme-secondary mt-1 truncate">
                {item.session_id || "No session"}
              </div>
              <div className="text-xs text-theme-secondary mt-0.5">
                {formatRelativeTime(item.timestamp)}
              </div>
            </div>
          </div>
        </button>
      );
    }

    if (item._type === "session") {
      const statusColors = {
        active: "bg-green-500/10 text-green-400",
        completed: "bg-blue-500/10 text-blue-400",
        failed: "bg-red-500/10 text-red-400",
      };
      return (
        <button
          key={`session-${item.id}`}
          onClick={() => {
            onSelectSession?.(item);
            onClose();
          }}
          className="w-full p-3 text-left hover:bg-theme-primary rounded-lg transition-colors"
        >
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-theme-primary truncate">
                  {item.session_id}
                </span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded", statusColors[item.status])}>
                  {item.status}
                </span>
              </div>
              <div className="text-xs text-theme-secondary mt-1">
                Started {formatRelativeTime(item.start_time)}
              </div>
            </div>
          </div>
        </button>
      );
    }

    if (item._type === "task") {
      const priorityColors = {
        low: "bg-gray-500/10 text-gray-400",
        medium: "bg-yellow-500/10 text-yellow-400",
        high: "bg-red-500/10 text-red-400",
      };
      const statusColors = {
        pending: "bg-gray-500/10 text-gray-400",
        in_progress: "bg-blue-500/10 text-blue-400",
        completed: "bg-green-500/10 text-green-400",
        cancelled: "bg-red-500/10 text-red-400",
      };
      return (
        <button
          key={`task-${item.task_id}`}
          onClick={() => {
            onSelectTask?.(item);
            onClose();
          }}
          className="w-full p-3 text-left hover:bg-theme-primary rounded-lg transition-colors"
        >
          <div className="flex items-start gap-3">
            <ListTodo className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-theme-primary truncate">
                  {item.title}
                </span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded", statusColors[item.status])}>
                  {item.status.replace("_", " ")}
                </span>
              </div>
              {item.description && (
                <div className="text-xs text-theme-secondary mt-1 truncate">
                  {item.description}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs px-1.5 py-0.5 rounded", priorityColors[item.priority])}>
                  {item.priority}
                </span>
                {item.project && (
                  <span className="text-xs text-theme-secondary">
                    {item.project}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      );
    }

    return null;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="lg">
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-theme-secondary" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, sessions, tasks..."
              className="w-full pl-10 pr-10 py-2.5 bg-theme-primary border border-theme rounded-lg text-theme-primary placeholder:text-theme-secondary focus:outline-none focus:border-blue-500"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-secondary hover:text-theme-primary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Type Filter Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex items-center gap-2 px-3 py-2.5 bg-theme-primary border border-theme rounded-lg text-sm text-theme-primary hover:bg-theme-card transition-colors"
            >
              <Filter className="h-4 w-4" />
              <TypeIcon className={cn("h-4 w-4", typeConfig[searchType].color)} />
              <span>{typeConfig[searchType].label}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {showTypeDropdown && (
              <div className="absolute right-0 mt-1 w-40 bg-theme-card border border-theme rounded-lg shadow-lg z-10">
                {(Object.keys(typeConfig) as SearchType[]).map((type) => {
                  const config = typeConfig[type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setSearchType(type);
                        setShowTypeDropdown(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-theme-primary transition-colors first:rounded-t-lg last:rounded-b-lg",
                        searchType === type
                          ? "text-blue-400 bg-blue-500/10"
                          : "text-theme-primary"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", config.color)} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="min-h-[300px] max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-6 w-6 animate-spin text-theme-secondary" />
            </div>
          ) : results && totalResults > 0 ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 text-xs text-theme-secondary px-2">
                <span>{totalResults} results found</span>
                {totals && (
                  <>
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-blue-400" />
                      {totals.events} events
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-green-400" />
                      {totals.sessions} sessions
                    </span>
                    <span className="flex items-center gap-1">
                      <ListTodo className="h-3 w-3 text-purple-400" />
                      {totals.tasks} tasks
                    </span>
                  </>
                )}
              </div>

              {/* Results List */}
              <div className="space-y-1">
                {/* Events */}
                {results.events.length > 0 && (searchType === "all" || searchType === "events") && (
                  <div>
                    {searchType === "all" && (
                      <div className="text-xs font-medium text-theme-secondary px-2 py-1 sticky top-0 bg-theme-card">
                        Events
                      </div>
                    )}
                    {results.events.map(renderResultItem)}
                  </div>
                )}

                {/* Sessions */}
                {results.sessions.length > 0 && (searchType === "all" || searchType === "sessions") && (
                  <div>
                    {searchType === "all" && (
                      <div className="text-xs font-medium text-theme-secondary px-2 py-1 sticky top-0 bg-theme-card">
                        Sessions
                      </div>
                    )}
                    {results.sessions.map(renderResultItem)}
                  </div>
                )}

                {/* Tasks */}
                {results.tasks.length > 0 && (searchType === "all" || searchType === "tasks") && (
                  <div>
                    {searchType === "all" && (
                      <div className="text-xs font-medium text-theme-secondary px-2 py-1 sticky top-0 bg-theme-card">
                        Tasks
                      </div>
                    )}
                    {results.tasks.map(renderResultItem)}
                  </div>
                )}
              </div>
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-theme-secondary">
              <FileText className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-theme-secondary">
              <Search className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Search across all your data</p>
              <p className="text-xs mt-1">Type at least 2 characters to search</p>
            </div>
          )}
        </div>

        {/* Keyboard shortcut hint */}
        <div className="flex items-center justify-end text-xs text-theme-secondary pt-2 border-t border-theme">
          <span className="px-1.5 py-0.5 bg-theme-primary rounded text-[10px]">ESC</span>
          <span className="ml-1">to close</span>
        </div>
      </div>
    </Modal>
  );
}
