import { Hono } from "hono";
import { getDb } from "../lib/db";

export const searchRouter = new Hono();

// GET /api/search - Full-text search across events, sessions, tasks
searchRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const query = c.req.query("q");
    const type = c.req.query("type"); // 'events', 'sessions', 'tasks', 'all'
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Search query is required" }, 400);
    }

    const searchTerm = `%${query.trim()}%`;
    const results: {
      events: any[];
      sessions: any[];
      tasks: any[];
      total: { events: number; sessions: number; tasks: number };
    } = {
      events: [],
      sessions: [],
      tasks: [],
      total: { events: 0, sessions: 0, tasks: 0 },
    };

    // Search events
    if (!type || type === "all" || type === "events") {
      const eventsQuery = `
        SELECT * FROM events
        WHERE event_type LIKE ?
           OR session_id LIKE ?
           OR payload LIKE ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      const events = db.prepare(eventsQuery).all(searchTerm, searchTerm, searchTerm, limit, offset);
      results.events = events.map((e: any) => ({
        ...e,
        payload: JSON.parse(e.payload || "{}"),
        _type: "event",
      }));

      // Count total
      const eventsCountQuery = `
        SELECT COUNT(*) as count FROM events
        WHERE event_type LIKE ?
           OR session_id LIKE ?
           OR payload LIKE ?
      `;
      const eventsCount: any = db.prepare(eventsCountQuery).get(searchTerm, searchTerm, searchTerm);
      results.total.events = eventsCount?.count || 0;
    }

    // Search sessions
    if (!type || type === "all" || type === "sessions") {
      const sessionsQuery = `
        SELECT * FROM sessions
        WHERE session_id LIKE ?
           OR status LIKE ?
           OR metadata LIKE ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      const sessions = db.prepare(sessionsQuery).all(searchTerm, searchTerm, searchTerm, limit, offset);
      results.sessions = sessions.map((s: any) => ({
        ...s,
        metadata: JSON.parse(s.metadata || "{}"),
        _type: "session",
      }));

      // Count total
      const sessionsCountQuery = `
        SELECT COUNT(*) as count FROM sessions
        WHERE session_id LIKE ?
           OR status LIKE ?
           OR metadata LIKE ?
      `;
      const sessionsCount: any = db.prepare(sessionsCountQuery).get(searchTerm, searchTerm, searchTerm);
      results.total.sessions = sessionsCount?.count || 0;
    }

    // Search tasks
    if (!type || type === "all" || type === "tasks") {
      const tasksQuery = `
        SELECT * FROM tasks
        WHERE task_id LIKE ?
           OR title LIKE ?
           OR description LIKE ?
           OR status LIKE ?
           OR project LIKE ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      const tasks = db.prepare(tasksQuery).all(
        searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset
      );
      results.tasks = tasks.map((t: any) => ({
        ...t,
        _type: "task",
      }));

      // Count total
      const tasksCountQuery = `
        SELECT COUNT(*) as count FROM tasks
        WHERE task_id LIKE ?
           OR title LIKE ?
           OR description LIKE ?
           OR status LIKE ?
           OR project LIKE ?
      `;
      const tasksCount: any = db.prepare(tasksCountQuery).get(
        searchTerm, searchTerm, searchTerm, searchTerm, searchTerm
      );
      results.total.tasks = tasksCount?.count || 0;
    }

    return c.json({
      query,
      results,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error searching:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

// GET /api/search/events - Search only events with more options
searchRouter.get("/events", async (c) => {
  try {
    const db = getDb();
    const query = c.req.query("q");
    const eventType = c.req.query("event_type");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    let sql = "SELECT * FROM events WHERE 1=1";
    const params: any[] = [];

    if (query && query.trim().length > 0) {
      const searchTerm = `%${query.trim()}%`;
      sql += " AND (event_type LIKE ? OR session_id LIKE ? OR payload LIKE ?)";
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (eventType) {
      sql += " AND event_type = ?";
      params.push(eventType);
    }

    if (startDate) {
      sql += " AND timestamp >= ?";
      params.push(startDate);
    }

    if (endDate) {
      sql += " AND timestamp <= ?";
      params.push(endDate);
    }

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const events = db.prepare(sql).all(...params);
    const parsedEvents = events.map((e: any) => ({
      ...e,
      payload: JSON.parse(e.payload || "{}"),
    }));

    // Get total count
    let countSql = "SELECT COUNT(*) as count FROM events WHERE 1=1";
    const countParams: any[] = [];

    if (query && query.trim().length > 0) {
      const searchTerm = `%${query.trim()}%`;
      countSql += " AND (event_type LIKE ? OR session_id LIKE ? OR payload LIKE ?)";
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (eventType) {
      countSql += " AND event_type = ?";
      countParams.push(eventType);
    }

    if (startDate) {
      countSql += " AND timestamp >= ?";
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += " AND timestamp <= ?";
      countParams.push(endDate);
    }

    const totalCount: any = db.prepare(countSql).get(...countParams);

    return c.json({
      events: parsedEvents,
      total: totalCount?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error searching events:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});
