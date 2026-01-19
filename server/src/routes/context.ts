import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { broadcastToClients } from "../ws/handler";

export const contextRouter = new Hono();

// Schema definitions
const PostContextSchema = z.object({
  project_id: z.string().min(1),
  context_type: z.enum(["decision", "blocker", "learning", "status", "question", "answer"]),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  author_agent_id: z.string().min(1),
  visibility: z.enum(["all", "team", "specific"]).default("all"),
  target_agents: z.array(z.string()).optional(),
  priority: z.number().min(0).max(3).default(1), // 0=low, 1=normal, 2=high, 3=urgent
  tags: z.array(z.string()).optional(),
  related_task_id: z.string().optional(),
  related_file_paths: z.array(z.string()).optional(),
  expires_at: z.string().optional(), // ISO date string, null = no expiry
});

const UpdateContextSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  priority: z.number().min(0).max(3).optional(),
  status: z.enum(["active", "archived", "expired"]).optional(),
  tags: z.array(z.string()).optional(),
});

// Context type labels for display
const CONTEXT_TYPE_LABELS: Record<string, string> = {
  decision: "決定事項",
  blocker: "ブロッカー",
  learning: "学習・発見",
  status: "進捗報告",
  question: "質問",
  answer: "回答",
};

// Priority labels
const PRIORITY_LABELS: Record<number, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  3: "Urgent",
};

// Helper: Get agent name
function getAgentName(db: any, agentId: string): string {
  const agent: any = db.prepare("SELECT name FROM agents WHERE agent_id = ?").get(agentId);
  return agent?.name || agentId;
}

