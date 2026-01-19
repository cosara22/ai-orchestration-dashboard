import { getDb } from "./db";

export interface LearningResult {
  agent_id: string;
  tag: string;
  old_proficiency: number;
  new_proficiency: number;
  change: number;
  reason: string;
}

export interface TaskCompletionData {
  task_id: string;
  agent_id: string;
  success: boolean;
  completion_time_minutes: number;
  estimated_minutes: number | null;
  required_capabilities: string[];
}

// Learning configuration
const LEARNING_CONFIG = {
  // Success bonuses
  SUCCESS_ON_TIME_BONUS: 2,      // Completed within estimated time
  SUCCESS_OVERTIME_BONUS: 1,     // Completed but took longer
  SUCCESS_NO_ESTIMATE_BONUS: 1,  // No estimate, still a bonus

  // Failure penalties
  FAILURE_PENALTY: -3,
  CONSECUTIVE_FAILURE_EXTRA_PENALTY: -2,  // Extra penalty for 3+ consecutive failures

  // Bounds
  MIN_PROFICIENCY: 0,
  MAX_PROFICIENCY: 100,

  // Time thresholds
  OVERTIME_THRESHOLD: 1.5,  // 150% of estimated time = overtime
  FAST_COMPLETION_THRESHOLD: 0.7,  // 70% of estimated time = fast
  FAST_COMPLETION_BONUS: 1,  // Extra bonus for fast completion
};

/**
 * Update agent capability proficiency based on task completion result
 */
