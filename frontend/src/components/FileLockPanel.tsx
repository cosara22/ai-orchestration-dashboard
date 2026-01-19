"use client";

import { useState, useEffect, useCallback } from "react";
import { api, FileLock, LockConflict } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  FileCode,
  User,
  Shield,
  RefreshCw,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface FileLockPanelProps {
  projectId?: string;
}

const lockTypeConfig = {
  exclusive: { icon: Lock, color: "text-red-500", bgColor: "bg-red-500/10", label: "Exclusive" },
  shared: { icon: Shield, color: "text-blue-500", bgColor: "bg-blue-500/10", label: "Shared" },
};

const statusConfig = {
  active: { icon: Lock, color: "text-green-400", label: "Active" },
  released: { icon: Unlock, color: "text-gray-400", label: "Released" },
  expired: { icon: Clock, color: "text-yellow-400", label: "Expired" },
  force_released: { icon: AlertTriangle, color: "text-red-400", label: "Force Released" },
};

export function FileLockPanel({ projectId }: FileLockPanelProps) {
  const [locks, setLocks] = useState<FileLock[]>([]);
  const [conflicts, setConflicts] = useState<LockConflict[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showConflicts, setShowConflicts] = useState(false);
  const [expandedLockId, setExpandedLockId] = useState<string | null>(null);
  const [stats, setStats] = useState({ active: 0, released: 0, expired: 0 });
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [locksRes, conflictsRes] = await Promise.all([
        api.getLocks({ project_id: projectId, status: statusFilter || undefined, limit: 100 }),
        api.getLockConflicts({ project_id: projectId, limit: 20 }),
      ]);
      setLocks(locksRes.locks);
      setStats({
        active: locksRes.active,
        released: locksRes.released,
        expired: locksRes.expired,
      });
      setConflicts(conflictsRes.conflicts);
    } catch (error) {
      console.error("Failed to fetch locks:", error);
      toast.error("Failed to load locks", "Could not fetch file lock data");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, statusFilter, toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleForceRelease = async (lock: FileLock) => {
    const reason = prompt("Enter reason for force release:");
    if (!reason) return;

    try {
      await api.forceReleaseLock(lock.lock_id, reason);
      toast.success("Lock released", `Force released lock on ${lock.file_path}`);
      fetchData();
    } catch (error) {
      console.error("Failed to force release:", error);
      toast.error("Failed to release", "Could not force release the lock");
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await api.cleanupLocks();
      toast.success("Cleanup complete", `Cleaned up ${result.expired_count} expired locks`);
      fetchData();
    } catch (error) {
      console.error("Failed to cleanup:", error);
      toast.error("Cleanup failed", "Could not cleanup expired locks");
    }
  };

  const handleResolveConflict = async (conflict: LockConflict) => {
    const resolution = prompt("Enter resolution result:");
    if (!resolution) return;

    try {
      await api.resolveConflict(conflict.conflict_id, resolution);
      toast.success("Conflict resolved", "The conflict has been marked as resolved");
      fetchData();
    } catch (error) {
      console.error("Failed to resolve conflict:", error);
      toast.error("Failed to resolve", "Could not resolve the conflict");
    }
  };

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0) return "Expired";
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m remaining`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m remaining`;
  };

  const unresolvedConflicts = conflicts.filter((c) => c.status === "detected");

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">File Locks</h2>
            {unresolvedConflicts.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                {unresolvedConflicts.length} conflicts
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCleanup}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Cleanup expired locks"
            >
              <Trash2 className="w-4 h-4" />
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

        {/* Stats */}
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-600 dark:text-gray-400">Active: {stats.active}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">Released: {stats.released}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">Expired: {stats.expired}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3">
          {["active", "released", "expired", ""].map((status) => (
            <button
              key={status || "all"}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                statusFilter === status
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              {status || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Conflicts Section */}
      {unresolvedConflicts.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800">
          <button
            onClick={() => setShowConflicts(!showConflicts)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                {unresolvedConflicts.length} Unresolved Conflict{unresolvedConflicts.length > 1 ? "s" : ""}
              </span>
            </div>
            {showConflicts ? (
              <ChevronUp className="w-4 h-4 text-red-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-red-500" />
            )}
          </button>

          {showConflicts && (
            <div className="mt-3 space-y-2">
              {unresolvedConflicts.map((conflict) => (
                <div
                  key={conflict.conflict_id}
                  className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {conflict.conflict_type}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {conflict.description}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Agents: {conflict.involved_agents.join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleResolveConflict(conflict)}
                      className="px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Locks List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {locks.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No locks found</p>
          </div>
        ) : (
          locks.map((lock) => {
            const typeConfig = lockTypeConfig[lock.lock_type];
            const StatusIcon = statusConfig[lock.status]?.icon || Lock;
            const isExpanded = expandedLockId === lock.lock_id;

            return (
              <div key={lock.lock_id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpandedLockId(isExpanded ? null : lock.lock_id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("p-1.5 rounded-lg", typeConfig.bgColor)}>
                      <FileCode className={cn("w-4 h-4", typeConfig.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {lock.file_path}
                        </span>
                        <span className={cn("flex items-center gap-1 text-xs", statusConfig[lock.status].color)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[lock.status].label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {lock.agent_name || lock.agent_id}
                        </span>
                        <span className={cn("px-1.5 py-0.5 rounded text-xs", typeConfig.bgColor, typeConfig.color)}>
                          {typeConfig.label}
                        </span>
                        {lock.status === "active" && lock.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {getTimeRemaining(lock.expires_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lock.status === "active" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleForceRelease(lock);
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Force release"
                      >
                        <Unlock className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 pl-10 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Lock ID:</span>
                        <span className="ml-2 text-gray-700 dark:text-gray-300 font-mono">{lock.lock_id}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Agent ID:</span>
                        <span className="ml-2 text-gray-700 dark:text-gray-300 font-mono">{lock.agent_id}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Acquired:</span>
                        <span className="ml-2 text-gray-700 dark:text-gray-300">
                          {formatRelativeTime(lock.acquired_at)}
                        </span>
                      </div>
                      {lock.expires_at && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Expires:</span>
                          <span className="ml-2 text-gray-700 dark:text-gray-300">
                            {new Date(lock.expires_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {lock.released_at && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Released:</span>
                          <span className="ml-2 text-gray-700 dark:text-gray-300">
                            {formatRelativeTime(lock.released_at)}
                          </span>
                        </div>
                      )}
                    </div>
                    {lock.reason && (
                      <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                        <span className="text-gray-500 dark:text-gray-400">Reason: </span>
                        <span className="text-gray-700 dark:text-gray-300">{lock.reason}</span>
                      </div>
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
