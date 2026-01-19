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

// ============================================
// Agent Capability Management (Phase 15-A/B)
// ============================================

const CapabilitySchema = z.object({
  tag: z.string().min(1),
  proficiency: z.number().min(0).max(100).default(50),
});

const RegisterCapabilitiesSchema = z.object({
  capabilities: z.array(CapabilitySchema),
});

// GET /api/agents/:id/capabilities - Get agent capabilities
agentsRouter.get("/:id/capabilities", async (c) => {
  try {
    const agentId = c.req.param("id");
    const db = getDb();

    const agent: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const capabilities: any[] = db.prepare(`
      SELECT ac.*, ct.category, ct.description as tag_description
      FROM agent_capabilities ac
      LEFT JOIN capability_tags ct ON ac.tag = ct.tag
      WHERE ac.agent_id = ?
      ORDER BY ac.proficiency DESC
    `).all(agentId);

    return c.json({
      agent_id: agentId,
      agent_name: agent.name,
      capabilities,
    });
  } catch (error) {
    console.error("Error fetching capabilities:", error);
    return c.json({ error: "Failed to fetch capabilities" }, 500);
  }
});

// POST /api/agents/:id/capabilities - Register agent capabilities
agentsRouter.post("/:id/capabilities", async (c) => {
  try {
    const agentId = c.req.param("id");
    const body = await c.req.json();
    const data = RegisterCapabilitiesSchema.parse(body);

    const db = getDb();

    const agent: any = db
      .prepare("SELECT * FROM agents WHERE agent_id = ?")
      .get(agentId);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const timestamp = new Date().toISOString();

    // Upsert capabilities
    const upsertStmt = db.prepare(`
      INSERT INTO agent_capabilities (agent_id, tag, proficiency, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_id, tag) DO UPDATE SET
        proficiency = excluded.proficiency,
        updated_at = excluded.updated_at
    `);

    for (const cap of data.capabilities) {
      upsertStmt.run(agentId, cap.tag, cap.proficiency, timestamp);
    }

    // Fetch updated capabilities
    const capabilities: any[] = db.prepare(`
      SELECT ac.*, ct.category, ct.description as tag_description
      FROM agent_capabilities ac
      LEFT JOIN capability_tags ct ON ac.tag = ct.tag
      WHERE ac.agent_id = ?
      ORDER BY ac.proficiency DESC
    `).all(agentId);

    broadcastToClients({
      type: "agent",
      action: "capabilities_updated",
      data: { agent_id: agentId, capabilities },
    });

    return c.json({
      success: true,
      agent_id: agentId,
      capabilities,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error registering capabilities:", error);
    return c.json({ error: "Failed to register capabilities" }, 500);
  }
});

// DELETE /api/agents/:id/capabilities/:tag - Remove a capability
agentsRouter.delete("/:id/capabilities/:tag", async (c) => {
  try {
    const agentId = c.req.param("id");
    const tag = c.req.param("tag");
    const db = getDb();

    const existing: any = db.prepare(`
      SELECT * FROM agent_capabilities WHERE agent_id = ? AND tag = ?
    `).get(agentId, tag);

    if (!existing) {
      return c.json({ error: "Capability not found" }, 404);
    }

    db.prepare(`
      DELETE FROM agent_capabilities WHERE agent_id = ? AND tag = ?
    `).run(agentId, tag);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing capability:", error);
    return c.json({ error: "Failed to remove capability" }, 500);
  }
});

// GET /api/agents/available - Get available agents (idle or low workload)
agentsRouter.get("/status/available", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const requiredTags = c.req.query("tags")?.split(",").filter(Boolean) || [];
    const maxWorkload = parseInt(c.req.query("max_workload") || "3");

    // Get agents with their current workload
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

    // Filter by workload
    let availableAgents = agents.filter((a) => a.current_workload < maxWorkload);

    // Filter by capabilities if required tags specified
    if (requiredTags.length > 0) {
      availableAgents = availableAgents.filter((agent) => {
        const caps: any[] = db.prepare(`
          SELECT tag FROM agent_capabilities WHERE agent_id = ?
        `).all(agent.agent_id);
        const agentTags = caps.map((c) => c.tag);
        return requiredTags.every((tag) => agentTags.includes(tag));
      });
    }

    // Parse JSON fields and add capability info
    const result = availableAgents.map((a) => {
      const caps: any[] = db.prepare(`
        SELECT tag, proficiency FROM agent_capabilities WHERE agent_id = ?
      `).all(a.agent_id);

      return {
        ...a,
        state: JSON.parse(a.state || "{}"),
        metrics: JSON.parse(a.metrics || "{}"),
        capabilities: caps,
        availability_score: calculateAvailabilityScore(a, caps, requiredTags),
      };
    });

    // Sort by availability score
    result.sort((a, b) => b.availability_score - a.availability_score);

    return c.json({
      available_agents: result,
      total: result.length,
      filter: { max_workload: maxWorkload, required_tags: requiredTags },
    });
  } catch (error) {
    console.error("Error fetching available agents:", error);
    return c.json({ error: "Failed to fetch available agents" }, 500);
  }
});

