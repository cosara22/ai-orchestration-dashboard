import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { broadcastToClients } from "../ws/handler";

export const queueRouter = new Hono();

// Priority weight for sorting (higher = more important)
const PRIORITY_WEIGHTS: Record<number, number> = {
  0: 100,  // Critical
  1: 80,   // High
  2: 60,   // Medium
  3: 40,   // Low
  4: 20,   // Background
};

// Schema definitions
const EnqueueSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  required_capabilities: z.array(z.string()).default([]),
  priority: z.number().min(0).max(4).default(2),
  estimated_minutes: z.number().positive().optional(),
  dependencies: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

const AssignSchema = z.object({
  agent_id: z.string().min(1),
});

const CompleteSchema = z.object({
  result: z.record(z.any()).optional(),
});

const FailSchema = z.object({
  error_message: z.string(),
});

// Helper function to calculate queue score
function calculateQueueScore(
  priority: number,
  createdAt: string,
  waitingMinutes: number
): number {
  const priorityWeight = PRIORITY_WEIGHTS[priority] || 50;
  const waitingBonus = Math.min(waitingMinutes * 0.5, 30); // Max 30 bonus from waiting
  return priorityWeight + waitingBonus;
}

// Helper function to check if dependencies are completed
function checkDependencies(db: any, dependencies: string[]): { satisfied: boolean; pending: string[] } {
  if (!dependencies || dependencies.length === 0) {
    return { satisfied: true, pending: [] };
  }

  const pending: string[] = [];
  for (const depId of dependencies) {
    const depTask: any = db.prepare(
      "SELECT status FROM task_queue WHERE id = ?"
    ).get(depId);

    if (!depTask || depTask.status !== "completed") {
      pending.push(depId);
    }
  }

  return { satisfied: pending.length === 0, pending };
}

