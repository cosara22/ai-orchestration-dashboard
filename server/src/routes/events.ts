import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { publishEvent, CHANNELS } from "../lib/redis";
import { broadcastToClients } from "../ws/handler";

export const eventsRouter = new Hono();

// Event schema validation
const EventSchema = z.object({
  event_type: z.string(),
  session_id: z.string().optional(),
  timestamp: z.string().optional(),
  payload: z.record(z.any()),
});

// POST /api/events - Create a new event
eventsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = EventSchema.parse(body);

    const db = getDb();
    const eventId = nanoid();
    const timestamp = validatedData.timestamp || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO events (event_id, event_type, session_id, timestamp, payload)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      eventId,
      validatedData.event_type,
      validatedData.session_id || null,
      timestamp,
      JSON.stringify(validatedData.payload)
    );

    const event = {
      id: eventId,
      event_type: validatedData.event_type,
      session_id: validatedData.session_id,
      timestamp,
      payload: validatedData.payload,
    };

    // Publish to Redis for real-time updates
    await publishEvent(CHANNELS.EVENTS, event);

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "event",
      data: event,
    });

    return c.json({ success: true, event }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error creating event:", error);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// GET /api/events - List events
eventsRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const eventType = c.req.query("event_type");
    const sessionId = c.req.query("session_id");
    const project = c.req.query("project");

    let query = "SELECT * FROM events WHERE 1=1";
    const params: any[] = [];

    if (eventType) {
      query += " AND event_type = ?";
      params.push(eventType);
    }

    if (sessionId) {
      query += " AND session_id = ?";
      params.push(sessionId);
    }

    if (project) {
      query += " AND json_extract(payload, '$.source_app') = ?";
      params.push(project);
    }

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const events = db.prepare(query).all(...params);

    // Parse payload JSON
    const parsedEvents = events.map((e: any) => ({
      ...e,
      payload: JSON.parse(e.payload),
    }));

    return c.json({ events: parsedEvents, limit, offset });
  } catch (error) {
    console.error("Error fetching events:", error);
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// GET /api/events/:id - Get single event
eventsRouter.get("/:id", async (c) => {
  try {
    const db = getDb();
    const eventId = c.req.param("id");

    const event: any = db
      .prepare("SELECT * FROM events WHERE event_id = ?")
      .get(eventId);

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({
      ...event,
      payload: JSON.parse(event.payload),
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    return c.json({ error: "Failed to fetch event" }, 500);
  }
});
