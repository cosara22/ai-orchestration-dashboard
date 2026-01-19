/**
 * E2E API Tests for AOD Backend
 * Phase 15-H: End-to-End Testing
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const API_BASE = process.env.API_BASE || "http://localhost:4000";

describe("Health & Scheduler APIs", () => {
  it("GET /health returns server status", async () => {
    const res = await fetch(`${API_BASE}/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.schedulers).toBeDefined();
    expect(data.schedulers.running).toBe(true);
  });

  it("GET /health includes scheduler job status", async () => {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();

    expect(data.schedulers.jobs).toBeDefined();
    expect(data.schedulers.jobs.dispatch).toBeDefined();
    expect(data.schedulers.jobs.timeout).toBeDefined();
    expect(data.schedulers.jobs.health).toBeDefined();
    expect(data.schedulers.jobs.lockCleanup).toBeDefined();
  });
});

describe("Metrics API", () => {
  it("GET /api/metrics/system returns system metrics", async () => {
    const res = await fetch(`${API_BASE}/api/metrics/system`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.timestamp).toBeDefined();
    expect(data.agents).toBeDefined();
    expect(data.tasks).toBeDefined();
    expect(data.locks).toBeDefined();
    expect(data.alerts).toBeDefined();
    expect(data.performance).toBeDefined();
  });

  it("POST /api/metrics/record accepts custom metrics", async () => {
    const res = await fetch(`${API_BASE}/api/metrics/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric_name: "test_metric",
        value: 42,
        tags: { source: "e2e_test" },
      }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("GET /api/metrics/summary returns dashboard summary", async () => {
    const res = await fetch(`${API_BASE}/api/metrics/summary`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toBeDefined();
    expect(data.events).toBeDefined();
    expect(data.tasks).toBeDefined();
  });
});

describe("Alerts API", () => {
  let testAlertId: string;

  it("POST /api/alerts/create creates a new alert", async () => {
    const res = await fetch(`${API_BASE}/api/alerts/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "system_error",
        severity: "low",
        title: "E2E Test Alert",
        message: "This is a test alert from E2E tests",
      }),
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.alert).toBeDefined();
    expect(data.alert.alert_id).toBeDefined();
    testAlertId = data.alert.alert_id;
  });

  it("GET /api/alerts/stats returns alert statistics", async () => {
    const res = await fetch(`${API_BASE}/api/alerts/stats`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBeDefined();
    expect(data.unread).toBeDefined();
    expect(data.by_severity).toBeDefined();
  });

  it("GET /api/alerts/system returns filtered alerts", async () => {
    const res = await fetch(`${API_BASE}/api/alerts/system?unresolved_only=true&limit=10`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.alerts).toBeDefined();
    expect(Array.isArray(data.alerts)).toBe(true);
    expect(data.total).toBeDefined();
  });

  it("POST /api/alerts/:id/resolve resolves an alert", async () => {
    if (!testAlertId) return;

    const res = await fetch(`${API_BASE}/api/alerts/${testAlertId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe("Task Queue API", () => {
  let testTaskId: string;

  it("POST /api/queue/tasks creates a new task", async () => {
    const res = await fetch(`${API_BASE}/api/queue/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: "test_project",
        title: "E2E Test Task",
        description: "Test task from E2E tests",
        priority: 2,
        required_capabilities: ["testing"],
      }),
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.task).toBeDefined();
    testTaskId = data.task.id;
  });

  it("GET /api/queue/tasks returns task list", async () => {
    const res = await fetch(`${API_BASE}/api/queue/tasks?limit=10`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tasks).toBeDefined();
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  it("GET /api/queue/tasks/:id returns task details", async () => {
    if (!testTaskId) return;

    const res = await fetch(`${API_BASE}/api/queue/tasks/${testTaskId}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(testTaskId);
    expect(data.title).toBe("E2E Test Task");
  });
});

describe("File Locks API", () => {
  let testLockId: string;
  const testAgentId = "e2e_test_agent";
  const testProjectId = "test_project";

  it("POST /api/locks/acquire acquires a file lock", async () => {
    const res = await fetch(`${API_BASE}/api/locks/acquire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: testProjectId,
        file_path: "test/e2e_test_file.ts",
        agent_id: testAgentId,
        reason: "E2E testing",
        expires_minutes: 5,
      }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.lock).toBeDefined();
    testLockId = data.lock.lock_id;
  });

  it("GET /api/locks returns active locks", async () => {
    const res = await fetch(`${API_BASE}/api/locks?project_id=${testProjectId}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.locks).toBeDefined();
    expect(Array.isArray(data.locks)).toBe(true);
  });

  it("POST /api/locks/release releases a file lock", async () => {
    if (!testLockId) return;

    const res = await fetch(`${API_BASE}/api/locks/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lock_id: testLockId,
        agent_id: testAgentId,
      }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe("Shared Context API", () => {
  let testContextId: string;
  const testProjectId = "test_project";

  it("POST /api/context creates shared context entry", async () => {
    const res = await fetch(`${API_BASE}/api/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: testProjectId,
        context_type: "decision",
        title: "E2E Test Decision",
        content: "Test decision content from E2E tests",
        author_agent_id: "e2e_test_agent",
      }),
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.context).toBeDefined();
    testContextId = data.context.context_id;
  });

  it("GET /api/context returns context entries", async () => {
    const res = await fetch(`${API_BASE}/api/context?project_id=${testProjectId}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.contexts).toBeDefined();
    expect(Array.isArray(data.contexts)).toBe(true);
  });

  it("GET /api/context/for-agent returns context for agent", async () => {
    const res = await fetch(`${API_BASE}/api/context/for-agent?project_id=${testProjectId}&agent_id=e2e_test_agent`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.contexts).toBeDefined();
  });
});

describe("Conductor API", () => {
  const testProjectId = "test_project";

  it("GET /api/conductor/overview returns all projects overview", async () => {
    const res = await fetch(`${API_BASE}/api/conductor/overview`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.projects).toBeDefined();
    expect(data.total_active_agents).toBeDefined();
    expect(data.total_pending_tasks).toBeDefined();
  });

  it("GET /api/conductor/decisions returns decision log", async () => {
    const res = await fetch(`${API_BASE}/api/conductor/decisions?limit=10`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.decisions).toBeDefined();
    expect(Array.isArray(data.decisions)).toBe(true);
  });
});

describe("Teams API", () => {
  let testTeamId: string;

  it("GET /api/teams/overview/all returns teams overview", async () => {
    const res = await fetch(`${API_BASE}/api/teams/overview/all`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.teams).toBeDefined();
    expect(data.summary).toBeDefined();
  });

  it("POST /api/teams creates a new team", async () => {
    const res = await fetch(`${API_BASE}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Test Team",
        description: "Test team from E2E tests",
        project_id: "test_project",
      }),
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.team).toBeDefined();
    testTeamId = data.team.team_id;
  });

  it("GET /api/teams returns team list", async () => {
    const res = await fetch(`${API_BASE}/api/teams`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.teams).toBeDefined();
    expect(Array.isArray(data.teams)).toBe(true);
  });

  it("DELETE /api/teams/:id deletes a team", async () => {
    if (!testTeamId) return;

    const res = await fetch(`${API_BASE}/api/teams/${testTeamId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe("Agents API", () => {
  let testAgentId: string;

  it("POST /api/agents creates a new agent", async () => {
    const res = await fetch(`${API_BASE}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Test Agent",
        type: "worker",
      }),
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.agent).toBeDefined();
    testAgentId = data.agent.agent_id;
  });

  it("GET /api/agents returns agent list", async () => {
    const res = await fetch(`${API_BASE}/api/agents`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agents).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
  });

  it("POST /api/agents/:id/heartbeat sends heartbeat", async () => {
    if (!testAgentId) return;

    const res = await fetch(`${API_BASE}/api/agents/${testAgentId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test heartbeat" }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/agents/:id/capabilities registers capabilities", async () => {
    if (!testAgentId) return;

    const res = await fetch(`${API_BASE}/api/agents/${testAgentId}/capabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capabilities: [
          { tag: "typescript", proficiency: 80 },
          { tag: "testing", proficiency: 90 },
        ],
      }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
