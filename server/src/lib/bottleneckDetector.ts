import { getDb } from "./db";

export interface Bottleneck {
  type: "agent_overload" | "capability_gap" | "dependency_chain" | "lock_contention" | "queue_stall" | "communication_gap";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affected_items: string[];
  suggested_action: string;
  metrics?: Record<string, number>;
}

export interface BottleneckAnalysis {
  project_id: string;
  analyzed_at: string;
  bottlenecks: Bottleneck[];
  overall_severity: "healthy" | "warning" | "critical";
  score: number; // 0-100, higher is worse
}

/**
 * Analyze a project for bottlenecks
 */
export function analyzeProjectBottlenecks(projectId: string): BottleneckAnalysis {
  const db = getDb();
  const bottlenecks: Bottleneck[] = [];

  // 1. Agent Overload Detection
  const agentOverload = detectAgentOverload(db, projectId);
  if (agentOverload) bottlenecks.push(agentOverload);

  // 2. Capability Gap Detection
  const capabilityGap = detectCapabilityGap(db, projectId);
  if (capabilityGap) bottlenecks.push(capabilityGap);

  // 3. Dependency Chain Detection
  const dependencyChain = detectDependencyChain(db, projectId);
  if (dependencyChain) bottlenecks.push(dependencyChain);

  // 4. Lock Contention Detection
  const lockContention = detectLockContention(db, projectId);
  if (lockContention) bottlenecks.push(lockContention);

  // 5. Queue Stall Detection
  const queueStall = detectQueueStall(db, projectId);
  if (queueStall) bottlenecks.push(queueStall);

  // 6. Communication Gap Detection
  const communicationGap = detectCommunicationGap(db, projectId);
  if (communicationGap) bottlenecks.push(communicationGap);

  // Calculate overall severity and score
  const score = calculateBottleneckScore(bottlenecks);
  const overallSeverity = score >= 70 ? "critical" : score >= 40 ? "warning" : "healthy";

  return {
    project_id: projectId,
    analyzed_at: new Date().toISOString(),
    bottlenecks,
    overall_severity: overallSeverity,
    score,
  };
}

/**
 * Detect agent overload
 */
function detectAgentOverload(db: any, projectId: string): Bottleneck | null {
  const agents: any[] = db.prepare(`
    SELECT
      a.agent_id, a.name,
      COUNT(t.task_id) as task_count
    FROM agents a
    LEFT JOIN task_queue t ON t.assigned_to = a.agent_id
      AND t.status IN ('queued', 'in_progress')
    WHERE a.status = 'active'
    GROUP BY a.agent_id
    HAVING task_count >= 3
  `).all();

  if (agents.length === 0) return null;

  const totalActiveAgents: any = db.prepare(
    "SELECT COUNT(*) as count FROM agents WHERE status = 'active'"
  ).get();

  const overloadRatio = agents.length / (totalActiveAgents?.count || 1);

  return {
    type: "agent_overload",
    severity: overloadRatio > 0.5 ? "critical" : agents.length > 2 ? "high" : "medium",
    description: `${agents.length} agent(s) at or above max workload capacity (3+ tasks)`,
    affected_items: agents.map(a => a.agent_id),
    suggested_action: "Redistribute tasks to less loaded agents or add more agent capacity",
    metrics: {
      overloaded_agents: agents.length,
      total_active_agents: totalActiveAgents?.count || 0,
      overload_ratio: Math.round(overloadRatio * 100),
    },
  };
}

/**
 * Detect capability gap - tasks that can't be assigned due to missing capabilities
 */
function detectCapabilityGap(db: any, projectId: string): Bottleneck | null {
  // Find tasks with capability requirements
  const tasksWithRequirements: any[] = db.prepare(`
    SELECT task_id, title, required_capabilities
    FROM task_queue
    WHERE project_id = ?
    AND status = 'pending'
    AND assigned_to IS NULL
    AND required_capabilities != '[]'
    AND required_capabilities IS NOT NULL
  `).all(projectId);

  if (tasksWithRequirements.length === 0) return null;

  // Get available capabilities from agents
  const availableCapabilities: any[] = db.prepare(`
    SELECT DISTINCT tag FROM agent_capabilities ac
    JOIN agents a ON ac.agent_id = a.agent_id
    WHERE a.status = 'active' AND ac.proficiency >= 50
  `).all();

  const availableTags = new Set(availableCapabilities.map(c => c.tag));

  // Find tasks with unmet requirements
  const unassignable: string[] = [];
  const missingCapabilities: Set<string> = new Set();

  for (const task of tasksWithRequirements) {
    const required = JSON.parse(task.required_capabilities || "[]");
    const unmet = required.filter((r: string) => !availableTags.has(r));
    if (unmet.length > 0) {
      unassignable.push(task.task_id);
      unmet.forEach((c: string) => missingCapabilities.add(c));
    }
  }

  if (unassignable.length === 0) return null;

  return {
    type: "capability_gap",
    severity: unassignable.length > 5 ? "high" : unassignable.length > 2 ? "medium" : "low",
    description: `${unassignable.length} tasks cannot be assigned due to missing capabilities: ${Array.from(missingCapabilities).join(", ")}`,
    affected_items: unassignable,
    suggested_action: "Register missing capabilities for agents or adjust task requirements",
    metrics: {
      unassignable_tasks: unassignable.length,
      missing_capability_count: missingCapabilities.size,
    },
  };
}

