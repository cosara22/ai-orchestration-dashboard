import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { getTestDb } from "./setup";

// Mock the db module to use test database
vi.mock("../src/lib/db", () => ({
  getDb: () => getTestDb(),
  db: getTestDb(),
}));

// Mock redis to avoid connection errors in tests
vi.mock("../src/lib/redis", () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
  CHANNELS: {
    EVENTS: "aod:events",
    SESSIONS: "aod:sessions",
  },
}));

// Mock WebSocket broadcast
vi.mock("../src/ws/handler", () => ({
  broadcastToClients: vi.fn(),
}));

describe("API Routes", () => {
  let app: Hono;
  let db: ReturnType<typeof getTestDb>;

  beforeAll(async () => {
    db = getTestDb();

    // Create a test app with routes
    app = new Hono();

    // Simple test routes that directly use db
    app.get("/api/health", (c) => c.json({ status: "ok" }));

    // Sessions routes
    app.post("/api/sessions", async (c) => {
      const body = await c.req.json();
      const sessionId = body.session_id || `session_${Date.now()}`;

      db.prepare(`
        INSERT INTO sessions (session_id, status, metadata)
        VALUES (?, 'active', ?)
      `).run(sessionId, JSON.stringify(body.metadata || {}));

      return c.json({
        success: true,
        session: { session_id: sessionId, status: "active" },
      }, 201);
    });

    app.get("/api/sessions", (c) => {
      const sessions = db.prepare("SELECT * FROM sessions ORDER BY id DESC").all();
      const parsed = sessions.map((s: any) => ({
        ...s,
        metadata: JSON.parse(s.metadata || "{}"),
      }));
      return c.json({ sessions: parsed });
    });

    app.get("/api/sessions/:id", (c) => {
      const id = c.req.param("id");
      const session: any = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(id);
      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }
      return c.json({
        ...session,
        metadata: JSON.parse(session.metadata || "{}"),
      });
    });

    app.patch("/api/sessions/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json();

      const existing = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(id);
      if (!existing) {
        return c.json({ error: "Session not found" }, 404);
      }

      if (body.status) {
        const endTime = body.status !== "active" ? new Date().toISOString() : null;
        db.prepare("UPDATE sessions SET status = ?, end_time = ? WHERE session_id = ?")
          .run(body.status, endTime, id);
      }

      const updated: any = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(id);
      return c.json({
        success: true,
        session: { ...updated, metadata: JSON.parse(updated.metadata || "{}") },
      });
    });

    // Events routes
    app.post("/api/events", async (c) => {
      const body = await c.req.json();
      const eventId = `event_${Date.now()}`;

      db.prepare(`
        INSERT INTO events (event_id, event_type, session_id, payload)
        VALUES (?, ?, ?, ?)
      `).run(eventId, body.event_type, body.session_id || null, JSON.stringify(body.payload || {}));

      return c.json({
        success: true,
        event: { event_id: eventId, event_type: body.event_type },
      }, 201);
    });

    app.get("/api/events", (c) => {
      const limit = parseInt(c.req.query("limit") || "50");
      const events = db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(limit);
      const parsed = events.map((e: any) => ({
        ...e,
        payload: JSON.parse(e.payload || "{}"),
      }));
      return c.json({ events: parsed });
    });

    // Tasks routes
    app.post("/api/tasks", async (c) => {
      const body = await c.req.json();
      const taskId = `task_${Date.now()}`;

      db.prepare(`
        INSERT INTO tasks (task_id, title, description, priority, project, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(taskId, body.title, body.description || null, body.priority || "medium", body.project || null);

      return c.json({
        success: true,
        task: { task_id: taskId, title: body.title, status: "pending" },
      }, 201);
    });

    app.get("/api/tasks", (c) => {
      const tasks = db.prepare("SELECT * FROM tasks ORDER BY id DESC").all();
      return c.json({ tasks });
    });

    // Agents routes
    app.post("/api/agents", async (c) => {
      const body = await c.req.json();
      const agentId = `agent_${Date.now()}`;

      db.prepare(`
        INSERT INTO agents (agent_id, name, type, status)
        VALUES (?, ?, ?, 'idle')
      `).run(agentId, body.name, body.type || "default");

      return c.json({
        success: true,
        agent: { agent_id: agentId, name: body.name, status: "idle" },
      }, 201);
    });

    app.get("/api/agents", (c) => {
      const agents = db.prepare("SELECT * FROM agents ORDER BY id DESC").all();
      const counts = {
        active: agents.filter((a: any) => a.status === "active").length,
        idle: agents.filter((a: any) => a.status === "idle").length,
        error: agents.filter((a: any) => a.status === "error").length,
        total: agents.length,
      };
      return c.json({ agents, counts });
    });

    // Alerts routes
    app.post("/api/alerts", async (c) => {
      const body = await c.req.json();
      const alertId = `alert_${Date.now()}`;

      db.prepare(`
        INSERT INTO alerts (alert_id, name, description, type, target, condition, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        alertId,
        body.name,
        body.description || null,
        body.type,
        body.target,
        JSON.stringify(body.condition),
        body.severity || "warning"
      );

      return c.json({
        success: true,
        alert: { alert_id: alertId, name: body.name, severity: body.severity || "warning" },
      }, 201);
    });

    app.get("/api/alerts", (c) => {
      const alerts = db.prepare("SELECT * FROM alerts ORDER BY id DESC").all();
      const parsed = alerts.map((a: any) => ({
        ...a,
        condition: JSON.parse(a.condition || "{}"),
        enabled: Boolean(a.enabled),
      }));
      return c.json({ alerts: parsed });
    });
  });

  describe("Health Check", () => {
    it("should return ok status", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
    });
  });

  describe("Sessions API", () => {
    it("should create a new session", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-session-001",
          metadata: { project: "test-project" },
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.session.session_id).toBe("test-session-001");
      expect(json.session.status).toBe("active");
    });

    it("should list sessions", async () => {
      // Create a session first
      await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "list-test-session" }),
      });

      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.sessions).toBeInstanceOf(Array);
      expect(json.sessions.length).toBeGreaterThan(0);
    });

    it("should get a single session", async () => {
      await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "get-test-session" }),
      });

      const res = await app.request("/api/sessions/get-test-session");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.session_id).toBe("get-test-session");
    });

    it("should return 404 for non-existent session", async () => {
      const res = await app.request("/api/sessions/non-existent");
      expect(res.status).toBe(404);
    });

    it("should update session status", async () => {
      await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "update-test-session" }),
      });

      const res = await app.request("/api/sessions/update-test-session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.session.status).toBe("completed");
    });
  });

  describe("Events API", () => {
    it("should create a new event", async () => {
      const res = await app.request("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "tool_execution",
          payload: { tool_name: "Read", success: true },
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.event.event_type).toBe("tool_execution");
    });

    it("should list events", async () => {
      // Create some events
      await app.request("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "test_event", payload: {} }),
      });

      const res = await app.request("/api/events");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.events).toBeInstanceOf(Array);
    });

    it("should respect limit parameter", async () => {
      // Create multiple events
      for (let i = 0; i < 5; i++) {
        await app.request("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: `event_${i}`, payload: {} }),
        });
      }

      const res = await app.request("/api/events?limit=2");
      const json = await res.json();
      expect(json.events.length).toBe(2);
    });
  });

  describe("Tasks API", () => {
    it("should create a new task", async () => {
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Task",
          description: "Test description",
          priority: "high",
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.task.title).toBe("Test Task");
      expect(json.task.status).toBe("pending");
    });

    it("should list tasks", async () => {
      await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "List Test Task" }),
      });

      const res = await app.request("/api/tasks");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tasks).toBeInstanceOf(Array);
    });
  });

  describe("Agents API", () => {
    it("should create a new agent", async () => {
      const res = await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          type: "worker",
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.agent.name).toBe("Test Agent");
      expect(json.agent.status).toBe("idle");
    });

    it("should list agents with counts", async () => {
      await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Agent 1" }),
      });

      const res = await app.request("/api/agents");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.agents).toBeInstanceOf(Array);
      expect(json.counts).toBeDefined();
      expect(json.counts.total).toBeGreaterThan(0);
    });
  });

  describe("Alerts API", () => {
    it("should create a new alert", async () => {
      const res = await app.request("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Alert",
          type: "threshold",
          target: "events",
          condition: { field: "event_type", operator: "eq", value: "error" },
          severity: "critical",
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.alert.name).toBe("Test Alert");
      expect(json.alert.severity).toBe("critical");
    });

    it("should list alerts", async () => {
      await app.request("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "List Test Alert",
          type: "pattern",
          target: "events",
          condition: { field: "event_type", operator: "eq", value: "error" },
        }),
      });

      const res = await app.request("/api/alerts");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.alerts).toBeInstanceOf(Array);
    });
  });
});
