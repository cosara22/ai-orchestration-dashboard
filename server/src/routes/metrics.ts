import { Hono } from "hono";
import { getDb } from "../lib/db";
import { redis } from "../lib/redis";

export const metricsRouter = new Hono();

// GET /api/metrics/summary - Get dashboard summary metrics
metricsRouter.get("/summary", async (c) => {
  try {
    const db = getDb();

    // Get session counts by status
    const sessionStats: any = db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM sessions
      `)
      .get();

    // Get event counts by type (last 24 hours)
    const recentEvents = db
      .prepare(`
        SELECT event_type, COUNT(*) as count
        FROM events
        WHERE timestamp > datetime('now', '-24 hours')
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `)
      .all();

    // Get total event count
    const totalEvents: any = db
      .prepare("SELECT COUNT(*) as count FROM events")
      .get();

    // Get task statistics
    const taskStats: any = db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM tasks
      `)
      .get();

    // Get tool execution counts
    const toolStats = db
      .prepare(`
        SELECT tool_name, COUNT(*) as count
        FROM tool_executions
        WHERE start_time > datetime('now', '-24 hours')
        GROUP BY tool_name
        ORDER BY count DESC
        LIMIT 10
      `)
      .all();

    return c.json({
      sessions: {
        total: sessionStats?.total || 0,
        active: sessionStats?.active || 0,
        completed: sessionStats?.completed || 0,
        failed: sessionStats?.failed || 0,
      },
      events: {
        total: totalEvents?.count || 0,
        recent_by_type: recentEvents,
      },
      tasks: {
        total: taskStats?.total || 0,
        pending: taskStats?.pending || 0,
        in_progress: taskStats?.in_progress || 0,
        completed: taskStats?.completed || 0,
      },
      tools: {
        recent_usage: toolStats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return c.json({ error: "Failed to fetch metrics" }, 500);
  }
});

// GET /api/metrics/timeline - Get event timeline data
metricsRouter.get("/timeline", async (c) => {
  try {
    const db = getDb();
    const hours = parseInt(c.req.query("hours") || "24");

    const timeline = db
      .prepare(`
        SELECT
          strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
          COUNT(*) as event_count
        FROM events
        WHERE timestamp > datetime('now', '-' || ? || ' hours')
        GROUP BY hour
        ORDER BY hour ASC
      `)
      .all(hours);

    return c.json({ timeline, hours });
  } catch (error) {
    console.error("Error fetching timeline:", error);
    return c.json({ error: "Failed to fetch timeline" }, 500);
  }
});

// GET /api/metrics/health - System health check
metricsRouter.get("/health", async (c) => {
  try {
    const db = getDb();

    // Check SQLite
    const sqliteOk = !!db.prepare("SELECT 1").get();

    // Check Redis
    let redisOk = false;
    try {
      const pong = await redis.ping();
      redisOk = pong === "PONG";
    } catch (e) {
      redisOk = false;
    }

    const healthy = sqliteOk && redisOk;

    return c.json({
      status: healthy ? "healthy" : "degraded",
      components: {
        sqlite: sqliteOk ? "ok" : "error",
        redis: redisOk ? "ok" : "error",
      },
      timestamp: new Date().toISOString(),
    }, healthy ? 200 : 503);
  } catch (error) {
    console.error("Health check error:", error);
    return c.json({
      status: "unhealthy",
      error: String(error),
    }, 503);
  }
});
