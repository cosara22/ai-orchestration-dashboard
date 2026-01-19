import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { broadcastToClients } from "../ws/handler";

export const locksRouter = new Hono();

// Schema definitions
const AcquireLockSchema = z.object({
  project_id: z.string().min(1),
  file_path: z.string().min(1),
  agent_id: z.string().min(1),
  lock_type: z.enum(["exclusive", "shared"]).default("exclusive"),
  reason: z.string().optional(),
  timeout_minutes: z.number().min(1).max(480).default(30),
});

const ReleaseLockSchema = z.object({
  lock_id: z.string().optional(),
  file_path: z.string().optional(),
  agent_id: z.string().min(1),
});

const ForceReleaseSchema = z.object({
  lock_id: z.string().min(1),
  reason: z.string().min(1),
});

const RecordConflictSchema = z.object({
  project_id: z.string().min(1),
  conflict_type: z.string().min(1),
  involved_agents: z.array(z.string()),
  involved_resources: z.record(z.any()),
  description: z.string().optional(),
  resolution_strategy: z.string().optional(),
});

// Helper: Check if lock is expired
function isLockExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// Helper: Get agent name
function getAgentName(db: any, agentId: string): string {
  const agent: any = db.prepare("SELECT name FROM agents WHERE agent_id = ?").get(agentId);
  return agent?.name || agentId;
}

