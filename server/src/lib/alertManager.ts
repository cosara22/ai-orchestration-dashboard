/**
 * Alert Manager - Centralized alert handling and notification
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "./db";
import { broadcastToChannel } from "../ws/handler";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertType =
  | "agent_inactive"
  | "agent_overload"
  | "task_timeout"
  | "task_failed"
  | "lock_conflict"
  | "capability_gap"
  | "queue_stall"
  | "system_error"
  | "intervention_required";

export interface AlertData {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  project_id?: string;
  agent_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
}

export interface Alert extends AlertData {
  alert_id: string;
  read: boolean;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

/**
 * Create and broadcast a new alert
 */
export async function createAlert(data: AlertData): Promise<Alert> {
  const db = getDb();
  const { nanoid } = await import("nanoid");
  const alertId = `alert_${nanoid(12)}`;

  db.prepare(`
    INSERT INTO alerts (
      alert_id, type, severity, title, message,
      project_id, agent_id, task_id, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    alertId,
    data.type,
    data.severity,
    data.title,
    data.message,
    data.project_id || null,
    data.agent_id || null,
    data.task_id || null,
    data.metadata ? JSON.stringify(data.metadata) : null
  );

  const alert = getAlert(alertId);
  if (!alert) {
    throw new Error("Failed to create alert");
  }

  // Broadcast alert to all connected clients
  broadcastToChannel("all", {
    type: "new_alert",
    alert,
  });

  console.log(`[AlertManager] Created ${data.severity} alert: ${data.title}`);

  return alert;
}

/**
 * Get a single alert by ID
 */
export function getAlert(alertId: string): Alert | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      alert_id, type, severity, title, message,
      project_id, agent_id, task_id, metadata,
      read, acknowledged, acknowledged_by, acknowledged_at,
      resolved, resolved_at, created_at
    FROM alerts
    WHERE alert_id = ?
  `).get(alertId) as {
    alert_id: string;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    project_id: string | null;
    agent_id: string | null;
    task_id: string | null;
    metadata: string | null;
    read: number;
    acknowledged: number;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
    resolved: number;
    resolved_at: string | null;
    created_at: string;
  } | undefined;

  if (!row) return null;

  return {
    alert_id: row.alert_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    project_id: row.project_id || undefined,
    agent_id: row.agent_id || undefined,
    task_id: row.task_id || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    read: Boolean(row.read),
    acknowledged: Boolean(row.acknowledged),
    acknowledged_by: row.acknowledged_by || undefined,
    acknowledged_at: row.acknowledged_at || undefined,
    resolved: Boolean(row.resolved),
    resolved_at: row.resolved_at || undefined,
    created_at: row.created_at,
  };
}

/**
 * Get alerts with filters
 */
export function getAlerts(options: {
  severity?: AlertSeverity;
  type?: AlertType;
  project_id?: string;
  agent_id?: string;
  unread_only?: boolean;
  unresolved_only?: boolean;
  limit?: number;
  offset?: number;
} = {}): { alerts: Alert[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.severity) {
    conditions.push("severity = ?");
    params.push(options.severity);
  }

  if (options.type) {
    conditions.push("type = ?");
    params.push(options.type);
  }

  if (options.project_id) {
    conditions.push("project_id = ?");
    params.push(options.project_id);
  }

  if (options.agent_id) {
    conditions.push("agent_id = ?");
    params.push(options.agent_id);
  }

  if (options.unread_only) {
    conditions.push("read = 0");
  }

  if (options.unresolved_only) {
    conditions.push("resolved = 0");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM alerts ${whereClause}
  `).get(...params) as { count: number };

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const rows = db.prepare(`
    SELECT
      alert_id, type, severity, title, message,
      project_id, agent_id, task_id, metadata,
      read, acknowledged, acknowledged_by, acknowledged_at,
      resolved, resolved_at, created_at
    FROM alerts
    ${whereClause}
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as {
    alert_id: string;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    project_id: string | null;
    agent_id: string | null;
    task_id: string | null;
    metadata: string | null;
    read: number;
    acknowledged: number;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
    resolved: number;
    resolved_at: string | null;
    created_at: string;
  }[];

  const alerts: Alert[] = rows.map((row) => ({
    alert_id: row.alert_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    project_id: row.project_id || undefined,
    agent_id: row.agent_id || undefined,
    task_id: row.task_id || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    read: Boolean(row.read),
    acknowledged: Boolean(row.acknowledged),
    acknowledged_by: row.acknowledged_by || undefined,
    acknowledged_at: row.acknowledged_at || undefined,
    resolved: Boolean(row.resolved),
    resolved_at: row.resolved_at || undefined,
    created_at: row.created_at,
  }));

  return { alerts, total: total.count };
}

/**
 * Mark alerts as read
 */
export function markAlertsRead(alertIds: string[]): number {
  if (alertIds.length === 0) return 0;

  const db = getDb();
  const placeholders = alertIds.map(() => "?").join(",");
  const result = db.prepare(`
    UPDATE alerts
    SET read = 1
    WHERE alert_id IN (${placeholders})
  `).run(...alertIds);

  return result.changes;
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE alerts
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now')
    WHERE alert_id = ? AND acknowledged = 0
  `).run(acknowledgedBy, alertId);

  if (result.changes > 0) {
    broadcastToChannel("all", {
      type: "alert_acknowledged",
      alert_id: alertId,
      acknowledged_by: acknowledgedBy,
    });
  }

  return result.changes > 0;
}

/**
 * Resolve an alert
 */
export function resolveAlert(alertId: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE alerts
    SET resolved = 1, resolved_at = datetime('now')
    WHERE alert_id = ? AND resolved = 0
  `).run(alertId);

  if (result.changes > 0) {
    broadcastToChannel("all", {
      type: "alert_resolved",
      alert_id: alertId,
    });
  }

  return result.changes > 0;
}

