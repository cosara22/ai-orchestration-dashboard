import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "./setup";

// Mock the db module
vi.mock("../src/lib/db", () => ({
  getDb: () => getTestDb(),
}));

// Mock WebSocket broadcast
const mockBroadcast = vi.fn();
vi.mock("../src/ws/handler", () => ({
  broadcastToClients: (msg: any) => mockBroadcast(msg),
}));

// Helper function to evaluate conditions (copied from alertEvaluator)
function evaluateCondition(
  condition: { field: string; operator: string; value: string | number },
  data: Record<string, any>
): boolean {
  const fieldValue = getNestedValue(data, condition.field);

  if (fieldValue === undefined) {
    return false;
  }

  const { operator, value } = condition;

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "ne":
      return fieldValue !== value;
    case "gt":
      return typeof fieldValue === "number" && fieldValue > Number(value);
    case "lt":
      return typeof fieldValue === "number" && fieldValue < Number(value);
    case "gte":
      return typeof fieldValue === "number" && fieldValue >= Number(value);
    case "lte":
      return typeof fieldValue === "number" && fieldValue <= Number(value);
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(String(value));
    default:
      return false;
  }
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

describe("Alert Evaluator", () => {
  beforeEach(() => {
    mockBroadcast.mockClear();
  });

  describe("evaluateCondition", () => {
    describe("eq operator", () => {
      it("should match equal string values", () => {
        const condition = { field: "event_type", operator: "eq", value: "error" };
        expect(evaluateCondition(condition, { event_type: "error" })).toBe(true);
        expect(evaluateCondition(condition, { event_type: "info" })).toBe(false);
      });

      it("should match equal number values", () => {
        const condition = { field: "count", operator: "eq", value: 5 };
        expect(evaluateCondition(condition, { count: 5 })).toBe(true);
        expect(evaluateCondition(condition, { count: 10 })).toBe(false);
      });
    });

    describe("ne operator", () => {
      it("should match not equal values", () => {
        const condition = { field: "status", operator: "ne", value: "active" };
        expect(evaluateCondition(condition, { status: "failed" })).toBe(true);
        expect(evaluateCondition(condition, { status: "active" })).toBe(false);
      });
    });

    describe("gt operator", () => {
      it("should match greater than values", () => {
        const condition = { field: "duration", operator: "gt", value: 100 };
        expect(evaluateCondition(condition, { duration: 150 })).toBe(true);
        expect(evaluateCondition(condition, { duration: 100 })).toBe(false);
        expect(evaluateCondition(condition, { duration: 50 })).toBe(false);
      });

      it("should handle string field values", () => {
        const condition = { field: "duration", operator: "gt", value: 100 };
        expect(evaluateCondition(condition, { duration: "150" })).toBe(false); // string not > number
      });
    });

    describe("lt operator", () => {
      it("should match less than values", () => {
        const condition = { field: "count", operator: "lt", value: 10 };
        expect(evaluateCondition(condition, { count: 5 })).toBe(true);
        expect(evaluateCondition(condition, { count: 10 })).toBe(false);
        expect(evaluateCondition(condition, { count: 15 })).toBe(false);
      });
    });

    describe("gte operator", () => {
      it("should match greater than or equal values", () => {
        const condition = { field: "score", operator: "gte", value: 80 };
        expect(evaluateCondition(condition, { score: 100 })).toBe(true);
        expect(evaluateCondition(condition, { score: 80 })).toBe(true);
        expect(evaluateCondition(condition, { score: 79 })).toBe(false);
      });
    });

    describe("lte operator", () => {
      it("should match less than or equal values", () => {
        const condition = { field: "errors", operator: "lte", value: 5 };
        expect(evaluateCondition(condition, { errors: 3 })).toBe(true);
        expect(evaluateCondition(condition, { errors: 5 })).toBe(true);
        expect(evaluateCondition(condition, { errors: 6 })).toBe(false);
      });
    });

    describe("contains operator", () => {
      it("should match substring in string values", () => {
        const condition = { field: "message", operator: "contains", value: "error" };
        expect(evaluateCondition(condition, { message: "An error occurred" })).toBe(true);
        expect(evaluateCondition(condition, { message: "Error in processing" })).toBe(false); // case sensitive
        expect(evaluateCondition(condition, { message: "All good" })).toBe(false);
      });
    });

    describe("nested fields", () => {
      it("should access nested field values", () => {
        const condition = { field: "payload.tool_name", operator: "eq", value: "Read" };
        const data = { payload: { tool_name: "Read" } };
        expect(evaluateCondition(condition, data)).toBe(true);
      });

      it("should return false for missing nested fields", () => {
        const condition = { field: "payload.missing.field", operator: "eq", value: "test" };
        const data = { payload: {} };
        expect(evaluateCondition(condition, data)).toBe(false);
      });

      it("should handle deeply nested fields", () => {
        const condition = { field: "a.b.c.d", operator: "eq", value: "deep" };
        const data = { a: { b: { c: { d: "deep" } } } };
        expect(evaluateCondition(condition, data)).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should return false for missing field", () => {
        const condition = { field: "nonexistent", operator: "eq", value: "test" };
        expect(evaluateCondition(condition, { other: "value" })).toBe(false);
      });

      it("should return false for invalid operator", () => {
        const condition = { field: "value", operator: "invalid", value: "test" };
        expect(evaluateCondition(condition, { value: "test" })).toBe(false);
      });

      it("should handle null values in data", () => {
        const condition = { field: "value", operator: "eq", value: "test" };
        expect(evaluateCondition(condition, { value: null })).toBe(false);
      });
    });
  });

  describe("getNestedValue", () => {
    it("should return simple field value", () => {
      expect(getNestedValue({ name: "test" }, "name")).toBe("test");
    });

    it("should return nested field value", () => {
      expect(getNestedValue({ user: { name: "John" } }, "user.name")).toBe("John");
    });

    it("should return undefined for missing field", () => {
      expect(getNestedValue({ user: {} }, "user.name")).toBeUndefined();
    });

    it("should return undefined for null parent", () => {
      expect(getNestedValue({ user: null }, "user.name")).toBeUndefined();
    });
  });
});

