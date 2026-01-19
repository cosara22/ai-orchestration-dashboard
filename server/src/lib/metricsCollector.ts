/**
 * Metrics Collector - Collects and aggregates system metrics
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "./db";

export interface SystemMetrics {
  timestamp: string;
  agents: {
    total: number;
    active: number;
    idle: number;
    busy: number;
    inactive: number;
  };
  tasks: {
    total: number;
    pending: number;
    queued: number;
    in_progress: number;
    completed: number;
    failed: number;
    avg_completion_time_minutes: number | null;
  };
  locks: {
    total_active: number;
    avg_hold_time_minutes: number | null;
    conflicts_today: number;
  };
  context: {
    total_entries: number;
    decisions: number;
    blockers: number;
    learnings: number;
  };
  alerts: {
    total_unread: number;
    high_severity: number;
    medium_severity: number;
    low_severity: number;
  };
  performance: {
    avg_task_wait_time_minutes: number | null;
    avg_task_execution_time_minutes: number | null;
    task_success_rate: number | null;
    agent_utilization_percent: number | null;
  };
}

export interface TimeSeriesMetric {
  timestamp: string;
  metric_name: string;
  value: number;
  tags?: Record<string, string>;
}

/**
 * Collect current system metrics
 */
export function collectMetrics(): SystemMetrics {
  const db = getDb();
  const now = new Date().toISOString();

  // Agent metrics
  const agentCounts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
      SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
      SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
    FROM agents
  `).get() as { total: number; active: number; idle: number; busy: number; inactive: number };

  // Task metrics
  const taskCounts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM task_queue
  `).get() as { total: number; pending: number; queued: number; in_progress: number; completed: number; failed: number };

  const avgCompletionTime = db.prepare(`
    SELECT AVG(
      (julianday(completed_at) - julianday(started_at)) * 24 * 60
    ) as avg_minutes
    FROM task_queue
    WHERE status = 'completed'
    AND completed_at IS NOT NULL
    AND started_at IS NOT NULL
    AND completed_at > datetime('now', '-7 days')
  `).get() as { avg_minutes: number | null };

  // Lock metrics
  const lockCounts = db.prepare(`
    SELECT
      COUNT(*) as total_active,
      AVG(
        (julianday('now') - julianday(acquired_at)) * 24 * 60
      ) as avg_hold_minutes
    FROM file_locks
    WHERE status = 'active'
  `).get() as { total_active: number; avg_hold_minutes: number | null };

  const conflictsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM lock_conflicts
    WHERE detected_at > datetime('now', '-1 day')
  `).get() as { count: number };

  // Context metrics
  const contextCounts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN type = 'decision' THEN 1 ELSE 0 END) as decisions,
      SUM(CASE WHEN type = 'blocker' THEN 1 ELSE 0 END) as blockers,
      SUM(CASE WHEN type = 'learning' THEN 1 ELSE 0 END) as learnings
    FROM shared_context
  `).get() as { total: number; decisions: number; blockers: number; learnings: number };

  // Alert metrics
  const alertCounts = db.prepare(`
    SELECT
      COUNT(*) as total_unread,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
      SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low
    FROM alerts
    WHERE read = 0
  `).get() as { total_unread: number; high: number; medium: number; low: number };

  // Performance metrics
  const avgWaitTime = db.prepare(`
    SELECT AVG(
      (julianday(started_at) - julianday(assigned_at)) * 24 * 60
    ) as avg_minutes
    FROM task_queue
    WHERE started_at IS NOT NULL
    AND assigned_at IS NOT NULL
    AND started_at > datetime('now', '-7 days')
  `).get() as { avg_minutes: number | null };

  const avgExecutionTime = db.prepare(`
    SELECT AVG(
      (julianday(completed_at) - julianday(started_at)) * 24 * 60
    ) as avg_minutes
    FROM task_queue
    WHERE status = 'completed'
    AND completed_at IS NOT NULL
    AND started_at IS NOT NULL
    AND completed_at > datetime('now', '-7 days')
  `).get() as { avg_minutes: number | null };

  const successRate = db.prepare(`
    SELECT
      CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) /
      NULLIF(COUNT(*), 0) * 100 as rate
    FROM task_queue
    WHERE status IN ('completed', 'failed')
    AND updated_at > datetime('now', '-7 days')
  `).get() as { rate: number | null };

  // Agent utilization (active agents with tasks / total active agents)
  const utilization = db.prepare(`
    SELECT
      CAST(
        (SELECT COUNT(DISTINCT assigned_to) FROM task_queue WHERE status IN ('queued', 'in_progress') AND assigned_to IS NOT NULL)
        AS FLOAT
      ) /
      NULLIF((SELECT COUNT(*) FROM agents WHERE status IN ('active', 'busy')), 0) * 100 as percent
  `).get() as { percent: number | null };

  return {
    timestamp: now,
    agents: {
      total: agentCounts.total || 0,
      active: agentCounts.active || 0,
      idle: agentCounts.idle || 0,
      busy: agentCounts.busy || 0,
      inactive: agentCounts.inactive || 0,
    },
    tasks: {
      total: taskCounts.total || 0,
      pending: taskCounts.pending || 0,
      queued: taskCounts.queued || 0,
      in_progress: taskCounts.in_progress || 0,
      completed: taskCounts.completed || 0,
      failed: taskCounts.failed || 0,
      avg_completion_time_minutes: avgCompletionTime.avg_minutes,
    },
    locks: {
      total_active: lockCounts.total_active || 0,
      avg_hold_time_minutes: lockCounts.avg_hold_minutes,
      conflicts_today: conflictsToday.count || 0,
    },
    context: {
      total_entries: contextCounts.total || 0,
      decisions: contextCounts.decisions || 0,
      blockers: contextCounts.blockers || 0,
      learnings: contextCounts.learnings || 0,
    },
    alerts: {
      total_unread: alertCounts.total_unread || 0,
      high_severity: alertCounts.high || 0,
      medium_severity: alertCounts.medium || 0,
      low_severity: alertCounts.low || 0,
    },
    performance: {
      avg_task_wait_time_minutes: avgWaitTime.avg_minutes,
      avg_task_execution_time_minutes: avgExecutionTime.avg_minutes,
      task_success_rate: successRate.rate,
      agent_utilization_percent: utilization.percent,
    },
  };
}

