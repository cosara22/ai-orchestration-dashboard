const BASE = "http://localhost:4000";

async function addTestData() {
  // Add 25 sessions via sessions API
  const statuses = ["active", "completed", "failed"];
  for (let i = 0; i < 25; i++) {
    const status = statuses[i % 3];
    const sessionId = `test-session-${String(i).padStart(3, "0")}`;

    // Create session
    await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        metadata: { project: "pagination-test", index: i }
      })
    });

    // Update status if not active
    if (status !== "active") {
      await fetch(`${BASE}/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
    }
  }

  // Add 50 events
  const eventTypes = ["tool_execution", "file_edit", "git_operation", "message"];
  for (let i = 0; i < 50; i++) {
    const type = eventTypes[i % eventTypes.length];
    await fetch(`${BASE}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: type,
        session_id: `test-session-${String(i % 25).padStart(3, "0")}`,
        payload: {
          message: `Test event ${i}`,
          tool_name: type === "tool_execution" ? `tool_${i}` : undefined,
          project: "pagination-test"
        }
      })
    });
  }

  console.log("Added 25 sessions and 50 events");
}

addTestData().catch(console.error);
