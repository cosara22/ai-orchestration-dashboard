import { getDb } from "./db";
import { broadcastToClients } from "../ws/handler";

interface AlertCondition {
  field: string;
  operator: "gt" | "lt" | "eq" | "ne" | "gte" | "lte" | "contains";
  value: string | number;
}

interface Alert {
  alert_id: string;
  name: string;
  type: string;
  target: string;
  condition: AlertCondition;
  severity: string;
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered: string | null;
}

interface Event {
  event_type: string;
  session_id?: string;
  payload: Record<string, any>;
}

function evaluateCondition(condition: AlertCondition, data: Record<string, any>): boolean {
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

function isInCooldown(alert: Alert): boolean {
  if (!alert.last_triggered) {
    return false;
  }

  const lastTriggered = new Date(alert.last_triggered);
  const cooldownMs = alert.cooldown_minutes * 60 * 1000;
  const now = new Date();

  return now.getTime() - lastTriggered.getTime() < cooldownMs;
}

export async function evaluateAlertsForEvent(event: Event): Promise<void> {
  const db = getDb();

  // Get all enabled alerts targeting events
  const alerts = db.prepare(`
    SELECT * FROM alerts
    WHERE enabled = 1 AND target = 'events'
  `).all() as any[];

  const parsedAlerts: Alert[] = alerts.map((a) => ({
    ...a,
    condition: JSON.parse(a.condition || "{}"),
    enabled: Boolean(a.enabled),
  }));

  const now = new Date().toISOString();
  const triggeredAlerts: any[] = [];

  for (const alert of parsedAlerts) {
    // Check cooldown
    if (isInCooldown(alert)) {
      continue;
    }

    // Build data object for evaluation
    const eventData = {
      event_type: event.event_type,
      session_id: event.session_id,
      ...event.payload,
    };

    // Evaluate condition
    if (evaluateCondition(alert.condition, eventData)) {
      // Create alert history entry
      db.prepare(`
        INSERT INTO alert_history (alert_id, triggered_at, status, details)
        VALUES (?, ?, 'active', ?)
      `).run(
        alert.alert_id,
        now,
        JSON.stringify({
          event_type: event.event_type,
          session_id: event.session_id,
          triggered_by: "auto",
          matched_field: alert.condition.field,
          matched_value: getNestedValue(eventData, alert.condition.field),
        })
      );

      // Update alert trigger info
      db.prepare(`
        UPDATE alerts
        SET last_triggered = ?, trigger_count = trigger_count + 1, updated_at = ?
        WHERE alert_id = ?
      `).run(now, now, alert.alert_id);

      triggeredAlerts.push({
        alert_id: alert.alert_id,
        name: alert.name,
        severity: alert.severity,
        triggered_at: now,
      });
    }
  }

  // Broadcast triggered alerts to WebSocket clients
  if (triggeredAlerts.length > 0) {
    for (const triggered of triggeredAlerts) {
      broadcastToClients({
        type: "alert_triggered",
        data: triggered,
      });
    }
  }
}