/**
 * Detect long dependency chains causing delays
 */
function detectDependencyChain(db: any, projectId: string): Bottleneck | null {
  // Find tasks blocked by dependencies
  const blockedByDependency: any[] = db.prepare(`
    SELECT task_id, title, dependencies
    FROM task_queue
    WHERE project_id = ?
    AND status = 'pending'
    AND dependencies != '[]'
    AND dependencies IS NOT NULL
  `).all(projectId);

  if (blockedByDependency.length === 0) return null;

  // Check which dependencies are not completed
  const actuallyBlocked: string[] = [];
  let maxChainLength = 0;

  for (const task of blockedByDependency) {
    const deps = JSON.parse(task.dependencies || "[]");
    if (deps.length === 0) continue;

    // Check if any dependency is not completed
    const uncompletedDeps: any[] = db.prepare(`
      SELECT task_id FROM task_queue
      WHERE task_id IN (${deps.map(() => "?").join(",")})
      AND status != 'completed'
    `).all(...deps);

    if (uncompletedDeps.length > 0) {
      actuallyBlocked.push(task.task_id);
      maxChainLength = Math.max(maxChainLength, deps.length);
    }
  }

  if (actuallyBlocked.length === 0) return null;

  return {
    type: "dependency_chain",
    severity: maxChainLength > 3 ? "high" : actuallyBlocked.length > 3 ? "medium" : "low",
    description: `${actuallyBlocked.length} tasks are waiting for dependencies to complete`,
    affected_items: actuallyBlocked,
    suggested_action: "Prioritize completing blocking tasks or parallelize independent work",
    metrics: {
      blocked_tasks: actuallyBlocked.length,
      max_chain_length: maxChainLength,
    },
  };
}

/**
 * Detect lock contention - files locked for too long
 */
function detectLockContention(db: any, projectId: string): Bottleneck | null {
  const longHeldLocks: any[] = db.prepare(`
    SELECT lock_id, file_path, agent_id, acquired_at
    FROM file_locks
    WHERE project_id = ?
    AND status = 'active'
    AND acquired_at < datetime('now', '-30 minutes')
  `).all(projectId);

  if (longHeldLocks.length === 0) return null;

  // Check for conflicts
  const conflicts: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM conflict_history
    WHERE project_id = ?
    AND status = 'detected'
    AND detected_at > datetime('now', '-1 hour')
  `).get(projectId);

  return {
    type: "lock_contention",
    severity: conflicts?.count > 0 ? "high" : longHeldLocks.length > 3 ? "medium" : "low",
    description: `${longHeldLocks.length} files locked for over 30 minutes${conflicts?.count > 0 ? `, ${conflicts.count} active conflicts` : ""}`,
    affected_items: longHeldLocks.map(l => l.file_path),
    suggested_action: "Review long-held locks and release if tasks are complete or stuck",
    metrics: {
      long_held_locks: longHeldLocks.length,
      active_conflicts: conflicts?.count || 0,
    },
  };
}

/**
 * Detect queue stall - tasks stuck in queue for too long
 */
function detectQueueStall(db: any, projectId: string): Bottleneck | null {
  const staleTasks: any[] = db.prepare(`
    SELECT task_id, title, status, updated_at
    FROM task_queue
    WHERE project_id = ?
    AND status IN ('pending', 'queued')
    AND updated_at < datetime('now', '-2 hours')
  `).all(projectId);

  if (staleTasks.length === 0) return null;

  // Check if there are available agents
  const availableAgents: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM agents a
    WHERE a.status = 'active'
    AND (
      SELECT COUNT(*) FROM task_queue t
      WHERE t.assigned_to = a.agent_id
      AND t.status IN ('queued', 'in_progress')
    ) < 3
  `).get();

  const hasCapacity = (availableAgents?.count || 0) > 0;

  return {
    type: "queue_stall",
    severity: staleTasks.length > 10 ? "critical" : staleTasks.length > 5 ? "high" : "medium",
    description: `${staleTasks.length} tasks have been waiting for over 2 hours${!hasCapacity ? " (no available agent capacity)" : ""}`,
    affected_items: staleTasks.map(t => t.task_id),
    suggested_action: hasCapacity
      ? "Trigger auto-assignment or manually assign tasks"
      : "Add more agent capacity or reduce task queue",
    metrics: {
      stale_tasks: staleTasks.length,
      available_agents: availableAgents?.count || 0,
    },
  };
}