/**
 * Record a time-series metric
 */
export function recordMetric(
  metricName: string,
  value: number,
  tags?: Record<string, string>
): void {
  const db = getDb();
  const { nanoid } = require("nanoid");
  const metricId = `metric_${nanoid(12)}`;

  db.prepare(`
    INSERT INTO metrics_history (metric_id, metric_name, value, tags, recorded_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(metricId, metricName, value, tags ? JSON.stringify(tags) : null);
}

/**
 * Get historical metrics for a specific metric name
 */
export function getMetricHistory(
  metricName: string,
  options: {
    since?: string;
    until?: string;
    limit?: number;
  } = {}
): TimeSeriesMetric[] {
  const db = getDb();
  const { since, until, limit = 100 } = options;

  let query = `
    SELECT metric_name, value, tags, recorded_at as timestamp
    FROM metrics_history
    WHERE metric_name = ?
  `;
  const params: (string | number)[] = [metricName];

  if (since) {
    query += ` AND recorded_at >= ?`;
    params.push(since);
  }

  if (until) {
    query += ` AND recorded_at <= ?`;
    params.push(until);
  }

  query += ` ORDER BY recorded_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(query).all(...params) as {
    metric_name: string;
    value: number;
    tags: string | null;
    timestamp: string;
  }[];

  return rows.map((row) => ({
    timestamp: row.timestamp,
    metric_name: row.metric_name,
    value: row.value,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
  }));
}

/**
 * Get aggregated metrics for dashboard display
 */
export function getAggregatedMetrics(
  metricName: string,
  options: {
    interval: "hour" | "day" | "week";
    since?: string;
  } = { interval: "hour" }
): { period: string; avg: number; min: number; max: number; count: number }[] {
  const db = getDb();
  const { interval, since } = options;

  let groupBy: string;
  let sinceDefault: string;

  switch (interval) {
    case "hour":
      groupBy = "strftime('%Y-%m-%d %H:00', recorded_at)";
      sinceDefault = "datetime('now', '-24 hours')";
      break;
    case "day":
      groupBy = "date(recorded_at)";
      sinceDefault = "datetime('now', '-30 days')";
      break;
    case "week":
      groupBy = "strftime('%Y-%W', recorded_at)";
      sinceDefault = "datetime('now', '-12 weeks')";
      break;
  }

  const query = `
    SELECT
      ${groupBy} as period,
      AVG(value) as avg,
      MIN(value) as min,
      MAX(value) as max,
      COUNT(*) as count
    FROM metrics_history
    WHERE metric_name = ?
    AND recorded_at >= ${since ? "?" : sinceDefault}
    GROUP BY period
    ORDER BY period ASC
  `;

  const params: string[] = since ? [metricName, since] : [metricName];

  return db.prepare(query).all(...params) as {
    period: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }[];
}

/**
 * Cleanup old metrics (keep last 30 days by default)
 */
export function cleanupOldMetrics(retentionDays: number = 30): number {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM metrics_history
    WHERE recorded_at < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
}
