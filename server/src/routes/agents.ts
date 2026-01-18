import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { publishEvent, CHANNELS } from "../lib/redis";
import { broadcastToClients } from "../ws/handler";

export const agentsRouter = new Hono();

// Agent schema validation
const CreateAgentSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  state: z.record(z.any()).optional(),
  metrics: z.record(z.any()).optional(),
});

const UpdateAgentSchema = z.object({
  name: z.string().optional(),
  status: z.enum(["active", "idle", "error"]).optional(),
  current_task_id: z.string().nullable().optional(),
  state: z.record(z.any()).optional(),
  metrics: z.record(z.any()).optional(),
});

// POST /api/agents - Create or register a new agent
agentsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CreateAgentSchema.parse(body);

    const db = getDb();
    const agentId = nanoid();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO agents (agent_id, name, type, status, state, metrics, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agentId,
      validatedData.name,
      validatedData.type || "default",
      JSON.stringify(validatedData.state || {}),
      JSON.stringify(validatedData.metrics || { tasks_completed: 0, tasks_failed: 0 }),
      now,
      now,
      now
    );

    const agent = {
      agent_id: agentId,
      name: validatedData.name,
      type: validatedData.type || "default",
      status: "idle",
      current_task_id: null,
      state: validatedData.state || {},
      metrics: validatedData.metrics || { tasks_completed: 0, tasks_failed: 0 },
      last_heartbeat: now,
      created_at: now,
      updated_at: now,
    };

    // Publish to Redis
    await publishEvent(CHANNELS.SESSIONS, {
      action: "agent_created",
      agent,
    });

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "agent",
      action: "created",
      data: agent,
    });

    return c.json({ success: true, agent }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error creating agent:", error);
    return c.json({ error: "Failed to create agent" }, 500);
  }
});

// GET /api/agents - List agents
agentsRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const status = c.req.query("status");

    let query = "SELECT * FROM agents WHERE 1=1";
    const params: any[] = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY last_heartbeat DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const agents = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsedAgents = agents.map((a: any) => ({
      ...a,
      state: JSON.parse(a.state || "{}"),
      metrics: JSON.parse(a.metrics || "{}"),
    }));

    // Get counts by status
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count FROM agents GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const counts = {
      active: 0,
      idle: 0,
      error: 0,
      total: parsedAgents.length,
    };

    statusCounts.forEach((row) => {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] = row.count;
      }
    });

    return c.json({ agents: parsedAgents, counts, limit, offset });
  } catch (error) {
    console.error("Error fetching agents:", error);
    return c.json({ error: "Failed to fetch agents" }, 500);
  }
});

// GET /api/agents/:id - Get single agent
agentsRouter.get("/:id", async (c) => {
  try {
    const db = getDb();
    const agentId = c.req.param("id");

    const agent: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    // Get current task if assigned
    let currentTask = null;
    if (agent.current_task_id) {
      currentTask = db
        .prepare("SELECT * FROM tasks WHERE task_id = ?")
        .get(agent.current_task_id);
    }

    // Get recent tasks handled by this agent (from state if tracked)
    const state = JSON.parse(agent.state || "{}");

    return c.json({
      ...agent,
      state: JSON.parse(agent.state || "{}"),
      metrics: JSON.parse(agent.metrics || "{}"),
      current_task: currentTask,
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    return c.json({ error: "Failed to fetch agent" }, 500);
  }
});

// PATCH /api/agents/:id - Update agent
agentsRouter.patch("/:id", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = UpdateAgentSchema.parse(body);
    const agentId = c.req.param("id");

    const db = getDb();

    // Check if agent exists
    const existing: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!existing) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (validatedData.name) {
      updates.push("name = ?");
      params.push(validatedData.name);
    }

    if (validatedData.status) {
      updates.push("status = ?");
      params.push(validatedData.status);
    }

    if (validatedData.current_task_id !== undefined) {
      updates.push("current_task_id = ?");
      params.push(validatedData.current_task_id);
    }

    if (validatedData.state) {
      updates.push("state = ?");
      params.push(JSON.stringify(validatedData.state));
    }

    if (validatedData.metrics) {
      // Merge with existing metrics
      const existingMetrics = JSON.parse(existing.metrics || "{}");
      const mergedMetrics = { ...existingMetrics, ...validatedData.metrics };
      updates.push("metrics = ?");
      params.push(JSON.stringify(mergedMetrics));
    }

    updates.push("last_heartbeat = ?");
    params.push(new Date().toISOString());

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(agentId);

    db.prepare(`
      UPDATE agents SET ${updates.join(", ")} WHERE agent_id = ?
    `).run(...params);

    const updated: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    const agent = {
      ...updated,
      state: JSON.parse(updated.state || "{}"),
      metrics: JSON.parse(updated.metrics || "{}"),
    };

    // Broadcast update
    broadcastToClients({
      type: "agent",
      action: "updated",
      data: agent,
    });

    return c.json({ success: true, agent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error updating agent:", error);
    return c.json({ error: "Failed to update agent" }, 500);
  }
});

// POST /api/agents/:id/heartbeat - Update agent heartbeat
agentsRouter.post("/:id/heartbeat", async (c) => {
  try {
    const agentId = c.req.param("id");
    const db = getDb();

    const existing: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!existing) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE agents SET last_heartbeat = ?, updated_at = ? WHERE agent_id = ?
    `).run(now, now, agentId);

    return c.json({ success: true, last_heartbeat: now });
  } catch (error) {
    console.error("Error updating heartbeat:", error);
    return c.json({ error: "Failed to update heartbeat" }, 500);
  }
});

// DELETE /api/agents/:id - Remove agent
agentsRouter.delete("/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const db = getDb();

    const existing: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!existing) {
      return c.json({ error: "Agent not found" }, 404);
    }

    db.prepare("DELETE FROM agents WHERE agent_id = ?").run(agentId);

    // Broadcast deletion
    broadcastToClients({
      type: "agent",
      action: "deleted",
      data: { agent_id: agentId },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    return c.json({ error: "Failed to delete agent" }, 500);
  }
});
