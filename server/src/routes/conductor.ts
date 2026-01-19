import { Hono } from "hono";
import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

const conductorRouter = new Hono();

// Types
interface AgentStatus {
  agent_id: string;
  name: string;
  status: string;
  current_workload: number;
  current_task_id: string | null;
  current_task_title: string | null;
  last_heartbeat: string;
}

interface BlockedTask {
  task_id: string;
  title: string;
  blocked_by: string;
  blocked_reason: string;
  assigned_to: string | null;
  agent_name: string | null;
}

interface Bottleneck {
  type: "agent_overload" | "capability_gap" | "dependency_chain" | "lock_contention" | "queue_stall";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affected_items: string[];
  suggested_action: string;
}

interface Risk {
  type: "deadline" | "quality" | "resource" | "dependency";
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  description: string;
  mitigation: string;
}

interface ProjectStatus {
  project_id: string;
  project_name: string;
  overall_progress: number;
  health: "good" | "warning" | "critical";
  active_agents: AgentStatus[];
  queued_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  blocked_tasks: BlockedTask[];
  bottlenecks: Bottleneck[];
  risks: Risk[];
  active_locks: number;
  unresolved_conflicts: number;
  recent_contexts: number;
  estimated_completion: string | null;
}

// GET /api/conductor/status/:project_id - Get project status overview
conductorRouter.get("/status/:project_id", async (c) => {
  const db = getDb();
  const projectId = c.req.param("project_id");

  try {
    // Get project info
    const project: any = db.prepare(
      "SELECT * FROM projects WHERE project_id = ?"
    ).get(projectId);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get task stats
    const taskStats: any = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(*) as total
      FROM task_queue
      WHERE project_id = ?
    `).get(projectId);

    // Get active agents with their current tasks
    const activeAgents: any[] = db.prepare(`
      SELECT
        a.agent_id, a.name, a.status, a.last_heartbeat,
        COUNT(t.task_id) as current_workload,
        (SELECT task_id FROM task_queue WHERE assigned_to = a.agent_id AND status = 'in_progress' LIMIT 1) as current_task_id,
        (SELECT title FROM task_queue WHERE assigned_to = a.agent_id AND status = 'in_progress' LIMIT 1) as current_task_title
      FROM agents a
      LEFT JOIN task_queue t ON t.assigned_to = a.agent_id AND t.status IN ('queued', 'in_progress')
      WHERE a.status = 'active'
      GROUP BY a.agent_id
    `).all();

    // Get blocked tasks
    const blockedTasks: any[] = db.prepare(`
      SELECT t.task_id, t.title, t.blocked_by, t.blocked_reason, t.assigned_to, a.name as agent_name
      FROM task_queue t
      LEFT JOIN agents a ON t.assigned_to = a.agent_id
      WHERE t.project_id = ? AND t.status = 'blocked'
    `).all(projectId);

    // Get lock stats
    const lockStats: any = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_locks
      FROM file_locks
      WHERE project_id = ?
    `).get(projectId);

    // Get conflict stats
    const conflictStats: any = db.prepare(`
      SELECT COUNT(*) as unresolved
      FROM conflict_history
      WHERE project_id = ? AND status = 'detected'
    `).get(projectId);

    // Get recent context count
    const contextStats: any = db.prepare(`
      SELECT COUNT(*) as recent
      FROM shared_context
      WHERE project_id = ? AND created_at > datetime('now', '-24 hours')
    `).get(projectId);

    // Detect bottlenecks
    const bottlenecks = detectBottlenecks(db, projectId, activeAgents, taskStats);

    // Assess risks
    const risks = assessRisks(db, projectId, taskStats, blockedTasks);

    // Calculate overall progress
    const total = taskStats.total || 1;
    const overallProgress = Math.round((taskStats.completed / total) * 100);

    // Determine health status
    let health: "good" | "warning" | "critical" = "good";
    if (bottlenecks.some(b => b.severity === "critical") || blockedTasks.length > 3) {
      health = "critical";
    } else if (bottlenecks.some(b => b.severity === "high") || blockedTasks.length > 0) {
      health = "warning";
    }

    const status: ProjectStatus = {
      project_id: projectId,
      project_name: project.name,
      overall_progress: overallProgress,
      health,
      active_agents: activeAgents,
      queued_tasks: taskStats.queued + taskStats.pending,
      in_progress_tasks: taskStats.in_progress,
      completed_tasks: taskStats.completed,
      failed_tasks: taskStats.failed,
      blocked_tasks: blockedTasks,
      bottlenecks,
      risks,
      active_locks: lockStats?.active_locks || 0,
      unresolved_conflicts: conflictStats?.unresolved || 0,
      recent_contexts: contextStats?.recent || 0,
      estimated_completion: null, // Could be calculated based on velocity
    };

    return c.json(status);
  } catch (error) {
    console.error("Failed to get project status:", error);
    return c.json({ error: "Failed to get project status" }, 500);
  }
});

