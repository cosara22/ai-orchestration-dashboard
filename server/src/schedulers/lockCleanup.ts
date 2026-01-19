/**
 * Lock Cleanup - Removes expired file locks
 * Phase 15-G: Automation & Monitoring
 */

import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

interface ExpiredLock {
  lock_id: string;
  project_id: string;
  file_path: string;
  agent_id: string;
  agent_name: string | null;
  lock_type: string;
  acquired_at: string;
  expires_at: string;
}

/**
 * Clean up expired file locks
 */
export async function cleanupExpiredLocks(): Promise<{
  expired: number;
  released: number;
  conflicts_recorded: number;
}> {
  const db = getDb();
  let expired = 0;
  let released = 0;
  let conflicts_recorded = 0;

  try {
    // Find expired locks
    const expiredLocks: ExpiredLock[] = db.prepare(`
      SELECT
        fl.lock_id, fl.project_id, fl.file_path, fl.agent_id, fl.lock_type,
        fl.acquired_at, fl.expires_at,
        a.name as agent_name
      FROM file_locks fl
      LEFT JOIN agents a ON fl.agent_id = a.agent_id
      WHERE fl.status = 'active'
      AND fl.expires_at IS NOT NULL
      AND datetime(fl.expires_at) < datetime('now')
    `).all() as ExpiredLock[];

    if (expiredLocks.length === 0) {
      return { expired: 0, released: 0, conflicts_recorded: 0 };
    }

    console.log(`[LockCleanup] Found ${expiredLocks.length} expired locks`);
    const { nanoid } = await import("nanoid");

    for (const lock of expiredLocks) {
      expired++;

      try {
        // Check if there are pending lock requests for this file
        const pendingRequests: { count: number } = db.prepare(`
          SELECT COUNT(*) as count
          FROM file_locks
          WHERE project_id = ? AND file_path = ? AND status = 'pending'
        `).get(lock.project_id, lock.file_path) as { count: number };

        // Release the lock
        db.prepare(`
          UPDATE file_locks
          SET status = 'expired', released_at = datetime('now')
          WHERE lock_id = ?
        `).run(lock.lock_id);

        released++;

        // Record conflict if there were waiting agents
        if (pendingRequests.count > 0) {
          const conflictId = `conflict_${nanoid(12)}`;
          db.prepare(`
            INSERT INTO conflict_history (
              conflict_id, project_id, conflict_type, involved_agents, involved_resources,
              description, resolution_strategy, resolution_result, detected_at, resolved_at, status
            ) VALUES (?, ?, 'lock_timeout', ?, ?, ?, 'auto_release', 'released_expired_lock', datetime('now'), datetime('now'), 'resolved')
          `).run(
            conflictId,
            lock.project_id,
            JSON.stringify([lock.agent_id]),
            JSON.stringify([lock.file_path]),
            `Lock on ${lock.file_path} by ${lock.agent_name || lock.agent_id} expired while ${pendingRequests.count} agent(s) were waiting`
          );

          conflicts_recorded++;
        }

        // Broadcast lock release
        broadcastToChannel("all", {
          type: "lock_expired",
          lock_id: lock.lock_id,
          project_id: lock.project_id,
          file_path: lock.file_path,
          agent_id: lock.agent_id,
          agent_name: lock.agent_name,
          acquired_at: lock.acquired_at,
          expires_at: lock.expires_at,
          waiting_requests: pendingRequests.count,
        });

        console.log(`[LockCleanup] Released expired lock ${lock.lock_id} on ${lock.file_path}`);
      } catch (lockError) {
        console.error(`[LockCleanup] Error releasing lock ${lock.lock_id}:`, lockError);
      }
    }

    // Also clean up old released/expired locks (older than 24 hours)
    const oldLocks = db.prepare(`
      DELETE FROM file_locks
      WHERE status IN ('released', 'expired')
      AND datetime(released_at) < datetime('now', '-24 hours')
    `).run();

    if (oldLocks.changes > 0) {
      console.log(`[LockCleanup] Deleted ${oldLocks.changes} old lock records`);
    }

    console.log(`[LockCleanup] Processed: expired=${expired}, released=${released}, conflicts=${conflicts_recorded}`);
    return { expired, released, conflicts_recorded };
  } catch (error) {
    console.error("[LockCleanup] Error:", error);
    throw error;
  }
}

/**
 * Force release all locks held by a specific agent
 * (Used when agent becomes inactive)
 */
export function forceReleaseAgentLocks(agentId: string): number {
  const db = getDb();

  const result = db.prepare(`
    UPDATE file_locks
    SET status = 'force_released', released_at = datetime('now')
    WHERE agent_id = ? AND status = 'active'
  `).run(agentId);

  if (result.changes > 0) {
    broadcastToChannel("all", {
      type: "locks_force_released",
      agent_id: agentId,
      count: result.changes,
      reason: "Agent inactive",
    });

    console.log(`[LockCleanup] Force released ${result.changes} locks for agent ${agentId}`);
  }

  return result.changes;
}
