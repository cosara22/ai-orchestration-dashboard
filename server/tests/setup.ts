import Database from "better-sqlite3";
import { beforeAll, afterAll, beforeEach } from "vitest";

// In-memory database for testing
let testDb: Database.Database;

export function getTestDb() {
  return testDb;
}

beforeAll(() => {
  // Create in-memory database
  testDb = new Database(":memory:");

  // Create all required tables
  testDb.exec(`
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      start_time TEXT DEFAULT (datetime('now')),
      end_time TEXT,
      metadata TEXT
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      payload TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT UNIQUE NOT NULL,
      session_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      project TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );

    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'default',
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      state TEXT,
      metrics TEXT,
      last_heartbeat TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      condition TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      enabled INTEGER DEFAULT 1,
      cooldown_minutes INTEGER DEFAULT 5,
      last_triggered TEXT,
      trigger_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE alert_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      resolved_at TEXT,
      status TEXT DEFAULT 'active',
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_events_session_id ON events(session_id);
    CREATE INDEX idx_tasks_session_id ON tasks(session_id);
    CREATE INDEX idx_tasks_status ON tasks(status);
    CREATE INDEX idx_agents_status ON agents(status);
    CREATE INDEX idx_alerts_enabled ON alerts(enabled);
    CREATE INDEX idx_alert_history_alert_id ON alert_history(alert_id);
  `);
});

beforeEach(() => {
  // Clear all tables before each test
  testDb.exec("DELETE FROM alert_history");
  testDb.exec("DELETE FROM alerts");
  testDb.exec("DELETE FROM agents");
  testDb.exec("DELETE FROM tasks");
  testDb.exec("DELETE FROM events");
  testDb.exec("DELETE FROM sessions");
});

afterAll(() => {
  testDb.close();
});