// POST /api/locks/acquire - Acquire a file lock
locksRouter.post("/acquire", async (c) => {
  try {
    const body = await c.req.json();
    const data = AcquireLockSchema.parse(body);

    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.timeout_minutes * 60000).toISOString();

    // Check for existing active lock on the file
    const existingLock: any = db.prepare(`
      SELECT * FROM file_locks
      WHERE project_id = ? AND file_path = ? AND status = 'active'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(data.project_id, data.file_path);

    if (existingLock) {
      // If same agent owns the lock, extend it
      if (existingLock.agent_id === data.agent_id) {
        db.prepare(`
          UPDATE file_locks
          SET expires_at = ?, reason = COALESCE(?, reason), lock_type = ?
          WHERE lock_id = ?
        `).run(expiresAt, data.reason, data.lock_type, existingLock.lock_id);

        return c.json({
          success: true,
          extended: true,
          lock_id: existingLock.lock_id,
          file_path: data.file_path,
          acquired_at: existingLock.acquired_at,
          expires_at: expiresAt,
        });
      }

      // Check lock type compatibility
      if (existingLock.lock_type === "exclusive" || data.lock_type === "exclusive") {
        // Conflict - cannot acquire
        const conflictAgentName = getAgentName(db, existingLock.agent_id);

        // Record the conflict
        const conflictId = `conf_${nanoid(12)}`;
        db.prepare(`
          INSERT INTO conflict_history (
            conflict_id, project_id, conflict_type, involved_agents,
            involved_resources, description, status, detected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          conflictId,
          data.project_id,
          "file_lock",
          JSON.stringify([existingLock.agent_id, data.agent_id]),
          JSON.stringify({ file_path: data.file_path }),
          `Lock conflict: ${data.agent_id} attempted to acquire lock held by ${existingLock.agent_id}`,
          "detected"
        );

        // Broadcast conflict event
        broadcastToClients({
          type: "lock",
          action: "conflict",
          data: {
            conflict_id: conflictId,
            file_path: data.file_path,
            requesting_agent: data.agent_id,
            holding_agent: existingLock.agent_id,
          },
        });

        return c.json({
          success: false,
          error: "Lock conflict",
          conflict: {
            lock_id: existingLock.lock_id,
            locked_by: existingLock.agent_id,
            agent_name: conflictAgentName,
            lock_type: existingLock.lock_type,
            acquired_at: existingLock.acquired_at,
            expires_at: existingLock.expires_at,
            reason: existingLock.reason,
          },
          suggestion: existingLock.expires_at
            ? `Wait until ${existingLock.expires_at} or contact the agent`
            : "Contact the holding agent to release the lock",
        }, 409);
      }

      // Shared lock can coexist with shared lock - allow
    }

    // Create new lock
    const lockId = `lock_${nanoid(12)}`;
    const timestamp = now.toISOString();

    db.prepare(`
      INSERT INTO file_locks (
        lock_id, project_id, file_path, agent_id, lock_type,
        reason, acquired_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      lockId,
      data.project_id,
      data.file_path,
      data.agent_id,
      data.lock_type,
      data.reason || null,
      timestamp,
      expiresAt
    );

    // Broadcast lock acquired
    broadcastToClients({
      type: "lock",
      action: "acquired",
      data: {
        lock_id: lockId,
        project_id: data.project_id,
        file_path: data.file_path,
        agent_id: data.agent_id,
        lock_type: data.lock_type,
        expires_at: expiresAt,
      },
    });

    return c.json({
      success: true,
      lock_id: lockId,
      file_path: data.file_path,
      acquired_at: timestamp,
      expires_at: expiresAt,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error acquiring lock:", error);
    return c.json({ error: "Failed to acquire lock" }, 500);
  }
});

// POST /api/locks/release - Release a lock
locksRouter.post("/release", async (c) => {
  try {
    const body = await c.req.json();
    const data = ReleaseLockSchema.parse(body);

    if (!data.lock_id && !data.file_path) {
      return c.json({ error: "Either lock_id or file_path is required" }, 400);
    }

    const db = getDb();
    const timestamp = new Date().toISOString();

    let lock: any;
    if (data.lock_id) {
      lock = db.prepare(`
        SELECT * FROM file_locks WHERE lock_id = ? AND status = 'active'
      `).get(data.lock_id);
    } else {
      lock = db.prepare(`
        SELECT * FROM file_locks
        WHERE file_path = ? AND agent_id = ? AND status = 'active'
        ORDER BY acquired_at DESC LIMIT 1
      `).get(data.file_path, data.agent_id);
    }

    if (!lock) {
      return c.json({ error: "Lock not found or already released" }, 404);
    }

    if (lock.agent_id !== data.agent_id) {
      return c.json({
        error: "Cannot release lock owned by another agent",
        lock_owner: lock.agent_id,
      }, 403);
    }

    // Calculate duration
    const acquiredAt = new Date(lock.acquired_at);
    const releasedAt = new Date(timestamp);
    const durationMinutes = Math.round((releasedAt.getTime() - acquiredAt.getTime()) / 60000);

    // Release the lock
    db.prepare(`
      UPDATE file_locks
      SET status = 'released', released_at = ?
      WHERE lock_id = ?
    `).run(timestamp, lock.lock_id);

    // Broadcast lock released
    broadcastToClients({
      type: "lock",
      action: "released",
      data: {
        lock_id: lock.lock_id,
        file_path: lock.file_path,
        agent_id: lock.agent_id,
      },
    });

    return c.json({
      success: true,
      lock_id: lock.lock_id,
      released_at: timestamp,
      duration_minutes: durationMinutes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error releasing lock:", error);
    return c.json({ error: "Failed to release lock" }, 500);
  }
});

// GET /api/locks/check - Check lock status for a file
locksRouter.get("/check", async (c) => {
  try {
    const projectId = c.req.query("project_id");
    const filePath = c.req.query("file_path");
    const agentId = c.req.query("agent_id");

    if (!projectId || !filePath) {
      return c.json({ error: "project_id and file_path are required" }, 400);
    }

    const db = getDb();

    // Get active lock
    const lock: any = db.prepare(`
      SELECT * FROM file_locks
      WHERE project_id = ? AND file_path = ? AND status = 'active'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(projectId, filePath);

    if (!lock) {
      return c.json({
        file_path: filePath,
        locked: false,
      });
    }

    const agentName = getAgentName(db, lock.agent_id);

    return c.json({
      file_path: filePath,
      locked: true,
      lock_id: lock.lock_id,
      lock_type: lock.lock_type,
      locked_by: lock.agent_id,
      agent_name: agentName,
      is_mine: agentId ? lock.agent_id === agentId : undefined,
      acquired_at: lock.acquired_at,
      expires_at: lock.expires_at,
      reason: lock.reason,
    });
  } catch (error) {
    console.error("Error checking lock:", error);
    return c.json({ error: "Failed to check lock" }, 500);
  }
});

