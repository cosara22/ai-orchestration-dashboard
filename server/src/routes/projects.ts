import { Hono } from "hono";
import { getDb } from "../lib/db";

export const projectsRouter = new Hono();

// GET /api/projects - List all projects
projectsRouter.get("/", async (c) => {
  try {
    const db = getDb();

    // Get unique projects from events payload.source_app
    const projects = db
      .prepare(`
        SELECT
          json_extract(payload, '$.source_app') as name,
          COUNT(*) as event_count,
          MAX(timestamp) as last_activity
        FROM events
        WHERE json_extract(payload, '$.source_app') IS NOT NULL
        GROUP BY json_extract(payload, '$.source_app')
        ORDER BY last_activity DESC
      `)
      .all() as Array<{ name: string; event_count: number; last_activity: string }>;

    // Get session counts per project (from events)
    const projectsWithSessions = projects.map((project) => {
      const sessionCount = db
        .prepare(`
          SELECT COUNT(DISTINCT session_id) as count
          FROM events
          WHERE json_extract(payload, '$.source_app') = ?
            AND session_id IS NOT NULL
        `)
        .get(project.name) as { count: number };

      return {
        ...project,
        session_count: sessionCount?.count || 0,
      };
    });

    return c.json({ projects: projectsWithSessions });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return c.json({ error: "Failed to fetch projects" }, 500);
  }
});

// GET /api/projects/:name - Get project details
projectsRouter.get("/:name", async (c) => {
  try {
    const db = getDb();
    const projectName = c.req.param("name");

    const eventCount = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM events
        WHERE json_extract(payload, '$.source_app') = ?
      `)
      .get(projectName) as { count: number };

    const sessionCount = db
      .prepare(`
        SELECT COUNT(DISTINCT session_id) as count
        FROM events
        WHERE json_extract(payload, '$.source_app') = ?
          AND session_id IS NOT NULL
      `)
      .get(projectName) as { count: number };

    const lastActivity = db
      .prepare(`
        SELECT MAX(timestamp) as last_activity
        FROM events
        WHERE json_extract(payload, '$.source_app') = ?
      `)
      .get(projectName) as { last_activity: string | null };

    const eventsByType = db
      .prepare(`
        SELECT event_type, COUNT(*) as count
        FROM events
        WHERE json_extract(payload, '$.source_app') = ?
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `)
      .all(projectName) as Array<{ event_type: string; count: number }>;

    return c.json({
      name: projectName,
      event_count: eventCount?.count || 0,
      session_count: sessionCount?.count || 0,
      last_activity: lastActivity?.last_activity || null,
      events_by_type: eventsByType,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return c.json({ error: "Failed to fetch project" }, 500);
  }
});