// POST /api/context/post - Post a new shared context
contextRouter.post("/post", async (c) => {
  try {
    const body = await c.req.json();
    const data = PostContextSchema.parse(body);

    const db = getDb();
    const contextId = `ctx_${nanoid(12)}`;
    const timestamp = new Date().toISOString();

    db.prepare(`
      INSERT INTO shared_context (
        context_id, project_id, context_type, title, content,
        author_agent_id, visibility, priority, tags,
        related_task_id, related_file_paths, expires_at, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      contextId,
      data.project_id,
      data.context_type,
      data.title,
      data.content,
      data.author_agent_id,
      data.visibility,
      data.priority,
      data.tags ? JSON.stringify(data.tags) : null,
      data.related_task_id || null,
      data.related_file_paths ? JSON.stringify(data.related_file_paths) : null,
      data.expires_at || null,
      timestamp,
      timestamp
    );

    // If specific visibility, store target agents (using tags field for now)
    // In a full implementation, you might want a separate table for this

    const context = {
      context_id: contextId,
      project_id: data.project_id,
      context_type: data.context_type,
      context_type_label: CONTEXT_TYPE_LABELS[data.context_type],
      title: data.title,
      content: data.content,
      author_agent_id: data.author_agent_id,
      author_name: getAgentName(db, data.author_agent_id),
      visibility: data.visibility,
      priority: data.priority,
      priority_label: PRIORITY_LABELS[data.priority],
      tags: data.tags || [],
      related_task_id: data.related_task_id,
      related_file_paths: data.related_file_paths || [],
      expires_at: data.expires_at,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };

    // Broadcast to relevant agents
    broadcastToClients({
      type: "context",
      action: "posted",
      data: context,
    });

    return c.json({ success: true, context }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error posting context:", error);
    return c.json({ error: "Failed to post context" }, 500);
  }
});

// GET /api/context/list - List shared contexts
contextRouter.get("/list", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");
    const contextType = c.req.query("type");
    const authorId = c.req.query("author");
    const status = c.req.query("status") || "active";
    const priority = c.req.query("priority");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    let query = "SELECT * FROM shared_context WHERE 1=1";
    const params: any[] = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (contextType) {
      query += " AND context_type = ?";
      params.push(contextType);
    }

    if (authorId) {
      query += " AND author_agent_id = ?";
      params.push(authorId);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (priority) {
      query += " AND priority >= ?";
      params.push(parseInt(priority));
    }

    // Exclude expired
    query += " AND (expires_at IS NULL OR expires_at > datetime('now'))";

    query += " ORDER BY priority DESC, created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const contexts: any[] = db.prepare(query).all(...params);

    // Parse and enrich
    const enrichedContexts = contexts.map((ctx) => ({
      ...ctx,
      context_type_label: CONTEXT_TYPE_LABELS[ctx.context_type],
      author_name: getAgentName(db, ctx.author_agent_id),
      priority_label: PRIORITY_LABELS[ctx.priority],
      tags: ctx.tags ? JSON.parse(ctx.tags) : [],
      related_file_paths: ctx.related_file_paths ? JSON.parse(ctx.related_file_paths) : [],
    }));

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM shared_context WHERE 1=1";
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
      contexts: enrichedContexts,
      total: countResult.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error listing contexts:", error);
    return c.json({ error: "Failed to list contexts" }, 500);
  }
});

// GET /api/context/for-me - Get contexts relevant to a specific agent
contextRouter.get("/for-me", async (c) => {
  try {
    const agentId = c.req.query("agent_id");
    const projectId = c.req.query("project_id");
    const since = c.req.query("since"); // ISO date string
    const limit = parseInt(c.req.query("limit") || "20");

    if (!agentId) {
      return c.json({ error: "agent_id is required" }, 400);
    }

    const db = getDb();

    // Get contexts that are:
    // 1. visibility = 'all'
    // 2. visibility = 'specific' and agent is in target (stored in tags for simplicity)
    // 3. Not authored by the requesting agent (optional - show own too)
    // 4. Not expired

    let query = `
      SELECT * FROM shared_context
      WHERE status = 'active'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND (
        visibility = 'all'
        OR (visibility = 'specific' AND tags LIKE ?)
      )
    `;
    const params: any[] = [`%"${agentId}"%`];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (since) {
      query += " AND created_at > ?";
      params.push(since);
    }

    query += " ORDER BY priority DESC, created_at DESC LIMIT ?";
    params.push(limit);

    const contexts: any[] = db.prepare(query).all(...params);

    // Enrich
    const enrichedContexts = contexts.map((ctx) => ({
      ...ctx,
      context_type_label: CONTEXT_TYPE_LABELS[ctx.context_type],
      author_name: getAgentName(db, ctx.author_agent_id),
      priority_label: PRIORITY_LABELS[ctx.priority],
      tags: ctx.tags ? JSON.parse(ctx.tags) : [],
      related_file_paths: ctx.related_file_paths ? JSON.parse(ctx.related_file_paths) : [],
      is_mine: ctx.author_agent_id === agentId,
    }));

    // Separate by type for easier consumption
    const byType: Record<string, any[]> = {
      decision: [],
      blocker: [],
      learning: [],
      status: [],
      question: [],
      answer: [],
    };

    enrichedContexts.forEach((ctx) => {
      if (byType[ctx.context_type]) {
        byType[ctx.context_type].push(ctx);
      }
    });

    return c.json({
      agent_id: agentId,
      contexts: enrichedContexts,
      by_type: byType,
      total: enrichedContexts.length,
      blockers: byType.blocker.length,
      urgent: enrichedContexts.filter((c) => c.priority >= 2).length,
    });
  } catch (error) {
    console.error("Error getting contexts for agent:", error);
    return c.json({ error: "Failed to get contexts" }, 500);
  }
});

// GET /api/context/:id - Get single context
contextRouter.get("/:id", async (c) => {
  try {
    const contextId = c.req.param("id");
    const db = getDb();

    const ctx: any = db.prepare(`
      SELECT * FROM shared_context WHERE context_id = ?
    `).get(contextId);

    if (!ctx) {
      return c.json({ error: "Context not found" }, 404);
    }

    const enriched = {
      ...ctx,
      context_type_label: CONTEXT_TYPE_LABELS[ctx.context_type],
      author_name: getAgentName(db, ctx.author_agent_id),
      priority_label: PRIORITY_LABELS[ctx.priority],
      tags: ctx.tags ? JSON.parse(ctx.tags) : [],
      related_file_paths: ctx.related_file_paths ? JSON.parse(ctx.related_file_paths) : [],
    };

    return c.json(enriched);
  } catch (error) {
    console.error("Error getting context:", error);
    return c.json({ error: "Failed to get context" }, 500);
  }
});

// PATCH /api/context/:id - Update context
contextRouter.patch("/:id", async (c) => {
  try {
    const contextId = c.req.param("id");
    const body = await c.req.json();
    const data = UpdateContextSchema.parse(body);

    const db = getDb();

    const existing: any = db.prepare(`
      SELECT * FROM shared_context WHERE context_id = ?
    `).get(contextId);

    if (!existing) {
      return c.json({ error: "Context not found" }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
      updates.push("title = ?");
      params.push(data.title);
    }

    if (data.content !== undefined) {
      updates.push("content = ?");
      params.push(data.content);
    }

    if (data.priority !== undefined) {
      updates.push("priority = ?");
      params.push(data.priority);
    }

    if (data.status !== undefined) {
      updates.push("status = ?");
      params.push(data.status);
    }

    if (data.tags !== undefined) {
      updates.push("tags = ?");
      params.push(JSON.stringify(data.tags));
    }

    if (updates.length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(contextId);

    db.prepare(`
      UPDATE shared_context SET ${updates.join(", ")} WHERE context_id = ?
    `).run(...params);

    const updated: any = db.prepare(`
      SELECT * FROM shared_context WHERE context_id = ?
    `).get(contextId);

    const enriched = {
      ...updated,
      context_type_label: CONTEXT_TYPE_LABELS[updated.context_type],
      author_name: getAgentName(db, updated.author_agent_id),
      priority_label: PRIORITY_LABELS[updated.priority],
      tags: updated.tags ? JSON.parse(updated.tags) : [],
      related_file_paths: updated.related_file_paths ? JSON.parse(updated.related_file_paths) : [],
    };

    broadcastToClients({
      type: "context",
      action: "updated",
      data: enriched,
    });

    return c.json({ success: true, context: enriched });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error updating context:", error);
    return c.json({ error: "Failed to update context" }, 500);
  }
});

// DELETE /api/context/:id - Delete/archive context
contextRouter.delete("/:id", async (c) => {
  try {
    const contextId = c.req.param("id");
    const hard = c.req.query("hard") === "true";

    const db = getDb();

    const existing: any = db.prepare(`
      SELECT * FROM shared_context WHERE context_id = ?
    `).get(contextId);

    if (!existing) {
      return c.json({ error: "Context not found" }, 404);
    }

    if (hard) {
      db.prepare("DELETE FROM shared_context WHERE context_id = ?").run(contextId);
    } else {
      db.prepare(`
        UPDATE shared_context SET status = 'archived', updated_at = ? WHERE context_id = ?
      `).run(new Date().toISOString(), contextId);
    }

    broadcastToClients({
      type: "context",
      action: hard ? "deleted" : "archived",
      data: { context_id: contextId },
    });

    return c.json({
      success: true,
      action: hard ? "deleted" : "archived",
    });
  } catch (error) {
    console.error("Error deleting context:", error);
    return c.json({ error: "Failed to delete context" }, 500);
  }
});

// POST /api/context/:id/acknowledge - Acknowledge reading a context
contextRouter.post("/:id/acknowledge", async (c) => {
  try {
    const contextId = c.req.param("id");
    const body = await c.req.json();
    const { agent_id } = body;

    if (!agent_id) {
      return c.json({ error: "agent_id is required" }, 400);
    }

    const db = getDb();

    const ctx: any = db.prepare(`
      SELECT * FROM shared_context WHERE context_id = ?
    `).get(contextId);

    if (!ctx) {
      return c.json({ error: "Context not found" }, 404);
    }

    // Store acknowledgment in tags (simple approach)
    // In a full implementation, use a separate acknowledgments table
    let tags = ctx.tags ? JSON.parse(ctx.tags) : [];
    const ackTag = `ack:${agent_id}`;
    if (!tags.includes(ackTag)) {
      tags.push(ackTag);
      db.prepare(`
        UPDATE shared_context SET tags = ?, updated_at = ? WHERE context_id = ?
      `).run(JSON.stringify(tags), new Date().toISOString(), contextId);
    }

    return c.json({
      success: true,
      context_id: contextId,
      acknowledged_by: agent_id,
    });
  } catch (error) {
    console.error("Error acknowledging context:", error);
    return c.json({ error: "Failed to acknowledge context" }, 500);
  }
});

// GET /api/context/search - Search contexts
contextRouter.get("/search/query", async (c) => {
  try {
    const db = getDb();
    const q = c.req.query("q");
    const projectId = c.req.query("project_id");
    const limit = parseInt(c.req.query("limit") || "20");

    if (!q) {
      return c.json({ error: "Search query 'q' is required" }, 400);
    }

    let query = `
      SELECT * FROM shared_context
      WHERE status = 'active'
      AND (title LIKE ? OR content LIKE ?)
    `;
    const searchTerm = `%${q}%`;
    const params: any[] = [searchTerm, searchTerm];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    query += " ORDER BY priority DESC, created_at DESC LIMIT ?";
    params.push(limit);

    const contexts: any[] = db.prepare(query).all(...params);

    const enrichedContexts = contexts.map((ctx) => ({
      ...ctx,
      context_type_label: CONTEXT_TYPE_LABELS[ctx.context_type],
      author_name: getAgentName(db, ctx.author_agent_id),
      priority_label: PRIORITY_LABELS[ctx.priority],
      tags: ctx.tags ? JSON.parse(ctx.tags) : [],
      related_file_paths: ctx.related_file_paths ? JSON.parse(ctx.related_file_paths) : [],
    }));

    return c.json({
      query: q,
      results: enrichedContexts,
      total: enrichedContexts.length,
    });
  } catch (error) {
    console.error("Error searching contexts:", error);
    return c.json({ error: "Failed to search contexts" }, 500);
  }
});

// GET /api/context/stats - Get context statistics
contextRouter.get("/stats/summary", async (c) => {
  try {
    const db = getDb();
    const projectId = c.req.query("project_id");

    let whereClause = "WHERE status = 'active'";
    const params: any[] = [];

    if (projectId) {
      whereClause += " AND project_id = ?";
      params.push(projectId);
    }

    // By type
    const byType: any[] = db.prepare(`
      SELECT context_type, COUNT(*) as count
      FROM shared_context ${whereClause}
      GROUP BY context_type
    `).all(...params);

    // By priority
    const byPriority: any[] = db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM shared_context ${whereClause}
      GROUP BY priority
    `).all(...params);

    // Recent activity
    const recentCount: any = db.prepare(`
      SELECT COUNT(*) as count
      FROM shared_context ${whereClause}
      AND created_at > datetime('now', '-24 hours')
    `).get(...params);

    // Active blockers
    const blockerCount: any = db.prepare(`
      SELECT COUNT(*) as count
      FROM shared_context ${whereClause}
      AND context_type = 'blocker'
    `).get(...params);

    const typeMap: Record<string, number> = {};
    byType.forEach((row) => {
      typeMap[row.context_type] = row.count;
    });

    const priorityMap: Record<number, number> = {};
    byPriority.forEach((row) => {
      priorityMap[row.priority] = row.count;
    });

    return c.json({
      by_type: {
        decision: typeMap.decision || 0,
        blocker: typeMap.blocker || 0,
        learning: typeMap.learning || 0,
        status: typeMap.status || 0,
        question: typeMap.question || 0,
        answer: typeMap.answer || 0,
      },
      by_priority: {
        low: priorityMap[0] || 0,
        normal: priorityMap[1] || 0,
        high: priorityMap[2] || 0,
        urgent: priorityMap[3] || 0,
      },
      recent_24h: recentCount.count,
      active_blockers: blockerCount.count,
    });
  } catch (error) {
    console.error("Error getting context stats:", error);
    return c.json({ error: "Failed to get context stats" }, 500);
  }
});
