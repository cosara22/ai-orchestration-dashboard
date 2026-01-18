import { Hono } from "hono";
import { getDb } from "../lib/db";
import { nanoid } from "nanoid";

export const alertsRouter = new Hono();

// GET /api/alerts - List all alerts
alertsRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const enabled = c.req.query("enabled");
    const severity = c.req.query("severity");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    let sql = "SELECT * FROM alerts WHERE 1=1";
    const params: any[] = [];

    if (enabled !== undefined) {
      sql += " AND enabled = ?";
      params.push(enabled === "true" ? 1 : 0);
    }

    if (severity) {
      sql += " AND severity = ?";
      params.push(severity);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const alerts = db.prepare(sql).all(...params);
    const parsedAlerts = alerts.map((a: any) => ({
      ...a,
      condition: JSON.parse(a.condition || "{}"),
      enabled: Boolean(a.enabled),
    }));

    // Get counts
    const counts: any = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) as info
      FROM alerts
    `).get();

    return c.json({
      alerts: parsedAlerts,
      counts: {
        total: counts?.total || 0,
        enabled: counts?.enabled || 0,
        critical: counts?.critical || 0,
        warning: counts?.warning || 0,
        info: counts?.info || 0,
      },
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return c.json({ error: "Failed to fetch alerts" }, 500);
  }
});

// POST /api/alerts - Create a new alert
alertsRouter.post("/", async (c) => {
  try {
    const db = getDb();
    const body = await c.req.json();
    const {
      name,
      description,
      type,
      target,
      condition,
      severity = "warning",
      cooldown_minutes = 5,
    } = body;

    if (!name || !type || !target || !condition) {
      return c.json(
        { error: "name, type, target, and condition are required" },
        400
      );
    }

    // Validate type
    const validTypes = ["threshold", "pattern", "anomaly"];
    if (!validTypes.includes(type)) {
      return c.json({ error: `type must be one of: ${validTypes.join(", ")}` }, 400);
    }

    // Validate target
    const validTargets = ["sessions", "events", "tasks", "agents"];
    if (!validTargets.includes(target)) {
      return c.json({ error: `target must be one of: ${validTargets.join(", ")}` }, 400);
    }

    // Validate severity
    const validSeverities = ["info", "warning", "critical"];
    if (!validSeverities.includes(severity)) {
      return c.json({ error: `severity must be one of: ${validSeverities.join(", ")}` }, 400);
    }

    const alert_id = `alert_${nanoid(12)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO alerts (alert_id, name, description, type, target, condition, severity, cooldown_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert_id,
      name,
      description || null,
      type,
      target,
      JSON.stringify(condition),
      severity,
      cooldown_minutes,
      now,
      now
    );

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(alert_id);

    return c.json({
      success: true,
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition),
        enabled: Boolean(alert.enabled),
      },
    }, 201);
  } catch (error) {
    console.error("Error creating alert:", error);
    return c.json({ error: "Failed to create alert" }, 500);
  }
});

// GET /api/alerts/:id - Get single alert
alertsRouter.get("/:id", async (c) => {
  try {
    const db = getDb();
    const id = c.req.param("id");

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(id);

    if (!alert) {
      return c.json({ error: "Alert not found" }, 404);
    }

    return c.json({
      ...alert,
      condition: JSON.parse(alert.condition || "{}"),
      enabled: Boolean(alert.enabled),
    });
  } catch (error) {
    console.error("Error fetching alert:", error);
    return c.json({ error: "Failed to fetch alert" }, 500);
  }
});

