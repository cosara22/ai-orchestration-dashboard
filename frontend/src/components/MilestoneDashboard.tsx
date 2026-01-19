"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Flag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ChevronRight,
  FileText,
  Target,
  Activity,
} from "lucide-react";
import { api, Milestone, SemanticRecord } from "@/lib/api";
import { useToast } from "./Toast";

interface MilestoneDashboardProps {
  projectId: string;
  onClose?: () => void;
}

interface MilestoneStats {
  total: number;
  achieved: number;
  pending: number;
  missed: number;
  deferred: number;
  achievementRate: number;
}

interface PhaseReport {
  phase: string;
  milestones: Milestone[];
  completedCount: number;
  totalCount: number;
}

export function MilestoneDashboard({ projectId, onClose }: MilestoneDashboardProps) {
  const toast = useToast();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [semanticRecords, setSemanticRecords] = useState<SemanticRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "timeline" | "reports">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [milestonesData, recordsData] = await Promise.all([
        api.getMilestones({ project_id: projectId }),
        api.getSemanticRecords({ project_id: projectId }),
      ]);
      setMilestones(milestonesData.milestones || []);
      setSemanticRecords(recordsData.records || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load milestone data");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate stats
  const stats: MilestoneStats = {
    total: milestones.length,
    achieved: milestones.filter((m) => m.status === "achieved").length,
    pending: milestones.filter((m) => m.status === "pending").length,
    missed: milestones.filter((m) => m.status === "missed").length,
    deferred: milestones.filter((m) => m.status === "deferred").length,
    achievementRate:
      milestones.length > 0
        ? Math.round(
            (milestones.filter((m) => m.status === "achieved").length /
              milestones.length) *
              100
          )
        : 0,
  };

  // Group milestones by type for phase reports
  const phaseReports: PhaseReport[] = ["checkpoint", "release", "review", "decision"].map(
    (type) => {
      const phaseMilestones = milestones.filter((m) => m.type === type);
      return {
        phase: type.charAt(0).toUpperCase() + type.slice(1),
        milestones: phaseMilestones,
        completedCount: phaseMilestones.filter((m) => m.status === "achieved").length,
        totalCount: phaseMilestones.length,
      };
    }
  );

  // Get recent milestones
  const recentMilestones = [...milestones]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  // Get recent records
  const recentRecords = [...semanticRecords]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "achieved":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "missed":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "deferred":
        return <Clock className="w-4 h-4 text-gray-500" />;
      default:
        return <Flag className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "checkpoint":
        return "bg-blue-500/20 text-blue-400";
      case "release":
        return "bg-green-500/20 text-green-400";
      case "review":
        return "bg-purple-500/20 text-purple-400";
      case "decision":
        return "bg-orange-500/20 text-orange-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-[var(--text-primary)]">Milestone Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === "overview"
                ? "bg-purple-500/20 text-purple-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === "timeline"
                ? "bg-purple-500/20 text-purple-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode("reports")}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === "reports"
                ? "bg-purple-500/20 text-purple-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            Reports
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === "overview" && (
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-[var(--text-secondary)]">Total</span>
                </div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  {stats.total}
                </div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-[var(--text-secondary)]">Achieved</span>
                </div>
                <div className="text-2xl font-bold text-green-400">{stats.achieved}</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-[var(--text-secondary)]">Pending</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-[var(--text-secondary)]">Achievement</span>
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {stats.achievementRate}%
                </div>
              </div>
            </div>

            {/* Progress by Type */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Progress by Type
              </h3>
              <div className="space-y-3">
                {phaseReports.map((report) => (
                  <div key={report.phase}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--text-secondary)]">{report.phase}</span>
                      <span className="text-[var(--text-primary)]">
                        {report.completedCount}/{report.totalCount}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all"
                        style={{
                          width: `${
                            report.totalCount > 0
                              ? (report.completedCount / report.totalCount) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Milestones */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Recent Milestones
              </h3>
              {recentMilestones.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)] text-center py-4">
                  No milestones yet
                </div>
              ) : (
                <div className="space-y-2">
                  {recentMilestones.map((milestone) => (
                    <div
                      key={milestone.milestone_id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-[var(--bg-primary)] cursor-pointer"
                      onClick={() => setSelectedMilestone(milestone)}
                    >
                      {getStatusIcon(milestone.status)}
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                        {milestone.title}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(milestone.type)}`}>
                        {milestone.type}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Records */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Recent Semantic Records
              </h3>
              {recentRecords.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)] text-center py-4">
                  No records yet
                </div>
              ) : (
                <div className="space-y-2">
                  {recentRecords.map((record) => (
                    <div
                      key={record.record_id}
                      className="flex items-start gap-2 p-2 rounded hover:bg-[var(--bg-primary)]"
                    >
                      <Activity className="w-4 h-4 text-blue-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">
                          {record.title}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {record.record_type} • {formatDate(record.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === "timeline" && (
          <div className="space-y-4">
            {/* Timeline View */}
            <div className="relative">
              {milestones
                .sort((a, b) => {
                  const dateA = a.achieved_date || a.target_date || a.created_at;
                  const dateB = b.achieved_date || b.target_date || b.created_at;
                  return new Date(dateB).getTime() - new Date(dateA).getTime();
                })
                .map((milestone, index) => (
                  <div key={milestone.milestone_id} className="flex gap-4 pb-4">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          milestone.status === "achieved"
                            ? "bg-green-500"
                            : milestone.status === "pending"
                            ? "bg-yellow-500"
                            : milestone.status === "missed"
                            ? "bg-red-500"
                            : "bg-gray-500"
                        }`}
                      />
                      {index < milestones.length - 1 && (
                        <div className="w-0.5 flex-1 bg-[var(--border-primary)]" />
                      )}
                    </div>
                    {/* Content */}
                    <div
                      className="flex-1 pb-4 cursor-pointer"
                      onClick={() => setSelectedMilestone(milestone)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {milestone.title}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(milestone.type)}`}>
                          {milestone.type}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mb-2">
                        {milestone.achieved_date
                          ? `Achieved: ${formatDate(milestone.achieved_date)}`
                          : milestone.target_date
                          ? `Target: ${formatDate(milestone.target_date)}`
                          : `Created: ${formatDate(milestone.created_at)}`}
                      </div>
                      {milestone.description && (
                        <div className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {milestone.description}
                        </div>
                      )}
                      {milestone.next_actions && milestone.next_actions.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-purple-400">
                          <Flag className="w-3 h-3" />
                          {milestone.next_actions.length} next action(s)
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {milestones.length === 0 && (
                <div className="text-sm text-[var(--text-secondary)] text-center py-8">
                  No milestones to display
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === "reports" && (
          <div className="space-y-4">
            {/* Phase Reports */}
            {phaseReports.map((report) => (
              <div key={report.phase} className="bg-[var(--bg-tertiary)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    {report.phase} Milestones
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {report.completedCount}/{report.totalCount} completed
                  </span>
                </div>
                {report.milestones.length === 0 ? (
                  <div className="text-xs text-[var(--text-secondary)] text-center py-2">
                    No {report.phase.toLowerCase()} milestones
                  </div>
                ) : (
                  <div className="space-y-2">
                    {report.milestones.map((milestone) => (
                      <div
                        key={milestone.milestone_id}
                        className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)]"
                      >
                        {getStatusIcon(milestone.status)}
                        <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                          {milestone.title}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {milestone.achieved_date
                            ? formatDate(milestone.achieved_date)
                            : milestone.target_date
                            ? `Target: ${formatDate(milestone.target_date)}`
                            : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Export Report Button */}
            <button
              onClick={async () => {
                try {
                  // Generate a summary report
                  const reportContent = `# Milestone Report

## Summary
- Total: ${stats.total}
- Achieved: ${stats.achieved} (${stats.achievementRate}%)
- Pending: ${stats.pending}
- Missed: ${stats.missed}
- Deferred: ${stats.deferred}

## Milestones

${milestones
  .map(
    (m) => `### ${m.title}
- Status: ${m.status}
- Type: ${m.type}
- ${m.achieved_date ? `Achieved: ${m.achieved_date}` : m.target_date ? `Target: ${m.target_date}` : ""}
${m.description ? `\n${m.description}` : ""}
`
  )
  .join("\n")}
`;
                  // Create download
                  const blob = new Blob([reportContent], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `milestone-report-${new Date().toISOString().split("T")[0]}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Report exported");
                } catch (error) {
                  toast.error("Failed to export report");
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Export Report (Markdown)
            </button>
          </div>
        )}
      </div>

      {/* Milestone Detail Modal */}
      {selectedMilestone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-[var(--border-primary)] max-w-lg w-full max-h-[80vh] overflow-auto shadow-xl">
            <div className="p-4 border-b border-[var(--border-primary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedMilestone.status)}
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    {selectedMilestone.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedMilestone(null)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${getTypeColor(selectedMilestone.type)}`}>
                  {selectedMilestone.type}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {selectedMilestone.status}
                </span>
              </div>

              {selectedMilestone.description && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Description
                  </h4>
                  <p className="text-sm text-[var(--text-primary)]">
                    {selectedMilestone.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">Target Date</span>
                  <div className="text-[var(--text-primary)]">
                    {formatDate(selectedMilestone.target_date)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">Achieved Date</span>
                  <div className="text-[var(--text-primary)]">
                    {formatDate(selectedMilestone.achieved_date)}
                  </div>
                </div>
              </div>

              {selectedMilestone.lessons_learned && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Lessons Learned
                  </h4>
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                    {selectedMilestone.lessons_learned}
                  </p>
                </div>
              )}

              {selectedMilestone.next_actions && selectedMilestone.next_actions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                    Next Actions
                  </h4>
                  <div className="space-y-2">
                    {selectedMilestone.next_actions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded bg-[var(--bg-tertiary)]"
                      >
                        <Flag
                          className={`w-4 h-4 mt-0.5 ${
                            action.priority === "high"
                              ? "text-red-400"
                              : action.priority === "medium"
                              ? "text-yellow-400"
                              : "text-gray-400"
                          }`}
                        />
                        <div className="flex-1">
                          <div className="text-sm text-[var(--text-primary)]">
                            {action.action}
                          </div>
                          {action.context && (
                            <div className="text-xs text-[var(--text-secondary)] mt-1">
                              {action.context}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