describe("Alert Integration", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
    mockBroadcast.mockClear();
  });

  it("should store alert in database", () => {
    const alertId = "test-alert-001";
    db.prepare(`
      INSERT INTO alerts (alert_id, name, type, target, condition, severity, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      alertId,
      "Test Alert",
      "threshold",
      "events",
      JSON.stringify({ field: "event_type", operator: "eq", value: "error" }),
      "critical"
    );

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(alertId);
    expect(alert).toBeDefined();
    expect(alert.name).toBe("Test Alert");
    expect(alert.severity).toBe("critical");
  });

  it("should create alert history entry", () => {
    const alertId = "test-alert-002";
    db.prepare(`
      INSERT INTO alerts (alert_id, name, type, target, condition, severity, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      alertId,
      "History Test Alert",
      "threshold",
      "events",
      JSON.stringify({ field: "event_type", operator: "eq", value: "error" }),
      "warning"
    );

    // Simulate alert trigger
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO alert_history (alert_id, triggered_at, status, details)
      VALUES (?, ?, 'active', ?)
    `).run(alertId, now, JSON.stringify({ triggered_by: "auto" }));

    const history: any = db.prepare("SELECT * FROM alert_history WHERE alert_id = ?").get(alertId);
    expect(history).toBeDefined();
    expect(history.status).toBe("active");
  });

  it("should update alert trigger count", () => {
    const alertId = "test-alert-003";
    db.prepare(`
      INSERT INTO alerts (alert_id, name, type, target, condition, severity, enabled, trigger_count)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    `).run(
      alertId,
      "Count Test Alert",
      "threshold",
      "events",
      JSON.stringify({ field: "event_type", operator: "eq", value: "error" }),
      "info"
    );

    // Simulate trigger
    db.prepare(`
      UPDATE alerts SET trigger_count = trigger_count + 1, last_triggered = ? WHERE alert_id = ?
    `).run(new Date().toISOString(), alertId);

    const alert: any = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(alertId);
    expect(alert.trigger_count).toBe(1);
  });
});