// POST /api/queue/enqueue - Add task to queue
queueRouter.post("/enqueue", async (c) => {
  try {
    const body = await c.req.json();
    const data = EnqueueSchema.parse(body);

    const db = getDb();
    const taskId = `tq_${nanoid(12)}`;
    const timestamp = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO task_queue (
        id, project_id, title, description, required_capabilities,
        priority, status, estimated_minutes, dependencies, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      data.project_id,
      data.title,
      data.description || null,
      JSON.stringify(data.required_capabilities),
      data.priority,
      "pending",
      data.estimated_minutes || null,
      JSON.stringify(data.dependencies),
      data.metadata ? JSON.stringify(data.metadata) : null,
      timestamp,
      timestamp
    );

    const task = {
      id: taskId,
      project_id: data.project_id,
      title: data.title,
      description: data.description || null,
      required_capabilities: data.required_capabilities,
      priority: data.priority,
      status: "pending",
      estimated_minutes: data.estimated_minutes || null,
      dependencies: data.dependencies,
      metadata: data.metadata || null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    broadcastToClients({
      type: "queue",
      action: "task_enqueued",
      data: task,
    });

    return c.json({ success: true, task }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error enqueueing task:", error);
    return c.json({ error: "Failed to enqueue task" }, 500);
  }
});

// GET /api/queue/list - List queued tasks
queueRouter.get("/list", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const status = c.req.query("status");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    let query = "SELECT * FROM task_queue WHERE 1=1";
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY priority ASC, created_at ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const tasks: any[] = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedTasks = tasks.map((t) => ({
      ...t,
      required_capabilities: JSON.parse(t.required_capabilities || "[]"),
      dependencies: JSON.parse(t.dependencies || "[]"),
      metadata: t.metadata ? JSON.parse(t.metadata) : null,
    }));

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM task_queue WHERE 1=1";
    const countParams: any[] = [];
    if (projectId) {
      countQuery += " AND project_id = ?";
      countParams.push(projectId);
    }
    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }
    const countResult: any = db.prepare(countQuery).get(...countParams);

    return c.json({
      tasks: parsedTasks,
      total: countResult.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error listing queue:", error);
    return c.json({ error: "Failed to list queue" }, 500);
  }
});

// GET /api/queue/next - Get next task for assignment
queueRouter.get("/next", async (c) => {
  try {
    const db = getDb();
    const agentId = c.req.query("agent_id");
    const projectId = c.req.query("project_id");

    if (!agentId) {
      return c.json({ error: "agent_id is required" }, 400);
    }

    // Get agent capabilities
    const agentCaps: any[] = db.prepare(`
      SELECT tag FROM agent_capabilities WHERE agent_id = ?
    `).all(agentId);
    const agentTags = agentCaps.map((ac) => ac.tag);

    // Get pending tasks
    let query = `
      SELECT * FROM task_queue
      WHERE status = 'pending'
    `;
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    query += " ORDER BY priority ASC, created_at ASC";

    const pendingTasks: any[] = db.prepare(query).all(...params);

    // Find the best matching task
    const now = new Date();
    let bestTask: any = null;
    let bestScore = -1;

    for (const task of pendingTasks) {
      const requiredCaps = JSON.parse(task.required_capabilities || "[]");
      const dependencies = JSON.parse(task.dependencies || "[]");

      // Check dependencies
      const depCheck = checkDependencies(db, dependencies);
      if (!depCheck.satisfied) {
        continue;
      }

      // Check capability match
      const hasRequiredCaps =
        requiredCaps.length === 0 ||
        requiredCaps.every((cap: string) => agentTags.includes(cap));

      if (!hasRequiredCaps) {
        continue;
      }

      // Calculate score
      const createdAt = new Date(task.created_at);
      const waitingMinutes = (now.getTime() - createdAt.getTime()) / 60000;
      const score = calculateQueueScore(task.priority, task.created_at, waitingMinutes);

      if (score > bestScore) {
        bestScore = score;
        bestTask = task;
      }
    }

    if (!bestTask) {
      return c.json({ task: null, message: "No suitable task found" });
    }

    // Parse JSON fields
    const parsedTask = {
      ...bestTask,
      required_capabilities: JSON.parse(bestTask.required_capabilities || "[]"),
      dependencies: JSON.parse(bestTask.dependencies || "[]"),
      metadata: bestTask.metadata ? JSON.parse(bestTask.metadata) : null,
      queue_score: bestScore,
    };

    return c.json({ task: parsedTask });
  } catch (error) {
    console.error("Error getting next task:", error);
    return c.json({ error: "Failed to get next task" }, 500);
  }
});

// POST /api/queue/:id/assign - Assign task to agent
queueRouter.post("/:id/assign", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");
    const body = await c.req.json();
    const data = AssignSchema.parse(body);

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status !== "pending") {
      return c.json({ error: `Cannot assign task with status: ${task.status}` }, 400);
    }

    // Check dependencies
    const dependencies = JSON.parse(task.dependencies || "[]");
    const depCheck = checkDependencies(db, dependencies);
    if (!depCheck.satisfied) {
      return c.json({
        error: "Dependencies not satisfied",
        pending_dependencies: depCheck.pending,
      }, 400);
    }

    const timestamp = new Date().toISOString();

    db.prepare(`
      UPDATE task_queue
      SET status = 'assigned', assigned_to = ?, assigned_at = ?, updated_at = ?
      WHERE id = ?
    `).run(data.agent_id, timestamp, timestamp, taskId);

    const updatedTask: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    const parsedTask = {
      ...updatedTask,
      required_capabilities: JSON.parse(updatedTask.required_capabilities || "[]"),
      dependencies: JSON.parse(updatedTask.dependencies || "[]"),
      metadata: updatedTask.metadata ? JSON.parse(updatedTask.metadata) : null,
    };

    broadcastToClients({
      type: "queue",
      action: "task_assigned",
      data: parsedTask,
    });

    return c.json({ success: true, task: parsedTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error assigning task:", error);
    return c.json({ error: "Failed to assign task" }, 500);
  }
});

