/**
 * Health Checker - Monitors agent health and handles unresponsive agents
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

interface Agent {
  agent_id: string;
  name: string;
  status: string;
  last_heartbeat: string | null;
  current_task_count: number;
}

interface HealthRecord {
  agent_id: string;
  previous_status: string;
  new_status: string;
  reason: string;
}

// Agent is considered unresponsive if no heartbeat for 5 minutes
const HEARTBEAT_TIMEOUT_MINUTES = 5;

// Agent is considered dead if no heartbeat for 15 minutes
const DEAD_TIMEOUT_MINUTES = 15;

/**
 * Check agent health and handle unresponsive agents
 */
export async function checkAgentHealth(): Promise<{
  checked: number;
  warnings: number;
  marked_inactive: number;
  tasks_reassigned: number;
}> {
  const db = getDb();
  let checked = 0;
  let warnings = 0;
  let marked_inactive = 0;
  let tasks_reassigned = 0;

  try {
    // Get all agents with their current status
    const agents: Agent[] = db.prepare(`
      SELECT
        a.agent_id,
        a.name,
        a.status,
        a.last_heartbeat,
        (SELECT COUNT(*) FROM task_queue t
         WHERE t.assigned_to = a.agent_id AND t.status IN ('queued', 'in_progress')) as current_task_count
      FROM agents a
      WHERE a.status IN ('active', 'busy', 'idle')
    `).all() as Agent[];

    if (agents.length === 0) {
      return { checked: 0, warnings: 0, marked_inactive: 0, tasks_reassigned: 0 };
    }

    const healthRecords: HealthRecord[] = [];
    const { nanoid } = await import("nanoid");

    for (const agent of agents) {
      checked++;

      // Skip if no heartbeat recorded yet
      if (!agent.last_heartbeat) {
        continue;
      }

      const lastHeartbeat = new Date(agent.last_heartbeat);
      const now = new Date();
      const minutesSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

      if (minutesSinceHeartbeat >= DEAD_TIMEOUT_MINUTES) {
        // Agent is dead - mark as inactive and reassign tasks
        db.prepare(`
          UPDATE agents
          SET status = 'inactive', updated_at = datetime('now')
          WHERE agent_id = ?
        `).run(agent.agent_id);

        marked_inactive++;

        // Record health change
        const healthId = `health_${nanoid(12)}`;
        db.prepare(`
          INSERT INTO agent_health (health_id, agent_id, status, health, message, recorded_at)
          VALUES (?, ?, 'inactive', 'critical', ?, datetime('now'))
        `).run(healthId, agent.agent_id, `No heartbeat for ${Math.round(minutesSinceHeartbeat)} minutes`);

        healthRecords.push({
          agent_id: agent.agent_id,
          previous_status: agent.status,
          new_status: "inactive",
          reason: `No heartbeat for ${Math.round(minutesSinceHeartbeat)} minutes`,
        });

        // Reassign tasks from dead agent
        if (agent.current_task_count > 0) {
          const reassignedCount = db.prepare(`
            UPDATE task_queue
            SET assigned_to = NULL, status = 'pending', assigned_at = NULL, started_at = NULL,
                error_message = ?, updated_at = datetime('now')
            WHERE assigned_to = ? AND status IN ('queued', 'in_progress')
          `).run(`Agent ${agent.name} became unresponsive`, agent.agent_id).changes;

          tasks_reassigned += reassignedCount;

          console.log(`[HealthChecker] Reassigned ${reassignedCount} tasks from dead agent ${agent.name}`);
        }

        // Create alert
        const alertId = `alert_${nanoid(12)}`;
        db.prepare(`
          INSERT INTO alerts (alert_id, type, severity, title, message, created_at)
          VALUES (?, 'agent_dead', 'high', ?, ?, datetime('now'))
        `).run(
          alertId,
          `Agent Unresponsive: ${agent.name}`,
          `Agent ${agent.name} (${agent.agent_id}) has not sent a heartbeat for ${Math.round(minutesSinceHeartbeat)} minutes. Status changed to inactive. ${agent.current_task_count} tasks were reassigned.`
        );

        // Broadcast agent death
        broadcastToChannel("all", {
          type: "agent_inactive",
          agent_id: agent.agent_id,
          agent_name: agent.name,
          reason: "No heartbeat",
          minutes_since_heartbeat: Math.round(minutesSinceHeartbeat),
          tasks_reassigned: agent.current_task_count,
        });

        console.log(`[HealthChecker] Marked agent ${agent.name} as inactive (no heartbeat for ${Math.round(minutesSinceHeartbeat)} min)`);
      } else if (minutesSinceHeartbeat >= HEARTBEAT_TIMEOUT_MINUTES) {
        // Agent is unresponsive but not dead yet - warn
        warnings++;

        // Record warning
        const healthId = `health_${nanoid(12)}`;
        db.prepare(`
          INSERT INTO agent_health (health_id, agent_id, status, health, message, recorded_at)
          VALUES (?, ?, ?, 'warning', ?, datetime('now'))
        `).run(healthId, agent.agent_id, agent.status, `Delayed heartbeat: ${Math.round(minutesSinceHeartbeat)} minutes`);

        // Broadcast warning
        broadcastToChannel("all", {
          type: "agent_warning",
          agent_id: agent.agent_id,
          agent_name: agent.name,
          reason: "Delayed heartbeat",
          minutes_since_heartbeat: Math.round(minutesSinceHeartbeat),
        });

        console.log(`[HealthChecker] Warning: Agent ${agent.name} heartbeat delayed (${Math.round(minutesSinceHeartbeat)} min)`);
      }
    }

    if (healthRecords.length > 0 || warnings > 0) {
      console.log(`[HealthChecker] Checked ${checked} agents: ${warnings} warnings, ${marked_inactive} marked inactive, ${tasks_reassigned} tasks reassigned`);
    }

    return { checked, warnings, marked_inactive, tasks_reassigned };
  } catch (error) {
    console.error("[HealthChecker] Error:", error);
    throw error;
  }
}

/**
 * Record a heartbeat for an agent
 */
export function recordHeartbeat(
  agentId: string,
  data?: {
    current_task_id?: string;
    progress?: number;
    memory_usage_mb?: number;
    cpu_percent?: number;
    message?: string;
  }
): void {
  const db = getDb();

  // Update last_heartbeat
  db.prepare(`
    UPDATE agents
    SET last_heartbeat = datetime('now'), status = 'active', updated_at = datetime('now')
    WHERE agent_id = ?
  `).run(agentId);

  // Record detailed health if data provided
  if (data) {
    const { nanoid } = require("nanoid");
    const healthId = `health_${nanoid(12)}`;

    db.prepare(`
      INSERT INTO agent_health (health_id, agent_id, status, health, current_task_id, progress, memory_usage_mb, cpu_percent, message, recorded_at)
      VALUES (?, ?, 'active', 'healthy', ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      healthId,
      agentId,
      data.current_task_id || null,
      data.progress || null,
      data.memory_usage_mb || null,
      data.cpu_percent || null,
      data.message || null
    );
  }
}
