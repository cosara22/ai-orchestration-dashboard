/**
 * Timeout Monitor - Detects and handles stalled/timed-out tasks
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

interface TimedOutTask {
  id: string;
  project_id: string;
  title: string;
  assigned_to: string | null;
  agent_name: string | null;
  started_at: string;
  estimated_minutes: number | null;
  status: string;
}

// Default timeout: 2 hours for in_progress tasks, 30 min for queued tasks
const DEFAULT_IN_PROGRESS_TIMEOUT_MINUTES = 120;
const DEFAULT_QUEUED_TIMEOUT_MINUTES = 30;

/**
 * Check for timed-out tasks and handle them
 */
export async function checkTaskTimeouts(): Promise<{
  timedOut: number;
  escalated: number;
  retried: number;
}> {
  const db = getDb();
  let timedOut = 0;
  let escalated = 0;
  let retried = 0;

  try {
    // Find in_progress tasks that have exceeded their estimated time or default timeout
    const stuckInProgressTasks: TimedOutTask[] = db.prepare(`
      SELECT
        t.id, t.project_id, t.title, t.assigned_to, t.started_at,
        t.estimated_minutes, t.status,
        a.name as agent_name
      FROM task_queue t
      LEFT JOIN agents a ON t.assigned_to = a.agent_id
      WHERE t.status = 'in_progress'
      AND t.started_at IS NOT NULL
      AND (
        (t.estimated_minutes IS NOT NULL AND
         datetime(t.started_at, '+' || (t.estimated_minutes * 2) || ' minutes') < datetime('now'))
        OR
        (t.estimated_minutes IS NULL AND
         datetime(t.started_at, '+${DEFAULT_IN_PROGRESS_TIMEOUT_MINUTES} minutes') < datetime('now'))
      )
    `).all() as TimedOutTask[];

    // Find queued tasks that have been waiting too long
    const stuckQueuedTasks: TimedOutTask[] = db.prepare(`
      SELECT
        t.id, t.project_id, t.title, t.assigned_to, t.started_at,
        t.estimated_minutes, t.status,
        a.name as agent_name
      FROM task_queue t
      LEFT JOIN agents a ON t.assigned_to = a.agent_id
      WHERE t.status = 'queued'
      AND t.assigned_at IS NOT NULL
      AND datetime(t.assigned_at, '+${DEFAULT_QUEUED_TIMEOUT_MINUTES} minutes') < datetime('now')
    `).all() as TimedOutTask[];

    const allTimedOutTasks = [...stuckInProgressTasks, ...stuckQueuedTasks];

    if (allTimedOutTasks.length === 0) {
      return { timedOut: 0, escalated: 0, retried: 0 };
    }

    console.log(`[TimeoutMonitor] Found ${allTimedOutTasks.length} timed-out tasks`);

    for (const task of allTimedOutTasks) {
      timedOut++;

      // Get retry count
      const taskDetails: { retry_count: number } | undefined = db.prepare(
        "SELECT retry_count FROM task_queue WHERE id = ?"
      ).get(task.id) as { retry_count: number } | undefined;

      const retryCount = taskDetails?.retry_count || 0;

      if (retryCount < 3) {
        // Retry: Reset to pending and unassign
        db.prepare(`
          UPDATE task_queue
          SET status = 'pending',
              assigned_to = NULL,
              assigned_at = NULL,
              started_at = NULL,
              retry_count = retry_count + 1,
              error_message = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(`Timeout after ${task.status === 'in_progress' ? 'execution' : 'queue'} (retry ${retryCount + 1}/3)`, task.id);

        retried++;

        // Broadcast retry
        broadcastToChannel("all", {
          type: "task_timeout_retry",
          task_id: task.id,
          title: task.title,
          previous_agent: task.agent_name,
          retry_count: retryCount + 1,
          reason: `Task timed out in ${task.status} status`,
        });

        console.log(`[TimeoutMonitor] Retrying task ${task.id} (attempt ${retryCount + 1}/3)`);
      } else {
        // Max retries reached - mark as failed and escalate
        db.prepare(`
          UPDATE task_queue
          SET status = 'failed',
              error_message = 'Max retries exceeded due to timeout',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(task.id);

        // Create escalation alert
        const { nanoid } = await import("nanoid");
        const alertId = `alert_${nanoid(12)}`;

        db.prepare(`
          INSERT INTO alerts (alert_id, type, severity, title, message, project_id, created_at)
          VALUES (?, 'task_timeout', 'high', ?, ?, ?, datetime('now'))
        `).run(
          alertId,
          `Task Failed: ${task.title}`,
          `Task ${task.id} failed after 3 timeout retries. Last assigned to: ${task.agent_name || 'unassigned'}`,
          task.project_id
        );

        escalated++;

        // Broadcast escalation
        broadcastToChannel("all", {
          type: "task_timeout_escalation",
          task_id: task.id,
          title: task.title,
          alert_id: alertId,
          severity: "high",
          reason: "Max retries exceeded due to repeated timeouts",
        });

        console.log(`[TimeoutMonitor] Escalated task ${task.id} after max retries`);
      }
    }

    console.log(`[TimeoutMonitor] Processed: timedOut=${timedOut}, retried=${retried}, escalated=${escalated}`);
    return { timedOut, escalated, retried };
  } catch (error) {
    console.error("[TimeoutMonitor] Error:", error);
    throw error;
  }
}
