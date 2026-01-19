"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderKanban,
  Plus,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Activity,
  TrendingUp,
  X,
  GanttChart as GanttIcon,
  List,
  FileText,
  Flag,
} from "lucide-react";
import { api, CCPMProject, WBSItem, WBSDependency } from "@/lib/api";
import { useToast } from "./Toast";
import { GanttChart } from "./GanttChart";
import { DocParserModal } from "./DocParserModal";
import { MilestoneRecorder } from "./MilestoneRecorder";
import { MilestoneDashboard } from "./MilestoneDashboard";

interface CCPMPanelProps {
  onSelectProject?: (project: CCPMProject | null) => void;
}

type ViewMode = "tree" | "gantt" | "milestones";

export function CCPMPanel({ onSelectProject }: CCPMPanelProps) {
  const [projects, setProjects] = useState<CCPMProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<CCPMProject | null>(null);
  const [wbsItems, setWbsItems] = useState<WBSItem[]>([]);
  const [flatWbsItems, setFlatWbsItems] = useState<WBSItem[]>([]);
  const [dependencies, setDependencies] = useState<WBSDependency[]>([]);
  const [criticalChain, setCriticalChain] = useState<string[]>([]);
  const [bufferData, setBufferData] = useState<{
    project_buffer: { size: number; consumed: number; consumed_percent: number; remaining: number };
    progress: { completed_duration: number; total_duration: number; percent: number };
    fever_status: "green" | "yellow" | "red";
  } | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [showDocParser, setShowDocParser] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const toast = useToast();

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.getCCPMProjects({ limit: 50 });
      setProjects(data.projects);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  }, []);

  const fetchWBS = useCallback(async (projectId: string) => {
    try {
      const [treeData, flatData] = await Promise.all([
        api.getWBS(projectId),
        api.getWBS(projectId, true),
      ]);
      setWbsItems(treeData.items);
      setFlatWbsItems(flatData.items);
    } catch (error) {
      console.error("Failed to fetch WBS:", error);
    }
  }, []);

  const fetchDependencies = useCallback(async (projectId: string) => {
    try {
      const data = await api.getDependencies(projectId);
      setDependencies(data.dependencies);
    } catch (error) {
      console.error("Failed to fetch dependencies:", error);
    }
  }, []);

  const fetchCriticalChain = useCallback(async (projectId: string) => {
    try {
      const data = await api.getCriticalChain(projectId);
      setCriticalChain(data.critical_chain);
    } catch (error) {
      console.error("Failed to fetch critical chain:", error);
    }
  }, []);

  const fetchBuffers = useCallback(async (projectId: string) => {
    try {
      const data = await api.getBuffers(projectId);
      setBufferData(data);
    } catch (error) {
      console.error("Failed to fetch buffers:", error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProject) {
      fetchWBS(selectedProject.project_id);
      fetchBuffers(selectedProject.project_id);
      fetchDependencies(selectedProject.project_id);
      fetchCriticalChain(selectedProject.project_id);
      onSelectProject?.(selectedProject);
    } else {
      setWbsItems([]);
      setFlatWbsItems([]);
      setDependencies([]);
      setCriticalChain([]);
      setBufferData(null);
      onSelectProject?.(null);
    }
  }, [selectedProject, fetchWBS, fetchBuffers, fetchDependencies, fetchCriticalChain, onSelectProject]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setLoading(true);
    try {
      await api.createCCPMProject({ name: newProjectName.trim() });
      toast.success("Project created successfully");
      setNewProjectName("");
      setShowCreateForm(false);
      fetchProjects();
    } catch (error) {
      toast.error("Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (wbsId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(wbsId)) {
        next.delete(wbsId);
      } else {
        next.add(wbsId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "in_progress":
        return <Activity className="w-4 h-4 text-blue-500" />;
      case "blocked":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getFeverColor = (status: "green" | "yellow" | "red") => {
    switch (status) {
      case "green":
        return "bg-green-500";
      case "yellow":
        return "bg-yellow-500";
      case "red":
        return "bg-red-500";
    }
  };

  const renderWBSItem = (item: WBSItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.wbs_id);

    return (
      <div key={item.wbs_id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => hasChildren && toggleExpand(item.wbs_id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            )
          ) : (
            <span className="w-4" />
          )}
          {getStatusIcon(item.status)}
          <span className="text-xs text-[var(--text-secondary)] font-mono">{item.code}</span>
          <span className="text-sm text-[var(--text-primary)] truncate flex-1">{item.title}</span>
          {item.estimated_duration && (
            <span className="text-xs text-[var(--text-secondary)]">
              <Clock className="w-3 h-3 inline mr-1" />
              {item.estimated_duration}h
            </span>
          )}
          {item.auto_created === 1 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Auto</span>
          )}
        </div>
        {hasChildren && isExpanded && item.children!.map((child) => renderWBSItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-[var(--text-primary)]">CCPM / WBS</h2>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
          title="New Project"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateProject} className="p-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name..."
              className="flex-1 px-2 py-1.5 text-sm rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !newProjectName.trim()}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Project List */}
      {!selectedProject ? (
        <div className="flex-1 overflow-auto p-2">
          {projects.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
              No projects yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => (
                <div
                  key={project.project_id}
                  onClick={() => setSelectedProject(project)}
                  className="p-3 rounded-lg border border-[var(--border-primary)] hover:border-purple-500/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-[var(--text-primary)]">{project.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        project.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : project.status === "completed"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                    <span>{project.wbs_count || 0} tasks</span>
                    <span>{project.progress || 0}% complete</span>
                  </div>
                  {project.wbs_count && project.wbs_count > 0 && (
                    <div className="mt-2 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${project.progress || 0}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selected Project Header */}
          <div className="p-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedProject(null)}
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back to Projects
              </button>
            </div>
            <h3 className="font-semibold text-[var(--text-primary)] mt-2">{selectedProject.name}</h3>
          </div>

          {/* Buffer Status */}
          {bufferData && (
            <div className="p-3 border-b border-[var(--border-primary)]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Buffer Status</span>
                <span className={`ml-auto w-3 h-3 rounded-full ${getFeverColor(bufferData.fever_status)}`} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[var(--text-secondary)]">Progress</div>
                  <div className="font-semibold text-[var(--text-primary)]">{bufferData.progress.percent}%</div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Buffer Consumed</div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    {bufferData.project_buffer.consumed_percent}%
                  </div>
                </div>
              </div>
              <div className="mt-2 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className={`h-full ${getFeverColor(bufferData.fever_status)} transition-all`}
                  style={{ width: `${Math.min(100, bufferData.project_buffer.consumed_percent)}%` }}
                />
              </div>
            </div>
          )}

          {/* View Mode Toggle & Actions */}
          <div className="flex items-center justify-between p-2 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                  viewMode === "tree"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <List className="w-3 h-3" />
                Tree
              </button>
              <button
                onClick={() => setViewMode("gantt")}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                  viewMode === "gantt"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <GanttIcon className="w-3 h-3" />
                Gantt
              </button>
              <button
                onClick={() => setViewMode("milestones")}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                  viewMode === "milestones"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <Flag className="w-3 h-3" />
                Dashboard
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDocParser(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                title="ドキュメントからWBS生成"
              >
                <FileText className="w-3 h-3" />
                Doc
              </button>
              <button
                onClick={() => setShowMilestones(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                title="マイルストーン記録"
              >
                <Plus className="w-3 h-3" />
                Record
              </button>
            </div>
          </div>

          {/* WBS View */}
          <div className="flex-1 overflow-auto p-2">
            {viewMode === "milestones" ? (
              <MilestoneDashboard projectId={selectedProject.project_id} />
            ) : wbsItems.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                No WBS items yet. They will be created automatically from Claude Code sessions.
              </div>
            ) : viewMode === "tree" ? (
              <div>{wbsItems.map((item) => renderWBSItem(item))}</div>
            ) : (
              <GanttChart
                items={flatWbsItems}
                dependencies={dependencies}
                criticalChain={criticalChain}
                onItemClick={(item) => {
                  toast.info(`Selected: ${item.code} ${item.title}`);
                }}
                onScheduleChange={async (itemId, start, end) => {
                  try {
                    const result = await api.updateWBSSchedule(
                      itemId,
                      start.toISOString(),
                      end.toISOString()
                    );
                    if (result.conflicts && result.conflicts.length > 0) {
                      toast.warning(
                        `Schedule updated with ${result.conflicts.length} conflict(s)`
                      );
                    } else {
                      toast.success("Schedule updated");
                    }
                    fetchWBS(selectedProject.project_id);
                  } catch (error) {
                    toast.error("Failed to update schedule");
                  }
                }}
              />
            )}
          </div>

          {/* Document Parser Modal */}
          <DocParserModal
            isOpen={showDocParser}
            onClose={() => setShowDocParser(false)}
            projectId={selectedProject.project_id}
            onWbsItemsAdded={() => {
              fetchWBS(selectedProject.project_id);
              toast.success("WBS items added from document");
            }}
          />

          {/* Milestone Recorder Modal */}
          <MilestoneRecorder
            isOpen={showMilestones}
            onClose={() => setShowMilestones(false)}
            projectId={selectedProject.project_id}
            onMilestoneCreated={() => {
              toast.success("Milestone updated");
            }}
          />
        </>
      )}
    </div>
  );
}
