import { Hono } from "hono";
import { getDb } from "../lib/db";
import { redis } from "../lib/redis";
import { collectMetrics, recordMetric, getMetricHistory, getAggregatedMetrics } from "../lib/metricsCollector";

export const metricsRouter = new Hono();

// GET /api/metrics/system - Get comprehensive system metrics
metricsRouter.get("/system", async (c) => {
  try {
    const metrics = collectMetrics();
    return c.json(metrics);
  } catch (error) {
    console.error("Error collecting system metrics:", error);
    return c.json({ error: "Failed to collect system metrics" }, 500);
  }
});

// POST /api/metrics/record - Record a custom metric
metricsRouter.post("/record", async (c) => {
  try {
    const body = await c.req.json();
    const { metric_name, value, tags } = body;

    if (!metric_name || value === undefined) {
      return c.json({ error: "metric_name and value are required" }, 400);
    }

    recordMetric(metric_name, value, tags);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error recording metric:", error);
    return c.json({ error: "Failed to record metric" }, 500);
  }
});

// GET /api/metrics/history/:metric_name - Get metric history
metricsRouter.get("/history/:metric_name", async (c) => {
  try {
    const metricName = c.req.param("metric_name");
    const since = c.req.query("since");
    const until = c.req.query("until");
    const limit = parseInt(c.req.query("limit") || "100");

    const history = getMetricHistory(metricName, { since, until, limit });
    return c.json({ metric_name: metricName, history });
  } catch (error) {
    console.error("Error fetching metric history:", error);
    return c.json({ error: "Failed to fetch metric history" }, 500);
  }
});

// GET /api/metrics/aggregated/:metric_name - Get aggregated metrics
metricsRouter.get("/aggregated/:metric_name", async (c) => {
  try {
    const metricName = c.req.param("metric_name");
    const interval = (c.req.query("interval") || "hour") as "hour" | "day" | "week";
    const since = c.req.query("since");

    const aggregated = getAggregatedMetrics(metricName, { interval, since });
    return c.json({ metric_name: metricName, interval, aggregated });
  } catch (error) {
    console.error("Error fetching aggregated metrics:", error);
    return c.json({ error: "Failed to fetch aggregated metrics" }, 500);
  }
});

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

// GET /api/metrics/hourly-activity - Get hourly activity aggregation (0-23 hours)
metricsRouter.get("/hourly-activity", async (c) => {
  try {
    const db = getDb();
    const days = parseInt(c.req.query("days") || "7");

    // Get event counts by hour of day (0-23)
    const eventsByHour = db
      .prepare(`
        SELECT
          CAST(strftime('%H', timestamp) AS INTEGER) as hour_of_day,
          COUNT(*) as event_count
        FROM events
        WHERE timestamp > datetime('now', '-' || ? || ' days')
        GROUP BY hour_of_day
        ORDER BY hour_of_day ASC
      `)
      .all(days);

    // Get task completions by hour of day
    const tasksByHour = db
      .prepare(`
        SELECT
          CAST(strftime('%H', completed_at) AS INTEGER) as hour_of_day,
          COUNT(*) as task_count
        FROM task_queue
        WHERE completed_at IS NOT NULL
          AND completed_at > datetime('now', '-' || ? || ' days')
        GROUP BY hour_of_day
        ORDER BY hour_of_day ASC
      `)
      .all(days);

    // Get tool executions by hour of day
    const toolsByHour = db
      .prepare(`
        SELECT
          CAST(strftime('%H', start_time) AS INTEGER) as hour_of_day,
          COUNT(*) as tool_count
        FROM tool_executions
        WHERE start_time > datetime('now', '-' || ? || ' days')
        GROUP BY hour_of_day
        ORDER BY hour_of_day ASC
      `)
      .all(days);

    // Build complete hourly data (0-23)
    const hourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const eventData = (eventsByHour as any[]).find((e: any) => e.hour_of_day === hour);
      const taskData = (tasksByHour as any[]).find((t: any) => t.hour_of_day === hour);
      const toolData = (toolsByHour as any[]).find((t: any) => t.hour_of_day === hour);

      hourlyData.push({
        hour,
        events: eventData?.event_count || 0,
        tasks: taskData?.task_count || 0,
        tools: toolData?.tool_count || 0,
        total: (eventData?.event_count || 0) + (taskData?.task_count || 0) + (toolData?.tool_count || 0),
      });
    }

    return c.json({
      days,
      hourly_activity: hourlyData,
      summary: {
        total_events: hourlyData.reduce((sum, h) => sum + h.events, 0),
        total_tasks: hourlyData.reduce((sum, h) => sum + h.tasks, 0),
        total_tools: hourlyData.reduce((sum, h) => sum + h.tools, 0),
        peak_hour: hourlyData.reduce((max, h) => h.total > max.total ? h : max, hourlyData[0]).hour,
      },
    });
  } catch (error) {
    console.error("Error fetching hourly activity:", error);
    return c.json({ error: "Failed to fetch hourly activity" }, 500);
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