export async function updateCapabilityFromTaskResult(
  data: TaskCompletionData
): Promise<LearningResult[]> {
  const db = getDb();
  const results: LearningResult[] = [];

  if (!data.required_capabilities || data.required_capabilities.length === 0) {
    return results;
  }

  // Check for consecutive failures
  const recentTasks: any[] = db.prepare(`
    SELECT status FROM task_queue
    WHERE assigned_to = ?
    ORDER BY completed_at DESC
    LIMIT 5
  `).all(data.agent_id);

  const consecutiveFailures = recentTasks
    .slice(0, 3)
    .filter((t) => t.status === "failed").length;

  for (const tag of data.required_capabilities) {
    // Get current proficiency
    const current: any = db.prepare(`
      SELECT proficiency FROM agent_capabilities
      WHERE agent_id = ? AND tag = ?
    `).get(data.agent_id, tag);

    const oldProficiency = current?.proficiency ?? 50; // Default 50 if not set
    let change = 0;
    let reason = "";

    if (data.success) {
      // Success case
      if (data.estimated_minutes && data.completion_time_minutes <= data.estimated_minutes) {
        // Completed on time or faster
        change = LEARNING_CONFIG.SUCCESS_ON_TIME_BONUS;
        reason = "Task completed within estimated time";

        // Extra bonus for fast completion
        if (data.completion_time_minutes <= data.estimated_minutes * LEARNING_CONFIG.FAST_COMPLETION_THRESHOLD) {
          change += LEARNING_CONFIG.FAST_COMPLETION_BONUS;
          reason = "Task completed significantly faster than estimated";
        }
      } else if (data.estimated_minutes && data.completion_time_minutes > data.estimated_minutes * LEARNING_CONFIG.OVERTIME_THRESHOLD) {
        // Significant overtime - still success but minimal bonus
        change = LEARNING_CONFIG.SUCCESS_OVERTIME_BONUS;
        reason = "Task completed but took longer than expected";
      } else {
        // No estimate or within threshold
        change = LEARNING_CONFIG.SUCCESS_NO_ESTIMATE_BONUS;
        reason = "Task completed successfully";
      }
    } else {
      // Failure case
      change = LEARNING_CONFIG.FAILURE_PENALTY;
      reason = "Task failed";

      if (consecutiveFailures >= 3) {
        change += LEARNING_CONFIG.CONSECUTIVE_FAILURE_EXTRA_PENALTY;
        reason = "Task failed (consecutive failures)";
      }
    }

    // Calculate new proficiency with bounds
    const newProficiency = Math.max(
      LEARNING_CONFIG.MIN_PROFICIENCY,
      Math.min(LEARNING_CONFIG.MAX_PROFICIENCY, oldProficiency + change)
    );

    // Update or insert capability
    db.prepare(`
      INSERT INTO agent_capabilities (agent_id, tag, proficiency, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(agent_id, tag) DO UPDATE SET
        proficiency = excluded.proficiency,
        updated_at = excluded.updated_at
    `).run(data.agent_id, tag, newProficiency);

    results.push({
      agent_id: data.agent_id,
      tag,
      old_proficiency: oldProficiency,
      new_proficiency: newProficiency,
      change: newProficiency - oldProficiency,
      reason,
    });
  }

  // Record learning history (optional - store in semantic_records for auditing)
  if (results.length > 0) {
    try {
      const { nanoid } = await import("nanoid");
      db.prepare(`
        INSERT INTO semantic_records (
          record_id, project_id, record_type, title, content, tags, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        `rec_${nanoid(12)}`,
        "system",
        "capability_learning",
        `Capability update for ${data.agent_id}`,
        JSON.stringify(results),
        JSON.stringify(data.required_capabilities),
        JSON.stringify({
          task_id: data.task_id,
          success: data.success,
          completion_time: data.completion_time_minutes,
          estimated_time: data.estimated_minutes,
        })
      );
    } catch {
      // Ignore if semantic_records doesn't have all fields
    }
  }

  return results;
}

/**
 * Get capability learning history for an agent
 */
export function getCapabilityHistory(agentId: string, limit: number = 20): any[] {
  const db = getDb();

  const records: any[] = db.prepare(`
    SELECT * FROM semantic_records
    WHERE record_type = 'capability_learning'
    AND title LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(`%${agentId}%`, limit);

  return records.map((r) => ({
    ...r,
    content: JSON.parse(r.content || "[]"),
    tags: JSON.parse(r.tags || "[]"),
    metadata: JSON.parse(r.metadata || "{}"),
  }));
}

/**
 * Recalculate proficiency based on historical task performance
 */
export function recalculateProficiency(agentId: string, tag: string): number {
  const db = getDb();

  // Get all completed tasks with this capability requirement
  const tasks: any[] = db.prepare(`
    SELECT status, actual_minutes, estimated_minutes
    FROM task_queue
    WHERE assigned_to = ?
    AND required_capabilities LIKE ?
    AND status IN ('completed', 'failed')
    ORDER BY completed_at DESC
    LIMIT 20
  `).all(agentId, `%"${tag}"%`);

  if (tasks.length === 0) {
    return 50; // Default
  }

  // Calculate success rate
  const completed = tasks.filter((t) => t.status === "completed").length;
  const successRate = completed / tasks.length;

  // Calculate average time efficiency for successful tasks
  const successfulTasks = tasks.filter((t) => t.status === "completed" && t.estimated_minutes);
  let timeEfficiency = 1.0;
  if (successfulTasks.length > 0) {
    const totalRatio = successfulTasks.reduce((sum, t) => {
      return sum + (t.estimated_minutes / Math.max(t.actual_minutes, 1));
    }, 0);
    timeEfficiency = Math.min(1.5, totalRatio / successfulTasks.length);
  }

  // Proficiency = base 50 + success bonus (up to 40) + efficiency bonus (up to 10)
  const proficiency = Math.round(
    50 +
    (successRate * 40) +
    ((timeEfficiency - 0.5) * 20)
  );

  return Math.max(0, Math.min(100, proficiency));
}

/**
 * Suggest capabilities for an agent based on successful tasks
 */
export function suggestCapabilities(agentId: string): string[] {
  const db = getDb();

  // Get tags from successfully completed tasks that agent doesn't have
  const suggestions: any[] = db.prepare(`
    SELECT DISTINCT json_each.value as tag
    FROM task_queue, json_each(task_queue.required_capabilities)
    WHERE task_queue.assigned_to = ?
    AND task_queue.status = 'completed'
    AND json_each.value NOT IN (
      SELECT tag FROM agent_capabilities WHERE agent_id = ?
    )
    LIMIT 10
  `).all(agentId, agentId);

  return suggestions.map((s) => s.tag);
}
