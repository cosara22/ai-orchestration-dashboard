"use client";

import { useState, useEffect, useCallback } from "react";
import { api, TeamWithStats, TeamMember, Agent } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Crown,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface OrgChartViewProps {
  onTeamSelect?: (teamId: string) => void;
  selectedTeamId?: string;
}

const teamColors = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Yellow", value: "#eab308" },
  { name: "Orange", value: "#f97316" },
  { name: "Red", value: "#ef4444" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

const statusIndicator: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-gray-400",
  error: "bg-red-500",
};

export function OrgChartView({ onTeamSelect, selectedTeamId }: OrgChartViewProps) {
  const [teams, setTeams] = useState<TeamWithStats[]>([]);
  const [summary, setSummary] = useState({ total_teams: 0, total_agents: 0, assigned_agents: 0, unassigned_agents: 0 });
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState<string | null>(null);
  const toast = useToast();

  // New team form state
  const [newTeam, setNewTeam] = useState({
    name: "",
    description: "",
    color: "#6366f1",
    max_members: 5,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [overviewRes, agentsRes] = await Promise.all([
        api.getTeamsOverview(),
        api.getAgents({ limit: 100 }),
      ]);
      setTeams(overviewRes.teams);
      setSummary(overviewRes.summary);
      setAvailableAgents(agentsRes.agents);
    } catch (error) {
      console.error("Failed to fetch org data:", error);
      toast.error("Failed to load", "Could not fetch organization data");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const fetchTeamMembers = async (teamId: string) => {
    try {
      const res = await api.getTeamMembers(teamId);
      setTeamMembers((prev) => ({ ...prev, [teamId]: res.members }));
    } catch (error) {
      console.error("Failed to fetch team members:", error);
    }
  };

  const handleExpandTeam = (teamId: string) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
    } else {
      setExpandedTeamId(teamId);
      if (!teamMembers[teamId]) {
        fetchTeamMembers(teamId);
      }
    }
    onTeamSelect?.(teamId);
  };

  const handleCreateTeam = async () => {
    if (!newTeam.name.trim()) {
      toast.error("Name required", "Please enter a team name");
      return;
    }

    try {
      await api.createTeam(newTeam);
      toast.success("Team created", `${newTeam.name} has been created`);
      setShowCreateModal(false);
      setNewTeam({ name: "", description: "", color: "#6366f1", max_members: 5 });
      fetchData();
    } catch (error) {
      console.error("Failed to create team:", error);
      toast.error("Failed to create", "Could not create team");
    }
  };

  const handleDeleteTeam = async (teamId: string, name: string) => {
    if (!confirm(`Delete team "${name}"? This will remove all member assignments.`)) {
      return;
    }

    try {
      await api.deleteTeam(teamId);
      toast.success("Team deleted", `${name} has been deleted`);
      fetchData();
    } catch (error) {
      console.error("Failed to delete team:", error);
      toast.error("Failed to delete", "Could not delete team");
    }
  };

  const handleAddMember = async (teamId: string, agentId: string) => {
    try {
      await api.addTeamMember(teamId, agentId);
      toast.success("Member added", "Agent has been added to the team");
      fetchTeamMembers(teamId);
      setShowAddMemberModal(null);
      fetchData();
    } catch (error: any) {
      console.error("Failed to add member:", error);
      toast.error("Failed to add", error.message || "Could not add member");
    }
  };

  const handleRemoveMember = async (teamId: string, agentId: string) => {
    try {
      await api.removeTeamMember(teamId, agentId);
      toast.success("Member removed", "Agent has been removed from the team");
      fetchTeamMembers(teamId);
      fetchData();
    } catch (error) {
      console.error("Failed to remove member:", error);
      toast.error("Failed to remove", "Could not remove member");
    }
  };

  const handlePromoteToLead = async (teamId: string, agentId: string) => {
    try {
      await api.updateTeamMemberRole(teamId, agentId, "lead");
      toast.success("Promoted", "Agent has been promoted to team lead");
      fetchTeamMembers(teamId);
      fetchData();
    } catch (error) {
      console.error("Failed to promote:", error);
      toast.error("Failed to promote", "Could not promote to lead");
    }
  };

  // Get unassigned agents for a team
  const getUnassignedAgents = (teamId: string) => {
    const members = teamMembers[teamId] || [];
    const memberIds = new Set(members.map((m) => m.agent_id));
    return availableAgents.filter((a) => !memberIds.has(a.agent_id));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Organization Chart</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Team
            </button>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{summary.total_teams}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Teams</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{summary.total_agents}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Agents</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{summary.assigned_agents}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Assigned</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{summary.unassigned_agents}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Unassigned</div>
          </div>
        </div>
      </div>

      {/* Teams Grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No teams yet</p>
            <p className="text-sm mt-1">Create your first team to organize agents</p>
          </div>
        ) : (
          teams.map((team) => {
            const isExpanded = expandedTeamId === team.team_id;
            const members = teamMembers[team.team_id] || [];
            const progress = team.completed_tasks + team.in_progress_tasks > 0
              ? Math.round((team.completed_tasks / (team.completed_tasks + team.in_progress_tasks)) * 100)
              : 0;

            return (
              <div
                key={team.team_id}
                className={cn(
                  "border rounded-lg overflow-hidden transition-all",
                  selectedTeamId === team.team_id
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : "border-gray-200 dark:border-gray-700"
                )}
              >
                {/* Team Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  style={{ borderLeft: `4px solid ${team.color}` }}
                  onClick={() => handleExpandTeam(team.team_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{team.name}</span>
                      <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                        {team.member_count}/{team.max_members}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTeam(team.team_id, team.name);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Team Info */}
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {team.project_name && (
                      <div>Project: {team.project_name}</div>
                    )}
                    {team.lead_name && (
                      <div className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-500" />
                        Lead: {team.lead_name}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {(team.completed_tasks > 0 || team.in_progress_tasks > 0) && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Progress</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {team.completed_tasks} / {team.completed_tasks + team.in_progress_tasks}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: team.color,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Members View */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Members</span>
                      <button
                        onClick={() => setShowAddMemberModal(team.team_id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                      >
                        <UserPlus className="w-3 h-3" />
                        Add
                      </button>
                    </div>

                    {members.length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-2">
                        No members yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {members.map((member) => (
                          <div
                            key={member.agent_id}
                            className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Cpu className="w-5 h-5 text-gray-400" />
                                <div
                                  className={cn(
                                    "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                                    statusIndicator[member.agent_status || "idle"]
                                  )}
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {member.agent_name}
                                  </span>
                                  {member.role === "lead" && (
                                    <Crown className="w-3 h-3 text-yellow-500" />
                                  )}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Workload: {member.current_workload || 0}/3
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {member.role !== "lead" && (
                                <button
                                  onClick={() => handlePromoteToLead(team.team_id, member.agent_id)}
                                  className="p-1 text-gray-400 hover:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                                  title="Promote to Lead"
                                >
                                  <Crown className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveMember(team.team_id, member.agent_id)}
                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                title="Remove"
                              >
                                <UserMinus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Team</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Team Alpha"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newTeam.description}
                  onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Team Color
                </label>
                <div className="flex gap-2">
                  {teamColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setNewTeam({ ...newTeam, color: color.value })}
                      className={cn(
                        "w-8 h-8 rounded-full transition-transform",
                        newTeam.color === color.value && "ring-2 ring-offset-2 ring-gray-400 scale-110"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Members
                </label>
                <input
                  type="number"
                  value={newTeam.max_members}
                  onChange={(e) => setNewTeam({ ...newTeam, max_members: parseInt(e.target.value) || 5 })}
                  min="1"
                  max="20"
                  className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Team Member</h3>
              <button
                onClick={() => setShowAddMemberModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {getUnassignedAgents(showAddMemberModal).length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No available agents to add
                </div>
              ) : (
                getUnassignedAgents(showAddMemberModal).map((agent) => (
                  <button
                    key={agent.agent_id}
                    onClick={() => handleAddMember(showAddMemberModal, agent.agent_id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Cpu className="w-6 h-6 text-gray-400" />
                        <div
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full",
                            statusIndicator[agent.status]
                          )}
                        />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">{agent.name}</div>
                        <div className="text-xs text-gray-500">{agent.type}</div>
                      </div>
                    </div>
                    <Plus className="w-5 h-5 text-blue-500" />
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowAddMemberModal(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
