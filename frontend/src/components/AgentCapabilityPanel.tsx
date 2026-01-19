"use client";

import { useState, useEffect, useCallback } from "react";
import { api, Agent, AgentCapability, CapabilityTag } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Cpu,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Tag,
  Zap,
  Target,
  BarChart3,
  Loader2,
  Search,
  UserCheck,
  Activity,
} from "lucide-react";

interface AgentCapabilityPanelProps {
  selectedAgentId?: string;
  onAgentSelect?: (agentId: string) => void;
}

const categoryColors: Record<string, { color: string; bgColor: string }> = {
  language: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
  framework: { color: "text-green-500", bgColor: "bg-green-500/10" },
  domain: { color: "text-purple-500", bgColor: "bg-purple-500/10" },
  tool: { color: "text-orange-500", bgColor: "bg-orange-500/10" },
};

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  active: { color: "text-green-500", bgColor: "bg-green-500", label: "Active" },
  idle: { color: "text-gray-500", bgColor: "bg-gray-400", label: "Idle" },
  error: { color: "text-red-500", bgColor: "bg-red-500", label: "Error" },
};

export function AgentCapabilityPanel({ selectedAgentId, onAgentSelect }: AgentCapabilityPanelProps) {
  const [agents, setAgents] = useState<(Agent & { capabilities?: AgentCapability[]; current_workload?: number })[]>([]);
  const [availableTags, setAvailableTags] = useState<CapabilityTag[]>([]);
  const [groupedTags, setGroupedTags] = useState<Record<string, CapabilityTag[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [showAddCapability, setShowAddCapability] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedProficiency, setSelectedProficiency] = useState(50);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentsRes, tagsRes, availableRes] = await Promise.all([
        api.getAgents({ limit: 50 }),
        api.getCapabilityTags(),
        api.getAvailableAgents({ max_workload: 10 }),
      ]);

      // Merge available agents data (has workload and capabilities)
      const agentsWithData = agentsRes.agents.map((agent) => {
        const availableAgent = availableRes.available_agents.find((a) => a.agent_id === agent.agent_id);
        return {
          ...agent,
          capabilities: availableAgent?.capabilities || [],
          current_workload: availableAgent?.current_workload || 0,
        };
      });

      setAgents(agentsWithData);
      setAvailableTags(tagsRes.tags);
      setGroupedTags(tagsRes.grouped);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load", "Could not fetch agent capability data");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAddCapability = async (agentId: string) => {
    if (!selectedTag) {
      toast.error("Select a tag", "Please select a capability tag");
      return;
    }

    try {
      await api.registerCapabilities(agentId, [{ tag: selectedTag, proficiency: selectedProficiency }]);
      toast.success("Capability added", `Added ${selectedTag} to agent`);
      setShowAddCapability(null);
      setSelectedTag("");
      setSelectedProficiency(50);
      fetchData();
    } catch (error) {
      console.error("Failed to add capability:", error);
      toast.error("Failed to add", "Could not add capability");
    }
  };

  const handleRemoveCapability = async (agentId: string, tag: string) => {
    try {
      await api.removeCapability(agentId, tag);
      toast.success("Capability removed", `Removed ${tag} from agent`);
      fetchData();
    } catch (error) {
      console.error("Failed to remove capability:", error);
      toast.error("Failed to remove", "Could not remove capability");
    }
  };

  const getProficiencyColor = (proficiency: number) => {
    if (proficiency >= 80) return "bg-green-500";
    if (proficiency >= 60) return "bg-blue-500";
    if (proficiency >= 40) return "bg-yellow-500";
    return "bg-gray-400";
  };

  const filteredAgents = searchQuery
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.agent_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : agents;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Capabilities</h2>
            <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full">
              {agents.length} agents
            </span>
          </div>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Tag Categories */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(groupedTags).map(([category, tags]) => (
            <div key={category} className="flex items-center gap-1">
              <span className={cn("text-xs font-medium capitalize", categoryColors[category]?.color || "text-gray-500")}>
                {category}:
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{tags.length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Agents List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
        {filteredAgents.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Cpu className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No agents found</p>
          </div>
        ) : (
          filteredAgents.map((agent) => {
            const isExpanded = expandedAgentId === agent.agent_id;
            const status = statusConfig[agent.status] || statusConfig.idle;
            const capabilities = agent.capabilities || [];

            return (
              <div
                key={agent.agent_id}
                className={cn(
                  "transition-colors",
                  selectedAgentId === agent.agent_id && "bg-indigo-50 dark:bg-indigo-900/20"
                )}
              >
                {/* Agent Header */}
                <div
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => {
                    setExpandedAgentId(isExpanded ? null : agent.agent_id);
                    onAgentSelect?.(agent.agent_id);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                          <Cpu className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div
                          className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800", status.bgColor)}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {agent.name}
                          </span>
                          <span className={cn("text-xs", status.color)}>{status.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Workload: {agent.current_workload}/3
                          </span>
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {capabilities.length} capabilities
                          </span>
                        </div>
                        {/* Capability Preview */}
                        {capabilities.length > 0 && !isExpanded && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {capabilities.slice(0, 5).map((cap) => (
                              <span
                                key={cap.tag}
                                className={cn(
                                  "px-1.5 py-0.5 text-xs rounded",
                                  categoryColors[cap.category || "domain"]?.bgColor || "bg-gray-100 dark:bg-gray-700",
                                  categoryColors[cap.category || "domain"]?.color || "text-gray-600 dark:text-gray-400"
                                )}
                              >
                                {cap.tag}
                              </span>
                            ))}
                            {capabilities.length > 5 && (
                              <span className="text-xs text-gray-500">+{capabilities.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0">
                    {/* Capabilities Grid */}
                    <div className="ml-13 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Capabilities</span>
                        <button
                          onClick={() => setShowAddCapability(showAddCapability === agent.agent_id ? null : agent.agent_id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>

                      {/* Add Capability Form */}
                      {showAddCapability === agent.agent_id && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={selectedTag}
                              onChange={(e) => setSelectedTag(e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">Select capability...</option>
                              {Object.entries(groupedTags).map(([category, tags]) => (
                                <optgroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                                  {tags.map((tag) => (
                                    <option key={tag.tag} value={tag.tag}>
                                      {tag.tag} - {tag.description}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={selectedProficiency}
                              onChange={(e) => setSelectedProficiency(parseInt(e.target.value) || 50)}
                              min="0"
                              max="100"
                              className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              placeholder="Prof."
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setShowAddCapability(null)}
                              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleAddCapability(agent.agent_id)}
                              className="px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Capabilities List */}
                      <div className="grid grid-cols-2 gap-2">
                        {capabilities.map((cap) => (
                          <div
                            key={cap.tag}
                            className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 text-xs rounded truncate",
                                  categoryColors[cap.category || "domain"]?.bgColor || "bg-gray-100",
                                  categoryColors[cap.category || "domain"]?.color || "text-gray-600"
                                )}
                              >
                                {cap.tag}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", getProficiencyColor(cap.proficiency))}
                                    style={{ width: `${cap.proficiency}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400 w-8">
                                  {cap.proficiency}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveCapability(agent.agent_id, cap.tag)}
                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {capabilities.length === 0 && (
                        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                          No capabilities registered. Add some to enable task matching.
                        </div>
                      )}

                      {/* Agent Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <div>
                          <span className="text-gray-400">Agent ID:</span>
                          <span className="ml-1 font-mono">{agent.agent_id}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Type:</span>
                          <span className="ml-1">{agent.type}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Last Heartbeat:</span>
                          <span className="ml-1">{formatRelativeTime(agent.last_heartbeat)}</span>
                        </div>
                      </div>
                    </div>
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