// POST /api/queue/:id/start - Start working on task
queueRouter.post("/:id/start", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status !== "assigned") {
      return c.json({ error: `Cannot start task with status: ${task.status}` }, 400);
    }

    const timestamp = new Date().toISOString();

    db.prepare(`
      UPDATE task_queue
      SET status = 'in_progress', started_at = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, timestamp, taskId);

    const updatedTask: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    const parsedTask = {
      ...updatedTask,
      required_capabilities: JSON.parse(updatedTask.required_capabilities || "[]"),
      dependencies: JSON.parse(updatedTask.dependencies || "[]"),
      metadata: updatedTask.metadata ? JSON.parse(updatedTask.metadata) : null,
    };

    broadcastToClients({
      type: "queue",
      action: "task_started",
      data: parsedTask,
    });

    return c.json({ success: true, task: parsedTask });
  } catch (error) {
    console.error("Error starting task:", error);
    return c.json({ error: "Failed to start task" }, 500);
  }
});

// POST /api/queue/:id/complete - Complete task
queueRouter.post("/:id/complete", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const data = CompleteSchema.parse(body);

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status !== "in_progress") {
      return c.json({ error: `Cannot complete task with status: ${task.status}` }, 400);
    }

    const timestamp = new Date().toISOString();
    const startedAt = task.started_at ? new Date(task.started_at) : new Date();
    const completedAt = new Date(timestamp);
    const actualMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

    db.prepare(`
      UPDATE task_queue
      SET status = 'completed', completed_at = ?, actual_minutes = ?,
          result = ?, updated_at = ?
      WHERE id = ?
    `).run(
      timestamp,
      actualMinutes,
      data.result ? JSON.stringify(data.result) : null,
      timestamp,
      taskId
    );

    const updatedTask: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    const parsedTask = {
      ...updatedTask,
      required_capabilities: JSON.parse(updatedTask.required_capabilities || "[]"),
      dependencies: JSON.parse(updatedTask.dependencies || "[]"),
      metadata: updatedTask.metadata ? JSON.parse(updatedTask.metadata) : null,
      result: updatedTask.result ? JSON.parse(updatedTask.result) : null,
    };

    broadcastToClients({
      type: "queue",
      action: "task_completed",
      data: parsedTask,
    });

    return c.json({ success: true, task: parsedTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error completing task:", error);
    return c.json({ error: "Failed to complete task" }, 500);
  }
});

// POST /api/queue/:id/fail - Mark task as failed
queueRouter.post("/:id/fail", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");
    const body = await c.req.json();
    const data = FailSchema.parse(body);

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status !== "in_progress" && task.status !== "assigned") {
      return c.json({ error: `Cannot fail task with status: ${task.status}` }, 400);
    }

    const timestamp = new Date().toISOString();
    const retryCount = (task.retry_count || 0) + 1;

    db.prepare(`
      UPDATE task_queue
      SET status = 'failed', error_message = ?, retry_count = ?, updated_at = ?
      WHERE id = ?
    `).run(data.error_message, retryCount, timestamp, taskId);

    const updatedTask: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    const parsedTask = {
      ...updatedTask,
      required_capabilities: JSON.parse(updatedTask.required_capabilities || "[]"),
      dependencies: JSON.parse(updatedTask.dependencies || "[]"),
      metadata: updatedTask.metadata ? JSON.parse(updatedTask.metadata) : null,
    };

    broadcastToClients({
      type: "queue",
      action: "task_failed",
      data: parsedTask,
    });

    return c.json({ success: true, task: parsedTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error failing task:", error);
    return c.json({ error: "Failed to mark task as failed" }, 500);
  }
});

// POST /api/queue/:id/retry - Retry failed task
queueRouter.post("/:id/retry", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status !== "failed") {
      return c.json({ error: `Cannot retry task with status: ${task.status}` }, 400);
    }

    const maxRetries = 3;
    if (task.retry_count >= maxRetries) {
      return c.json({
        error: `Maximum retry attempts (${maxRetries}) exceeded`,
        retry_count: task.retry_count,
      }, 400);
    }

    const timestamp = new Date().toISOString();

    db.prepare(`
      UPDATE task_queue
      SET status = 'pending', assigned_to = NULL, assigned_at = NULL,
          started_at = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(timestamp, taskId);

    const updatedTask: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    const parsedTask = {
      ...updatedTask,
      required_capabilities: JSON.parse(updatedTask.required_capabilities || "[]"),
      dependencies: JSON.parse(updatedTask.dependencies || "[]"),
      metadata: updatedTask.metadata ? JSON.parse(updatedTask.metadata) : null,
    };

    broadcastToClients({
      type: "queue",
      action: "task_retried",
      data: parsedTask,
    });

    return c.json({ success: true, task: parsedTask });
  } catch (error) {
    console.error("Error retrying task:", error);
    return c.json({ error: "Failed to retry task" }, 500);
  }
});