// PATCH /api/alerts/:id - Update alert
alertsRouter.patch("/:id", async (c) => {
  try {
    const db = getDb();
    const id = c.req.param("id");
    const body = await c.req.json();

    const existing: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(id);
    if (!existing) {
      return c.json({ error: "Alert not found" }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.type !== undefined) {
      updates.push("type = ?");
      values.push(body.type);
    }
    if (body.target !== undefined) {
      updates.push("target = ?");
      values.push(body.target);
    }
    if (body.condition !== undefined) {
      updates.push("condition = ?");
      values.push(JSON.stringify(body.condition));
    }
    if (body.severity !== undefined) {
      updates.push("severity = ?");
      values.push(body.severity);
    }
    if (body.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(body.enabled ? 1 : 0);
    }
    if (body.cooldown_minutes !== undefined) {
      updates.push("cooldown_minutes = ?");
      values.push(body.cooldown_minutes);
    }

    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE alerts SET ${updates.join(", ")} WHERE alert_id = ?`).run(...values);

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(id);

    return c.json({
      success: true,
      alert: {
        ...alert,
        condition: JSON.parse(alert.condition || "{}"),
        enabled: Boolean(alert.enabled),
      },
    });
  } catch (error) {
    console.error("Error updating alert:", error);
    return c.json({ error: "Failed to update alert" }, 500);
  }
});

// DELETE /api/alerts/:id - Delete alert
alertsRouter.delete("/:id", async (c) => {
  try {
    const db = getDb();
    const id = c.req.param("id");

    const existing = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(id);
    if (!existing) {
      return c.json({ error: "Alert not found" }, 404);
    }

    // Delete related history
    db.prepare("DELETE FROM alert_history WHERE alert_id = ?").run(id);
    // Delete alert
    db.prepare("DELETE FROM alerts WHERE alert_id = ?").run(id);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert:", error);
    return c.json({ error: "Failed to delete alert" }, 500);
  }
});

// GET /api/alerts/:id/history - Get alert trigger history
alertsRouter.get("/:id/history", async (c) => {
  try {
    const db = getDb();
    const id = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const history = db.prepare(`
      SELECT * FROM alert_history
      WHERE alert_id = ?
      ORDER BY triggered_at DESC
      LIMIT ? OFFSET ?
    `).all(id, limit, offset);

    const parsedHistory = history.map((h: any) => ({
      ...h,
      details: JSON.parse(h.details || "{}"),
    }));

    return c.json({
      history: parsedHistory,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching alert history:", error);
    return c.json({ error: "Failed to fetch alert history" }, 500);
  }
});

// POST /api/alerts/:id/test - Test an alert (manually trigger)
alertsRouter.post("/:id/test", async (c) => {
  try {
    const db = getDb();
    const id = c.req.param("id");

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(id);
    if (!alert) {
      return c.json({ error: "Alert not found" }, 404);
    }

    const now = new Date().toISOString();

    // Log to history
    db.prepare(`
      INSERT INTO alert_history (alert_id, triggered_at, status, details)
      VALUES (?, ?, 'active', ?)
    `).run(id, now, JSON.stringify({ test: true, triggered_by: "manual" }));

    // Update alert
    db.prepare(`
      UPDATE alerts
      SET last_triggered = ?, trigger_count = trigger_count + 1, updated_at = ?
      WHERE alert_id = ?
    `).run(now, now, id);

    return c.json({
      success: true,
      triggered_at: now,
    });
  } catch (error) {
    console.error("Error testing alert:", error);
    return c.json({ error: "Failed to test alert" }, 500);
  }
});

// GET /api/alerts/history/active - Get all active alert instances
alertsRouter.get("/history/active", async (c) => {
  try {
    const db = getDb();
    const limit = parseInt(c.req.query("limit") || "50");

    const activeAlerts = db.prepare(`
      SELECT ah.*, a.name as alert_name, a.severity, a.target
      FROM alert_history ah
      JOIN alerts a ON ah.alert_id = a.alert_id
      WHERE ah.status = 'active'
      ORDER BY ah.triggered_at DESC
      LIMIT ?
    `).all(limit);

    const parsed = activeAlerts.map((a: any) => ({
      ...a,
      details: JSON.parse(a.details || "{}"),
    }));

    return c.json({ active_alerts: parsed });
  } catch (error) {
    console.error("Error fetching active alerts:", error);
    return c.json({ error: "Failed to fetch active alerts" }, 500);
  }
});

// PATCH /api/alerts/history/:historyId/acknowledge - Acknowledge an alert
alertsRouter.patch("/history/:historyId/acknowledge", async (c) => {
  try {
    const db = getDb();
    const historyId = c.req.param("historyId");

    db.prepare(`
      UPDATE alert_history
      SET status = 'acknowledged'
      WHERE id = ?
    `).run(historyId);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    return c.json({ error: "Failed to acknowledge alert" }, 500);
  }
});

// PATCH /api/alerts/history/:historyId/resolve - Resolve an alert
alertsRouter.patch("/history/:historyId/resolve", async (c) => {
  try {
    const db = getDb();
    const historyId = c.req.param("historyId");
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alert_history
      SET status = 'resolved', resolved_at = ?
      WHERE id = ?
    `).run(now, historyId);

    return c.json({ success: true, resolved_at: now });
  } catch (error) {
    console.error("Error resolving alert:", error);
    return c.json({ error: "Failed to resolve alert" }, 500);
  }
});