// GET /api/locks/list - List locks
locksRouter.get("/list", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const status = c.req.query("status");
    const agentId = c.req.query("agent_id");
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");

    let query = "SELECT * FROM file_locks WHERE 1=1";
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    } else {
      // Default to active locks only
      query += " AND status = 'active'";
    }

    if (agentId) {
      query += " AND agent_id = ?";
      params.push(agentId);
    }

    query += " ORDER BY acquired_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const locks: any[] = db.prepare(query).all(...params);

    // Get agent names
    const locksWithNames = locks.map((lock) => ({
      ...lock,
      agent_name: getAgentName(db, lock.agent_id),
      is_expired: isLockExpired(lock.expires_at),
    }));

    // Get counts
    let countQuery = "SELECT status, COUNT(*) as count FROM file_locks WHERE 1=1";
    const countParams: any[] = [];
    if (projectId) {
      countQuery += " AND project_id = ?";
      countParams.push(projectId);
    }
    countQuery += " GROUP BY status";
    const counts: any[] = db.prepare(countQuery).all(...countParams);

    const statusCounts: Record<string, number> = {
      active: 0,
      released: 0,
      expired: 0,
      force_released: 0,
    };
    counts.forEach((row) => {
      statusCounts[row.status] = row.count;
    });

    return c.json({
      locks: locksWithNames,
      total: locksWithNames.length,
      ...statusCounts,
    });
  } catch (error) {
    console.error("Error listing locks:", error);
    return c.json({ error: "Failed to list locks" }, 500);
  }
});

// GET /api/locks/agent/:id - Get locks held by an agent
locksRouter.get("/agent/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const db = getDb();

    const locks: any[] = db.prepare(`
      SELECT * FROM file_locks
      WHERE agent_id = ? AND status = 'active'
      ORDER BY acquired_at DESC
    `).all(agentId);

    const locksWithExpiry = locks.map((lock) => ({
      ...lock,
      is_expired: isLockExpired(lock.expires_at),
    }));

    return c.json({
      agent_id: agentId,
      locks: locksWithExpiry,
      total_locks: locksWithExpiry.length,
    });
  } catch (error) {
    console.error("Error getting agent locks:", error);
    return c.json({ error: "Failed to get agent locks" }, 500);
  }
});