// Helper function to calculate availability score
function calculateAvailabilityScore(
  agent: any,
  capabilities: any[],
  requiredTags: string[]
): number {
  let score = 100;

  // Reduce score based on workload
  score -= agent.current_workload * 20;

  // Boost score based on matching capabilities proficiency
  if (requiredTags.length > 0) {
    let proficiencySum = 0;
    for (const tag of requiredTags) {
      const cap = capabilities.find((c) => c.tag === tag);
      proficiencySum += cap?.proficiency || 0;
    }
    score += proficiencySum / requiredTags.length * 0.5;
  }

  // Penalize agents that haven't sent heartbeat recently
  const lastHeartbeat = new Date(agent.last_heartbeat);
  const minutesSinceHeartbeat = (Date.now() - lastHeartbeat.getTime()) / 60000;
  if (minutesSinceHeartbeat > 5) {
    score -= Math.min(minutesSinceHeartbeat, 30);
  }

  return Math.max(0, Math.round(score));
}

// GET /api/agents/tags - Get all capability tags
agentsRouter.get("/capability/tags", async (c) => {
  try {
    const db = getDb();
    const category = c.req.query("category");

    let query = "SELECT * FROM capability_tags";
    const params: any[] = [];

    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }

    query += " ORDER BY category, tag";

    const tags: any[] = db.prepare(query).all(...params);

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const tag of tags) {
      if (!grouped[tag.category]) {
        grouped[tag.category] = [];
      }
      grouped[tag.category].push(tag);
    }

    return c.json({ tags, grouped });
  } catch (error) {
    console.error("Error fetching capability tags:", error);
    return c.json({ error: "Failed to fetch capability tags" }, 500);
  }
});

// POST /api/agents/capability/tags - Add new capability tag
agentsRouter.post("/capability/tags", async (c) => {
  try {
    const body = await c.req.json();
    const { tag, category, description } = body;

    if (!tag || !category) {
      return c.json({ error: "tag and category are required" }, 400);
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO capability_tags (tag, category, description)
      VALUES (?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET
        category = excluded.category,
        description = excluded.description
    `).run(tag, category, description || null);

    return c.json({ success: true, tag: { tag, category, description } });
  } catch (error) {
    console.error("Error adding capability tag:", error);
    return c.json({ error: "Failed to add capability tag" }, 500);
  }
});

// GET /api/agents/match - Find best matching agent for task requirements
agentsRouter.get("/match/task", async (c) => {
  try {
    const db = getDb();
    const requiredTags = c.req.query("tags")?.split(",").filter(Boolean) || [];
    const projectId = c.req.query("project_id");
    const excludeAgents = c.req.query("exclude")?.split(",").filter(Boolean) || [];

    if (requiredTags.length === 0) {
      return c.json({ error: "At least one tag is required" }, 400);
    }

    // Get all active agents with their capabilities
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

    const candidates: any[] = [];

    for (const agent of agents) {
      if (excludeAgents.includes(agent.agent_id)) {
        continue;
      }

      // Get capabilities
      const caps: any[] = db.prepare(`
        SELECT tag, proficiency FROM agent_capabilities WHERE agent_id = ?
      `).all(agent.agent_id);

      const agentTags = caps.map((c) => c.tag);

      // Check if agent has all required capabilities
      const hasAllCaps = requiredTags.every((tag) => agentTags.includes(tag));
      if (!hasAllCaps) {
        continue;
      }

      // Calculate match score
      let matchScore = 0;
      for (const tag of requiredTags) {
        const cap = caps.find((c) => c.tag === tag);
        matchScore += cap?.proficiency || 0;
      }
      matchScore = matchScore / requiredTags.length;

      // Adjust score based on workload
      const workloadPenalty = agent.current_workload * 10;
      const finalScore = matchScore - workloadPenalty;

      candidates.push({
        agent_id: agent.agent_id,
        agent_name: agent.name,
        status: agent.status,
        current_workload: agent.current_workload,
        capabilities: caps,
        match_score: Math.round(matchScore),
        final_score: Math.round(finalScore),
        last_heartbeat: agent.last_heartbeat,
      });
    }

    // Sort by final score
    candidates.sort((a, b) => b.final_score - a.final_score);

    return c.json({
      required_tags: requiredTags,
      candidates,
      best_match: candidates[0] || null,
      total_candidates: candidates.length,
    });
  } catch (error) {
    console.error("Error matching agent:", error);
    return c.json({ error: "Failed to match agent" }, 500);
  }
});