/**
 * Get alert statistics
 */
export function getAlertStats(): {
  total: number;
  unread: number;
  unresolved: number;
  by_severity: Record<AlertSeverity, number>;
  by_type: Record<string, number>;
  recent_24h: number;
} {
  const db = getDb();

  const total = db.prepare("SELECT COUNT(*) as count FROM alerts").get() as { count: number };
  const unread = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE read = 0").get() as { count: number };
  const unresolved = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE resolved = 0").get() as { count: number };
  const recent = db.prepare(`
    SELECT COUNT(*) as count FROM alerts WHERE created_at > datetime('now', '-1 day')
  `).get() as { count: number };

  const bySeverity = db.prepare(`
    SELECT severity, COUNT(*) as count
    FROM alerts
    WHERE resolved = 0
    GROUP BY severity
  `).all() as { severity: AlertSeverity; count: number }[];

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM alerts
    WHERE resolved = 0
    GROUP BY type
  `).all() as { type: string; count: number }[];

  const severityMap: Record<AlertSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const row of bySeverity) {
    severityMap[row.severity] = row.count;
  }

  const typeMap: Record<string, number> = {};
  for (const row of byType) {
    typeMap[row.type] = row.count;
  }

  return {
    total: total.count,
    unread: unread.count,
    unresolved: unresolved.count,
    by_severity: severityMap,
    by_type: typeMap,
    recent_24h: recent.count,
  };
}

/**
 * Create predefined alerts for common scenarios
 */
export const AlertPresets = {
  agentInactive: (agentName: string, agentId: string, minutesSinceHeartbeat: number) =>
    createAlert({
      type: "agent_inactive",
      severity: "high",
      title: `Agent Unresponsive: ${agentName}`,
      message: `Agent ${agentName} has not sent a heartbeat for ${minutesSinceHeartbeat} minutes.`,
      agent_id: agentId,
      metadata: { minutes_since_heartbeat: minutesSinceHeartbeat },
    }),

  taskTimeout: (taskTitle: string, taskId: string, agentName?: string) =>
    createAlert({
      type: "task_timeout",
      severity: "medium",
      title: `Task Timeout: ${taskTitle}`,
      message: `Task "${taskTitle}" exceeded its time limit. ${agentName ? `Assigned to: ${agentName}` : ""}`,
      task_id: taskId,
      metadata: { assigned_agent: agentName },
    }),

  taskFailed: (taskTitle: string, taskId: string, error: string) =>
    createAlert({
      type: "task_failed",
      severity: "high",
      title: `Task Failed: ${taskTitle}`,
      message: `Task "${taskTitle}" failed after max retries. Error: ${error}`,
      task_id: taskId,
      metadata: { error },
    }),

  lockConflict: (filePath: string, requestingAgent: string, holdingAgent: string) =>
    createAlert({
      type: "lock_conflict",
      severity: "medium",
      title: `Lock Conflict: ${filePath}`,
      message: `Agent ${requestingAgent} requested lock on ${filePath} but it's held by ${holdingAgent}.`,
      metadata: { file_path: filePath, requesting_agent: requestingAgent, holding_agent: holdingAgent },
    }),

  capabilityGap: (taskTitle: string, missingCapabilities: string[]) =>
    createAlert({
      type: "capability_gap",
      severity: "medium",
      title: `No Agent Available: ${taskTitle}`,
      message: `No active agent has the required capabilities: ${missingCapabilities.join(", ")}`,
      metadata: { missing_capabilities: missingCapabilities },
    }),

  queueStall: (queuedCount: number, oldestMinutes: number) =>
    createAlert({
      type: "queue_stall",
      severity: "high",
      title: "Task Queue Stalled",
      message: `${queuedCount} tasks have been queued for over ${oldestMinutes} minutes without progress.`,
      metadata: { queued_count: queuedCount, oldest_minutes: oldestMinutes },
    }),

  interventionRequired: (reason: string, context: Record<string, unknown>) =>
    createAlert({
      type: "intervention_required",
      severity: "critical",
      title: "Human Intervention Required",
      message: reason,
      metadata: context,
    }),
};