/**
 * Detect communication gap - lack of shared context updates
 */
function detectCommunicationGap(db: any, projectId: string): Bottleneck | null {
  // Get active agent count
  const activeAgents: any = db.prepare(`
    SELECT COUNT(DISTINCT assigned_to) as count
    FROM task_queue
    WHERE project_id = ?
    AND status IN ('queued', 'in_progress')
    AND assigned_to IS NOT NULL
  `).get(projectId);

  if ((activeAgents?.count || 0) < 2) return null; // Need at least 2 agents for communication

  // Check recent context sharing
  const recentContexts: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM shared_context
    WHERE project_id = ?
    AND created_at > datetime('now', '-4 hours')
  `).get(projectId);

  const contextPerAgent = (recentContexts?.count || 0) / (activeAgents?.count || 1);

  // Check for unacknowledged contexts
  const unacknowledged: any = db.prepare(`
    SELECT COUNT(*) as count
    FROM shared_context
    WHERE project_id = ?
    AND visibility != 'all'
    AND acknowledged_by = '[]'
    AND created_at > datetime('now', '-8 hours')
  `).get(projectId);

  if (contextPerAgent >= 1 && (unacknowledged?.count || 0) < 3) return null;

  return {
    type: "communication_gap",
    severity: contextPerAgent < 0.5 ? "medium" : "low",
    description: `Low communication activity: ${recentContexts?.count || 0} context updates in last 4 hours for ${activeAgents?.count || 0} agents`,
    affected_items: [],
    suggested_action: "Encourage agents to share decisions, blockers, and learnings more frequently",
    metrics: {
      recent_contexts: recentContexts?.count || 0,
      active_agents: activeAgents?.count || 0,
      context_per_agent: Math.round(contextPerAgent * 10) / 10,
      unacknowledged: unacknowledged?.count || 0,
    },
  };
}

/**
 * Calculate overall bottleneck score (0-100)
 */
function calculateBottleneckScore(bottlenecks: Bottleneck[]): number {
  if (bottlenecks.length === 0) return 0;

  const severityWeights: Record<string, number> = {
    low: 10,
    medium: 25,
    high: 40,
    critical: 60,
  };

  let totalScore = 0;
  for (const b of bottlenecks) {
    totalScore += severityWeights[b.severity] || 0;
  }

  // Cap at 100
  return Math.min(100, totalScore);
}

/**
 * Get bottleneck history for a project
 */
export function getBottleneckHistory(projectId: string, hours: number = 24): any[] {
  const db = getDb();

  // Get decisions that recorded bottleneck analyses
  const history: any[] = db.prepare(`
    SELECT decision_id, description, metadata, created_at
    FROM conductor_decisions
    WHERE project_id = ?
    AND decision_type = 'bottleneck_analysis'
    AND created_at > datetime('now', '-' || ? || ' hours')
    ORDER BY created_at DESC
  `).all(projectId, hours);

  return history.map(h => ({
    ...h,
    metadata: JSON.parse(h.metadata || "{}"),
  }));
}

/**
 * Record bottleneck analysis result
 */
export async function recordBottleneckAnalysis(analysis: BottleneckAnalysis): Promise<string> {
  const db = getDb();
  const { nanoid } = await import("nanoid");
  const decisionId = `dec_${nanoid(12)}`;

  db.prepare(`
    INSERT INTO conductor_decisions (
      decision_id, project_id, decision_type, description, metadata, created_at
    ) VALUES (?, ?, 'bottleneck_analysis', ?, ?, datetime('now'))
  `).run(
    decisionId,
    analysis.project_id,
    `Bottleneck analysis: ${analysis.overall_severity} (score: ${analysis.score}), ${analysis.bottlenecks.length} issue(s) found`,
    JSON.stringify({
      bottlenecks: analysis.bottlenecks,
      score: analysis.score,
      overall_severity: analysis.overall_severity,
    })
  );

  return decisionId;
}