// GET /api/conductor/overview - Get overview of all projects
conductorRouter.get("/overview", async (c) => {
  const db = getDb();

  try {
    const projects: any[] = db.prepare(`
      SELECT
        p.project_id, p.name, p.status,
        COUNT(DISTINCT a.agent_id) as agent_count,
        COUNT(CASE WHEN t.status IN ('pending', 'queued') THEN 1 END) as queued_tasks,
        COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks,
        COUNT(t.task_id) as total_tasks
      FROM projects p
      LEFT JOIN task_queue t ON t.project_id = p.project_id
      LEFT JOIN agents a ON a.status = 'active'
      GROUP BY p.project_id
    `).all();

    const projectStatuses = projects.map(p => ({
      project_id: p.project_id,
      name: p.name,
      status: p.status,
      agent_count: p.agent_count,
      progress: p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0,
      queued_tasks: p.queued_tasks,
      in_progress_tasks: p.in_progress_tasks,
      completed_tasks: p.completed_tasks,
      blocked_tasks: p.blocked_tasks,
      health: p.blocked_tasks > 3 ? "critical" : p.blocked_tasks > 0 ? "warning" : "good",
    }));

    // Get overall stats
    const totalAgents: any = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'active'"
    ).get();

    const totalTasks: any = db.prepare(
      "SELECT COUNT(*) as count FROM task_queue WHERE status IN ('pending', 'queued', 'in_progress')"
    ).get();

    const activeLocks: any = db.prepare(
      "SELECT COUNT(*) as count FROM file_locks WHERE status = 'active'"
    ).get();

    return c.json({
      projects: projectStatuses,
      total_active_agents: totalAgents?.count || 0,
      total_pending_tasks: totalTasks?.count || 0,
      total_active_locks: activeLocks?.count || 0,
    });
  } catch (error) {
    console.error("Failed to get overview:", error);
    return c.json({ error: "Failed to get overview" }, 500);
  }
});