// GET /api/queue/stats - Get queue statistics
queueRouter.get("/stats", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");

    let whereClause = "";
    const params: any[] = [];
    if (projectId) {
      whereClause = "WHERE project_id = ?";
      params.push(projectId);
    }

    // Get counts by status
    const statusCounts: any[] = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM task_queue ${whereClause}
      GROUP BY status
    `).all(...params);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row.count;
    }

    // Get counts by priority
    const priorityCounts: any[] = db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM task_queue ${whereClause}
      GROUP BY priority
    `).all(...params);

    const priorityMap: Record<number, number> = {};
    for (const row of priorityCounts) {
      priorityMap[row.priority] = row.count;
    }

    // Get average completion time
    const avgTime: any = db.prepare(`
      SELECT AVG(actual_minutes) as avg_minutes
      FROM task_queue
      ${whereClause ? whereClause + " AND" : "WHERE"} status = 'completed' AND actual_minutes IS NOT NULL
    `).get(...params);

    // Get agent workload
    const agentWorkload: any[] = db.prepare(`
      SELECT assigned_to, COUNT(*) as task_count
      FROM task_queue
      ${whereClause ? whereClause + " AND" : "WHERE"} status IN ('assigned', 'in_progress') AND assigned_to IS NOT NULL
      GROUP BY assigned_to
    `).all(...params);

    // Get recent failures
    const recentFailures: any[] = db.prepare(`
      SELECT id, title, error_message, retry_count, updated_at
      FROM task_queue
      ${whereClause ? whereClause + " AND" : "WHERE"} status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(...params);

    return c.json({
      by_status: {
        pending: statusMap.pending || 0,
        assigned: statusMap.assigned || 0,
        in_progress: statusMap.in_progress || 0,
        completed: statusMap.completed || 0,
        failed: statusMap.failed || 0,
        cancelled: statusMap.cancelled || 0,
      },
      by_priority: {
        critical: priorityMap[0] || 0,
        high: priorityMap[1] || 0,
        medium: priorityMap[2] || 0,
        low: priorityMap[3] || 0,
        background: priorityMap[4] || 0,
      },
      average_completion_minutes: avgTime?.avg_minutes || null,
      agent_workload: agentWorkload,
      recent_failures: recentFailures,
    });
  } catch (error) {
    console.error("Error getting queue stats:", error);
    return c.json({ error: "Failed to get queue stats" }, 500);
  }
});

// POST /api/queue/dispatch - Auto-assign pending tasks to available agents
queueRouter.post("/dispatch", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const maxAssignments = parseInt(c.req.query("max") || "10");

    // Get pending tasks sorted by priority
    let taskQuery = `
      SELECT * FROM task_queue
      WHERE status = 'pending'
    `;
    const taskParams: any[] = [];

    if (projectId) {
      taskQuery += " AND project_id = ?";
      taskParams.push(projectId);
    }

    taskQuery += " ORDER BY priority ASC, created_at ASC LIMIT ?";
    taskParams.push(maxAssignments * 2); // Get extra tasks in case some can't be assigned

    const pendingTasks: any[] = db.prepare(taskQuery).all(...taskParams);

    // Get available agents
    const agents: any[] = db.prepare(`
      SELECT
        a.*,
        (SELECT COUNT(*) FROM task_queue tq
         WHERE tq.assigned_to = a.agent_id
         AND tq.status IN ('assigned', 'in_progress')) as current_workload
      FROM agents a
      WHERE a.status IN ('idle', 'active')
      ORDER BY a.last_heartbeat DESC
    `).all();

    const assignments: any[] = [];
    const skipped: any[] = [];
    const timestamp = new Date().toISOString();

    for (const task of pendingTasks) {
      if (assignments.length >= maxAssignments) {
        break;
      }

      const requiredCaps = JSON.parse(task.required_capabilities || "[]");
      const dependencies = JSON.parse(task.dependencies || "[]");

      // Check dependencies
      const depCheck = checkDependencies(db, dependencies);
      if (!depCheck.satisfied) {
        skipped.push({
          task_id: task.id,
          title: task.title,
          reason: "dependencies_not_satisfied",
          pending_dependencies: depCheck.pending,
        });
        continue;
      }

      // Find best matching agent
      let bestAgent: any = null;
      let bestScore = -1;

      for (const agent of agents) {
        // Check if agent already has too many tasks
        const assignedToThisAgent = assignments.filter(
          (a) => a.agent_id === agent.agent_id
        ).length;
        if (agent.current_workload + assignedToThisAgent >= 3) {
          continue;
        }

        // Check capabilities
        const caps: any[] = db.prepare(`
          SELECT tag, proficiency FROM agent_capabilities WHERE agent_id = ?
        `).all(agent.agent_id);
        const agentTags = caps.map((c) => c.tag);

        const hasRequiredCaps =
          requiredCaps.length === 0 ||
          requiredCaps.every((cap: string) => agentTags.includes(cap));

        if (!hasRequiredCaps) {
          continue;
        }

        // Calculate score
        let score = 100 - (agent.current_workload + assignedToThisAgent) * 20;
        for (const cap of requiredCaps) {
          const capObj = caps.find((c) => c.tag === cap);
          score += (capObj?.proficiency || 0) * 0.5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestAgent = agent;
        }
      }

      if (!bestAgent) {
        skipped.push({
          task_id: task.id,
          title: task.title,
          reason: "no_matching_agent",
          required_capabilities: requiredCaps,
        });
        continue;
      }

      // Assign task
      db.prepare(`
        UPDATE task_queue
        SET status = 'assigned', assigned_to = ?, assigned_at = ?, updated_at = ?
        WHERE id = ?
      `).run(bestAgent.agent_id, timestamp, timestamp, task.id);

      assignments.push({
        task_id: task.id,
        title: task.title,
        agent_id: bestAgent.agent_id,
        agent_name: bestAgent.name,
        priority: task.priority,
      });

      // Broadcast assignment
      broadcastToClients({
        type: "queue",
        action: "task_assigned",
        data: {
          id: task.id,
          title: task.title,
          assigned_to: bestAgent.agent_id,
          assigned_at: timestamp,
        },
      });
    }

    return c.json({
      success: true,
      assignments,
      skipped,
      summary: {
        assigned: assignments.length,
        skipped: skipped.length,
        remaining_pending: pendingTasks.length - assignments.length - skipped.length,
      },
    });
  } catch (error) {
    console.error("Error dispatching tasks:", error);
    return c.json({ error: "Failed to dispatch tasks" }, 500);
  }
});

// POST /api/queue/timeout-check - Check and handle timed out tasks
queueRouter.post("/timeout-check", async (c) => {
  try {
    const db = getDb();
    const timeoutMinutes = parseInt(c.req.query("timeout_minutes") || "60");
    const timestamp = new Date().toISOString();
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60000).toISOString();

    // Find tasks that have been in_progress or assigned for too long
    const timedOutTasks: any[] = db.prepare(`
      SELECT * FROM task_queue
      WHERE status IN ('assigned', 'in_progress')
      AND (
        (status = 'assigned' AND assigned_at < ?)
        OR (status = 'in_progress' AND started_at < ?)
      )
    `).all(cutoffTime, cutoffTime);

    const results: any[] = [];

    for (const task of timedOutTasks) {
      const retryCount = (task.retry_count || 0) + 1;
      const maxRetries = 3;

      if (retryCount >= maxRetries) {
        // Mark as failed
        db.prepare(`
          UPDATE task_queue
          SET status = 'failed', error_message = 'Task timed out after ${timeoutMinutes} minutes',
              retry_count = ?, updated_at = ?
          WHERE id = ?
        `).run(retryCount, timestamp, task.id);

        results.push({
          task_id: task.id,
          title: task.title,
          action: "failed",
          reason: "max_retries_exceeded",
          retry_count: retryCount,
        });

        broadcastToClients({
          type: "queue",
          action: "task_failed",
          data: { id: task.id, reason: "timeout" },
        });
      } else {
        // Reset to pending for retry
        db.prepare(`
          UPDATE task_queue
          SET status = 'pending', assigned_to = NULL, assigned_at = NULL,
              started_at = NULL, retry_count = ?, updated_at = ?
          WHERE id = ?
        `).run(retryCount, timestamp, task.id);

        results.push({
          task_id: task.id,
          title: task.title,
          action: "reset_for_retry",
          retry_count: retryCount,
        });

        broadcastToClients({
          type: "queue",
          action: "task_reset",
          data: { id: task.id, retry_count: retryCount },
        });
      }
    }

    return c.json({
      success: true,
      timeout_minutes: timeoutMinutes,
      processed: results,
      total_processed: results.length,
    });
  } catch (error) {
    console.error("Error checking timeouts:", error);
    return c.json({ error: "Failed to check timeouts" }, 500);
  }
});

// DELETE /api/queue/:id - Cancel/remove task from queue
queueRouter.delete("/:id", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");

    const task: any = db.prepare(
      "SELECT * FROM task_queue WHERE id = ?"
    ).get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status === "in_progress") {
      return c.json({ error: "Cannot delete task that is in progress" }, 400);
    }

    const timestamp = new Date().toISOString();

    if (task.status === "pending" || task.status === "assigned") {
      // Mark as cancelled instead of deleting
      db.prepare(`
        UPDATE task_queue
        SET status = 'cancelled', updated_at = ?
        WHERE id = ?
      `).run(timestamp, taskId);

      broadcastToClients({
        type: "queue",
        action: "task_cancelled",
        data: { id: taskId },
      });

      return c.json({ success: true, message: "Task cancelled" });
    }

    // For completed/failed/cancelled tasks, actually delete
    db.prepare("DELETE FROM task_queue WHERE id = ?").run(taskId);

    broadcastToClients({
      type: "queue",
      action: "task_deleted",
      data: { id: taskId },
    });

    return c.json({ success: true, message: "Task deleted" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return c.json({ error: "Failed to delete task" }, 500);
  }
});
