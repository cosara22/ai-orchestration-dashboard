"use client";

import { useState, useEffect, useCallback } from "react";
import { api, SharedContext } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  MessageSquare,
  AlertOctagon,
  Lightbulb,
  Activity,
  HelpCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  User,
  Tag,
  FileText,
  Clock,
  Archive,
  Search,
} from "lucide-react";

interface SharedContextPanelProps {
  projectId?: string;
  agentId?: string;
}

const contextTypeConfig = {
  decision: { icon: MessageSquare, color: "text-blue-500", bgColor: "bg-blue-500/10", label: "Decision" },
  blocker: { icon: AlertOctagon, color: "text-red-500", bgColor: "bg-red-500/10", label: "Blocker" },
  learning: { icon: Lightbulb, color: "text-yellow-500", bgColor: "bg-yellow-500/10", label: "Learning" },
  status: { icon: Activity, color: "text-green-500", bgColor: "bg-green-500/10", label: "Status" },
  question: { icon: HelpCircle, color: "text-purple-500", bgColor: "bg-purple-500/10", label: "Question" },
  answer: { icon: MessageCircle, color: "text-teal-500", bgColor: "bg-teal-500/10", label: "Answer" },
};

const priorityConfig = {
  0: { label: "Low", color: "text-gray-500", bgColor: "bg-gray-500/10" },
  1: { label: "Normal", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  2: { label: "High", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  3: { label: "Urgent", color: "text-red-500", bgColor: "bg-red-500/10" },
};

export function SharedContextPanel({ projectId, agentId }: SharedContextPanelProps) {
  const [contexts, setContexts] = useState<SharedContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ blockers: 0, urgent: 0, recent: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    context_type: "status" as SharedContext["context_type"],
    title: "",
    content: "",
    priority: 1,
    tags: "",
  });
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [contextsRes, statsRes] = await Promise.all([
        api.getContexts({
          project_id: projectId,
          type: typeFilter || undefined,
          status: "active",
          limit: 50,
        }),
        api.getContextStats(projectId),
      ]);
      setContexts(contextsRes.contexts);
      setStats({
        blockers: statsRes.active_blockers,
        urgent: statsRes.by_priority.high + statsRes.by_priority.urgent,
        recent: statsRes.recent_24h,
      });
    } catch (error) {
      console.error("Failed to fetch contexts:", error);
      toast.error("Failed to load contexts", "Could not fetch shared context data");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, typeFilter, toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchData();
      return;
    }
    setIsLoading(true);
    try {
      const result = await api.searchContexts(searchQuery, projectId, 50);
      setContexts(result.results);
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Search failed", "Could not search contexts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !agentId) {
      toast.error("Missing info", "Project ID and Agent ID are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.postContext({
        project_id: projectId,
        context_type: formData.context_type,
        title: formData.title,
        content: formData.content,
        author_agent_id: agentId,
        priority: formData.priority,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : undefined,
      });
      toast.success("Context posted", "Your context has been shared");
      setShowForm(false);
      setFormData({ context_type: "status", title: "", content: "", priority: 1, tags: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to post context:", error);
      toast.error("Failed to post", "Could not share the context");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (contextId: string) => {
    try {
      await api.deleteContext(contextId);
      toast.success("Archived", "Context has been archived");
      fetchData();
    } catch (error) {
      console.error("Failed to archive:", error);
      toast.error("Failed to archive", "Could not archive the context");
    }
  };

  const handleAcknowledge = async (contextId: string) => {
    if (!agentId) return;
    try {
      await api.acknowledgeContext(contextId, agentId);
      toast.success("Acknowledged", "Context acknowledged");
    } catch (error) {
      console.error("Failed to acknowledge:", error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shared Context</h2>
            {stats.blockers > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                {stats.blockers} blocker{stats.blockers > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {agentId && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Post
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-sm">
            <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
            <span className="text-gray-600 dark:text-gray-400">Blockers: {stats.blockers}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-gray-600 dark:text-gray-400">Urgent: {stats.urgent}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Recent (24h): {stats.recent}</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search contexts..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Type Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => setTypeFilter(null)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full transition-colors",
              !typeFilter
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            )}
          >
            All
          </button>
          {Object.entries(contextTypeConfig).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full transition-colors",
                  typeFilter === type
                    ? `${config.bgColor} ${config.color}`
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                <Icon className="w-3 h-3" />
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Post Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select
                  value={formData.context_type}
                  onChange={(e) => setFormData({ ...formData, context_type: e.target.value as SharedContext["context_type"] })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(contextTypeConfig).map(([type, config]) => (
                    <option key={type} value={type}>{config.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(priorityConfig).map(([value, config]) => (
                    <option key={value} value={value}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Brief title..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                rows={3}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Detailed content..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="auth, api, urgent..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Posting..." : "Post Context"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Contexts List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {contexts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No shared contexts found</p>
          </div>
        ) : (
          contexts.map((context) => {
            const typeConfig = contextTypeConfig[context.context_type];
            const prioConfig = priorityConfig[context.priority as keyof typeof priorityConfig];
            const TypeIcon = typeConfig?.icon || MessageSquare;
            const isExpanded = expandedContextId === context.context_id;

            return (
              <div
                key={context.context_id}
                className={cn(
                  "p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors",
                  context.priority >= 2 && "border-l-2 border-l-orange-500"
                )}
              >
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpandedContextId(isExpanded ? null : context.context_id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("p-1.5 rounded-lg", typeConfig?.bgColor)}>
                      <TypeIcon className={cn("w-4 h-4", typeConfig?.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {context.title}
                        </span>
                        <span className={cn("px-1.5 py-0.5 text-xs rounded", prioConfig?.bgColor, prioConfig?.color)}>
                          {prioConfig?.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {context.author_name || context.author_agent_id}
                        </span>
                        <span>{formatRelativeTime(context.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(context.context_id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-3 pl-10 space-y-2">
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {context.content}
                    </div>
                    {context.tags && context.tags.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Tag className="w-3 h-3 text-gray-400" />
                        <div className="flex flex-wrap gap-1">
                          {context.tags.filter(t => !t.startsWith("ack:")).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {context.related_file_paths && context.related_file_paths.length > 0 && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3 text-gray-400" />
                        <div className="flex flex-wrap gap-1">
                          {context.related_file_paths.map((path) => (
                            <span
                              key={path}
                              className="px-2 py-0.5 text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
                            >
                              {path}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {agentId && (
                      <button
                        onClick={() => handleAcknowledge(context.context_id)}
                        className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
