/**
 * Task Dispatcher - Auto-assigns pending tasks to available agents
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

interface PendingTask {
  id: string;
  project_id: string;
  title: string;
  priority: number;
  required_capabilities: string;
  dependencies: string;
  estimated_minutes: number | null;
}

interface AvailableAgent {
  agent_id: string;
  name: string;
  current_workload: number;
  max_concurrent_tasks: number;
}

interface AgentCapability {
  agent_id: string;
  tag: string;
  proficiency: number;
}

/**
 * Auto-dispatch pending tasks to available agents
 */
export async function autoDispatchTasks(): Promise<{
  dispatched: number;
  skipped: number;
  errors: number;
}> {
  const db = getDb();
  let dispatched = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get pending tasks ordered by priority (higher first) and creation time
    const pendingTasks: PendingTask[] = db.prepare(`
      SELECT id, project_id, title, priority, required_capabilities, dependencies, estimated_minutes
      FROM task_queue
      WHERE status = 'pending' AND assigned_to IS NULL
      ORDER BY priority DESC, created_at ASC
      LIMIT 20
    `).all() as PendingTask[];

    if (pendingTasks.length === 0) {
      return { dispatched: 0, skipped: 0, errors: 0 };
    }

    // Get available agents with their current workload
    const availableAgents: AvailableAgent[] = db.prepare(`
      SELECT
        a.agent_id,
        a.name,
        COALESCE(
          (SELECT COUNT(*) FROM task_queue t
           WHERE t.assigned_to = a.agent_id AND t.status IN ('queued', 'in_progress')),
          0
        ) as current_workload,
        3 as max_concurrent_tasks
      FROM agents a
      WHERE a.status = 'active'
      AND (
        SELECT COUNT(*) FROM task_queue t
        WHERE t.assigned_to = a.agent_id AND t.status IN ('queued', 'in_progress')
      ) < 3
      ORDER BY current_workload ASC
    `).all() as AvailableAgent[];

    if (availableAgents.length === 0) {
      return { dispatched: 0, skipped: pendingTasks.length, errors: 0 };
    }

    // Get all agent capabilities
    const allCapabilities: AgentCapability[] = db.prepare(`
      SELECT agent_id, tag, proficiency
      FROM agent_capabilities
    `).all() as AgentCapability[];

    // Build capability map per agent
    const agentCapabilityMap = new Map<string, Map<string, number>>();
    for (const cap of allCapabilities) {
      if (!agentCapabilityMap.has(cap.agent_id)) {
        agentCapabilityMap.set(cap.agent_id, new Map());
      }
      agentCapabilityMap.get(cap.agent_id)!.set(cap.tag, cap.proficiency);
    }

    // Process each pending task
    for (const task of pendingTasks) {
      try {
        // Check dependencies
        const dependencies: string[] = JSON.parse(task.dependencies || "[]");
        if (dependencies.length > 0) {
          const incompleteDeps: { count: number } = db.prepare(`
            SELECT COUNT(*) as count
            FROM task_queue
            WHERE id IN (${dependencies.map(() => "?").join(",")})
            AND status NOT IN ('completed')
          `).get(...dependencies) as { count: number };

          if (incompleteDeps.count > 0) {
            skipped++;
            continue; // Skip - dependencies not met
          }
        }

        // Parse required capabilities
        const requiredCaps: string[] = JSON.parse(task.required_capabilities || "[]");

        // Find best matching agent
        let bestAgent: AvailableAgent | null = null;
        let bestScore = -1;

        for (const agent of availableAgents) {
          // Skip if agent is at capacity
          if (agent.current_workload >= agent.max_concurrent_tasks) {
            continue;
          }

          // Calculate capability match score
          let score = 100; // Base score
          const agentCaps = agentCapabilityMap.get(agent.agent_id);

          if (requiredCaps.length > 0) {
            if (!agentCaps) {
              score = 0; // No capabilities registered
            } else {
              let matchedCaps = 0;
              let totalProficiency = 0;

              for (const reqCap of requiredCaps) {
                const proficiency = agentCaps.get(reqCap);
                if (proficiency !== undefined) {
                  matchedCaps++;
                  totalProficiency += proficiency;
                }
              }

              if (matchedCaps < requiredCaps.length) {
                score = 0; // Missing required capabilities
              } else {
                score = totalProficiency / requiredCaps.length;
              }
            }
          }

          // Prefer agents with lower workload
          score -= agent.current_workload * 10;

          if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
          }
        }

        if (bestAgent && bestScore > 0) {
          // Assign task to agent
          db.prepare(`
            UPDATE task_queue
            SET assigned_to = ?, status = 'queued', assigned_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).run(bestAgent.agent_id, task.id);

          // Update agent workload in memory
          bestAgent.current_workload++;

          dispatched++;

          // Broadcast assignment
          broadcastToChannel("all", {
            type: "task_assigned",
            task_id: task.id,
            agent_id: bestAgent.agent_id,
            agent_name: bestAgent.name,
            title: task.title,
            auto_dispatched: true,
          });

          console.log(`[TaskDispatcher] Assigned task ${task.id} to agent ${bestAgent.name}`);
        } else {
          skipped++;
        }
      } catch (taskError) {
        console.error(`[TaskDispatcher] Error processing task ${task.id}:`, taskError);
        errors++;
      }
    }

    if (dispatched > 0) {
      console.log(`[TaskDispatcher] Dispatched ${dispatched} tasks, skipped ${skipped}, errors ${errors}`);
    }

    return { dispatched, skipped, errors };
  } catch (error) {
    console.error("[TaskDispatcher] Fatal error:", error);
    throw error;
  }
}