// POST /api/conductor/decompose - Decompose a high-level task into subtasks
conductorRouter.post("/decompose", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { project_id, parent_task_id, subtasks, auto_assign } = body;

  if (!project_id || !subtasks || !Array.isArray(subtasks)) {
    return c.json({ error: "project_id and subtasks array required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");
    const createdTasks: any[] = [];

    for (const subtask of subtasks) {
      const taskId = `task_${nanoid(12)}`;

      db.prepare(`
        INSERT INTO task_queue (
          task_id, project_id, title, description, priority, status,
          estimated_minutes, required_capabilities, dependencies, parent_task_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        taskId,
        project_id,
        subtask.title,
        subtask.description || "",
        subtask.priority || 1,
        subtask.estimated_minutes || null,
        JSON.stringify(subtask.required_capabilities || []),
        JSON.stringify(subtask.dependencies || []),
        parent_task_id || null
      );

      createdTasks.push({
        task_id: taskId,
        title: subtask.title,
        priority: subtask.priority || 1,
      });
    }

    // Record decision
    const decisionId = `dec_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO conductor_decisions (
        decision_id, project_id, decision_type, description, affected_tasks, created_at
      ) VALUES (?, ?, 'task_decomposition', ?, ?, datetime('now'))
    `).run(
      decisionId,
      project_id,
      `Decomposed ${parent_task_id || "new task"} into ${subtasks.length} subtasks`,
      JSON.stringify(createdTasks.map(t => t.task_id))
    );

    // Broadcast update
    broadcastToChannel("all", {
      type: "conductor_decompose",
      project_id,
      parent_task_id,
      subtasks: createdTasks,
    });

    return c.json({
      success: true,
      decision_id: decisionId,
      created_tasks: createdTasks,
    });
  } catch (error) {
    console.error("Failed to decompose task:", error);
    return c.json({ error: "Failed to decompose task" }, 500);
  }
});

// POST /api/conductor/reallocate - Reallocate tasks between agents
conductorRouter.post("/reallocate", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { project_id, task_ids, from_agent_id, to_agent_id, reason } = body;

  if (!task_ids || !Array.isArray(task_ids) || !to_agent_id) {
    return c.json({ error: "task_ids array and to_agent_id required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");
    const reallocated: string[] = [];

    for (const taskId of task_ids) {
      const task: any = db.prepare(
        "SELECT * FROM task_queue WHERE task_id = ?"
      ).get(taskId);

      if (!task) continue;

      // Only reallocate if task is not completed
      if (task.status !== "completed" && task.status !== "failed") {
        db.prepare(`
          UPDATE task_queue
          SET assigned_to = ?, status = 'queued', updated_at = datetime('now')
          WHERE task_id = ?
        `).run(to_agent_id, taskId);
        reallocated.push(taskId);
      }
    }

    // Record decision
    const decisionId = `dec_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO conductor_decisions (
        decision_id, project_id, decision_type, description, affected_tasks, affected_agents, created_at
      ) VALUES (?, ?, 'reallocation', ?, ?, ?, datetime('now'))
    `).run(
      decisionId,
      project_id || "system",
      reason || `Reallocated ${reallocated.length} tasks to ${to_agent_id}`,
      JSON.stringify(reallocated),
      JSON.stringify([from_agent_id, to_agent_id].filter(Boolean))
    );

    // Broadcast update
    broadcastToChannel("all", {
      type: "conductor_reallocate",
      project_id,
      from_agent_id,
      to_agent_id,
      task_ids: reallocated,
    });

    return c.json({
      success: true,
      decision_id: decisionId,
      reallocated_count: reallocated.length,
      reallocated_tasks: reallocated,
    });
  } catch (error) {
    console.error("Failed to reallocate tasks:", error);
    return c.json({ error: "Failed to reallocate tasks" }, 500);
  }
});

// POST /api/conductor/escalate - Escalate an issue
conductorRouter.post("/escalate", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { project_id, issue_type, description, affected_tasks, affected_agents, severity, suggested_actions } = body;

  if (!project_id || !issue_type || !description) {
    return c.json({ error: "project_id, issue_type, and description required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");
    const escalationId = `esc_${nanoid(12)}`;

    // Record escalation in conductor_decisions
    db.prepare(`
      INSERT INTO conductor_decisions (
        decision_id, project_id, decision_type, description, affected_tasks, affected_agents, metadata, created_at
      ) VALUES (?, ?, 'escalation', ?, ?, ?, ?, datetime('now'))
    `).run(
      escalationId,
      project_id,
      `[${severity || "medium"}] ${issue_type}: ${description}`,
      JSON.stringify(affected_tasks || []),
      JSON.stringify(affected_agents || []),
      JSON.stringify({ severity, issue_type, suggested_actions })
    );

    // Create alert for escalation
    const alertId = `alert_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO alerts (alert_id, type, severity, title, message, project_id, created_at)
      VALUES (?, 'escalation', ?, ?, ?, ?, datetime('now'))
    `).run(
      alertId,
      severity || "medium",
      `Escalation: ${issue_type}`,
      description,
      project_id
    );

    // Broadcast escalation
    broadcastToChannel("all", {
      type: "conductor_escalation",
      escalation_id: escalationId,
      project_id,
      issue_type,
      severity: severity || "medium",
      description,
    });

    return c.json({
      success: true,
      escalation_id: escalationId,
      alert_id: alertId,
    });
  } catch (error) {
    console.error("Failed to escalate:", error);
    return c.json({ error: "Failed to escalate" }, 500);
  }
});

// POST /api/conductor/request-intervention - Request human intervention
conductorRouter.post("/request-intervention", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { project_id, request_type, description, urgency, context, requester_agent_id } = body;

  if (!project_id || !request_type || !description) {
    return c.json({ error: "project_id, request_type, and description required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");
    const interventionId = `int_${nanoid(12)}`;

    // Record intervention request
    db.prepare(`
      INSERT INTO conductor_decisions (
        decision_id, project_id, decision_type, description, affected_agents, metadata, created_at
      ) VALUES (?, ?, 'intervention_request', ?, ?, ?, datetime('now'))
    `).run(
      interventionId,
      project_id,
      `[${urgency || "normal"}] ${request_type}: ${description}`,
      JSON.stringify(requester_agent_id ? [requester_agent_id] : []),
      JSON.stringify({ request_type, urgency, context, status: "pending" })
    );

    // Create high-priority alert
    const alertId = `alert_${nanoid(12)}`;
    const alertSeverity = urgency === "critical" ? "critical" : urgency === "urgent" ? "high" : "medium";
    db.prepare(`
      INSERT INTO alerts (alert_id, type, severity, title, message, project_id, created_at)
      VALUES (?, 'intervention', ?, ?, ?, ?, datetime('now'))
    `).run(
      alertId,
      alertSeverity,
      `Human Intervention Required: ${request_type}`,
      description,
      project_id
    );

    // Broadcast intervention request
    broadcastToChannel("all", {
      type: "conductor_intervention",
      intervention_id: interventionId,
      project_id,
      request_type,
      urgency: urgency || "normal",
      description,
    });

    return c.json({
      success: true,
      intervention_id: interventionId,
      alert_id: alertId,
    });
  } catch (error) {
    console.error("Failed to request intervention:", error);
    return c.json({ error: "Failed to request intervention" }, 500);
  }
});

// GET /api/conductor/decisions - Get conductor decisions history
conductorRouter.get("/decisions", async (c) => {
  const db = getDb();
  const projectId = c.req.query("project_id");
  const decisionType = c.req.query("type");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    let query = `
      SELECT * FROM conductor_decisions
      WHERE 1=1
    `;
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (decisionType) {
      query += " AND decision_type = ?";
      params.push(decisionType);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const decisions: any[] = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedDecisions = decisions.map(d => ({
      ...d,
      affected_tasks: JSON.parse(d.affected_tasks || "[]"),
      affected_agents: JSON.parse(d.affected_agents || "[]"),
      metadata: JSON.parse(d.metadata || "{}"),
    }));

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM conductor_decisions WHERE 1=1";
    const countParams: any[] = [];
    if (projectId) {
      countQuery += " AND project_id = ?";
      countParams.push(projectId);
    }
    if (decisionType) {
      countQuery += " AND decision_type = ?";
      countParams.push(decisionType);
    }

    const total: any = db.prepare(countQuery).get(...countParams);

    return c.json({
      decisions: parsedDecisions,
      total: total?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to get decisions:", error);
    return c.json({ error: "Failed to get decisions" }, 500);
  }
});

// POST /api/conductor/override - Manual override a decision
conductorRouter.post("/override", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { decision_id, override_action, reason, operator } = body;

  if (!decision_id || !override_action) {
    return c.json({ error: "decision_id and override_action required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");

    // Get original decision
    const original: any = db.prepare(
      "SELECT * FROM conductor_decisions WHERE decision_id = ?"
    ).get(decision_id);

    if (!original) {
      return c.json({ error: "Decision not found" }, 404);
    }

    // Record override
    const overrideId = `ovr_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO conductor_decisions (
        decision_id, project_id, decision_type, description, metadata, created_at
      ) VALUES (?, ?, 'override', ?, ?, datetime('now'))
    `).run(
      overrideId,
      original.project_id,
      `Override: ${override_action}. Original: ${original.decision_type}. Reason: ${reason || "No reason provided"}`,
      JSON.stringify({
        original_decision_id: decision_id,
        override_action,
        reason,
        operator: operator || "human",
      })
    );

    // Broadcast override
    broadcastToChannel("all", {
      type: "conductor_override",
      override_id: overrideId,
      original_decision_id: decision_id,
      override_action,
    });

    return c.json({
      success: true,
      override_id: overrideId,
    });
  } catch (error) {
    console.error("Failed to override:", error);
    return c.json({ error: "Failed to override" }, 500);
  }
});

// Helper: Detect bottlenecks
function detectBottlenecks(
  db: any,
  projectId: string,
  activeAgents: AgentStatus[],
  taskStats: any
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  // Check for agent overload
  const overloadedAgents = activeAgents.filter(a => a.current_workload >= 3);
  if (overloadedAgents.length > 0) {
    bottlenecks.push({
      type: "agent_overload",
      severity: overloadedAgents.length > 2 ? "high" : "medium",
      description: `${overloadedAgents.length} agent(s) at max workload capacity`,
      affected_items: overloadedAgents.map(a => a.agent_id),
      suggested_action: "Consider redistributing tasks or adding more agents",
    });
  }

  // Check for capability gaps
  const unassignableTasks: any[] = db.prepare(`
    SELECT task_id, title, required_capabilities
    FROM task_queue
    WHERE project_id = ? AND status = 'pending' AND assigned_to IS NULL
    AND required_capabilities != '[]'
    LIMIT 10
  `).all(projectId);

  if (unassignableTasks.length > 3) {
    bottlenecks.push({
      type: "capability_gap",
      severity: unassignableTasks.length > 5 ? "high" : "medium",
      description: `${unassignableTasks.length} tasks cannot be assigned due to capability requirements`,
      affected_items: unassignableTasks.map(t => t.task_id),
      suggested_action: "Register additional capabilities for agents or adjust task requirements",
    });
  }

  // Check for queue stall
  const staleQueuedTasks: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM task_queue
    WHERE project_id = ? AND status = 'queued'
    AND updated_at < datetime('now', '-1 hour')
  `).get(projectId);

  if (staleQueuedTasks?.count > 5) {
    bottlenecks.push({
      type: "queue_stall",
      severity: staleQueuedTasks.count > 10 ? "critical" : "high",
      description: `${staleQueuedTasks.count} tasks have been queued for over an hour without progress`,
      affected_items: [],
      suggested_action: "Check agent availability and task dependencies",
    });
  }

  // Check for lock contention
  const lockStats: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM file_locks
    WHERE project_id = ? AND status = 'active'
    AND acquired_at < datetime('now', '-30 minutes')
  `).get(projectId);

  if (lockStats?.count > 3) {
    bottlenecks.push({
      type: "lock_contention",
      severity: lockStats.count > 5 ? "high" : "medium",
      description: `${lockStats.count} files have been locked for over 30 minutes`,
      affected_items: [],
      suggested_action: "Review long-held locks and consider force-releasing if tasks are stuck",
    });
  }

  return bottlenecks;
}

// Helper: Assess risks
function assessRisks(
  db: any,
  projectId: string,
  taskStats: any,
  blockedTasks: BlockedTask[]
): Risk[] {
  const risks: Risk[] = [];

  // Deadline risk
  const overdueTasksCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM task_queue
    WHERE project_id = ? AND status NOT IN ('completed', 'failed')
    AND deadline < datetime('now')
  `).get(projectId);

  if (overdueTasksCount?.count > 0) {
    risks.push({
      type: "deadline",
      probability: "high",
      impact: overdueTasksCount.count > 3 ? "critical" : "high",
      description: `${overdueTasksCount.count} tasks are past their deadline`,
      mitigation: "Prioritize overdue tasks or adjust deadlines",
    });
  }

  // Dependency risk
  if (blockedTasks.length > 2) {
    risks.push({
      type: "dependency",
      probability: "medium",
      impact: blockedTasks.length > 5 ? "high" : "medium",
      description: `${blockedTasks.length} tasks are blocked by dependencies`,
      mitigation: "Focus on completing blocking tasks first",
    });
  }

  // Resource risk
  const failureRate = taskStats.total > 0
    ? (taskStats.failed / taskStats.total) * 100
    : 0;

  if (failureRate > 10) {
    risks.push({
      type: "quality",
      probability: failureRate > 20 ? "high" : "medium",
      impact: "high",
      description: `Task failure rate is ${failureRate.toFixed(1)}%`,
      mitigation: "Review failing tasks for common patterns and improve processes",
    });
  }

  return risks;
}

export { conductorRouter };
