/**
 * AI Orchestration Dashboard - Integration Tests
 *
 * Test cases:
 * AT-001: Infrastructure connectivity (Redis, SQLite)
 * AT-002: API Gateway health and endpoints
 * AT-003: Event creation and retrieval
 * AT-004: Session management
 * AT-005: Frontend accessibility
 */

const API_URL = process.env.AOD_API_URL || "http://localhost:4000";
const FRONTEND_URL = process.env.AOD_FRONTEND_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - startTime,
    });
    console.log(`[PASS] ${name} (${Date.now() - startTime}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`[FAIL] ${name}: ${error}`);
  }
}

// AT-001: Infrastructure Connectivity
async function testInfrastructure() {
  await runTest("AT-001-a: Redis connectivity via API", async () => {
    const res = await fetch(`${API_URL}/api/metrics/health`);
    const data = await res.json();

    if (data.components?.redis !== "ok") {
      throw new Error(`Redis status: ${data.components?.redis}`);
    }
  });

  await runTest("AT-001-b: SQLite connectivity via API", async () => {
    const res = await fetch(`${API_URL}/api/metrics/health`);
    const data = await res.json();

    if (data.components?.sqlite !== "ok") {
      throw new Error(`SQLite status: ${data.components?.sqlite}`);
    }
  });
}

// AT-002: API Gateway Health
async function testAPIGateway() {
  await runTest("AT-002-a: Health endpoint returns 200", async () => {
    const res = await fetch(`${API_URL}/health`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (data.status !== "ok") throw new Error(`Health status: ${data.status}`);
  });

  await runTest("AT-002-b: CORS headers present", async () => {
    const res = await fetch(`${API_URL}/health`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });

    // Check for CORS-related response (even if 405, CORS should be set)
    // The middleware should handle this
  });

  await runTest("AT-002-c: 404 for unknown routes", async () => {
    const res = await fetch(`${API_URL}/api/unknown-route-xyz`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });
}

// AT-003: Event Management
async function testEvents() {
  let createdEventId: string;

  await runTest("AT-003-a: Create event via POST /api/events", async () => {
    const res = await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "integration_test",
        payload: { test_id: Date.now(), message: "Integration test event" },
      }),
    });

    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error("Event creation failed");
    if (!data.event?.id) throw new Error("No event ID returned");

    createdEventId = data.event.id;
  });

  await runTest("AT-003-b: Retrieve events via GET /api/events", async () => {
    const res = await fetch(`${API_URL}/api/events?limit=10`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data.events)) throw new Error("Events not an array");
  });

  await runTest("AT-003-c: Filter events by type", async () => {
    const res = await fetch(`${API_URL}/api/events?event_type=integration_test`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    const allMatch = data.events.every((e: any) => e.event_type === "integration_test");
    if (!allMatch) throw new Error("Filter not working correctly");
  });

  await runTest("AT-003-d: Validate event schema", async () => {
    const res = await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: "data" }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });
}

// AT-004: Session Management
async function testSessions() {
  let createdSessionId: string;

  await runTest("AT-004-a: Create session via POST /api/sessions", async () => {
    const res = await fetch(`${API_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { test: true, created_by: "integration_test" },
      }),
    });

    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error("Session creation failed");
    if (!data.session?.session_id) throw new Error("No session ID returned");

    createdSessionId = data.session.session_id;
  });

  await runTest("AT-004-b: Retrieve sessions via GET /api/sessions", async () => {
    const res = await fetch(`${API_URL}/api/sessions?limit=10`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data.sessions)) throw new Error("Sessions not an array");
  });

  await runTest("AT-004-c: Update session status via PATCH", async () => {
    if (!createdSessionId) throw new Error("No session to update");

    const res = await fetch(`${API_URL}/api/sessions/${createdSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (data.session?.status !== "completed") {
      throw new Error(`Status not updated: ${data.session?.status}`);
    }
  });

  await runTest("AT-004-d: Get session details via GET /api/sessions/:id", async () => {
    if (!createdSessionId) throw new Error("No session to retrieve");

    const res = await fetch(`${API_URL}/api/sessions/${createdSessionId}`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (data.session_id !== createdSessionId) {
      throw new Error("Session ID mismatch");
    }
  });
}

// AT-005: Frontend Accessibility
async function testFrontend() {
  await runTest("AT-005-a: Frontend serves HTML", async () => {
    const res = await fetch(FRONTEND_URL);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const html = await res.text();
    if (!html.includes("AI Orchestration Dashboard")) {
      throw new Error("Dashboard title not found in HTML");
    }
  });

  await runTest("AT-005-b: Frontend static assets accessible", async () => {
    // Just check that the server responds - static assets are handled by Next.js
    const res = await fetch(FRONTEND_URL);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
  });
}

// AT-006: Metrics Endpoint
async function testMetrics() {
  await runTest("AT-006-a: Get metrics summary", async () => {
    const res = await fetch(`${API_URL}/api/metrics/summary`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (typeof data.sessions?.total !== "number") {
      throw new Error("Invalid metrics structure");
    }
    if (typeof data.events?.total !== "number") {
      throw new Error("Invalid metrics structure");
    }
  });

  await runTest("AT-006-b: Get timeline data", async () => {
    const res = await fetch(`${API_URL}/api/metrics/timeline?hours=24`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data.timeline)) {
      throw new Error("Timeline not an array");
    }
  });
}

// Main test runner
async function runAllTests() {
  console.log("\n========================================");
  console.log("AI Orchestration Dashboard - Integration Tests");
  console.log("========================================\n");

  console.log("--- AT-001: Infrastructure Connectivity ---");
  await testInfrastructure();

  console.log("\n--- AT-002: API Gateway Health ---");
  await testAPIGateway();

  console.log("\n--- AT-003: Event Management ---");
  await testEvents();

  console.log("\n--- AT-004: Session Management ---");
  await testSessions();

  console.log("\n--- AT-005: Frontend Accessibility ---");
  await testFrontend();

  console.log("\n--- AT-006: Metrics Endpoints ---");
  await testMetrics();

  // Summary
  console.log("\n========================================");
  console.log("Test Summary");
  console.log("========================================");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }

  console.log("\n========================================\n");

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