// POST /api/locks/force-release - Force release a lock (admin)
locksRouter.post("/force-release", async (c) => {
  try {
    const body = await c.req.json();
    const data = ForceReleaseSchema.parse(body);

    const db = getDb();
    const timestamp = new Date().toISOString();

    const lock: any = db.prepare(`
      SELECT * FROM file_locks WHERE lock_id = ? AND status = 'active'
    `).get(data.lock_id);

    if (!lock) {
      return c.json({ error: "Lock not found or already released" }, 404);
    }

    // Force release
    db.prepare(`
      UPDATE file_locks
      SET status = 'force_released', released_at = ?
      WHERE lock_id = ?
    `).run(timestamp, data.lock_id);

    // Record the force release in conflict history
    const conflictId = `conf_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO conflict_history (
        conflict_id, project_id, conflict_type, involved_agents,
        involved_resources, description, resolution_strategy,
        resolution_result, status, detected_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      conflictId,
      lock.project_id,
      "force_release",
      JSON.stringify([lock.agent_id]),
      JSON.stringify({ file_path: lock.file_path, lock_id: lock.lock_id }),
      `Lock force released: ${data.reason}`,
      "admin_override",
      "Lock force released by administrator",
      "resolved"
    );

    // Broadcast force release
    broadcastToClients({
      type: "lock",
      action: "force_released",
      data: {
        lock_id: lock.lock_id,
        file_path: lock.file_path,
        agent_id: lock.agent_id,
        reason: data.reason,
      },
    });

    return c.json({
      success: true,
      lock_id: lock.lock_id,
      force_released_at: timestamp,
      reason: data.reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error force releasing lock:", error);
    return c.json({ error: "Failed to force release lock" }, 500);
  }
});

// POST /api/locks/cleanup - Clean up expired locks
locksRouter.post("/cleanup", async (c) => {
  try {
    const db = getDb();
    const timestamp = new Date().toISOString();

    // Find expired locks
    const expiredLocks: any[] = db.prepare(`
      SELECT * FROM file_locks
      WHERE status = 'active' AND expires_at < datetime('now')
    `).all();

    // Update them to expired
    const updateStmt = db.prepare(`
      UPDATE file_locks
      SET status = 'expired', released_at = ?
      WHERE lock_id = ?
    `);

    for (const lock of expiredLocks) {
      updateStmt.run(timestamp, lock.lock_id);

      // Broadcast expiration
      broadcastToClients({
        type: "lock",
        action: "expired",
        data: {
          lock_id: lock.lock_id,
          file_path: lock.file_path,
          agent_id: lock.agent_id,
        },
      });
    }

    return c.json({
      success: true,
      expired_count: expiredLocks.length,
      cleaned_at: timestamp,
    });
  } catch (error) {
    console.error("Error cleaning up locks:", error);
    return c.json({ error: "Failed to cleanup locks" }, 500);
  }
});

// GET /api/locks/conflicts - Get conflict history
locksRouter.get("/conflicts", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const status = c.req.query("status");
    const limit = parseInt(c.req.query("limit") || "50");

    let query = "SELECT * FROM conflict_history WHERE 1=1";
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY detected_at DESC LIMIT ?";
    params.push(limit);

    const conflicts: any[] = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedConflicts = conflicts.map((conf) => ({
      ...conf,
      involved_agents: JSON.parse(conf.involved_agents || "[]"),
      involved_resources: JSON.parse(conf.involved_resources || "{}"),
    }));

    return c.json({
      conflicts: parsedConflicts,
      total: parsedConflicts.length,
    });
  } catch (error) {
    console.error("Error getting conflicts:", error);
    return c.json({ error: "Failed to get conflicts" }, 500);
  }
});

// POST /api/locks/conflicts/record - Record a conflict
locksRouter.post("/conflicts/record", async (c) => {
  try {
    const body = await c.req.json();
    const data = RecordConflictSchema.parse(body);

    const db = getDb();
    const conflictId = `conf_${nanoid(12)}`;

    db.prepare(`
      INSERT INTO conflict_history (
        conflict_id, project_id, conflict_type, involved_agents,
        involved_resources, description, resolution_strategy, status, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'detected', datetime('now'))
    `).run(
      conflictId,
      data.project_id,
      data.conflict_type,
      JSON.stringify(data.involved_agents),
      JSON.stringify(data.involved_resources),
      data.description || null,
      data.resolution_strategy || null
    );

    return c.json({
      success: true,
      conflict_id: conflictId,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error recording conflict:", error);
    return c.json({ error: "Failed to record conflict" }, 500);
  }
});

// POST /api/locks/conflicts/:id/resolve - Resolve a conflict
locksRouter.post("/conflicts/:id/resolve", async (c) => {
  try {
    const conflictId = c.req.param("id");
    const body = await c.req.json();
    const { resolution_result } = body;

    if (!resolution_result) {
      return c.json({ error: "resolution_result is required" }, 400);
    }

    const db = getDb();

    const conflict: any = db.prepare(`
      SELECT * FROM conflict_history WHERE conflict_id = ?
    `).get(conflictId);

    if (!conflict) {
      return c.json({ error: "Conflict not found" }, 404);
    }

    db.prepare(`
      UPDATE conflict_history
      SET status = 'resolved', resolution_result = ?, resolved_at = datetime('now')
      WHERE conflict_id = ?
    `).run(resolution_result, conflictId);

    return c.json({
      success: true,
      conflict_id: conflictId,
      status: "resolved",
    });
  } catch (error) {
    console.error("Error resolving conflict:", error);
    return c.json({ error: "Failed to resolve conflict" }, 500);
  }
});
