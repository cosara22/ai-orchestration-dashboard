import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { publishEvent, CHANNELS } from "../lib/redis";
import { broadcastToClients } from "../ws/handler";

export const sessionsRouter = new Hono();

// Session schema validation
const CreateSessionSchema = z.object({
  metadata: z.record(z.any()).optional(),
});

const UpdateSessionSchema = z.object({
  status: z.enum(["active", "completed", "failed"]).optional(),
  metadata: z.record(z.any()).optional(),
});

// POST /api/sessions - Create a new session
sessionsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CreateSessionSchema.parse(body);

    const db = getDb();
    const sessionId = nanoid();
    const startTime = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO sessions (session_id, start_time, status, metadata)
      VALUES (?, ?, 'active', ?)
    `);

    stmt.run(
      sessionId,
      startTime,
      JSON.stringify(validatedData.metadata || {})
    );

    const session = {
      session_id: sessionId,
      start_time: startTime,
      status: "active",
      metadata: validatedData.metadata || {},
    };

    // Publish to Redis
    await publishEvent(CHANNELS.SESSIONS, {
      action: "created",
      session,
    });

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "session",
      action: "created",
      data: session,
    });

    return c.json({ success: true, session }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error creating session:", error);
    return c.json({ error: "Failed to create session" }, 500);
  }
});

// GET /api/sessions - List sessions
sessionsRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    const status = c.req.query("status");

    let query = "SELECT * FROM sessions WHERE 1=1";
    const params: any[] = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const sessions = db.prepare(query).all(...params);

    // Parse metadata JSON
    const parsedSessions = sessions.map((s: any) => ({
      ...s,
      metadata: JSON.parse(s.metadata || "{}"),
    }));

    return c.json({ sessions: parsedSessions, limit, offset });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return c.json({ error: "Failed to fetch sessions" }, 500);
  }
});

// GET /api/sessions/:id - Get single session
sessionsRouter.get("/:id", async (c) => {
  try {
    const db = getDb();
    const sessionId = c.req.param("id");

    const session: any = db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Get tasks for this session
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId);

    // Get events count for this session
    const eventsCount: any = db
      .prepare("SELECT COUNT(*) as count FROM events WHERE session_id = ?")
      .get(sessionId);

    return c.json({
      ...session,
      metadata: JSON.parse(session.metadata || "{}"),
      tasks,
      events_count: eventsCount?.count || 0,
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    return c.json({ error: "Failed to fetch session" }, 500);
  }
});

// PATCH /api/sessions/:id - Update session
sessionsRouter.patch("/:id", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = UpdateSessionSchema.parse(body);
    const sessionId = c.req.param("id");

    const db = getDb();

    // Check if session exists
    const existing: any = db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId);

    if (!existing) {
      return c.json({ error: "Session not found" }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (validatedData.status) {
      updates.push("status = ?");
      params.push(validatedData.status);

      if (validatedData.status === "completed" || validatedData.status === "failed") {
        updates.push("end_time = ?");
        params.push(new Date().toISOString());
      }
    }

    if (validatedData.metadata) {
      updates.push("metadata = ?");
      params.push(JSON.stringify(validatedData.metadata));
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(sessionId);

    db.prepare(`
      UPDATE sessions SET ${updates.join(", ")} WHERE session_id = ?
    `).run(...params);

    const updated: any = db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId);

    const session = {
      ...updated,
      metadata: JSON.parse(updated.metadata || "{}"),
    };

    // Broadcast update
    broadcastToClients({
      type: "session",
      action: "updated",
      data: session,
    });

    return c.json({ success: true, session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error updating session:", error);
    return c.json({ error: "Failed to update session" }, 500);
  }
});
